import { describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { MatchClient, SYNC_INTERVAL_MS, errorCode } from "../../src/net/matchClient";
import type { MatchTransport } from "../../src/net/transport";

const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle(world: LocalWorld): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await world.idle();
    await flush();
  }
}

async function joinAll(world: LocalWorld, now?: () => number): Promise<MatchClient[]> {
  const clients = PLAYERS.map((p) => new MatchClient(new LocalTransport(world, p), now));
  for (const c of clients) await c.join();
  await settle(world);
  return clients;
}

function traitorOf(clients: MatchClient[]): MatchClient {
  return clients.find((c) => c.state.you.role === "traitor")!;
}

describe("MatchClient", () => {
  it("waits in the lobby until four players are in", async () => {
    const world = new LocalWorld(new Server());
    const solo = new MatchClient(new LocalTransport(world, "test-solo"));
    await solo.join();
    expect(solo.state.phase).toBe("lobby");
    expect(solo.state.you.role).toBeNull();
  });

  it("starts the match and tells every player their role, including those who joined early", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    expect(clients.map((c) => c.state.phase)).toEqual(["playing", "playing", "playing", "playing"]);
    expect(new Set(clients.map((c) => c.state.roomId)).size).toBe(1);
    expect(clients.filter((c) => c.state.you.role === "traitor")).toHaveLength(1);
    expect(clients.every((c) => c.state.you.hp === 100)).toBe(true);
    expect(Math.abs(clients[0].serverNow() - Date.now())).toBeLessThan(1000);
  });

  it("turns server errors into codes", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const adventurer = clients.find((c) => c.state.you.role === "adventurer")!;
    expect(await adventurer.possess("zombie-0")).toBe("not_traitor");
    expect(errorCode(new Error("RuleViolation: out_of_range"))).toBe("out_of_range");
    expect(errorCode("something else")).toBe("something else");
  });

  it("tracks other players' reported poses, throttled", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    clients[0].reportPose({ x: 6, z: 6, yaw: 1 });
    clients[0].reportPose({ x: 7, z: 7, yaw: 1 });
    await settle(world);
    expect(clients[1].state.poses["test-a"]).toEqual({ x: 6, z: 6, yaw: 1 });
  });

  it("applies private updates to the player they are for", async () => {
    const world = new LocalWorld(new Server());
    const [a, b] = await joinAll(world);
    // test-a is the first active player, so it drives the unpossessed monsters.
    b.reportPose({ x: 34, z: 14, yaw: 0 });
    await settle(world);
    expect(await a.attackWithMonster("zombie-0", "test-b")).toBeNull();
    await settle(world);
    expect(b.state.you.hp).toBe(80);
    expect(a.state.you.hp).toBe(100);
  });

  it("hears screams and possession changes", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const traitor = traitorOf(clients);
    const shooter = clients.find((c) => c !== traitor)!;
    const pains: unknown[] = [];
    const possessions: unknown[] = [];
    shooter.onPain((e) => pains.push(e));
    shooter.onPossession((e) => possessions.push(e));
    traitor.reportPose({ x: 30, z: 14, yaw: 0 });
    shooter.reportPose({ x: 34, z: 20, yaw: 0 });
    await settle(world);
    expect(await traitor.advanceClock(60_000)).toBeNull();
    expect(await traitor.possess("zombie-0")).toBeNull();
    expect(traitor.state.you.possession?.monsterId).toBe("zombie-0");
    expect(await shooter.fireAtMonster("zombie-0")).toBeNull();
    await settle(world);
    expect(pains).toEqual([{ x: 30, z: 14 }]);
    expect(possessions).toHaveLength(1);
    expect(possessions[0]).toMatchObject({ monsterId: "zombie-0", active: true });
  });

  it("sends syncMatch once per interval while playing", async () => {
    let now = 0;
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world, () => now);
    const transport = (clients[0] as unknown as { transport: MatchTransport }).transport;
    const spy = vi.spyOn(transport, "call");
    clients[0].tick();
    clients[0].tick();
    now += SYNC_INTERVAL_MS;
    clients[0].tick();
    expect(spy.mock.calls.filter(([name]) => name === "syncMatch")).toHaveLength(2);
  });

  it("names the first active player as host", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    expect(clients[1].host()).toBe("test-a");
    await clients[0].leave();
    await settle(world);
    expect(clients[1].host()).toBe("test-b");
    expect(clients[0].state.phase).toBe("idle");
    expect(clients[0].state.match).toBeNull();
  });

  it("keeps the monster positions it just reported over slower room updates", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const host = clients[0];
    host.reportMonsters([{ id: "zombie-0", x: 34, z: 15, yaw: 0 }]);
    host.reportMonsters([{ id: "zombie-0", x: 34, z: 16, yaw: 0 }]);
    expect(host.state.match!.monsters["zombie-0"].z).toBe(16);
    await settle(world);
    await clients[1].refresh();
    clients[1].tick();
    await settle(world);
    expect(host.state.match!.monsters["zombie-0"].z).toBe(16);
    expect(world.roomState(host.state.roomId!).match.monsters["zombie-0"].z).toBe(15);
  });

  it("fails clearly on a protocol mismatch", async () => {
    const transport: MatchTransport = {
      account: "x",
      call: async <T,>() => ({ protocol: 999 }) as T,
      subscribeRoomState: () => () => {},
      subscribeRoomUsers: () => () => {},
      onRoomMessage: () => () => {},
    };
    const client = new MatchClient(transport);
    await client.join();
    expect(client.state.phase).toBe("error");
    expect(client.state.error).toContain("protocol");
  });

  it("uses what is nearby and can skip stages in test rooms", async () => {
    const world = new LocalWorld(new Server());
    const [a] = await joinAll(world);
    a.reportPose({ x: 6, z: 6, yaw: 0 });
    await settle(world);
    expect(await a.interact()).toBe("nothing_here");
    expect(await a.setStage("exit")).toBeNull();
    await settle(world);
    expect(a.state.match!.objectives.stage).toBe("exit");
  });

  it("notices when a tick ends its possession", async () => {
    const world = new LocalWorld(new Server());
    const clients = await joinAll(world);
    const traitor = clients.find((c) => c.state.you.role === "traitor")!;
    await traitor.advanceClock(60_000);
    traitor.reportPose({ x: 30, z: 14, yaw: 0 });
    await settle(world);
    expect(await traitor.possess("zombie-0")).toBeNull();
    expect(traitor.state.you.possession).not.toBeNull();

    const voters = clients.filter((c) => c !== traitor).slice(0, 2);
    const plate = [{ x: 10, z: 10 }, { x: 18, z: 10 }, { x: 10, z: 18 }, { x: 18, z: 18 }][
      traitor.state.match!.players.indexOf(traitor.account)
    ];
    for (const v of voters) v.reportPose({ x: plate.x, z: plate.z, yaw: 0 });
    await settle(world);
    await world.tickAll();
    await voters[0].advanceClock(5000);
    await world.tickAll();
    await settle(world);
    expect(traitor.state.match!.revealed).toBe(traitor.account);
    expect(traitor.state.you.possession).toBeNull();
  });
});
