import { PLAYERS, actAs, errorOf, fillRoom, findTraitor, placeAll, roomMatch } from "./helpers";

const SHARDS = [{ x: 38, z: 6 }, { x: 6, z: 30 }];
const GATE_1_SIDE = { x: 39.2, z: 18 };
const ALTAR = { x: 82, z: 34 };
const EXIT = { x: 54, z: 46 };
const PLATES = [{ x: 10, z: 10 }, { x: 18, z: 10 }, { x: 10, z: 18 }, { x: 18, z: 18 }];

describe("interact", () => {
  test("collects the shards and opens the first gate", async (server) => {
    const roomId = await fillRoom(server);
    const a = PLAYERS[0];
    const b = PLAYERS[1];
    await placeAll(server, roomId, { [a]: { x: 6, z: 6 } });
    actAs(server, a, roomId);
    expect(await errorOf(server.interact())).toContain("nothing_here");

    await placeAll(server, roomId, { [a]: SHARDS[0], [b]: SHARDS[1] });
    actAs(server, a, roomId);
    await server.interact();
    actAs(server, b, roomId);
    await server.interact();
    await placeAll(server, roomId, { [b]: GATE_1_SIDE });
    actAs(server, b, roomId);
    await server.interact();

    const match = await roomMatch(roomId);
    expect(match.objectives.stage).toBe("devices");
    expect(match.objectives.gates).toEqual([1]);
  });
});

describe("devSetStage", () => {
  test("is for test accounts only and the exit opens at the last stage", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const runner = PLAYERS.filter((p) => p !== traitor)[0];
    await placeAll(server, roomId, { [runner]: EXIT });
    actAs(server, runner, roomId);
    expect(await errorOf(server.escape())).toContain("exit_locked");
    expect(await errorOf(server.devSetStage("nowhere"))).toContain("unavailable");
    await server.devSetStage("exit");
    expect((await roomMatch(roomId)).objectives.stage).toBe("exit");
    await server.escape();
    expect((await roomMatch(roomId)).escaped).toEqual([runner]);

    server.connect({ account: "player-x", roomId });
    expect(await errorOf(server.devSetStage("boss"))).toContain("unavailable");
  });
});

describe("$roomTick", () => {
  test("carries a plate vote once the voters have held it", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const plate = PLAYERS.indexOf(traitor);
    const voters = PLAYERS.filter((p) => p !== traitor).slice(0, 2);
    await placeAll(server, roomId, { [voters[0]]: PLATES[plate], [voters[1]]: PLATES[plate] });
    await server.$roomTick(500, roomId);
    expect((await roomMatch(roomId)).vote.plate).toBe(plate);

    actAs(server, voters[0], roomId);
    await server.devAdvanceClock(5000);
    await server.$roomTick(500, roomId);
    const match = await roomMatch(roomId);
    expect(match.revealed).toBe(traitor);
    expect(match.vote.last.guilty).toBe(true);
  });

  test("moves the seal only while someone guards the altar", async (server) => {
    const roomId = await fillRoom(server);
    const a = PLAYERS[0];
    actAs(server, a, roomId);
    await server.devSetStage("seal");
    await placeAll(server, roomId, { [a]: ALTAR });
    actAs(server, a, roomId);
    await server.interact();
    expect((await roomMatch(roomId)).objectives.seal.waves).toBe(1);

    await server.devAdvanceClock(1000);
    await server.$roomTick(500, roomId);
    const progress = (await roomMatch(roomId)).objectives.seal.progressMs;
    expect(progress >= 1000 && progress < 1500).toBe(true);

    await placeAll(server, roomId, { [a]: { x: 6, z: 6 } });
    actAs(server, a, roomId);
    await server.devAdvanceClock(1000);
    await server.$roomTick(500, roomId);
    expect((await roomMatch(roomId)).objectives.seal.progressMs).toBe(progress);
  });
});
