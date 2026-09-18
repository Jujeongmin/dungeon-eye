import * as THREE from "three";
import { reachWithArm } from "./armIk";
import { isCostumePart, type Costume } from "./costumes";
import { fpTuning } from "./firstPersonTuning";
import { clipByName, ownMaterials, skinnedHeight } from "./skinned";

// Only the arms and the top's sleeves belong in a first-person view; the rest would cut the frame.
const HIDDEN = /Head|Eyes|Jaw|Balaclava|Cloth_Face|Bag|Pants|Shoes/;
const PLAYER_HEIGHT = 1.8;

interface Arm { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D }

export interface Grips {
  right: THREE.Vector3;
  left: THREE.Vector3;
}

// Your own arms, in your costume, holding the first-person rifle.
export class FirstPersonArms {
  readonly object: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly right: Arm;
  private readonly left: Arm;
  private readonly head: THREE.Object3D;
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly offset = new THREE.Vector3();
  private readonly elbowLeft = new THREE.Vector3();
  private readonly elbowRight = new THREE.Vector3();
  // Each material with its own colour, so the shade can change live.
  private readonly tinted: { material: THREE.MeshStandardMaterial; base: THREE.Color }[];
  private shade = Number.NaN;

  static create(camera: THREE.Camera, model: THREE.Object3D, clips: THREE.AnimationClip[], costume: Costume): FirstPersonArms | null {
    const bone = (name: string) => model.getObjectByName(name) ?? null;
    const arm = (side: "r" | "l"): Arm | null => {
      const upper = bone(`upperarm_${side}`);
      const lower = bone(`lowerarm_${side}`);
      const hand = bone(`hand_${side}`);
      return upper && lower && hand ? { upper, lower, hand } : null;
    };
    const right = arm("r");
    const left = arm("l");
    const head = bone("head");
    if (!right || !left || !head) return null;
    return new FirstPersonArms(camera, model, clips, costume, right, left, head);
  }

  private constructor(
    camera: THREE.Camera,
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    costume: Costume,
    right: Arm,
    left: Arm,
    head: THREE.Object3D,
  ) {
    model.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      o.visible = isCostumePart(costume, o.name) && !HIDDEN.test(o.name);
      // The arms hug the camera; frustum culling only makes them blink.
      o.frustumCulled = false;
    });
    this.tinted = ownMaterials(model).map((material) => {
      // The pack marks skin and cloth fully metallic, which up close shows only the lamp's glare.
      material.metalness = 0;
      // From this close you look into the open sleeve; drawn one-sided, its inside showed the wall.
      material.side = THREE.DoubleSide;
      return { material, base: material.color.clone() };
    });
    model.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(model));
    // The model faces +z and the camera looks down -z.
    model.rotation.y = Math.PI;
    this.object = model;
    this.right = right;
    this.left = left;
    this.head = head;
    // The rifle aim clip gives the wrists and fingers a grip; the IK below moves the arms.
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.clipAction(clipByName(clips, "HumanM@Rifle_Aim01")).play();
    this.mixer.update(0);
    camera.add(model);
    this.placeHead();
  }

  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  // Poses the arms, then reaches each hand to its grip (world space).
  update(dt: number, grips: Grips): void {
    if (!this.object.visible) return;
    this.applyShade();
    this.mixer.update(dt);
    this.placeHead();
    const camera = this.object.parent;
    const { elbowLeft: el, elbowRight: er } = fpTuning;
    this.elbowLeft.set(el.x, el.y, el.z);
    this.elbowRight.set(er.x, er.y, er.z);
    camera?.localToWorld(this.elbowLeft);
    camera?.localToWorld(this.elbowRight);
    reachWithArm(this.right.upper, this.right.lower, this.right.hand, grips.right, this.elbowRight);
    reachWithArm(this.left.upper, this.left.lower, this.left.hand, grips.left, this.elbowLeft);
    const { twistRight: r, twistLeft: l } = fpTuning;
    this.right.hand.quaternion.multiply(this.turn.setFromEuler(this.euler.set(r.x, r.y, r.z)));
    this.left.hand.quaternion.multiply(this.turn.setFromEuler(this.euler.set(l.x, l.y, l.z)));
  }

  private applyShade(): void {
    if (fpTuning.shade === this.shade) return;
    this.shade = fpTuning.shade;
    for (const { material, base } of this.tinted) material.color.copy(base).multiplyScalar(this.shade);
  }

  // Moves the body so its head bone lands at the tuned spot in camera space, whatever the clip did.
  private placeHead(): void {
    const parent = this.object.parent;
    if (!parent) return;
    this.object.updateMatrixWorld(true);
    const head = parent.worldToLocal(this.head.getWorldPosition(new THREE.Vector3()));
    const { head: at } = fpTuning;
    this.object.position.add(this.offset.set(at.x, at.y, at.z).sub(head));
    this.object.updateMatrixWorld(true);
  }
}
