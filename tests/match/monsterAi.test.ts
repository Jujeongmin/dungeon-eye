import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { ZOMBIE_AGGRO_RANGE, ZOMBIE_SPEED, stepMonsterAi } from "../../src/game/match/monsterAi";
import type { Pose, Poses } from "../../src/game/match/types";
import { PLAYER_RADIUS } from "../../src/game/rules/movement";

const open = () => false;
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });
const never = () => false;

function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  return match;
}

describe("stepMonsterAi", () => {
  it("walks toward the nearest active player in range", () => {
    const match = playing();
    const poses: Poses = { a: at(10, 20), b: at(10, 14), c: null, d: at(40, 40) };
    const step = stepMonsterAi(match, poses, open, 0.1, 0, never);
    expect(step.attacks).toEqual([]);
    expect(step.updates).toHaveLength(1);
    const u = step.updates[0];
    expect(u.id).toBe("zombie-0");
    expect(u.x).toBeCloseTo(10);
    expect(u.z).toBeCloseTo(10 + ZOMBIE_SPEED * 0.1);
    // Camera convention: forward (-sin yaw, -cos yaw) = (0, +1) means yaw = ±π.
    expect(Math.abs(u.yaw)).toBeCloseTo(Math.PI);
  });

  it("ignores players out of range, dead or escaped", () => {
    const match = playing();
    match.dead.push("a");
    match.escaped.push("c");
    const poses: Poses = { a: at(10, 11), b: at(10, 10 + ZOMBIE_AGGRO_RANGE + 1), c: at(11, 10), d: null };
    expect(stepMonsterAi(match, poses, open, 0.1, 0, never)).toEqual({ updates: [], attacks: [] });
  });

  it("stops and attacks when close, once the attack timer allows it", () => {
    const match = playing();
    const poses: Poses = { b: at(10, 11) };
    const step = stepMonsterAi(match, poses, open, 0.1, 0, never);
    expect(step.updates[0]).toMatchObject({ id: "zombie-0", x: 10, z: 10 });
    expect(step.attacks).toEqual([{ monsterId: "zombie-0", target: "b" }]);

    match.monsters["zombie-0"].attackReadyAt = 500;
    expect(stepMonsterAi(match, poses, open, 0.1, 0, never).attacks).toEqual([]);
    expect(stepMonsterAi(match, poses, open, 0.1, 500, never).attacks).toHaveLength(1);
  });

  it("does nothing while stunned", () => {
    const match = playing();
    match.monsters["zombie-0"].stunnedUntil = 500;
    expect(stepMonsterAi(match, { b: at(10, 11) }, open, 0.1, 0, never)).toEqual({ updates: [], attacks: [] });
  });

  it("leaves possessed, dead and skipped monsters alone", () => {
    const poses: Poses = { b: at(10, 12) };
    const possessed = playing();
    possessed.monsters["zombie-0"].possessed = true;
    expect(stepMonsterAi(possessed, poses, open, 0.1, 0, never).updates).toEqual([]);
    const dead = playing();
    dead.monsters["zombie-0"].alive = false;
    expect(stepMonsterAi(dead, poses, open, 0.1, 0, never).updates).toEqual([]);
    const skipped = playing();
    expect(stepMonsterAi(skipped, poses, open, 0.1, 0, (id) => id === "zombie-0").updates).toEqual([]);
  });

  it("walks up to a wall but not into it", () => {
    const match = playing();
    const wallAhead = (_x: number, z: number) => z > 10.5;
    const step = stepMonsterAi(match, { b: at(10, 14) }, wallAhead, 0.1, 0, never);
    expect(step.updates[0].z).toBeGreaterThan(10);
    expect(step.updates[0].z + PLAYER_RADIUS).toBeLessThanOrEqual(10.5);
  });
});
