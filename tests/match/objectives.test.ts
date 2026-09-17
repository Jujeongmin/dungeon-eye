import { describe, expect, it } from "vitest";
import {
  DEVICE_ACTIVE_MS, MONSTER_STATS, SEAL_DURATION_MS, SEAL_TICK_CAP_MS, WAVE_SIZE,
} from "../../src/game/match/constants";
import { createLobby, joinLobby, monsterSpawnsFor, startMatch } from "../../src/game/match/lifecycle";
import {
  BOSS_ID, advanceObjectives, interactableNear, operateObjective, skipToStage,
} from "../../src/game/match/objectives";
import { startPossession } from "../../src/game/match/possession";
import type { Poses, Vec2 } from "../../src/game/match/types";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";

const level = parseLevel(RUINS, TILE_SIZE);
const gate1 = level.gates[0];
const altar = level.altar!;
const pose = (p: Vec2) => ({ x: p.x, z: p.z, yaw: 0 });
const T = 100_000;

// Traitor is "c".
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, monsterSpawnsFor(level));
  return { match, secret };
}

describe("shards", () => {
  it("picks up shards one by one and opens the first gate with both", () => {
    const { match, secret } = playing();
    expect(() => operateObjective(match, secret, "a", pose(level.playerSpawn), level, T)).toThrow("nothing_here");
    operateObjective(match, secret, "a", pose(level.shards[0]), level, T);
    expect(match.objectives.shards).toEqual([true, false]);
    expect(() => operateObjective(match, secret, "a", pose(level.shards[0]), level, T)).toThrow("nothing_here");
    const atGate = { x: gate1.x - 2.8, z: gate1.z, yaw: 0 };
    expect(() => operateObjective(match, secret, "a", atGate, level, T)).toThrow("need_shards");
    operateObjective(match, secret, "b", pose(level.shards[1]), level, T);
    expect(interactableNear(match, level, atGate, T)?.kind).toBe("gate");
    operateObjective(match, secret, "b", atGate, level, T);
    expect(match.objectives.gates).toEqual([1]);
    expect(match.objectives.stage).toBe("devices");
  });

  it("refuses bound, gone or frozen players", () => {
    const { match, secret } = playing();
    match.bound.a = T + 1;
    expect(() => operateObjective(match, secret, "a", pose(level.shards[0]), level, T)).toThrow("bound");
    match.dead.push("b");
    expect(() => operateObjective(match, secret, "b", pose(level.shards[0]), level, T)).toThrow("unavailable");
    startPossession(match, secret, "c", "zombie-0", { x: 34, z: 20 }, T);
    expect(() => operateObjective(match, secret, "c", pose(level.shards[0]), level, T)).toThrow("unavailable");
    expect(() => operateObjective(match, secret, "d", null, level, T)).toThrow("nothing_here");
  });
});

describe("devices", () => {
  it("opens the second gate only while both devices are on together", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "devices", T);
    operateObjective(match, secret, "a", pose(level.devices[0]), level, T);
    expect(match.objectives.devices[0]).toBe(T + DEVICE_ACTIVE_MS);
    expect(() => operateObjective(match, secret, "a", pose(level.devices[0]), level, T + 1)).toThrow("nothing_here");
    operateObjective(match, secret, "b", pose(level.devices[1]), level, T + DEVICE_ACTIVE_MS);
    expect(match.objectives.gates).toEqual([1]);
    operateObjective(match, secret, "a", pose(level.devices[0]), level, T + DEVICE_ACTIVE_MS + 10);
    expect(match.objectives.gates).toEqual([1, 2]);
    expect(match.objectives.stage).toBe("seal");
  });
});

describe("seal", () => {
  it("starts at the altar with a first wave and moves only while guarded", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "seal", T);
    const before = Object.keys(match.monsters).length;
    operateObjective(match, secret, "a", pose(altar), level, T);
    expect(Object.keys(match.monsters).length).toBe(before + WAVE_SIZE);
    expect(match.monsters["wave-0-0"]).toMatchObject({ kind: "zombie", alive: true });
    expect(match.objectives.seal).toEqual({ progressMs: 0, lastAt: T, waves: 1 });
    expect(() => operateObjective(match, secret, "b", pose(altar), level, T)).toThrow("nothing_here");

    const guarded: Poses = { a: pose(altar), b: null, c: null, d: null };
    const away: Poses = { a: pose(level.playerSpawn), b: null, c: null, d: null };
    advanceObjectives(match, guarded, level, T + 1000);
    expect(match.objectives.seal.progressMs).toBe(1000);
    advanceObjectives(match, away, level, T + 2000);
    expect(match.objectives.seal.progressMs).toBe(1000);
    advanceObjectives(match, guarded, level, T + 60_000);
    expect(match.objectives.seal.progressMs).toBe(1000 + SEAL_TICK_CAP_MS);
    advanceObjectives(match, null, level, T + 61_000);
    expect(match.objectives.seal.progressMs).toBe(1000 + SEAL_TICK_CAP_MS);
  });

  it("sends the remaining waves, then opens the boss room and wakes the boss", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "seal", T);
    operateObjective(match, secret, "a", pose(altar), level, T);
    match.objectives.seal.progressMs = SEAL_DURATION_MS - 500;
    advanceObjectives(match, { a: pose(altar) }, level, T + 1000);
    expect(match.objectives.seal.waves).toBe(3);
    expect(match.monsters["wave-2-2"]).toBeDefined();
    expect(match.objectives.gates).toEqual([1, 2, 3]);
    expect(match.objectives.stage).toBe("boss");
    expect(match.monsters[BOSS_ID]).toMatchObject({ kind: "boss", hp: MONSTER_STATS.boss.hp, x: 54, z: 38 });
  });

  it("does not count dead players as guards", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "seal", T);
    operateObjective(match, secret, "a", pose(altar), level, T);
    match.dead.push("a");
    advanceObjectives(match, { a: pose(altar) }, level, T + 1000);
    expect(match.objectives.seal.progressMs).toBe(0);
  });
});

describe("boss and exit", () => {
  it("opens the exit once the boss is down", () => {
    const { match } = playing();
    skipToStage(match, level, "boss", T);
    advanceObjectives(match, null, level, T);
    expect(match.objectives.stage).toBe("boss");
    match.monsters[BOSS_ID].alive = false;
    advanceObjectives(match, null, level, T);
    expect(match.objectives.stage).toBe("exit");
  });

  it("skips straight to a later stage for testing", () => {
    const { match } = playing();
    skipToStage(match, level, "exit", T);
    expect(match.objectives).toMatchObject({ stage: "exit", shards: [true, true], gates: [1, 2, 3] });
    expect(match.monsters[BOSS_ID].alive).toBe(false);
  });
});
