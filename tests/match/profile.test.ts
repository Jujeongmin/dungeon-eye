import { describe, expect, it } from "vitest";
import { emptyStats } from "../../src/game/match/lifecycle";
import { addResult, emptyProfile, readProfile } from "../../src/game/match/profile";
import type { PlayerResult } from "../../src/game/match/types";

function result(over: Partial<PlayerResult>): PlayerResult {
  return {
    account: "a", role: "adventurer", won: false, escaped: false, died: false,
    reason: "timeout", durationMs: 1000, endedAt: 5000, stats: emptyStats(), ...over,
  };
}

describe("readProfile", () => {
  it("returns an empty profile for missing or broken data", () => {
    expect(readProfile(undefined)).toEqual(emptyProfile());
    expect(readProfile("nope")).toEqual(emptyProfile());
    expect(readProfile({ games: "3", wins: -1, escapes: 2 })).toEqual({ ...emptyProfile(), escapes: 2 });
  });
});

describe("addResult", () => {
  it("counts an adventurer win with an escape and kills", () => {
    const stats = { ...emptyStats(), monsterKills: 3, traitorDamage: 40 };
    const next = addResult(emptyProfile(), result({ won: true, escaped: true, stats }));
    expect(next).toEqual({
      ...emptyProfile(),
      games: 1, wins: 1, adventurerGames: 1, adventurerWins: 1,
      escapes: 1, monsterKills: 3, traitorDamage: 40, lastPlayedAt: 5000,
    });
  });

  it("counts a traitor loss with possessions and a death", () => {
    const stats = { ...emptyStats(), possessions: 2 };
    const next = addResult(emptyProfile(), result({ role: "traitor", died: true, stats }));
    expect(next).toMatchObject({ games: 1, wins: 0, traitorGames: 1, traitorWins: 0, deaths: 1, possessions: 2 });
  });

  it("does not change the profile it was given", () => {
    const before = emptyProfile();
    addResult(before, result({ won: true }));
    expect(before).toEqual(emptyProfile());
  });
});
