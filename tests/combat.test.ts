import { describe, expect, it } from "vitest";
import {
  AKM, ZOMBIE_HP, applyDamage, canFire, pickTarget, resolveShot, wallDistance,
  type HitTarget, type Ray3,
} from "../src/game/rules/combat";

const ahead: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0, dz: -1 };
const zombie = (id: string, z: number, alive = true): HitTarget => ({ id, x: 0, z, radius: 0.4, height: 1.8, alive });
const open = () => false;

describe("pickTarget", () => {
  it("hits the near face of a cylinder straight ahead", () => {
    expect(pickTarget(ahead, [zombie("a", -5)], 60)).toEqual({ id: "a", distance: expect.closeTo(4.6, 5) });
  });

  it("misses when the ray passes over the head", () => {
    const up: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0.8, dz: -0.6 };
    expect(pickTarget(up, [zombie("a", -5)], 60)).toBeNull();
  });

  it("picks the nearest living target and skips the dead", () => {
    const targets = [zombie("far", -10), zombie("dead", -3, false), zombie("near", -6)];
    expect(pickTarget(ahead, targets, 60)?.id).toBe("near");
  });

  it("ignores targets beyond range", () => {
    expect(pickTarget(ahead, [zombie("a", -5)], 4)).toBeNull();
  });
});

describe("wallDistance / resolveShot", () => {
  const wallAt = (d: number) => (_x: number, z: number) => z < -d;

  it("finds the wall along the ray", () => {
    expect(wallDistance(ahead, wallAt(3), 60, 4)).toBeGreaterThanOrEqual(3);
    expect(wallDistance(ahead, wallAt(3), 60, 4)).toBeLessThan(3.1);
  });

  it("stops at the floor and the ceiling", () => {
    const down: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: -1, dz: 0 };
    expect(wallDistance(down, open, 60, 4)).toBeCloseTo(1.6, 1);
    const upward: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 1, dz: 0 };
    expect(wallDistance(upward, open, 60, 4)).toBeCloseTo(2.4, 1);
  });

  it("a wall in front of the target blocks the shot", () => {
    expect(resolveShot(ahead, [zombie("a", -5)], wallAt(3), AKM.range, 4)).toBeNull();
  });

  it("a wall behind the target does not", () => {
    expect(resolveShot(ahead, [zombie("a", -5)], wallAt(8), AKM.range, 4)?.id).toBe("a");
  });
});

describe("damage and fire rate", () => {
  it("kills a zombie in three AKM hits and never goes below zero", () => {
    let hp = ZOMBIE_HP;
    const results = [1, 2, 3].map(() => {
      const r = applyDamage(hp, AKM.damage);
      hp = r.hp;
      return r;
    });
    expect(results.map((r) => r.killed)).toEqual([false, false, true]);
    expect(hp).toBe(0);
  });

  it("allows a shot only after the fire interval", () => {
    expect(canFire(1.0, 1.05, AKM.fireInterval)).toBe(false);
    expect(canFire(1.0, 1.1, AKM.fireInterval)).toBe(true);
    expect(canFire(-Infinity, 0, AKM.fireInterval)).toBe(true);
  });
});
