import * as THREE from "three";
import type { Pose } from "../match/types";
import { reachWithArm, setWorldRotation } from "./armIk";
import { isCostumePart, type Costume } from "./costumes";
import { createLabel, setLabel } from "./labels";
import { withUpperBodyPose } from "./playerAnimation";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

const PLAYER_HEIGHT = 1.8;
const FOLLOW_RATE = 12;
const FALL_RATE = 6;
const RIFLE_LENGTH = 0.75;

export interface HandTurn { on: boolean; x: number; y: number; z: number }

// How the rifle is held. Mutable so the development tuner can adjust it live.
export const GRIP = {
  // Where the stock sits relative to the chest bone, in body space (the model faces +z, its right is -x).
  stock: { x: -0.12, y: 0.07, z: 0.05 },
  // Where the hands hold it, as fractions of its length from the stock.
  trigger: 0.16,
  barrel: 0.63,
  // Each hand's shift from the rifle's centre line, in metres: side (+ = body's left) and up.
  rightShift: { side: -0.05, up: -0.05 },
  leftShift: { side: 0.06, up: -0.03 },
  // How much of the animation's neck and head tilt to keep; the aim clip bends the neck to a sight.
  neckKeep: 0.1,
  // Optional hand rotation in the rifle's space, in degrees; off keeps the animation's hand rotation.
  rightHand: { on: false, x: -30, y: 0, z: -5 } as HandTurn,
  leftHand: { on: false, x: 0, y: 0, z: 0 } as HandTurn,
};

const DEG = Math.PI / 180;

export type PlayerStatus = "active" | "dead" | "escaped";

export interface PlayerModel {
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
  costume: Costume;
  // Shouldered and held with both hands; the model needs spine_03 and upperarm/lowerarm/hand bones.
  weapon: THREE.Object3D | null;
}

interface Arm { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D }
interface Rig {
  chest: THREE.Object3D;
  right: Arm;
  left: Arm;
  // Bones straightened back toward their rest pose, with that rest rotation.
  straighten: { bone: THREE.Object3D; rest: THREE.Quaternion }[];
}

function findRig(object: THREE.Object3D): Rig | null {
  const bone = (name: string) => object.getObjectByName(name) ?? null;
  const arm = (side: "r" | "l"): Arm | null => {
    const upper = bone(`upperarm_${side}`);
    const lower = bone(`lowerarm_${side}`);
    const hand = bone(`hand_${side}`);
    return upper && lower && hand ? { upper, lower, hand } : null;
  };
  const chest = bone("spine_03");
  const right = arm("r");
  const left = arm("l");
  if (!chest || !right || !left) return null;
  const straighten = ["neck_01", "head"]
    .map(bone)
    .filter((b): b is THREE.Object3D => b !== null)
    .map((b) => ({ bone: b, rest: b.quaternion.clone() }));
  return { chest, right, left, straighten };
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
  private readonly tag = createLabel(1.8);
  private tagText = "";
  private readonly weapon: THREE.Object3D | null;
  private readonly rig: Rig | null;
  private readonly rifleBox = new THREE.Box3();
  private readonly at = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly handTurn = new THREE.Quaternion();
  private placed = false;
  private dead = false;

  constructor(readonly account: string, model: PlayerModel | null) {
    this.body = model?.object ?? placeholderBody();
    this.object = new THREE.Group();
    this.tag.position.y = 2.2;
    this.object.add(this.body, this.tag);
    // Rest rotations are read before any clip plays.
    this.rig = model ? findRig(model.object) : null;
    this.animated = model ? RemotePlayerActor.animate(model) : null;
    this.weapon = model?.weapon && this.rig ? RemotePlayerActor.rifle(model.weapon) : null;
    if (this.weapon) {
      this.object.add(this.weapon);
      this.rifleBox.setFromObject(this.weapon);
    }
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.object.visible = false;
  }

  // A tag over an exposed traitor or a bound player.
  mark(revealed: boolean, bound: boolean): void {
    const text = this.dead ? "" : revealed ? "배신자" : bound ? "묶임" : "";
    if (text === this.tagText) return;
    this.tagText = text;
    setLabel(this.tag, text, revealed ? "#ff6b5a" : "#ffb35a");
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

  // Straightens the neck, shoulders the rifle and pulls both hands onto it.
  private holdRifle(): void {
    const { weapon, rig } = this;
    if (!weapon || !rig) return;
    weapon.visible = !this.dead;
    if (this.dead) return;
    for (const { bone, rest } of rig.straighten) bone.quaternion.slerp(rest, 1 - GRIP.neckKeep);
    this.object.updateMatrixWorld(true);

    const box = this.rifleBox;
    const length = box.max.z - box.min.z;
    const centreX = (box.min.x + box.max.x) / 2;
    const centreY = (box.min.y + box.max.y) / 2;
    this.object.worldToLocal(rig.chest.getWorldPosition(this.at));
    weapon.position.copy(this.at);
    weapon.position.x += GRIP.stock.x;
    weapon.position.y += GRIP.stock.y;
    weapon.position.z += GRIP.stock.z;
    weapon.position.z -= box.min.z;
    weapon.updateMatrixWorld(true);

    const hold = (arm: Arm, along: number, shift: { side: number; up: number }, hand: HandTurn) => {
      // The rifle is not rotated in body space, so its box offsets add straight onto its position.
      this.at.set(centreX + shift.side, centreY + shift.up, box.min.z + length * along).add(weapon.position);
      reachWithArm(arm.upper, arm.lower, arm.hand, this.object.localToWorld(this.at));
      if (!hand.on) return;
      weapon.getWorldQuaternion(this.turn);
      this.turn.multiply(this.handTurn.setFromEuler(this.euler.set(hand.x * DEG, hand.y * DEG, hand.z * DEG)));
      setWorldRotation(arm.hand, this.turn);
    };
    hold(rig.right, GRIP.trigger, GRIP.rightShift, GRIP.rightHand);
    hold(rig.left, GRIP.barrel, GRIP.leftShift, GRIP.leftHand);
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
      this.holdRifle();
    } else if (this.dead) {
      // The stand-in has no death clip, so it tips over backwards.
      const fall = this.body.rotation;
      fall.x += (-Math.PI / 2 - fall.x) * (1 - Math.exp(-dt * FALL_RATE));
    }
    this.object.visible = true;
  }
}
