import * as THREE from "three";
import type { Pose } from "../match/types";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

const PLAYER_HEIGHT = 1.8;
const FOLLOW_RATE = 12;

export type PlayerStatus = "active" | "dead" | "escaped";

export class RemotePlayerActor {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private placed = false;
  private dead = false;

  constructor(readonly account: string, readonly object: THREE.Object3D, clips: THREE.AnimationClip[]) {
    object.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(object));
    object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.mixer = new THREE.AnimationMixer(object);
    this.idle = this.mixer.clipAction(clipByName(clips, "Idle_Rifle"));
    this.run = this.mixer.clipAction(clipByName(clips, "Run_Rifle"));
    this.death = this.mixer.clipAction(clipByName(clips, "Death_Rifle"));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
    this.blender = new ActionBlender(this.idle);
    object.visible = false;
  }

  sync(pose: Pose | null, status: PlayerStatus, dt: number): void {
    if (!pose || status === "escaped") {
      this.object.visible = false;
      return;
    }
    const p = this.object.position;
    if (!this.placed) {
      p.set(pose.x, 0, pose.z);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    const dx = pose.x - p.x;
    const dz = pose.z - p.z;
    p.x += dx * k;
    p.z += dz * k;
    this.object.rotation.y = pose.yaw + Math.PI;
    if (status === "dead" && !this.dead) {
      this.dead = true;
      this.blender.fadeTo(this.death, 0.1);
    } else if (!this.dead) {
      this.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? this.run : this.idle);
    }
    this.object.visible = true;
    this.mixer.update(dt);
  }
}
