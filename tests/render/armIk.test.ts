import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { reachWithArm } from "../../src/game/render/armIk";

function arm(scale = 1) {
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  body.rotation.y = 0.7;
  const upper = new THREE.Object3D();
  const lower = new THREE.Object3D();
  lower.position.set(1, 0, 0);
  const hand = new THREE.Object3D();
  hand.position.set(0, 1, 0);
  body.add(upper);
  upper.add(lower);
  lower.add(hand);
  body.updateMatrixWorld(true);
  return { body, upper, lower, hand };
}

const worldOf = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

describe("reachWithArm", () => {
  it("puts the wrist on a reachable target, keeping bone lengths", () => {
    for (const scale of [1, 0.02]) {
      const { upper, lower, hand } = arm(scale);
      const target = new THREE.Vector3(0.6, 0.5, -0.4).multiplyScalar(scale);
      reachWithArm(upper, lower, hand, target);
      expect(worldOf(hand).distanceTo(target)).toBeLessThan(1e-4 * scale + 1e-6);
      expect(worldOf(upper).distanceTo(worldOf(lower))).toBeCloseTo(scale, 5);
      expect(worldOf(lower).distanceTo(worldOf(hand))).toBeCloseTo(scale, 5);
    }
  });

  it("stretches toward a target that is too far", () => {
    const { upper, lower, hand } = arm();
    const target = new THREE.Vector3(5, 0, 0);
    reachWithArm(upper, lower, hand, target);
    const direction = worldOf(hand).sub(worldOf(upper)).normalize();
    expect(direction.dot(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0.999);
    expect(worldOf(hand).length()).toBeCloseTo(2, 2);
  });
});
