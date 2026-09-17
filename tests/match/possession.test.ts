import { describe, expect, it } from "vitest";
import { POSSESS_COOLDOWN_MS, POSSESS_DURATION_MS, POSSESS_FIRST_READY_MS } from "../../src/game/match/constants";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import {
  endPossession, expirePossession, releasePossession, startPossession,
} from "../../src/game/match/possession";

const NEAR = { x: 5, z: 10 };
const READY = POSSESS_FIRST_READY_MS;

// Traitor is "c" (rng 0.6); one zombie at (10, 10); match starts at t=0.
function playing() {
  const match = createLobby(0);
  for (const a of ["a", "b", "c", "d"]) joinLobby(match, a);
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  return { match, secret };
}

describe("startPossession", () => {
  it("takes over a nearby monster once ready", () => {
    const { match, secret } = playing();
    const events = startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const endsAt = READY + POSSESS_DURATION_MS;
    expect(events).toEqual([
      { type: "possession", monsterId: "zombie-0", active: true, endsAt },
      { type: "private", account: "c" },
    ]);
    expect(secret.possession).toEqual({ monsterId: "zombie-0", endsAt });
    expect(match.monsters["zombie-0"].possessed).toBe(true);
    expect(secret.stats.c.possessions).toBe(1);
  });

  it("refuses before the first ready time", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY - 1)).toThrow("not_ready");
  });

  it("refuses anyone but the traitor", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "a", "zombie-0", NEAR, READY)).toThrow("not_traitor");
  });

  it("refuses a far monster or an unknown body position", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "c", "zombie-0", { x: 30, z: 10 }, READY)).toThrow("out_of_range");
    expect(() => startPossession(match, secret, "c", "zombie-0", null, READY)).toThrow("out_of_range");
  });

  it("refuses unknown or dead monsters", () => {
    const { match, secret } = playing();
    expect(() => startPossession(match, secret, "c", "zombie-9", NEAR, READY)).toThrow("no_monster");
    match.monsters["zombie-0"].alive = false;
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY)).toThrow("monster_dead");
  });

  it("refuses a dead traitor, a second possession, and a match not in play", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY + 1)).toThrow("already_possessing");
    match.dead.push("c");
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY + 1)).toThrow("unavailable");
    match.phase = "ended";
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, READY + 1)).toThrow("not_playing");
  });

  it("expires an old possession first, then allows the next one after the cooldown", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const end = READY + POSSESS_DURATION_MS;
    const events = startPossession(match, secret, "c", "zombie-0", NEAR, end + POSSESS_COOLDOWN_MS);
    expect(events.map((e) => e.type)).toEqual(["possession", "private", "possession", "private"]);
    expect(events[0]).toEqual({ type: "possession", monsterId: "zombie-0", active: false, endsAt: null });
    expect(secret.possession?.endsAt).toBe(end + POSSESS_COOLDOWN_MS + POSSESS_DURATION_MS);
  });

  it("refuses a new possession during the cooldown", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const end = READY + POSSESS_DURATION_MS;
    expect(() => startPossession(match, secret, "c", "zombie-0", NEAR, end + POSSESS_COOLDOWN_MS - 1)).toThrow("not_ready");
  });
});

describe("expirePossession / releasePossession / endPossession", () => {
  it("ends at endsAt and starts the cooldown from endsAt, however late it is noticed", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    const end = READY + POSSESS_DURATION_MS;
    expect(expirePossession(match, secret, end - 1)).toEqual([]);
    const events = expirePossession(match, secret, end + 30_000);
    expect(events).toEqual([
      { type: "possession", monsterId: "zombie-0", active: false, endsAt: null },
      { type: "private", account: "c" },
    ]);
    expect(secret.possession).toBeNull();
    expect(secret.readyAt).toBe(end + POSSESS_COOLDOWN_MS);
    expect(match.monsters["zombie-0"].possessed).toBe(false);
  });

  it("lets the traitor let go early", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", NEAR, READY);
    releasePossession(match, secret, "c", READY + 2000);
    expect(secret.possession).toBeNull();
    expect(secret.readyAt).toBe(READY + 2000 + POSSESS_COOLDOWN_MS);
  });

  it("refuses release when not possessing or not the traitor", () => {
    const { match, secret } = playing();
    expect(() => releasePossession(match, secret, "c", READY)).toThrow("not_possessing");
    expect(() => releasePossession(match, secret, "a", READY)).toThrow("not_traitor");
  });

  it("is a no-op when nothing is possessed", () => {
    const { match, secret } = playing();
    expect(endPossession(match, secret, READY)).toEqual([]);
    expect(secret.readyAt).toBe(READY);
  });
});
