import { saveResults } from "../src/store";
import { actAs, errorOf, roomMatch } from "./helpers";

async function lobbyOf(server: any, accounts: string[]): Promise<string> {
  let roomId = "";
  for (const account of accounts) {
    server.connect({ account });
    roomId = (await server.findMatch()).roomId;
  }
  return roomId;
}

describe("bot fill", () => {
  test("waits 15 s, then bots take the empty seats and the person is the traitor", async (server) => {
    const roomId = await lobbyOf(server, ["test-a"]);
    actAs(server, "test-a", roomId);
    await server.devAdvanceClock(14_000);
    expect((await roomMatch(roomId)).phase).toBe("lobby");
    await server.devAdvanceClock(1_000);
    const match = await roomMatch(roomId);
    expect(match.phase).toBe("playing");
    expect(match.players).toEqual(["test-a", "bot-1", "bot-2", "bot-3"]);
    expect((await server.getMatchState()).you.role).toBe("traitor");
  });

  test("the room tick fills a lobby nobody touches", async (server) => {
    const roomId = await lobbyOf(server, ["test-a", "test-b"]);
    const match = await roomMatch(roomId);
    await $global.updateRoomState(roomId, { match: { ...match, createdAt: match.createdAt - 15_000 } });
    await server.$roomTick(0, roomId);
    expect((await roomMatch(roomId)).players).toEqual(["test-a", "test-b", "bot-1", "bot-2"]);
  });
});

describe("botCall", () => {
  test("lets the host act for a bot, and nobody else", async (server) => {
    const roomId = await lobbyOf(server, ["test-a", "test-b"]);
    actAs(server, "test-a", roomId);
    await server.devAdvanceClock(15_000);
    await server.botCall("bot-1", "reportPose", [{ x: 5, z: 6, yaw: 1 }]);
    const pose = (await $global.getRoomUserState(roomId, "bot-1")).pose;
    expect([pose.x, pose.z, pose.yaw]).toEqual([5, 6, 1]);
    expect((await server.botCall("bot-2", "getMatchState", [])).you.role).toBe("adventurer");
    expect(await errorOf(server.botCall("test-b", "reportPose", [{ x: 1, z: 1, yaw: 0 }]))).toContain("not_authority");
    expect(await errorOf(server.botCall("bot-1", "possess", ["zombie-0"]))).toContain("unavailable");
    actAs(server, "test-b", roomId);
    expect(await errorOf(server.botCall("bot-1", "reportPose", [{ x: 1, z: 1, yaw: 0 }]))).toContain("not_authority");
  });
});

describe("bot results", () => {
  test("are not saved to any account", async (server) => {
    const stats = { monsterKills: 0, monsterDamage: 0, traitorDamage: 0, possessions: 0, possessedDamage: 0 };
    const base = { role: "adventurer", won: true, escaped: false, died: false, reason: "escaped", durationMs: 1, endedAt: 1, stats };
    await saveResults("m", [{ ...base, account: "bot-1" }, { ...base, account: "test-a" }] as any);
    expect(await $global.getUserState("bot-1")).toEqual({});
    expect((await $global.getUserState("test-a")).profile.games).toBe(1);
  });
});
