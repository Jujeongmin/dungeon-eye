import * as THREE from "three";
import type { ClientPhase, ClientState, MatchClient } from "../../net/matchClient";
import { ModelLibrary } from "../assets/ModelLibrary";
import {
  AKM_FIRE_INTERVAL_MS, AKM_RANGE, EXIT_RADIUS, POSSESS_RANGE, RANGE_SLACK, ZOMBIE_ATTACK_RANGE,
} from "../match/constants";
import { isActive } from "../match/lifecycle";
import { ZOMBIE_SPEED } from "../match/monsterAi";
import type { MatchResult, PlayerResult, Pose, Possession, PublicMatch } from "../match/types";
import { distance } from "../match/view";
import { ZOMBIE_HEIGHT, ZOMBIE_RADIUS, resolveShot, type HitTarget, type Ray3 } from "../rules/combat";
import { LEVEL_1, TILE_SIZE, parseLevel, solidAt, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, PLAYER_RADIUS, applyLook, stepPlayer } from "../rules/movement";
import { FpsInput } from "./FpsInput";
import { MonsterActor } from "./MonsterActor";
import { RemotePlayerActor, type PlayerStatus } from "./RemotePlayerActor";
import { Viewmodel } from "./Viewmodel";
import { playScream } from "./scream";

export const LOOK_SENSITIVITY = 0.0022;

// Corrections for the Decrepit Dungeon kit's own pivots and facing, tuned by eye in Plan 1.
// Wall_A is authored running along z, so it needs a quarter turn to span its edge.
export const KIT = { wallYawOffset: Math.PI / 2, wallInset: 0, ceilingYOffset: 0 };

const KIT_MODELS = ["dd_floor_a", "dd_ceiling", "dd_wall_a", "dd_pillar_a", "dd_torch", "dd_barrel", "chest_closed"];
export const MATCH_MODELS = [...KIT_MODELS, "wpn_akm", "zombie1", "contract_killer"];

const MONSTER_EYE = 1.5;
const POSSESSED_SPEED = ZOMBIE_SPEED * 1.3;
const HUD_INTERVAL_MS = 100;
const PLAYER_HEIGHT = 1.8;

export interface HudState {
  phase: ClientPhase;
  role: "adventurer" | "traitor" | null;
  hp: number | null;
  timeLeftMs: number | null;
  alive: boolean;
  escaped: boolean;
  possession: { monsterId: string; remainingMs: number } | null;
  possessReadyInMs: number | null;
  canPossess: boolean;
  nearExit: boolean;
  players: number;
  painAt: number | null;
  error: { code: string; at: number } | null;
  result: MatchResult | null;
  results: PlayerResult[] | null;
}

export interface MatchViewOptions {
  onProgress?: (done: number, total: number) => void;
  onFrame?: (dt: number, ownPose: Pose | null) => void;
}

export interface MatchDebugHandle {
  pose(): { x: number; z: number; yaw: number; pitch: number };
  setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
  stats(): { triangles: number; calls: number };
  hud(): HudState | null;
  state(): ClientState;
  fire(): Promise<string | null>;
  possessNearest(): Promise<string | null>;
  release(): Promise<string | null>;
  escape(): Promise<string | null>;
  advanceClock(ms: number): Promise<string | null>;
}

export class MatchView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  private readonly clock = new THREE.Clock();
  private readonly layout: LevelLayout = parseLevel(LEVEL_1, TILE_SIZE);
  private readonly input: FpsInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly torches: THREE.PointLight[] = [];
  private readonly monsters = new Map<string, MonsterActor>();
  private readonly players = new Map<string, RemotePlayerActor>();
  private readonly hudListeners = new Set<(hud: HudState) => void>();
  private readonly aim = new THREE.Vector3();
  private readonly isSolid = (x: number, z: number) => solidAt(this.layout, x, z);
  private library: ModelLibrary | null = null;
  private viewmodel: Viewmodel | null = null;
  private pose: Pose;
  private yaw = 0;
  private pitch = 0;
  private spawned = false;
  private lastShotAt = Number.NEGATIVE_INFINITY;
  private pendingAction = false;
  private painAt: number | null = null;
  private error: { code: string; at: number } | null = null;
  private lastHud: HudState | null = null;
  private lastHudAt = Number.NEGATIVE_INFINITY;
  private frame = 0;
  private disposed = false;
  private offPain: (() => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly client: MatchClient,
    private readonly options: MatchViewOptions = {},
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.input = new FpsInput(this.renderer.domElement);
    this.pose = { ...this.layout.playerSpawn, yaw: 0 };
    this.scene.background = new THREE.Color(0x050404);
    this.scene.fog = new THREE.FogExp2(0x050404, 0.07);
    this.scene.add(this.camera);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  async start(): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(MATCH_MODELS, this.options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.library = library;
    this.buildLevel(library);
    this.addLights();
    this.addExitMarker();
    this.viewmodel = new Viewmodel(this.camera, library.instance("wpn_akm"));
    this.offPain = this.client.onPain(() => {
      this.painAt = performance.now();
      playScream();
    });
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  onHud(cb: (hud: HudState) => void): () => void {
    this.hudListeners.add(cb);
    return () => {
      this.hudListeners.delete(cb);
    };
  }

  debugHandle(): MatchDebugHandle {
    return {
      pose: () => ({ ...this.pose, pitch: this.pitch }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw };
        this.yaw = p.yaw;
        this.pitch = p.pitch ?? 0;
        this.spawned = true;
      },
      stats: () => ({ triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls }),
      hud: () => this.lastHud,
      state: () => this.client.state,
      fire: () => {
        const match = this.client.state.match;
        if (!match) return Promise.resolve("not_playing");
        this.placeCamera(match, this.client.state.you.possession);
        return this.shoot(match);
      },
      possessNearest: () => {
        const match = this.client.state.match;
        const id = match ? this.possessCandidate(match) : null;
        return id ? this.client.possess(id) : Promise.resolve("no_monster");
      },
      release: () => this.client.release(),
      escape: () => this.client.escape(),
      advanceClock: (ms) => this.client.advanceClock(ms),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.offPain?.();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudListeners.clear();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const state = this.client.state;
    const match = state.match;
    const me = this.client.account;

    if (match && !this.spawned && match.players.includes(me)) {
      const spot = spawnPoint(this.layout, match.players.indexOf(me));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
      this.spawned = true;
    }

    const look = this.input.consumeLook();
    const view = applyLook(this.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY);
    this.yaw = view.yaw;
    this.pitch = view.pitch;

    const possession = state.you.possession;
    const active = !!match && match.phase === "playing" && isActive(match, me);
    const move = this.input.moveInput();
    if (active && possession && match) {
      this.driveMonster(match, possession.monsterId, move, dt);
    } else if (active) {
      this.pose = stepPlayer({ ...this.pose, yaw: this.yaw }, move, dt, this.isSolid);
    }
    if (match) this.handleActions(match, state, possession, active);
    if (active && !possession) this.client.reportPose(this.pose);
    this.options.onFrame?.(dt, active ? this.pose : null);
    this.client.tick();

    if (match) {
      this.syncActors(match, state, dt, possession);
      this.placeCamera(match, possession);
    }
    const moving = move.forward !== 0 || move.strafe !== 0;
    this.viewmodel?.setVisible(active && !possession);
    this.viewmodel?.update(dt, moving);

    const t = this.clock.elapsedTime;
    this.torches.forEach((light, i) => {
      light.intensity = 25 + Math.sin(t * 9 + i * 1.7) * 3 + Math.sin(t * 23 + i) * 2;
    });

    this.emitHud(match, state, possession, active);
    this.renderer.render(this.scene, this.camera);
  };

  private handleActions(match: PublicMatch, state: ClientState, possession: Possession | null, active: boolean): void {
    const pressPossess = this.input.consumePress("KeyE");
    const pressEscape = this.input.consumePress("KeyF");
    const pressRelease = this.input.consumePress("KeyR");
    if (!active) return;

    if (possession) {
      if (this.pendingAction) return;
      if (pressRelease) {
        this.perform(() => this.client.release());
        return;
      }
      if (this.input.firing) {
        const victim = this.attackCandidate(match, possession.monsterId);
        if (victim) this.perform(() => this.client.attackWithMonster(possession.monsterId, victim));
      }
      return;
    }

    if (!this.pendingAction && pressPossess && state.you.role === "traitor") {
      const id = this.possessCandidate(match);
      if (id) this.perform(() => this.client.possess(id));
      else this.fail("no_monster");
    }
    if (!this.pendingAction && pressEscape) this.perform(() => this.client.escape());
    if (this.input.firing && this.client.serverNow() - this.lastShotAt >= AKM_FIRE_INTERVAL_MS) {
      void this.shoot(match);
    }
  }

  private shoot(match: PublicMatch): Promise<string | null> {
    this.lastShotAt = this.client.serverNow();
    this.viewmodel?.fire();
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.aim);
    const ray: Ray3 = {
      ox: this.camera.position.x, oy: this.camera.position.y, oz: this.camera.position.z,
      dx: this.aim.x, dy: this.aim.y, dz: this.aim.z,
    };
    const me = this.client.account;
    const targets: HitTarget[] = [];
    for (const [id, m] of Object.entries(match.monsters)) {
      if (m.alive) targets.push({ id: `m:${id}`, x: m.x, z: m.z, radius: ZOMBIE_RADIUS, height: ZOMBIE_HEIGHT, alive: true });
    }
    for (const account of match.players) {
      const p = this.client.state.poses[account];
      if (account === me || !p || !isActive(match, account)) continue;
      targets.push({ id: `p:${account}`, x: p.x, z: p.z, radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, alive: true });
    }
    const hit = resolveShot(ray, targets, this.isSolid, AKM_RANGE, TILE_SIZE);
    if (!hit) return Promise.resolve("miss");
    const id = hit.id.slice(2);
    const call = hit.id.startsWith("m:") ? this.client.fireAtMonster(id) : this.client.fireAtPlayer(id);
    return call.then((code) => {
      if (code) this.fail(code);
      return code;
    });
  }

  private driveMonster(
    match: PublicMatch, monsterId: string, move: { forward: number; strafe: number }, dt: number,
  ): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const next = stepPlayer({ x: monster.x, z: monster.z, yaw: this.yaw }, move, dt, this.isSolid, POSSESSED_SPEED);
    if (next.x === monster.x && next.z === monster.z && Math.abs(this.yaw - monster.yaw) < 1e-3) return;
    this.client.reportMonsters([{ id: monsterId, x: next.x, z: next.z, yaw: this.yaw }]);
  }

  private possessCandidate(match: PublicMatch): string | null {
    let best: { id: string; d: number } | null = null;
    for (const [id, m] of Object.entries(match.monsters)) {
      if (!m.alive || m.possessed) continue;
      const d = distance(this.pose, m);
      if (d <= POSSESS_RANGE && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  }

  private attackCandidate(match: PublicMatch, monsterId: string): string | null {
    const monster = match.monsters[monsterId];
    if (!monster) return null;
    const me = this.client.account;
    let best: { account: string; d: number } | null = null;
    for (const account of match.players) {
      const p = this.client.state.poses[account];
      if (account === me || !p || !isActive(match, account)) continue;
      const d = distance(p, monster);
      if (d <= ZOMBIE_ATTACK_RANGE + RANGE_SLACK && (!best || d < best.d)) best = { account, d };
    }
    if (!best) return null;
    return monster.attackReadyAt <= this.client.serverNow() ? best.account : null;
  }

  private perform(action: () => Promise<string | null>): void {
    this.pendingAction = true;
    void action()
      .then((code) => {
        if (code) this.fail(code);
      })
      .finally(() => {
        this.pendingAction = false;
      });
  }

  private fail(code: string): void {
    this.error = { code, at: performance.now() };
  }

  private syncActors(match: PublicMatch, state: ClientState, dt: number, possession: Possession | null): void {
    const library = this.library;
    if (!library) return;
    for (const [id, m] of Object.entries(match.monsters)) {
      let actor = this.monsters.get(id);
      if (!actor) {
        actor = new MonsterActor(id, library.instance("zombie1"), library.get("zombie1").animations);
        this.scene.add(actor.object);
        this.monsters.set(id, actor);
      }
      actor.sync(m, dt, possession?.monsterId === id);
    }

    const me = this.client.account;
    for (const account of match.players) {
      let actor = this.players.get(account);
      if (!actor) {
        actor = new RemotePlayerActor(account, library.instance("contract_killer"), library.get("contract_killer").animations);
        this.scene.add(actor.object);
        this.players.set(account, actor);
      }
      const status: PlayerStatus = match.dead.includes(account) ? "dead" : match.escaped.includes(account) ? "escaped" : "active";
      // My own body is only drawn while I look out through a monster.
      const pose = account === me ? (possession ? this.pose : null) : (state.poses[account] ?? null);
      actor.sync(pose, status, dt);
    }
  }

  private placeCamera(match: PublicMatch, possession: Possession | null): void {
    const monster = possession ? match.monsters[possession.monsterId] : undefined;
    if (monster) this.camera.position.set(monster.x, MONSTER_EYE, monster.z);
    else this.camera.position.set(this.pose.x, EYE_HEIGHT, this.pose.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  private emitHud(match: PublicMatch | null, state: ClientState, possession: Possession | null, active: boolean): void {
    const now = performance.now();
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    const me = this.client.account;
    const serverNow = this.client.serverNow();
    const readyAt = state.you.possessReadyAt;
    const possessReadyInMs = readyAt === null ? null : Math.max(0, readyAt - serverNow);
    const exit = this.layout.exits[0];
    const hud: HudState = {
      phase: state.phase,
      role: state.you.role,
      hp: state.you.hp,
      timeLeftMs: match && match.phase === "playing" && match.endsAt !== null ? Math.max(0, match.endsAt - serverNow) : null,
      alive: match ? !match.dead.includes(me) : true,
      escaped: match ? match.escaped.includes(me) : false,
      possession: possession ? { monsterId: possession.monsterId, remainingMs: Math.max(0, possession.endsAt - serverNow) } : null,
      possessReadyInMs,
      canPossess: !!match && active && !possession && state.you.role === "traitor" && possessReadyInMs === 0 && this.possessCandidate(match) !== null,
      nearExit: active && !possession && !!exit && distance(this.pose, exit) <= EXIT_RADIUS,
      players: match?.players.length ?? 0,
      painAt: this.painAt,
      error: this.error,
      result: match?.result ?? null,
      results: match?.results ?? null,
    };
    this.lastHud = hud;
    for (const listener of this.hudListeners) listener(hud);
  }

  private buildLevel(library: ModelLibrary): void {
    const floorSize = new THREE.Box3().setFromObject(library.get("dd_floor_a").scene).getSize(new THREE.Vector3());
    const kitScale = TILE_SIZE / Math.max(floorSize.x, floorSize.z);
    for (const p of this.layout.placements) {
      const obj = library.instance(p.model);
      obj.scale.setScalar(kitScale);
      let { x, y, z } = p;
      let yaw = p.rotationY;
      if (p.model === "dd_wall_a") {
        x += Math.sin(p.rotationY) * KIT.wallInset;
        z += Math.cos(p.rotationY) * KIT.wallInset;
        yaw += KIT.wallYawOffset;
      }
      if (p.model === "dd_ceiling") y += KIT.ceilingYOffset;
      obj.position.set(x, y, z);
      obj.rotation.y = yaw;
      this.scene.add(obj);
    }
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x8a8298, 0x2a2018, 0.9));
    for (const p of this.layout.placements) {
      if (p.model !== "dd_torch") continue;
      const light = new THREE.PointLight(0xff8a3d, 25, 12, 2);
      light.position.set(p.x, p.y + 0.4, p.z);
      this.scene.add(light);
      this.torches.push(light);
    }
    const lamp = new THREE.SpotLight(0xfff1dc, 90, 24, 0.8, 0.7, 2);
    lamp.position.set(0, 0, 0);
    lamp.target.position.set(0, 0, -1);
    this.camera.add(lamp, lamp.target);
  }

  private addExitMarker(): void {
    for (const exit of this.layout.exits) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(EXIT_RADIUS - 0.25, EXIT_RADIUS, 48),
        new THREE.MeshBasicMaterial({ color: 0x4dff9a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(exit.x, 0.03, exit.z);
      const light = new THREE.PointLight(0x4dff9a, 12, 8, 2);
      light.position.set(exit.x, 1.2, exit.z);
      this.scene.add(ring, light);
    }
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
