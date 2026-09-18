import { errorOf, roomMatch } from "./helpers";

const NAMES: Record<string, string> = {
  "test-a": "Hunter", "test-b": "Seeker", "test-c": "Raider", "test-x": "Stranger", "test-y": "Loner",
};

function as(server: any, account: string): any {
  server.connect({ account });
  return server;
}

// test-a leads a party of test-a plus `members`, everyone online at the menu.
async function party(server: any, members: string[]): Promise<void> {
  for (const [account, name] of Object.entries(NAMES)) {
    await as(server, account).setNickname(name);
    await server.syncParty("menu");
  }
  for (const account of members) {
    await as(server, "test-a").requestFriend(NAMES[account]);
    await as(server, account).acceptFriend("test-a");
    await as(server, "test-a").inviteToParty(account);
    await as(server, account).acceptPartyInvite("test-a");
  }
}

describe("party matchmaking", () => {
  test("the leader seats the whole party in one lobby and the others follow", async (server) => {
    await party(server, ["test-b", "test-c"]);
    const { roomId } = await as(server, "test-a").findMatch();
    expect((await roomMatch(roomId)).players).toEqual(["test-a", "test-b", "test-c"]);
    const view = await as(server, "test-b").syncParty("menu");
    expect(view.match).toEqual({ roomId });
    expect(await server.joinPartyMatch()).toEqual({ roomId });
    const inRoom: string[] = await $global.getRoomUserAccounts(roomId);
    expect(["test-a", "test-b"].every((a) => inRoom.includes(a))).toBe(true);
    expect((await server.syncParty("match")).match).toBeNull();
    expect(await errorOf(server.joinPartyMatch())).toContain("unavailable");
  });

  test("only the leader can start", async (server) => {
    await party(server, ["test-b"]);
    expect(await errorOf(as(server, "test-b").findMatch())).toContain("not_leader");
  });

  test("waits for members still in a match", async (server) => {
    await party(server, ["test-b"]);
    await as(server, "test-b").syncParty("match");
    expect(await errorOf(as(server, "test-a").findMatch())).toContain("party_busy");
    await as(server, "test-b").syncParty("menu");
    expect(await as(server, "test-a").findMatch()).toHaveProperty("roomId");
  });

  test("skips a lobby without room for everyone, and starts once four are in", async (server) => {
    await party(server, ["test-b", "test-c"]);
    const crowded = (await as(server, "test-x").findMatch()).roomId;
    await as(server, "test-y").findMatch();
    const { roomId } = await as(server, "test-a").findMatch();
    expect(roomId === crowded).toBe(false);
    expect((await roomMatch(crowded)).players).toEqual(["test-x", "test-y"]);
    const solo = (await as(server, "test-x").findMatch()).roomId;
    expect(solo).toBe(crowded);
  });

  test("fills a lobby exactly and starts the match", async (server) => {
    await party(server, ["test-b", "test-c"]);
    const lobby = (await as(server, "test-x").findMatch()).roomId;
    const { roomId } = await as(server, "test-a").findMatch();
    expect(roomId).toBe(lobby);
    const match = await roomMatch(roomId);
    expect(match.players).toEqual(["test-x", "test-a", "test-b", "test-c"]);
    expect(match.phase).toBe("playing");
  });

  test("an old seat call is ignored after a minute", async (server) => {
    await party(server, ["test-b"]);
    const { roomId } = await as(server, "test-a").findMatch();
    await $global.updateUserState("test-b", { partyMatch: { roomId, at: Date.now() - 61_000 } });
    expect((await as(server, "test-b").syncParty("menu")).match).toBeNull();
    expect(await errorOf(server.joinPartyMatch())).toContain("unavailable");
  });
});
