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
const grip = new THREE.Quaternion();

// Applies a world-space rotation to a bone, keeping it in its parent's space.
function rotateInWorld(bone: THREE.Object3D, rotation: THREE.Quaternion): void {
  bone.getWorldQuaternion(own).premultiply(rotation);
  if (bone.parent) bone.parent.getWorldQuaternion(parent).invert();
  else parent.identity();
  bone.quaternion.copy(parent.multiply(own));
  bone.updateMatrixWorld(true);
}

// Two-bone IK (shoulder, elbow, wrist): bends the elbow in its current plane, then swings the arm
// so the wrist reaches the target, or points at it when it is out of reach. With `elbowHint`, the
// arm then turns about the shoulder-to-wrist line so the elbow points toward that world point.
export function reachWithArm(
  upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, elbowHint?: THREE.Vector3,
): void {
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
  if (elbowHint) pointElbow(upper, lower, hand, elbowHint);
}

// Turns the arm about the line from the shoulder to the wrist, which leaves the wrist where it is,
// and gives the hand back the world orientation it had, so the grip does not twist.
function pointElbow(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, hint: THREE.Vector3): void {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  hand.getWorldPosition(c);
  axis.subVectors(c, a);
  if (axis.lengthSq() < 1e-10) return;
  axis.normalize();
  const flat = (v: THREE.Vector3) => v.sub(a).addScaledVector(axis, -v.dot(axis));
  from.copy(b);
  flat(from);
  to.copy(hint);
  flat(to);
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  from.normalize();
  to.normalize();
  const angle = Math.atan2(ba.crossVectors(from, to).dot(axis), from.dot(to));
  hand.getWorldQuaternion(grip);
  rotateInWorld(upper, turn.setFromAxisAngle(axis, angle));
  if (hand.parent) hand.parent.getWorldQuaternion(parent).invert();
  else parent.identity();
  hand.quaternion.copy(parent.multiply(grip));
  hand.updateMatrixWorld(true);
}
