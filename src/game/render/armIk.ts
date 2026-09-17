import * as THREE from "three";

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const ba = new THREE.Vector3();
const bc = new THREE.Vector3();
const axis = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const turn = new THREE.Quaternion();
const own = new THREE.Quaternion();
const parent = new THREE.Quaternion();

// Applies a world-space rotation to a bone, keeping it in its parent's space.
function rotateInWorld(bone: THREE.Object3D, rotation: THREE.Quaternion): void {
  bone.getWorldQuaternion(own).premultiply(rotation);
  if (bone.parent) bone.parent.getWorldQuaternion(parent).invert();
  else parent.identity();
  bone.quaternion.copy(parent.multiply(own));
  bone.updateMatrixWorld(true);
}

// Two-bone IK (shoulder, elbow, wrist): bends the elbow in its current plane, then swings the arm
// so the wrist reaches the target, or points at it when it is out of reach.
export function reachWithArm(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3): void {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  hand.getWorldPosition(c);
  const upperLength = a.distanceTo(b);
  const lowerLength = b.distanceTo(c);
  const reach = THREE.MathUtils.clamp(a.distanceTo(target), 1e-4, upperLength + lowerLength - 1e-4);

  ba.subVectors(a, b).normalize();
  bc.subVectors(c, b).normalize();
  axis.crossVectors(ba, bc);
  if (axis.lengthSq() < 1e-10) axis.set(0, 0, 1).cross(ba);
  if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0).cross(ba);
  axis.normalize();
  const current = ba.angleTo(bc);
  const cosWanted = (upperLength ** 2 + lowerLength ** 2 - reach ** 2) / (2 * upperLength * lowerLength);
  const wanted = Math.acos(THREE.MathUtils.clamp(cosWanted, -1, 1));
  rotateInWorld(lower, turn.setFromAxisAngle(axis, wanted - current));

  hand.getWorldPosition(c);
  from.subVectors(c, a).normalize();
  to.subVectors(target, a).normalize();
  rotateInWorld(upper, turn.setFromUnitVectors(from, to));
}
