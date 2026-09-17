import { describe, expect, it } from "vitest";
import { BIND_MS, PLATE_HOLD_MS, PLATE_LOCK_MS } from "../../src/game/match/constants";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { startPossession } from "../../src/game/match/possession";
import type { Pose, Poses } from "../../src/game/match/types";
import { stepVote, tallyPlates, votingOpen } from "../../src/game/match/vote";

const T = 100_000;
const PLATES = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }, { x: 30, z: 0 }];
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });
const away = at(50, 50);

// Players a, b, c, d own plates 0..3. Traitor is "c".
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 60, z: 50 }]);
  return { match, secret };
}

describe("tallyPlates", () => {
  it("counts the other living players standing on each plate", () => {
    const { match } = playing();
    const poses: Poses = { a: at(20.5, 0), b: at(20, 1), c: at(20, 0), d: away };
    const c = tallyPlates(match, poses, PLATES).find((t) => t.accused === "c")!;
    expect(c).toEqual({ plate: 2, accused: "c", votes: 2, needed: 2, voters: ["a", "b"] });
    match.dead.push("d");
    expect(tallyPlates(match, poses, PLATES).find((t) => t.accused === "c")!.needed).toBe(2);
    match.dead.push("a");
    expect(tallyPlates(match, poses, PLATES).find((t) => t.accused === "c")).toMatchObject({ votes: 1, needed: 1 });
    expect(tallyPlates(match, poses, PLATES).some((t) => t.accused === "a")).toBe(false);
  });
});

describe("stepVote", () => {
  it("exposes the traitor after the voters hold the plate, and ends the possession", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", at(55, 50), T);
    const poses: Poses = { a: at(20, 0), b: at(20, 0.5), c: away, d: away };
    expect(stepVote(match, secret, poses, PLATES, T)).toEqual([]);
    expect(match.vote).toMatchObject({ plate: 2, since: T });
    expect(stepVote(match, secret, poses, PLATES, T + PLATE_HOLD_MS - 1)).toEqual([]);
    const events = stepVote(match, secret, poses, PLATES, T + PLATE_HOLD_MS);
    expect(match.revealed).toBe("c");
    expect(match.vote.last).toEqual({ accused: "c", guilty: true, at: T + PLATE_HOLD_MS });
    expect(secret.possession).toBeNull();
    expect(events.some((e) => e.type === "possession")).toBe(true);
    expect(votingOpen(match, T + PLATE_HOLD_MS)).toBe(false);
  });

  it("restarts the hold when voters step off", () => {
    const { match, secret } = playing();
    const on: Poses = { a: at(20, 0), b: at(20, 0.5), c: away, d: away };
    const off: Poses = { a: at(20, 0), b: away, c: away, d: away };
    stepVote(match, secret, on, PLATES, T);
    stepVote(match, secret, off, PLATES, T + 3000);
    expect(match.vote.plate).toBeNull();
    stepVote(match, secret, on, PLATES, T + 4000);
    stepVote(match, secret, on, PLATES, T + 4000 + PLATE_HOLD_MS - 1);
    expect(match.revealed).toBeNull();
  });

  it("binds an innocent player and locks the plates for a while", () => {
    const { match, secret } = playing();
    const onB: Poses = { a: at(10, 0), b: away, c: at(10, 0.5), d: away };
    stepVote(match, secret, onB, PLATES, T);
    stepVote(match, secret, onB, PLATES, T + PLATE_HOLD_MS);
    const decided = T + PLATE_HOLD_MS;
    expect(match.bound.b).toBe(decided + BIND_MS);
    expect(match.vote.last).toEqual({ accused: "b", guilty: false, at: decided });
    expect(match.vote.lockedUntil).toBe(decided + PLATE_LOCK_MS);
    expect(match.revealed).toBeNull();

    const onC: Poses = { a: at(20, 0), b: at(20, 0.5), c: away, d: away };
    stepVote(match, secret, onC, PLATES, decided + 1);
    stepVote(match, secret, onC, PLATES, decided + 1 + PLATE_HOLD_MS);
    expect(match.revealed).toBeNull();
    expect(match.vote.plate).toBeNull();

    stepVote(match, secret, onC, PLATES, decided + PLATE_LOCK_MS);
    stepVote(match, secret, onC, PLATES, decided + PLATE_LOCK_MS + PLATE_HOLD_MS);
    expect(match.revealed).toBe("c");
  });

  it("does nothing outside a running match", () => {
    const { match, secret } = playing();
    match.phase = "ended";
    const poses: Poses = { a: at(20, 0), b: at(20, 0), c: away, d: away };
    stepVote(match, secret, poses, PLATES, T);
    expect(match.vote.plate).toBeNull();
  });
});
