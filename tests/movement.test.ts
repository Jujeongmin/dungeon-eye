import { describe, expect, it } from "vitest";
import { PITCH_LIMIT, PLAYER_RADIUS, WALK_SPEED, applyLook, stepPlayer } from "../src/game/rules/movement";

const open = () => false;
const wallWest = (x: number) => x < 0;

describe("stepPlayer", () => {
  it("walks forward along -z at yaw 0", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 0.1, open);
    expect(next.x).toBeCloseTo(10);
    expect(next.z).toBeCloseTo(10 - WALK_SPEED * 0.1);
  });

  it("walks forward along -x at yaw +90deg and strafes right along -z", () => {
    const fwd = stepPlayer({ x: 10, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.1, open);
    expect(fwd.x).toBeCloseTo(10 - WALK_SPEED * 0.1);
    const right = stepPlayer({ x: 10, z: 10, yaw: Math.PI / 2 }, { forward: 0, strafe: 1 }, 0.1, open);
    expect(right.z).toBeCloseTo(10 - WALK_SPEED * 0.1);
  });

  it("strafes right along +x at yaw 0", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 0, strafe: 1 }, 0.1, open);
    expect(next.x).toBeCloseTo(10 + WALK_SPEED * 0.1);
  });

  it("does not move faster diagonally", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 1 }, 0.1, open);
    expect(Math.hypot(next.x - 10, next.z - 10)).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it("caps a long frame so a hitch cannot tunnel through a wall", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 5, open);
    expect(10 - next.z).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it("stops at a wall without entering it", () => {
    const next = stepPlayer({ x: 0.5, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.1, wallWest);
    expect(next.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.x).toBeLessThan(0.5);
  });

  it("slides along a wall", () => {
    const next = stepPlayer({ x: PLAYER_RADIUS, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 1 }, 0.1, wallWest);
    expect(next.x).toBeCloseTo(PLAYER_RADIUS);
    expect(next.z).toBeLessThan(10 - 0.2);
  });

  it("moves at a custom speed when one is given", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 0.1, open, 2);
    expect(10 - next.z).toBeCloseTo(0.2);
  });

  it("stands still with no input", () => {
    const pose = { x: 1, z: 2, yaw: 3 };
    expect(stepPlayer(pose, { forward: 0, strafe: 0 }, 0.1, open)).toEqual(pose);
  });
});

describe("applyLook", () => {
  it("turns right (yaw decreases) when the mouse moves right", () => {
    expect(applyLook(0, 0, 100, 0, 0.002).yaw).toBeCloseTo(-0.2);
  });

  it("clamps pitch so the camera never flips", () => {
    expect(applyLook(0, 0, 0, -100000, 0.002).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(applyLook(0, 0, 0, 100000, 0.002).pitch).toBeCloseTo(-PITCH_LIMIT);
  });
});
