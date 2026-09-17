import { describe, expect, it } from "vitest";
import {
  MATCH_DURATION_MS, MATCH_PLAYERS, MONSTER_STATS, PLAYER_HP, POSSESS_FIRST_READY_MS, ZOMBIE_HP,
} from "../../src/game/match/constants";
import {
  createLobby, createObjectives, emptyStats, isActive, isBound, joinLobby, leaveLobby, monsterSpawnsFor, newMonster,
  startMatch,
} from "../../src/game/match/lifecycle";
import { RuleViolation } from "../../src/game/match/types";

const ACCOUNTS = ["a", "b", "c", "d"];
const SPAWNS = [{ id: "zombie-0", x: 1, z: 2 }];

function fullLobby() {
  const match = createLobby(1000);
  for (const a of ACCOUNTS) joinLobby(match, a);
  return match;
}

describe("lobby", () => {
  it("starts empty in the lobby phase", () => {
    const match = createLobby(1000);
    expect(match).toMatchObject({ version: 1, phase: "lobby", players: [], createdAt: 1000, result: null, secretRef: null });
  });

  it("adds players once, in join order, up to the limit", () => {
    const match = fullLobby();
    joinLobby(match, "b");
    expect(match.players).toEqual(ACCOUNTS);
    expect(() => joinLobby(match, "e")).toThrow(RuleViolation);
    expect(() => joinLobby(match, "e")).toThrow("match_full");
    expect(MATCH_PLAYERS).toBe(4);
  });

  it("removes a player who leaves the lobby", () => {
    const match = fullLobby();
    leaveLobby(match, "c");
    expect(match.players).toEqual(["a", "b", "d"]);
  });

  it("refuses to join a match that already started", () => {
    const match = fullLobby();
    startMatch(match, 5000, () => 0, SPAWNS);
    expect(() => joinLobby(match, "e")).toThrow("unavailable");
  });
});

describe("startMatch", () => {
  it("needs a full lobby", () => {
    const match = createLobby(1000);
    joinLobby(match, "a");
    expect(() => startMatch(match, 5000, () => 0, SPAWNS)).toThrow("not_playing");
  });

  it("picks the traitor from the rng and sets the clock", () => {
    const match = fullLobby();
    const secret = startMatch(match, 5000, () => 0.6, SPAWNS);
    expect(secret.traitor).toBe("c");
    expect(match.phase).toBe("playing");
    expect(match.startedAt).toBe(5000);
    expect(match.endsAt).toBe(5000 + MATCH_DURATION_MS);
    expect(secret.readyAt).toBe(5000 + POSSESS_FIRST_READY_MS);
    expect(secret.possession).toBeNull();
    expect(secret.hp).toEqual({ a: PLAYER_HP, b: PLAYER_HP, c: PLAYER_HP, d: PLAYER_HP });
    expect(Object.keys(secret.stats)).toEqual(ACCOUNTS);
    expect(secret.stats.a).toEqual(emptyStats());
    expect(Object.values(emptyStats()).every((v) => v === 0)).toBe(true);
  });

  it("never picks out of range, even for rng() close to 1", () => {
    const match = fullLobby();
    expect(startMatch(match, 5000, () => 0.9999999, SPAWNS).traitor).toBe("d");
  });

  it("places monsters from the spawns at full health", () => {
    const match = fullLobby();
    startMatch(match, 5000, () => 0, SPAWNS);
    expect(match.monsters["zombie-0"]).toEqual({
      kind: "zombie", x: 1, z: 2, yaw: 0, hp: ZOMBIE_HP, alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
    });
  });

  it("does not put the traitor anywhere in the public match", () => {
    const match = fullLobby();
    startMatch(match, 5000, () => 0.3, SPAWNS);
    expect(JSON.stringify(match)).not.toContain("traitor");
  });
});

describe("isActive / monsterSpawnsFor", () => {
  it("is true only for players who are neither dead nor escaped", () => {
    const match = fullLobby();
    match.dead.push("a");
    match.escaped.push("b");
    expect(ACCOUNTS.map((a) => isActive(match, a))).toEqual([false, false, true, true]);
    expect(isActive(match, "stranger")).toBe(false);
  });

  it("names zombie spawns by index", () => {
    expect(monsterSpawnsFor({ zombieSpawns: [{ x: 1, z: 2 }, { x: 3, z: 4 }] })).toEqual([
      { id: "zombie-0", x: 1, z: 2 },
      { id: "zombie-1", x: 3, z: 4 },
    ]);
  });
});

describe("plan 4 state", () => {
  it("starts with the first stage, no votes and nobody bound", () => {
    const match = fullLobby();
    startMatch(match, 1000, () => 0, SPAWNS);
    expect(match.objectives).toEqual(createObjectives());
    expect(match.objectives).toEqual({
      stage: "shards", shards: [false, false], devices: [0, 0], gates: [],
      seal: { progressMs: 0, lastAt: null, waves: 0 },
    });
    expect(match.vote).toEqual({ held: 0, round: null, last: null });
    expect(match.bound).toEqual({});
    expect(match.revealed).toBeNull();
  });

  it("makes monsters from their kind's numbers and knows who is bound", () => {
    expect(newMonster("boss", 3, 4)).toMatchObject({ kind: "boss", x: 3, z: 4, hp: MONSTER_STATS.boss.hp, alive: true });
    const match = fullLobby();
    match.bound.a = 5000;
    expect(isBound(match, "a", 4999)).toBe(true);
    expect(isBound(match, "a", 5000)).toBe(false);
    expect(isBound(match, "b", 0)).toBe(false);
  });
});
