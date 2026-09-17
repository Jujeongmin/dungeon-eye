import * as THREE from "three";
import { ModelLibrary } from "../assets/ModelLibrary";
import { LEVEL_1, TILE_SIZE, parseLevel, solidAt, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, applyLook, stepPlayer, type PlayerPose } from "../rules/movement";
import { FpsInput } from "./FpsInput";
import { Viewmodel } from "./Viewmodel";

export const LOOK_SENSITIVITY = 0.0022;

// Corrections for the Decrepit Dungeon kit's own pivots and facing, tuned by eye.
// Wall_A is authored running along z, so it needs a quarter turn to span its edge.
export const KIT = { wallYawOffset: Math.PI / 2, wallInset: 0, ceilingYOffset: 0 };

const KIT_MODELS = ["dd_floor_a", "dd_ceiling", "dd_wall_a", "dd_pillar_a", "dd_torch", "dd_barrel", "chest_closed"];
export const LEVEL_MODELS = [...KIT_MODELS, "wpn_akm"];

export interface GameDebugHandle {
  pose(): { x: number; z: number; yaw: number; pitch: number };
  setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
  stats(): { triangles: number; calls: number };
}

export class GameView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  private readonly clock = new THREE.Clock();
  private readonly layout: LevelLayout = parseLevel(LEVEL_1, TILE_SIZE);
  private readonly input: FpsInput;
  private readonly resizeObserver: ResizeObserver;
  private readonly torches: THREE.PointLight[] = [];
  private pose: PlayerPose;
  private pitch = 0;
  private viewmodel: Viewmodel | null = null;
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
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

  async start(options: { onProgress?: (done: number, total: number) => void } = {}): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(LEVEL_MODELS, options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.buildLevel(library);
    this.addLights();    this.viewmodel = new Viewmodel(this.camera, library.instance("wpn_akm"));
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  debugHandle(): GameDebugHandle {
    return {
      pose: () => ({ ...this.pose, pitch: this.pitch }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw };
        this.pitch = p.pitch ?? 0;
      },
      stats: () => ({ triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls }),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
        // Panel faces the floor along (sin, cos) of its rotation; inset moves it that way.
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
    const lamp = new THREE.SpotLight(0xfff1dc, 30, 22, 0.8, 0.7, 2);
    lamp.position.set(0, 0, 0);
    lamp.target.position.set(0, 0, -1);
    this.camera.add(lamp, lamp.target);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);

    const look = this.input.consumeLook();
    const view = applyLook(this.pose.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY);
    this.pitch = view.pitch;
    const move = this.input.moveInput();
    this.pose = stepPlayer({ ...this.pose, yaw: view.yaw }, move, dt, (x, z) => solidAt(this.layout, x, z));

    this.camera.position.set(this.pose.x, EYE_HEIGHT, this.pose.z);
    this.camera.rotation.set(this.pitch, this.pose.yaw, 0, "YXZ");
    this.viewmodel?.update(dt, move.forward !== 0 || move.strafe !== 0);

    const t = this.clock.elapsedTime;
    this.torches.forEach((light, i) => {
      light.intensity = 25 + Math.sin(t * 9 + i * 1.7) * 3 + Math.sin(t * 23 + i) * 2;
    });

    this.renderer.render(this.scene, this.camera);
  };
}
