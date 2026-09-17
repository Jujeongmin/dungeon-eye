import { describe, expect, it } from "vitest";
import { MATCH_DURATION_MS, POSSESS_FIRST_READY_MS } from "../../src/game/match/constants";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { markLeft, resolveOutcome, settleResults } from "../../src/game/match/outcome";
import { startPossession } from "../../src/game/match/possession";

const START = 1000;
const END = START + MATCH_DURATION_MS;

// Traitor is "c"; adventurers are a, b, d.
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, START, () => 0.6, [{ id: "zombie-0", x: 0, z: 0 }]);
  return { match, secret };
}

describe("resolveOutcome", () => {
  it("does nothing while adventurers are still inside and time remains", () => {
    const { match, secret } = playing();
    match.escaped.push("a");
    expect(resolveOutcome(match, secret, START + 5)).toEqual([]);
    expect(match.phase).toBe("playing");
  });

  it("gives the adventurers the win once every living adventurer is out", () => {
    const { match, secret } = playing();
    match.escaped.push("a", "d");
    match.dead.push("b");
    const events = resolveOutcome(match, secret, START + 5000);
    expect(events).toEqual([{ type: "ended" }]);
    expect(match.phase).toBe("ended");
    expect(match.endedAt).toBe(START + 5000);
    expect(match.result).toEqual({ winner: "adventurers", reason: "escaped", traitor: "c" });
  });

  it("gives the traitor the win when every adventurer is dead", () => {
    const { match, secret } = playing();
    match.dead.push("a", "b", "d");
    resolveOutcome(match, secret, START + 10);
    expect(match.result).toEqual({ winner: "traitor", reason: "wiped", traitor: "c" });
  });

  it("gives the traitor the win on timeout, dated at the deadline", () => {
    const { match, secret } = playing();
    expect(resolveOutcome(match, secret, END - 1)).toEqual([]);
    resolveOutcome(match, secret, END + 60_000);
    expect(match.result).toEqual({ winner: "traitor", reason: "timeout", traitor: "c" });
    expect(match.endedAt).toBe(END);
  });

  it("ignores what happens to the traitor", () => {
    const { match, secret } = playing();
    match.dead.push("c");
    expect(resolveOutcome(match, secret, START + 10)).toEqual([]);
  });

  it("ends a running possession before announcing the end, and only ends once", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", { x: 0, z: 1 }, START + POSSESS_FIRST_READY_MS);
    match.dead.push("a", "b", "d");
    const events = resolveOutcome(match, secret, START + POSSESS_FIRST_READY_MS + 1);
    expect(events.map((e) => e.type)).toEqual(["possession", "private", "ended"]);
    expect(secret.possession).toBeNull();
    expect(match.monsters["zombie-0"].possessed).toBe(false);
    expect(resolveOutcome(match, secret, START + POSSESS_FIRST_READY_MS + 2)).toEqual([]);
  });

  it("does nothing without a secret or outside play", () => {
    const { match, secret } = playing();
    expect(resolveOutcome(match, null, END + 1)).toEqual([]);
    match.phase = "lobby";
    expect(resolveOutcome(match, secret, END + 1)).toEqual([]);
  });
});

describe("markLeft", () => {
  it("counts a player who leaves mid-match as dead", () => {
    const { match, secret } = playing();
    expect(markLeft(match, secret, "a", START + 1)).toEqual([]);
    expect(match.dead).toEqual(["a"]);
    expect(secret.hp.a).toBe(0);
  });

  it("ends the traitor's possession when the traitor leaves", () => {
    const { match, secret } = playing();
    startPossession(match, secret, "c", "zombie-0", { x: 0, z: 1 }, START + POSSESS_FIRST_READY_MS);
    const events = markLeft(match, secret, "c", START + POSSESS_FIRST_READY_MS + 1);
    expect(events.map((e) => e.type)).toEqual(["possession", "private"]);
    expect(match.dead).toEqual(["c"]);
  });

  it("ignores strangers, the already gone, and matches not in play", () => {
    const { match, secret } = playing();
    match.escaped.push("b");
    markLeft(match, secret, "b", START + 1);
    markLeft(match, secret, "zz", START + 1);
    expect(match.dead).toEqual([]);
    match.phase = "ended";
    markLeft(match, secret, "a", START + 1);
    expect(match.dead).toEqual([]);
  });
});

describe("settleResults", () => {
  it("writes one result per player with team-based wins", () => {
    const { match, secret } = playing();
    secret.stats.a.monsterKills = 2;
    match.escaped.push("a", "d");
    match.dead.push("b");
    resolveOutcome(match, secret, START + 5000);
    const results = settleResults(match, secret);
    expect(results.map((r) => [r.account, r.role, r.won, r.escaped, r.died])).toEqual([
      ["a", "adventurer", true, true, false],
      ["b", "adventurer", true, false, true],
      ["c", "traitor", false, false, false],
      ["d", "adventurer", true, true, false],
    ]);
    expect(results[0]).toMatchObject({ reason: "escaped", durationMs: 5000, endedAt: START + 5000 });
    expect(results[0].stats.monsterKills).toBe(2);
  });

  it("copies stats instead of sharing them", () => {
    const { match, secret } = playing();
    match.dead.push("a", "b", "d");
    resolveOutcome(match, secret, START + 1);
    const [first] = settleResults(match, secret);
    first.stats.monsterKills = 99;
    expect(secret.stats.a.monsterKills).toBe(0);
  });

  it("refuses to settle a match that has not ended", () => {
    const { match, secret } = playing();
    expect(() => settleResults(match, secret)).toThrow("not_playing");
  });
});
