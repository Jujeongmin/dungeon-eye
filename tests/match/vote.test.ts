import { describe, expect, it } from "vitest";
import {
  BIND_MS, PLATE_RADIUS, VOTE_DECIDE_HOLD_MS, VOTE_DURATION_MS,
} from "../../src/game/match/constants";
import { createLobby, joinLobby, monsterSpawnsFor, startMatch } from "../../src/game/match/lifecycle";
import { skipToStage } from "../../src/game/match/objectives";
import { startPossession } from "../../src/game/match/possession";
import type { Pose, Poses, Vec2 } from "../../src/game/match/types";
import { placePlates, skipPlate, stepVote, tallyPlates, votesNeeded } from "../../src/game/match/vote";
import { RUINS, TILE_SIZE, parseLevel, solidWith } from "../../src/game/rules/levelLayout";
import { findPath } from "../../src/game/rules/pathfinding";

const level = parseLevel(RUINS, TILE_SIZE);
const T = 100_000;
const at = (p: Vec2): Pose => ({ x: p.x, z: p.z, yaw: 0 });
const start: Poses = { a: at({ x: 6, z: 6 }), b: at({ x: 8, z: 6 }), c: at({ x: 6, z: 8 }), d: at({ x: 8, z: 8 }) };
// Well clear of the plates, which drop near the start.
const away: Poses = { a: at({ x: 30, z: 18 }), b: at({ x: 32, z: 18 }), c: at({ x: 34, z: 18 }), d: at({ x: 36, z: 18 }) };

// Players a, b, c, d own plates 0..3; plate 4 is skip. Traitor is "c".
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, monsterSpawnsFor(level));
  return { match, secret };
}

// A match with gate 1 just opened and its vote round started.
function voting() {
  const s = playing();
  skipToStage(s.match, level, "devices", T);
  stepVote(s.match, s.secret, start, level, T);
  const plates = s.match.vote.round!.plates;
  return { ...s, plates };
}

function standOn(plates: Vec2[], who: Record<string, number>): Poses {
  const poses: Poses = { ...away };
  for (const [account, plate] of Object.entries(who)) poses[account] = at(plates[plate]);
  return poses;
}

describe("placePlates", () => {
  it("puts every plate on open floor the players can walk to", () => {
    for (const gates of [[1], [1, 2], [1, 2, 3]]) {
      const isSolid = solidWith(level, gates);
      const from = gates.length === 1 ? [at({ x: 34, z: 14 }), at({ x: 50, z: 18 })] : [at({ x: 82, z: 34 }), at({ x: 54, z: 40 })];
      const plates = placePlates(level, gates, from, 5);
      expect(plates).toHaveLength(5);
      for (const p of plates) {
        expect(isSolid(p.x, p.z)).toBe(false);
        expect(isSolid(p.x + PLATE_RADIUS, p.z) || isSolid(p.x - PLATE_RADIUS, p.z)).toBe(false);
        expect(findPath(level, from[0], p, isSolid) !== null).toBe(true);
      }
      for (let i = 0; i < plates.length; i++) {
        for (let j = i + 1; j < plates.length; j++) {
          expect(Math.hypot(plates[i].x - plates[j].x, plates[i].z - plates[j].z)).toBeGreaterThan(PLATE_RADIUS * 2);
        }
      }
    }
  });
});

describe("tallyPlates", () => {
  it("counts living voters, never on their own plate, and has a skip plate", () => {
    const { match, plates } = voting();
    const poses = standOn(plates, { a: 2, b: 2, c: 2, d: 4 });
    const tallies = tallyPlates(match, poses, plates);
    expect(tallies[2]).toEqual({ plate: 2, accused: "c", votes: 2, voters: ["a", "b"] });
    expect(tallies[skipPlate(match)]).toMatchObject({ accused: null, votes: 1, voters: ["d"] });
    expect(votesNeeded(match)).toBe(3);
    match.dead.push("d");
    expect(votesNeeded(match)).toBe(2);
    expect(tallyPlates(match, poses, plates)[3].votes).toBe(0);
  });
});

describe("stepVote", () => {
  it("opens one round per opened gate, and none before", () => {
    const { match, secret } = playing();
    stepVote(match, secret, start, level, T);
    expect(match.vote.round).toBeNull();
    skipToStage(match, level, "devices", T);
    stepVote(match, secret, start, level, T);
    expect(match.vote).toMatchObject({ held: 1, round: { startedAt: T, endsAt: T + VOTE_DURATION_MS, leading: null } });
    expect(match.vote.round!.plates).toHaveLength(5);
  });

  it("decides early when a majority holds a plate", () => {
    const { match, secret, plates } = voting();
    startPossession(match, secret, "c", "zombie-0", { x: 34, z: 18 }, T);
    const poses = standOn(plates, { a: 2, b: 2, d: 2 });
    stepVote(match, secret, poses, level, T + 1000);
    expect(match.vote.round!.leading).toBe(2);
    stepVote(match, secret, poses, level, T + 1000 + VOTE_DECIDE_HOLD_MS - 1);
    expect(match.revealed).toBeNull();
    const events = stepVote(match, secret, poses, level, T + 1000 + VOTE_DECIDE_HOLD_MS);
    expect(match.revealed).toBe("c");
    expect(match.vote.round).toBeNull();
    expect(match.vote.last).toEqual({ accused: "c", guilty: true, at: T + 1000 + VOTE_DECIDE_HOLD_MS });
    expect(secret.possession).toBeNull();
    expect(events.some((e) => e.type === "possession")).toBe(true);
  });

  it("restarts the early hold when someone steps off", () => {
    const { match, secret, plates } = voting();
    stepVote(match, secret, standOn(plates, { a: 2, b: 2, d: 2 }), level, T + 1000);
    stepVote(match, secret, standOn(plates, { a: 2, b: 2 }), level, T + 2000);
    expect(match.vote.round!.leading).toBeNull();
    stepVote(match, secret, standOn(plates, { a: 2, b: 2, d: 2 }), level, T + 3000);
    stepVote(match, secret, standOn(plates, { a: 2, b: 2, d: 2 }), level, T + 3000 + VOTE_DECIDE_HOLD_MS - 1);
    expect(match.revealed).toBeNull();
  });

  it("lets a single vote decide when time runs out, binding an innocent", () => {
    const { match, secret, plates } = voting();
    const poses = standOn(plates, { a: 1 });
    stepVote(match, secret, poses, level, T + VOTE_DURATION_MS - 1);
    expect(match.vote.round).not.toBeNull();
    stepVote(match, secret, poses, level, T + VOTE_DURATION_MS);
    expect(match.vote.last).toEqual({ accused: "b", guilty: false, at: T + VOTE_DURATION_MS });
    expect(match.bound.b).toBe(T + VOTE_DURATION_MS + BIND_MS);
    expect(match.revealed).toBeNull();
  });

  it("passes on no votes, a tie or a skip win", () => {
    for (const who of [{}, { a: 1, b: 3 }, { a: 4, b: 4, d: 1 }] as Record<string, number>[]) {
      const { match, secret, plates } = voting();
      stepVote(match, secret, standOn(plates, who), level, T + VOTE_DURATION_MS);
      expect(match.vote.last).toEqual({ accused: null, guilty: false, at: T + VOTE_DURATION_MS });
      expect(match.bound).toEqual({});
    }
  });

  it("stops voting once the traitor is known, and after the last gate's round", () => {
    const { match, secret } = voting();
    stepVote(match, secret, start, level, T + VOTE_DURATION_MS);
    stepVote(match, secret, start, level, T + VOTE_DURATION_MS + 1);
    expect(match.vote.round).toBeNull();
    expect(match.vote.held).toBe(1);
    match.objectives.gates.push(2);
    match.revealed = "c";
    stepVote(match, secret, start, level, T + VOTE_DURATION_MS + 2);
    expect(match.vote.round).toBeNull();
    expect(match.vote.held).toBe(2);
  });

  it("skipping ahead keeps only the latest gate's round", () => {
    const { match, secret } = playing();
    skipToStage(match, level, "exit", T);
    stepVote(match, secret, start, level, T);
    expect(match.vote.held).toBe(3);
    expect(match.vote.round).not.toBeNull();
  });
});
