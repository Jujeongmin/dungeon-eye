import { describe, expect, it } from "vitest";
import {
  INVITE_LIMIT, INVITE_TTL_MS, PARTY_MAX, addInvite, checkInvite, joinParty, kickFromParty, leaveParty, readInvites,
  type Party,
} from "../../src/game/account/party";

describe("checkInvite", () => {
  it("needs a friend who is not already with you, and room in the party", () => {
    expect(() => checkInvite(null, "b", [])).toThrow("not_friends");
    expect(() => checkInvite(null, "b", ["b"])).not.toThrow();
    const party: Party = { leader: "a", members: ["a", "b"] };
    expect(() => checkInvite(party, "b", ["b"])).toThrow("already_in_party");
    const full: Party = { leader: "a", members: ["a", "b", "c", "d"] };
    expect(() => checkInvite(full, "e", ["e"])).toThrow("party_full");
  });
});

describe("joinParty", () => {
  it("starts a party led by the inviter when they had none", () => {
    expect(joinParty(null, "a", "b")).toEqual({ leader: "a", members: ["a", "b"] });
  });

  it("adds to the inviter's party up to four", () => {
    let party = joinParty(null, "a", "b");
    party = joinParty(party, "b", "c");
    party = joinParty(party, "a", "d");
    expect(party).toEqual({ leader: "a", members: ["a", "b", "c", "d"] });
    expect(party.members).toHaveLength(PARTY_MAX);
    expect(() => joinParty(party, "a", "e")).toThrow("party_full");
  });
});

describe("leaveParty", () => {
  it("hands the lead to the next member and ends a party of one", () => {
    const party: Party = { leader: "a", members: ["a", "b", "c"] };
    expect(leaveParty(party, "a")).toEqual({ leader: "b", members: ["b", "c"] });
    expect(leaveParty({ leader: "b", members: ["b", "c"] }, "c")).toBeNull();
  });
});

describe("kickFromParty", () => {
  it("is for the leader only", () => {
    const party: Party = { leader: "a", members: ["a", "b", "c"] };
    expect(() => kickFromParty(party, "b", "c")).toThrow("not_leader");
    expect(kickFromParty(party, "a", "c")).toEqual({ leader: "a", members: ["a", "b"] });
    expect(() => kickFromParty(party, "a", "z")).toThrow("unavailable");
  });
});

describe("invites", () => {
  it("expire, keep one per sender and drop the oldest past the limit", () => {
    let invites = addInvite([], "a", 1_000);
    invites = addInvite(invites, "a", 2_000);
    expect(invites).toEqual([{ from: "a", at: 2_000 }]);
    expect(readInvites(invites, 2_000 + INVITE_TTL_MS)).toEqual(invites);
    expect(readInvites(invites, 2_001 + INVITE_TTL_MS)).toEqual([]);

    for (let i = 0; i < INVITE_LIMIT; i++) invites = addInvite(invites, `f${i}`, 3_000 + i);
    expect(invites).toHaveLength(INVITE_LIMIT);
    expect(invites.map((x) => x.from)).not.toContain("a");
  });

  it("reads only well-formed invites", () => {
    expect(readInvites([{ from: "a", at: 5 }, { from: 3, at: 5 }, "x", null], 5)).toEqual([{ from: "a", at: 5 }]);
    expect(readInvites(undefined, 0)).toEqual([]);
  });
});
