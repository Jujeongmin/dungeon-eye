import { describe, expect, it } from "vitest";
import { LOBBY_FILL_MS } from "../../src/game/match/constants";
import { monsterAuthority } from "../../src/game/match/damage";
import {
  botFillInMs, createLobby, fillWithBots, isBot, joinLobby, matchHost, startMatch,
} from "../../src/game/match/lifecycle";
import { markLeft, resolveOutcome } from "../../src/game/match/outcome";

const SPAWNS = [{ id: "zombie-0", x: 1, z: 2 }];

describe("isBot", () => {
  it("marks only the online fill bots", () => {
    expect(isBot("bot-1")).toBe(true);
    expect(isBot("test-bot-1")).toBe(false);
    expect(isBot("0xabc")).toBe(false);
    expect(isBot("bot-x")).toBe(false);
  });
});

describe("fillWithBots", () => {
  it("fills the empty seats once the lobby has waited long enough", () => {
    const match = createLobby(1_000);
    joinLobby(match, "a");
    joinLobby(match, "b");
    expect(fillWithBots(match, 1_000 + LOBBY_FILL_MS - 1)).toBe(false);
    expect(match.players).toEqual(["a", "b"]);
    expect(fillWithBots(match, 1_000 + LOBBY_FILL_MS)).toBe(true);
    expect(match.players).toEqual(["a", "b", "bot-1", "bot-2"]);
  });

  it("leaves empty, full and started lobbies alone", () => {
    const late = 1_000 + LOBBY_FILL_MS;
    expect(fillWithBots(createLobby(1_000), late)).toBe(false);
    const full = createLobby(1_000);
    for (const p of ["a", "b", "c", "d"]) joinLobby(full, p);
    expect(fillWithBots(full, late)).toBe(false);
  });
});

describe("startMatch with bots", () => {
  it("never makes a bot the traitor", () => {
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      const match = createLobby(0);
      joinLobby(match, "a");
      joinLobby(match, "b");
      fillWithBots(match, LOBBY_FILL_MS);
      const secret = startMatch(match, LOBBY_FILL_MS, () => roll, SPAWNS);
      expect(["a", "b"]).toContain(secret.traitor);
    }
  });
});

describe("matchHost", () => {
  it("is the first active human, never a bot", () => {
    const match = createLobby(0);
    joinLobby(match, "bot-1");
    joinLobby(match, "a");
    joinLobby(match, "b");
    joinLobby(match, "bot-2");
    const secret = startMatch(match, 0, () => 0, SPAWNS);
    expect(matchHost(match)).toBe("a");
    expect(monsterAuthority(match, secret, "zombie-0")).toBe("a");
    match.dead.push("a");
    expect(matchHost(match)).toBe("b");
    match.escaped.push("b");
    expect(matchHost(match)).toBeNull();
  });
});

describe("a match with bots", () => {
  it("ends for the adventurers once no person is left in play", () => {
    const match = createLobby(0);
    joinLobby(match, "a");
    joinLobby(match, "b");
    fillWithBots(match, LOBBY_FILL_MS);
    const secret = startMatch(match, LOBBY_FILL_MS, () => 0, SPAWNS);
    const other = secret.traitor === "a" ? "b" : "a";
    markLeft(match, secret, other, LOBBY_FILL_MS + 1);
    expect(resolveOutcome(match, secret, LOBBY_FILL_MS + 1)).toEqual([]);
    markLeft(match, secret, secret.traitor, LOBBY_FILL_MS + 2);
    resolveOutcome(match, secret, LOBBY_FILL_MS + 2);
    expect(match.phase).toBe("ended");
    expect(match.result).toEqual({ winner: "adventurers", reason: "humans_out", traitor: secret.traitor });
  });
});

describe("botFillInMs", () => {
  it("counts down while a lobby waits for people, and is null otherwise", () => {
    const match = createLobby(1_000);
    expect(botFillInMs(match, 2_000)).toBeNull();
    joinLobby(match, "a");
    expect(botFillInMs(match, 2_000)).toBe(LOBBY_FILL_MS - 1_000);
    expect(botFillInMs(match, 1_000 + LOBBY_FILL_MS + 500)).toBe(0);
    fillWithBots(match, 1_000 + LOBBY_FILL_MS);
    expect(botFillInMs(match, 1_000 + LOBBY_FILL_MS)).toBeNull();
  });
});
