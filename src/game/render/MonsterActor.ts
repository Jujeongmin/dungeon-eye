import * as THREE from "three";
import type { MonsterState } from "../match/types";
import { ActionBlender, clipByName, ownMaterials, skinnedHeight } from "./skinned";

const MONSTER_HEIGHT = 1.8;
const HIT_FLASH_SECONDS = 0.08;
const FOLLOW_RATE = 12;

export class MonsterActor {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private readonly materials: THREE.MeshStandardMaterial[];
  private flashLeft = 0;
  private lastHp: number | null = null;
  private dead = false;
  private placed = false;

  constructor(readonly id: string, readonly object: THREE.Object3D, clips: THREE.AnimationClip[]) {
    object.scale.setScalar(MONSTER_HEIGHT / skinnedHeight(object));
    this.materials = ownMaterials(object);
    this.mixer = new THREE.AnimationMixer(object);
    this.idle = this.mixer.clipAction(clipByName(clips, "Z_Idle"));
    this.walk = this.mixer.clipAction(clipByName(clips, "Z_Walk_InPlace"));
    this.death = this.mixer.clipAction(clipByName(clips, "Z_FallingBack"));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
    this.blender = new ActionBlender(this.idle);
  }

  sync(state: MonsterState, dt: number, hidden: boolean): void {
    const p = this.object.position;
    if (!this.placed) {
      p.set(state.x, 0, state.z);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    const dx = state.x - p.x;
    const dz = state.z - p.z;
    p.x += dx * k;
    p.z += dz * k;
    // State yaw uses the camera convention; the model faces +z.
    this.object.rotation.y = state.yaw + Math.PI;

    if (this.lastHp !== null && state.hp < this.lastHp) this.flashLeft = HIT_FLASH_SECONDS;
    this.lastHp = state.hp;
    if (!state.alive && !this.dead) {
      this.dead = true;
      this.blender.fadeTo(this.death, 0.1);
    } else if (!this.dead) {
      this.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? this.walk : this.idle);
    }

    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const glow = this.flashLeft > 0 ? 1.5 : 0;
    for (const m of this.materials) m.emissive.setRGB(glow, glow * 0.2, glow * 0.2);
    this.object.visible = !hidden;
    this.mixer.update(dt);
  }
}
