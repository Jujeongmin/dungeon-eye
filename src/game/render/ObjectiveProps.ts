import * as THREE from "three";
import type { ModelLibrary } from "../assets/ModelLibrary";
import { MATCH_PLAYERS, PLATE_RADIUS, SEAL_DURATION_MS, SEAL_RADIUS } from "../match/constants";
import { isActive } from "../match/lifecycle";
import type { PublicMatch } from "../match/types";
import type { LevelLayout, Point2 } from "../rules/levelLayout";
import { createLabel, setLabel } from "./labels";

// Everything here is a dungeon-kit model; lights and labels only show state.
export const OBJECTIVE_MODELS = [
  "dd_arch_a", "dd_arch_gate", "dd_table_a", "dd_table_b", "dd_key_set", "dd_candles", "dd_floor_gate",
];

const GATE_BAR_WIDTH = 2.7;
const GATE_RAISE = 2.5;
const GATE_RAISE_RATE = 2.5;
const KEY_SCALE = 1.6;
const GUARD_CANDLES = 10;
const PLATE_DROP_HEIGHT = 7;
const PLATE_DROP_SECONDS = 0.45;
const CANDLE_LIGHT = 0xffa24a;
// Each dropped grate gets a beam from above and candles on its rim so it reads from across a room.
const PLATE_SPOT_HEIGHT = 3.8;
const PLATE_SPOT_IDLE = 0xffd9a0;
const PLATE_SPOT_SKIP = 0xcfd6e0;
const PLATE_SPOT_LEADING = 0xff9a3a;
const PLATE_CANDLES = 3;
const LABEL_IDLE = "#f0d9a8";
const LABEL_SKIP = "#c9c1b3";
const LABEL_LEADING = "#ffb35a";
const LABEL_OFF = "#777777";
const SKIP_LABEL = "건너뛰기";

interface GateView { bars: THREE.Object3D; raised: number }
interface KeyView { key: THREE.Object3D; glow: THREE.PointLight }
interface DeviceView { light: THREE.PointLight }
interface PlateView { plate: THREE.Object3D; spot: THREE.SpotLight; label: THREE.Sprite; text: string; color: string }

function boxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

// Wraps a model so the wrapper's origin sits at the model's footprint centre on the floor.
function grounded(object: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group();
  holder.add(object);
  const box = boxOf(holder);
  const centre = box.getCenter(new THREE.Vector3());
  object.position.x -= centre.x;
  object.position.z -= centre.z;
  object.position.y -= box.min.y;
  return holder;
}

function topOf(object: THREE.Object3D): number {
  return boxOf(object).max.y;
}

export class ObjectiveProps {
  private readonly gates = new Map<number, GateView>();
  private readonly keys: KeyView[] = [];
  private readonly devices: DeviceView[] = [];
  private readonly plates: PlateView[] = [];
  private readonly altarLight = new THREE.PointLight(CANDLE_LIGHT, 0, 10, 2);
  private time = 0;
  private roundKey: number | null = null;
  private landed = false;
  // Called once when a round's plates hit the ground.
  onLand: (() => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly layout: LevelLayout,
    private readonly library: ModelLibrary,
    private readonly kitScale: number,
  ) {
    for (const gate of layout.gates) this.addGate(gate);
    for (const at of layout.shards) this.addKeys(at);
    for (const at of layout.devices) this.addDevice(at);
    if (layout.altar) this.addAltar(layout.altar);
    for (let i = 0; i <= MATCH_PLAYERS; i++) this.addPlate();
  }

  private kit(name: string): THREE.Object3D {
    const object = this.library.instance(name);
    object.scale.setScalar(this.kitScale);
    return object;
  }

  private place(object: THREE.Object3D, at: Point2, y = 0, yaw = 0): THREE.Object3D {
    object.position.set(at.x, y, at.z);
    object.rotation.y = yaw;
    this.scene.add(object);
    return object;
  }

  // An archway across the passage with a portcullis that rises when the gate opens.
  private addGate(gate: { n: number; x: number; z: number }): void {
    const t = this.layout.tileSize;
    const col = Math.floor(gate.x / t);
    const row = Math.floor(gate.z / t);
    const alongX = !this.layout.solid[row]?.[col - 1] && !this.layout.solid[row]?.[col + 1];
    // The arch model spans z, so a passage running along x crosses it as authored.
    const yaw = alongX ? 0 : Math.PI / 2;
    this.place(grounded(this.kit("dd_arch_a")), gate, 0, yaw);

    // The portcullis model lies flat; stand it up across the passage.
    const raw = this.library.instance("dd_arch_gate");
    raw.rotation.x = -Math.PI / 2;
    const upright = new THREE.Group();
    upright.add(raw);
    const size = boxOf(upright).getSize(new THREE.Vector3());
    raw.scale.setScalar(GATE_BAR_WIDTH / Math.max(size.x, size.z));
    upright.rotation.y = Math.PI / 2;
    const bars = grounded(upright);
    this.place(bars, gate, 0, yaw);
    this.gates.set(gate.n, { bars, raised: 0 });
  }

  // A key ring on a small table.
  private addKeys(at: Point2): void {
    const table = this.place(grounded(this.kit("dd_table_a")), at);
    const key = this.library.instance("dd_key_set");
    key.scale.setScalar(this.kitScale * KEY_SCALE);
    this.place(grounded(key), at, topOf(table));
    // A small glow so the keys can be spotted from across the room.
    const glow = new THREE.PointLight(CANDLE_LIGHT, 3, 3, 2);
    glow.position.set(at.x, topOf(table) + 0.5, at.z);
    this.scene.add(glow);
    this.keys.push({ key, glow });
  }

  // A ritual table with candles; lit while the device is on.
  private addDevice(at: Point2): void {
    const table = this.place(grounded(this.kit("dd_table_b")), at, 0, Math.PI / 2);
    const top = topOf(table);
    this.place(grounded(this.kit("dd_candles")), { x: at.x, z: at.z - 0.35 }, top);
    this.place(grounded(this.kit("dd_candles")), { x: at.x, z: at.z + 0.35 }, top, 1.3);
    const light = new THREE.PointLight(CANDLE_LIGHT, 0, 8, 2);
    light.position.set(at.x, top + 0.6, at.z);
    this.scene.add(light);
    this.devices.push({ light });
  }

  // The altar: a candle-covered table, ringed by candles that mark the guarded area.
  private addAltar(at: Point2): void {
    const table = this.place(grounded(this.kit("dd_table_b")), at);
    const top = topOf(table);
    for (const dz of [-0.6, 0, 0.6]) this.place(grounded(this.kit("dd_candles")), { x: at.x, z: at.z + dz }, top, dz * 3);
    for (let i = 0; i < GUARD_CANDLES; i++) {
      const a = (i / GUARD_CANDLES) * Math.PI * 2;
      this.place(grounded(this.kit("dd_candles")), { x: at.x + Math.cos(a) * SEAL_RADIUS, z: at.z + Math.sin(a) * SEAL_RADIUS }, 0, a);
    }
    this.altarLight.position.set(at.x, top + 1, at.z);
    this.scene.add(this.altarLight);
  }

  // A floor grate that drops for a vote round.
  private addPlate(): void {
    const grate = this.library.instance("dd_floor_gate");
    const size = boxOf(grate).getSize(new THREE.Vector3());
    grate.scale.setScalar((PLATE_RADIUS * 2) / Math.max(size.x, size.z));
    const plate = grounded(grate);
    for (let i = 0; i < PLATE_CANDLES; i++) {
      const a = (i / PLATE_CANDLES) * Math.PI * 2 + 0.4;
      const candles = grounded(this.kit("dd_candles"));
      candles.position.set(Math.cos(a) * PLATE_RADIUS * 0.8, 0.02, Math.sin(a) * PLATE_RADIUS * 0.8);
      candles.rotation.y = a;
      plate.add(candles);
    }
    const label = createLabel();
    label.position.y = 2.1;
    plate.add(label);
    plate.visible = false;
    // Lights stay in the scene at zero so turning them on does not rebuild shaders.
    const spot = new THREE.SpotLight(PLATE_SPOT_IDLE, 0, PLATE_SPOT_HEIGHT + 2, 0.42, 0.6, 1.5);
    this.scene.add(spot, spot.target);
    this.scene.add(plate);
    this.plates.push({ plate, spot, label, text: "", color: "" });
  }

  // names[i] is the display name for match.players[i].
  update(match: PublicMatch, now: number, dt: number, names: string[]): void {
    this.time += dt;
    const o = match.objectives;
    for (const [n, gate] of this.gates) {
      const target = o.gates.includes(n) ? GATE_RAISE : 0;
      gate.raised = Math.min(target, gate.raised + dt * GATE_RAISE_RATE);
      if (target === 0) gate.raised = 0;
      gate.bars.position.y = gate.raised;
    }
    this.keys.forEach((k, i) => {
      k.key.visible = !o.shards[i];
      k.glow.intensity = o.shards[i] ? 0 : 3;
    });
    const flicker = 1 + Math.sin(this.time * 11) * 0.08 + Math.sin(this.time * 23) * 0.05;
    this.devices.forEach((device, i) => {
      const on = o.gates.includes(2) || (o.stage === "devices" && o.devices[i] > now);
      device.light.intensity = on ? 14 * flicker : 0;
    });
    const sealing = o.stage === "seal" && o.seal.lastAt !== null;
    this.altarLight.intensity = o.gates.includes(3) ? 20 * flicker
      : sealing ? (4 + (o.seal.progressMs / SEAL_DURATION_MS) * 16) * flicker : 0;
    this.updatePlates(match, now, names);
  }

  private updatePlates(match: PublicMatch, now: number, names: string[]): void {
    const round = match.vote.round;
    if (!round) {
      this.roundKey = null;
      for (const plate of this.plates) {
        plate.plate.visible = false;
        plate.spot.intensity = 0;
      }
      return;
    }
    if (this.roundKey !== round.startedAt) {
      this.roundKey = round.startedAt;
      this.landed = false;
    }
    // Grates fall from above and land together; everyone sees the same moment from server time.
    const t = Math.min(1, Math.max(0, (now - round.startedAt) / 1000 / PLATE_DROP_SECONDS));
    const height = PLATE_DROP_HEIGHT * (1 - t * t);
    if (t >= 1 && !this.landed) {
      this.landed = true;
      // A late joiner should not hear an old landing.
      if (now - round.startedAt < 1500) this.onLand?.();
    }
    this.plates.forEach((view, i) => {
      const at = round.plates[i];
      view.plate.visible = !!at;
      if (!at) {
        view.spot.intensity = 0;
        return;
      }
      view.plate.position.set(at.x, height, at.z);
      const skip = i === match.players.length;
      const accused = skip ? null : match.players[i];
      const text = skip ? SKIP_LABEL : (names[i] ?? "");
      const off = !!accused && !isActive(match, accused);
      const leading = round.leading === i;
      const color = off ? LABEL_OFF : leading ? LABEL_LEADING : skip ? LABEL_SKIP : LABEL_IDLE;
      view.spot.position.set(at.x, PLATE_SPOT_HEIGHT, at.z);
      view.spot.target.position.set(at.x, 0, at.z);
      view.spot.color.setHex(leading ? PLATE_SPOT_LEADING : skip ? PLATE_SPOT_SKIP : PLATE_SPOT_IDLE);
      view.spot.intensity = t < 1 || off ? 0 : leading ? 70 + Math.sin(this.time * 10) * 20 : 45;
      if (text !== view.text || color !== view.color) {
        view.text = text;
        view.color = color;
        setLabel(view.label, text, color);
      }
    });
  }
}
