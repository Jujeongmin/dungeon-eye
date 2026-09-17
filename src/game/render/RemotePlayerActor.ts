import * as THREE from "three";
import type { Pose } from "../match/types";
import { isCostumePart, type Costume } from "./costumes";
import { withUpperBodyPose } from "./playerAnimation";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

const PLAYER_HEIGHT = 1.8;
const FOLLOW_RATE = 12;
const FALL_RATE = 6;
const RIFLE_LENGTH = 0.75;
// The rifle sits in the right hand and points through the left hand, like a two-handed grip.
// How far along that line its centre is, from the right hand. Tuned by eye against the aim pose.
const RIFLE_CENTER_AHEAD = 0.16;
const UP = new THREE.Vector3(0, 1, 0);

export type PlayerStatus = "active" | "dead" | "escaped";

export interface PlayerModel {
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
  costume: Costume;
  // Held in the right hand; the model is expected to have a hand_r bone.
  weapon: THREE.Object3D | null;
}

interface Animated {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  run: THREE.AnimationAction;
  death: THREE.AnimationAction;
  blender: ActionBlender;
}

// Stand-in body for tests and for a model that failed to load.
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
  private readonly revealMark: THREE.Mesh;
  private readonly boundMark: THREE.Mesh;
  private readonly weapon: THREE.Object3D | null;
  private readonly hand: THREE.Object3D | null;
  private readonly supportHand: THREE.Object3D | null;
  private readonly handAt = new THREE.Vector3();
  private readonly supportAt = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly lift = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private placed = false;
  private dead = false;

  constructor(readonly account: string, model: PlayerModel | null) {
    this.body = model?.object ?? placeholderBody();
    this.object = new THREE.Group();
    this.revealMark = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 12), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    this.revealMark.rotation.x = Math.PI;
    this.revealMark.position.y = 2.25;
    this.revealMark.visible = false;
    this.boundMark = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffb35a }));
    this.boundMark.rotation.x = Math.PI / 2;
    this.boundMark.position.y = 1.0;
    this.boundMark.visible = false;
    this.object.add(this.body, this.revealMark, this.boundMark);
    this.animated = model ? RemotePlayerActor.animate(model) : null;
    this.hand = model?.object.getObjectByName("hand_r") ?? null;
    this.supportHand = model?.object.getObjectByName("hand_l") ?? null;
    this.weapon = model?.weapon && this.hand ? RemotePlayerActor.rifle(model.weapon) : null;
    if (this.weapon) this.object.add(this.weapon);
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.object.visible = false;
  }

  // A red marker over an exposed traitor, a rope ring around a bound player.
  mark(revealed: boolean, bound: boolean): void {
    this.revealMark.visible = revealed && !this.dead;
    this.boundMark.visible = bound && !this.dead;
  }

  private static animate({ object, clips, costume }: PlayerModel): Animated {
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.visible = isCostumePart(costume, o.name);
    });
    object.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(object));
    const mixer = new THREE.AnimationMixer(object);
    const aim = clipByName(clips, "HumanM@Rifle_Aim01");
    const idle = mixer.clipAction(aim);
    const run = mixer.clipAction(withUpperBodyPose(clipByName(clips, "HumanM@Run01_Forward"), aim, "RunAim"));
    const death = mixer.clipAction(clipByName(clips, "HumanM@Death01"));
    death.setLoop(THREE.LoopOnce, 1);
    death.clampWhenFinished = true;
    return { mixer, idle, run, death, blender: new ActionBlender(idle) };
  }

  private static rifle(weapon: THREE.Object3D): THREE.Object3D {
    const size = new THREE.Box3().setFromObject(weapon).getSize(new THREE.Vector3());
    weapon.scale.setScalar(RIFLE_LENGTH / Math.max(size.x, size.y, size.z));
    weapon.traverse((o) => {
      // Loose cartridges (cal_*) are reload-animation props.
      if (o.name.startsWith("cal_")) o.visible = false;
    });
    return weapon;
  }

  private placeRifle(): void {
    const { weapon, hand, supportHand } = this;
    if (!weapon || !hand || !supportHand) return;
    weapon.visible = !this.dead;
    if (this.dead) return;
    this.object.updateMatrixWorld(true);
    this.object.worldToLocal(hand.getWorldPosition(this.handAt));
    this.object.worldToLocal(supportHand.getWorldPosition(this.supportAt));
    const aim = this.supportAt.sub(this.handAt).normalize();
    // Keep the rifle upright (magazine down) while it points along the aim line.
    this.side.crossVectors(UP, aim).normalize();
    this.lift.crossVectors(aim, this.side);
    weapon.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.side, this.lift, aim));
    weapon.position.copy(this.handAt).addScaledVector(aim, RIFLE_CENTER_AHEAD);
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
      this.placeRifle();
    } else if (this.dead) {
      // The stand-in has no death clip, so it tips over backwards.
      const fall = this.body.rotation;
      fall.x += (-Math.PI / 2 - fall.x) * (1 - Math.exp(-dt * FALL_RATE));
    }
    this.object.visible = true;
  }
}
