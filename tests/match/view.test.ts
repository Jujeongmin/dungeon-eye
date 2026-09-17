import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { distance, nearbyAccounts, privateView } from "../../src/game/match/view";

function playing() {
  const match = createLobby(0);
  for (const a of ["a", "b", "c", "d"]) joinLobby(match, a);
  const secret = startMatch(match, 0, () => 0.6, []);
  return { match, secret };
}

describe("distance / nearbyAccounts", () => {
  it("measures on the ground plane", () => {
    expect(distance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });

  it("lists other accounts within the radius, sorted, skipping unknown poses", () => {
    const poses = {
      c: { x: 0, z: 0, yaw: 0 },
      b: { x: 0, z: 10, yaw: 0 },
      a: { x: 3, z: 4, yaw: 0 },
      d: null,
    };
    expect(nearbyAccounts(poses, { x: 0, z: 0 }, 10, "c")).toEqual(["a", "b"]);
    expect(nearbyAccounts(poses, { x: 0, z: 0 }, 9.9, "c")).toEqual(["a"]);
  });
});

describe("privateView", () => {
  it("tells the traitor their role, hp and possession timing", () => {
    const { match, secret } = playing();
    expect(privateView(match, secret, "c")).toEqual({ role: "traitor", hp: 100, possession: null, possessReadyAt: 60_000 });
  });

  it("tells an adventurer only their role and hp", () => {
    const { match, secret } = playing();
    secret.possession = { monsterId: "zombie-0", endsAt: 1 };
    expect(privateView(match, secret, "a")).toEqual({ role: "adventurer", hp: 100, possession: null, possessReadyAt: null });
  });

  it("tells a stranger, or anyone before the match starts, nothing", () => {
    const { match, secret } = playing();
    const empty = { role: null, hp: null, possession: null, possessReadyAt: null };
    expect(privateView(match, secret, "z")).toEqual(empty);
    expect(privateView(match, null, "a")).toEqual(empty);
  });
});
