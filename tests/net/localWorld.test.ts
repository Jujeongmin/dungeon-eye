import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld, type WorldEvent } from "../../src/net/local/localWorld";

const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];

async function fill(world: LocalWorld): Promise<string> {
  let roomId = "";
  for (const p of PLAYERS) roomId = ((await world.call(p, null, "findMatch")) as { roomId: string }).roomId;
  return roomId;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LocalWorld", () => {
  it("runs the real server: four players start one match with one traitor", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    const roles: string[] = [];
    for (const p of PLAYERS) {
      const snap = (await world.call(p, roomId, "getMatchState")) as { match: { phase: string }; you: { role: string } };
      expect(snap.match.phase).toBe("playing");
      roles.push(snap.you.role);
    }
    expect(roles.filter((r) => r === "traitor")).toHaveLength(1);
    expect(world.roomState(roomId).$users).toEqual(PLAYERS);
  });

  it("emits the changed room state before the messages", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    await world.call(PLAYERS[0], roomId, "reportPose", [{ x: 6, z: 6, yaw: 0 }]);
    await world.call(PLAYERS[1], roomId, "reportPose", [{ x: 6, z: 9, yaw: 0 }]);
    const events: WorldEvent[] = [];
    world.subscribe((e) => events.push(e));
    await world.call(PLAYERS[0], roomId, "fireAtPlayer", [PLAYERS[1]]);
    expect(events.map((e) => e.kind)).toEqual(["roomState", "message"]);
    const message = events[1] as Extract<WorldEvent, { kind: "message" }>;
    expect(message).toMatchObject({ roomId, to: PLAYERS[1], type: "private" });
    expect((message.message as { hp: number }).hp).toBe(66);
  });

  it("reports user states as account plus state", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    const events: WorldEvent[] = [];
    world.subscribe((e) => events.push(e));
    await world.call(PLAYERS[2], roomId, "reportPose", [{ x: 1, z: 2, yaw: 3 }]);
    const users = events.find((e) => e.kind === "roomUsers") as Extract<WorldEvent, { kind: "roomUsers" }>;
    const mine = users.users.find((u) => u.account === PLAYERS[2])!;
    expect([mine.pose.x, mine.pose.z, mine.pose.yaw]).toEqual([1, 2, 3]);
  });

  it("passes rule errors through and refuses unknown or hook functions", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    expect(await codeOf(world.call(PLAYERS[0], roomId, "escape"))).toContain("not_at_exit");
    expect(await codeOf(world.call(PLAYERS[0], roomId, "nope"))).toContain("unknown server function");
    expect(await codeOf(world.call(PLAYERS[0], roomId, "$roomTick", [0, roomId]))).toContain("unknown server function");
  });

  it("serializes overlapping calls and restores the globals afterwards", async () => {
    const world = new LocalWorld(new Server());
    const results = await Promise.all(PLAYERS.map((p) => world.call(p, null, "findMatch")));
    const ids = new Set(results.map((r) => (r as { roomId: string }).roomId));
    expect(ids.size).toBe(1);
    expect((globalThis as Record<string, unknown>).$global).toBeUndefined();
    expect((globalThis as Record<string, unknown>).$sender).toBeUndefined();
  });

  it("copies values so callers cannot change stored state", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    const snap = (await world.call(PLAYERS[0], roomId, "getMatchState")) as { match: { players: string[] } };
    snap.match.players.push("intruder");
    expect(world.roomState(roomId).match.players).toEqual(PLAYERS);
  });

  it("ticks rooms like $roomTick, ending a match whose time is up", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    const world = new LocalWorld(new Server());
    const roomId = await fill(world);
    await world.tickAll();
    expect(world.roomState(roomId).match.phase).toBe("playing");
    vi.setSystemTime(1_000_000 + 9 * 60_000);
    await world.tickAll();
    expect(world.roomState(roomId).match.phase).toBe("ended");
  });

  it("drops a player from the room list when they leave", async () => {
    const world = new LocalWorld(new Server());
    const first = (await world.call("test-x", null, "findMatch")) as { roomId: string };
    await world.call("test-x", first.roomId, "leaveMatch");
    expect(world.roomState(first.roomId).$users).toEqual([]);
    const again = (await world.call("test-y", null, "findMatch")) as { roomId: string };
    expect(again.roomId === first.roomId).toBe(false);
  });
});
