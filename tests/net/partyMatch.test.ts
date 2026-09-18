import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { MatchClient } from "../../src/net/matchClient";
import { PartyClient } from "../../src/net/party";

// A leader (test-0) and members, all friends, in one party, each with a transport and a running PartyClient.
async function partyOf(world: LocalWorld, size: number) {
  const seats = Array.from({ length: size }, (_, i) => new LocalTransport(world, `test-${i}`));
  for (const [i, t] of seats.entries()) {
    await t.call("setNickname", [`P${i}name`]);
    await t.call("syncFriends");
  }
  for (const [i, t] of seats.entries()) {
    if (i === 0) continue;
    await seats[0].call("requestFriend", [`P${i}name`]);
    await t.call("acceptFriend", ["test-0"]);
    await seats[0].call("inviteToParty", [`test-${i}`]);
    await t.call("acceptPartyInvite", ["test-0"]);
  }
  const parties = seats.map((t) => new PartyClient(t));
  for (const p of parties) await p.start();
  return { seats, parties };
}

describe("party quick start", () => {
  it("pulls the members into the leader's room", async () => {
    const world = new LocalWorld(new Server());
    const { seats, parties } = await partyOf(world, 3);
    const leader = new MatchClient(seats[0]);
    await leader.join();
    await world.idle();
    const roomId = leader.state.roomId;
    expect(roomId).toBeTruthy();
    expect(parties[1].view?.match).toEqual({ roomId });
    expect(parties[2].view?.match).toEqual({ roomId });

    const member = new MatchClient(seats[1]);
    await member.join("joinPartyMatch");
    expect(member.state.roomId).toBe(roomId);
    expect(member.state.match?.players).toEqual(["test-0", "test-1", "test-2"]);
    expect(member.state.phase).toBe("lobby");
  });

  it("will not start while a member is still in a match", async () => {
    const world = new LocalWorld(new Server());
    const { seats, parties } = await partyOf(world, 2);
    await parties[1].setActivity("match");
    const leader = new MatchClient(seats[0]);
    await leader.join();
    expect(leader.state.phase).toBe("error");
    expect(leader.state.error).toBe("party_busy");
  });
});
