import * as THREE from "three";
import type { Pose } from "../match/types";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

const PLAYER_HEIGHT = 1.8;
const FOLLOW_RATE = 12;
const FALL_RATE = 6;

export type PlayerStatus = "active" | "dead" | "escaped";

export interface PlayerModel {
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

interface Animated {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  run: THREE.AnimationAction;
  death: THREE.AnimationAction;
  blender: ActionBlender;
}

// Stand-in body until the player character asset is chosen (it must also support costumes).
export function placeholderBody(): THREE.Object3D {
  const root = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.9 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 12), cloth);
  body.position.y = 0.73;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), cloth);
  head.position.y = 1.62;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), gear);
  gun.position.set(0.18, 1.15, 0.3);
  root.add(body, head, gun);
  return root;
}

export class RemotePlayerActor {
  readonly object: THREE.Object3D;
  private readonly body: THREE.Object3D;
  private readonly animated: Animated | null;
  private placed = false;
  private dead = false;

  constructor(readonly account: string, model: PlayerModel | null) {
    this.body = model?.object ?? placeholderBody();
    this.object = new THREE.Group();
    this.object.add(this.body);
    this.animated = model ? RemotePlayerActor.animate(model) : null;
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.object.visible = false;
  }

  private static animate({ object, clips }: PlayerModel): Animated {
    object.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(object));
    const mixer = new THREE.AnimationMixer(object);
    const idle = mixer.clipAction(clipByName(clips, "Idle_Rifle"));
    const run = mixer.clipAction(clipByName(clips, "Run_Rifle"));
    const death = mixer.clipAction(clipByName(clips, "Death_Rifle"));
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    return { mixer, idle, run, death, blender: new ActionBlender(idle) };
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
    if (status === "dead") this.dead = true;
    const a = this.animated;
    if (a) {
      if (this.dead) a.blender.fadeTo(a.death, 0.1);
      else a.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? a.run : a.idle);
      a.mixer.update(dt);
    } else if (this.dead) {
      // The stand-in has no death clip, so it tips over backwards.
      const fall = this.body.rotation;
      fall.x += (-Math.PI / 2 - fall.x) * (1 - Math.exp(-dt * FALL_RATE));
    }
    this.object.visible = true;
  }
}
