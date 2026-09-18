import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { BotCrew } from "../../src/net/botCrew";
import { BotTransport } from "../../src/net/botTransport";
import type { CallOptions, MatchTransport } from "../../src/net/transport";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { MatchClient } from "../../src/net/matchClient";

const layout = parseLevel(RUINS, TILE_SIZE);

// People join one lobby, then the first one waits out the lobby so bots fill the rest.
async function filled(world: LocalWorld, accounts: string[]) {
  const seats = accounts.map((a) => ({ transport: new LocalTransport(world, a), client: null as unknown as MatchClient }));
  for (const seat of seats) {
    seat.client = new MatchClient(seat.transport);
    await seat.client.join();
  }
  await seats[0].client.advanceClock(15_000);
  await world.idle();
  for (const seat of seats) await seat.client.refresh();
  return seats.map((s) => ({ ...s, crew: new BotCrew(s.client, s.transport, layout) }));
}

async function run(world: LocalWorld, crews: BotCrew[], frames: number): Promise<void> {
  for (let i = 0; i < frames; i++) {
    for (const crew of crews) crew.update(0.1);
    await world.idle();
  }
}

describe("BotCrew", () => {
  it("drives every bot from the host's client", async () => {
    const world = new LocalWorld(new Server());
    const [host, guest] = await filled(world, ["test-a", "test-b"]);
    expect(host.client.state.match?.players).toEqual(["test-a", "test-b", "bot-1", "bot-2"]);
    await run(world, [host.crew, guest.crew], 5);
    expect(host.crew.driving).toEqual(["bot-1", "bot-2"]);
    expect(guest.crew.driving).toEqual([]);
    expect(guest.client.state.poses["bot-1"]).toBeTruthy();
    expect(guest.client.state.poses["bot-2"]).toBeTruthy();
  });

  it("gives each bot its own adventurer view, not the host's", async () => {
    const world = new LocalWorld(new Server());
    const [host] = await filled(world, ["test-a"]);
    await run(world, [host.crew], 2);
    expect(host.client.state.you.role).toBe("traitor");
    expect(host.crew.views().map((v) => v.role)).toEqual(["adventurer", "adventurer", "adventurer"]);
  });

  it("stops driving once the match is over", async () => {
    const world = new LocalWorld(new Server());
    const [host] = await filled(world, ["test-a"]);
    await run(world, [host.crew], 2);
    await host.client.leave();
    await run(world, [host.crew], 1);
    expect(host.crew.driving).toEqual([]);
  });
});

describe("BotTransport", () => {
  function fakeHost() {
    const calls: unknown[][] = [];
    const listened: string[] = [];
    const host: MatchTransport = {
      account: "test-a",
      call: async <T,>(name: string, args: unknown[] = [], options: CallOptions = {}) => {
        calls.push([name, args, options]);
        return undefined as T;
      },
      subscribeRoomState: () => () => {},
      subscribeRoomUsers: () => () => {},
      onRoomMessage: (_roomId, type) => {
        listened.push(type);
        return () => {};
      },
      subscribeMyState: () => () => {},
    };
    return { host, calls, listened };
  }

  it("sends a bot's calls through the host as botCall, throttled per bot", async () => {
    const { host, calls } = fakeHost();
    await new BotTransport(host, "bot-2").call("reportPose", [{ x: 1 }], { throttle: 100 });
    expect(calls).toEqual([["botCall", ["bot-2", "reportPose", [{ x: 1 }]], { throttle: 100, throttleKey: "bot-2:reportPose" }]]);
  });

  it("never hands the host's own messages to a bot", () => {
    const { host, listened } = fakeHost();
    const bot = new BotTransport(host, "bot-1");
    for (const type of ["private", "pain", "possession"]) bot.onRoomMessage("r", type, () => {});
    expect(listened).toEqual(["possession"]);
  });
});
