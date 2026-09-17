import {
  PLAYERS, actAs, captureMessages, errorOf, fillRoom, findTraitor, placeAll, roomMatch,
} from "./helpers";

const MINUTE = 60_000;

describe("rule errors", () => {
  test("come back to the caller as their code", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const adventurer = PLAYERS.filter((p) => p !== traitor)[0];
    actAs(server, adventurer, roomId);
    expect(await errorOf(server.possess("zombie-0"))).toContain("not_traitor");
    expect(await errorOf(server.fireAtMonster(""))).toContain("unavailable");
    actAs(server, traitor, roomId);
    expect(await errorOf(server.possess("zombie-0"))).toContain("not_ready");
  });

  test("block match actions in the lobby", async (server) => {
    server.connect({ account: "test-a" });
    const roomId = (await server.findMatch()).roomId;
    actAs(server, "test-a", roomId);
    expect(await errorOf(server.fireAtMonster("zombie-0"))).toContain("not_playing");
    expect(await errorOf(server.escape())).toContain("not_playing");
  });
});

describe("reportPose", () => {
  test("stores a valid pose and rejects bad numbers", async (server) => {
    const roomId = await fillRoom(server);
    actAs(server, PLAYERS[0], roomId);
    await server.reportPose({ x: 3, z: 4, yaw: 1 });
    const stored = (await $global.getRoomUserState(roomId, PLAYERS[0])).pose;
    expect([stored.x, stored.z, stored.yaw]).toEqual([3, 4, 1]);
    expect(await errorOf(server.reportPose({ x: Number.NaN, z: 0, yaw: 0 }))).toContain("unavailable");
    expect(await errorOf(server.reportPose(null))).toContain("unavailable");
  });
});

describe("possession", () => {
  test("links damage to the body and screams only to nearby players", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const [shooter, near, far] = PLAYERS.filter((p) => p !== traitor);
    await placeAll(server, roomId, {
      [traitor]: { x: 30, z: 14 },
      [shooter]: { x: 34, z: 20 },
      [near]: { x: 28, z: 16 },
      [far]: { x: 6, z: 6 },
    });
    actAs(server, traitor, roomId);
    await server.devAdvanceClock(MINUTE);

    const messages = captureMessages();
    try {
      const view = await server.possess("zombie-0");
      expect(view.possession.monsterId).toBe("zombie-0");
      actAs(server, shooter, roomId);
      await server.fireAtMonster("zombie-0");
    } finally {
      messages.restore();
    }

    const possession = messages.sent.filter((m) => m.type === "possession");
    expect(possession).toHaveLength(1);
    expect(possession[0].message.monsterId).toBe("zombie-0");
    expect(possession[0].message.active).toBe(true);
    expect(messages.sent.filter((m) => m.type === "pain").map((m) => m.account).sort()).toEqual([near, shooter].sort());
    const privates = messages.sent.filter((m) => m.type === "private");
    expect(privates.length > 0 && privates.every((m) => m.account === traitor)).toBe(true);

    actAs(server, traitor, roomId);
    const you = (await server.getMatchState()).you;
    expect(you.hp).toBe(86);
    expect(you.possession.monsterId).toBe("zombie-0");
    expect((await roomMatch(roomId)).monsters["zombie-0"].hp).toBe(66);
  });

  test("the traitor can let go early", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    await placeAll(server, roomId, { [traitor]: { x: 30, z: 14 } });
    actAs(server, traitor, roomId);
    await server.devAdvanceClock(MINUTE);
    await server.possess("zombie-0");
    const view = await server.release();
    expect(view.possession).toBeNull();
    expect((await roomMatch(roomId)).monsters["zombie-0"].possessed).toBe(false);
  });
});

describe("monsters", () => {
  test("only the host moves unpossessed monsters, and the host's monster can attack", async (server) => {
    const roomId = await fillRoom(server);
    const [host, target, other] = PLAYERS;
    await placeAll(server, roomId, { [target]: { x: 34, z: 15 } });

    actAs(server, other, roomId);
    await server.reportMonsters([{ id: "zombie-0", x: 1, z: 1, yaw: 0 }]);
    let zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect([zombie.x, zombie.z]).toEqual([34, 14]);

    actAs(server, host, roomId);
    await server.reportMonsters([{ id: "zombie-0", x: 34, z: 14.5, yaw: 1 }]);
    zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect([zombie.x, zombie.z, zombie.yaw]).toEqual([34, 14.5, 1]);

    await server.attackWithMonster("zombie-0", target);
    actAs(server, target, roomId);
    expect((await server.getMatchState()).you.hp).toBe(80);

    actAs(server, other, roomId);
    expect(await errorOf(server.attackWithMonster("zombie-0", target))).toContain("not_authority");
    expect(await errorOf(server.reportMonsters("nope"))).toContain("unavailable");
  });

  test("an adventurer can kill a monster", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const shooter = PLAYERS.filter((p) => p !== traitor)[0];
    await placeAll(server, roomId, { [shooter]: { x: 34, z: 20 } });
    actAs(server, shooter, roomId);
    for (let i = 0; i < 3; i++) {
      await server.fireAtMonster("zombie-0");
      await server.devAdvanceClock(100);
    }
    const zombie = (await roomMatch(roomId)).monsters["zombie-0"];
    expect(zombie.alive).toBe(false);
    expect(await errorOf(server.fireAtMonster("zombie-0"))).toContain("monster_dead");
  });
});

describe("escape", () => {
  test("needs the exit", async (server) => {
    const roomId = await fillRoom(server);
    await placeAll(server, roomId, { [PLAYERS[0]]: { x: 2, z: 2 } });
    actAs(server, PLAYERS[0], roomId);
    expect(await errorOf(server.escape())).toContain("not_at_exit");
  });

  test("adventurers win when every living adventurer is out, and everyone is told", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const adventurers = PLAYERS.filter((p) => p !== traitor);
    const spots: Record<string, { x: number; z: number }> = {};
    for (const a of adventurers) spots[a] = { x: 38, z: 26 };
    await placeAll(server, roomId, spots);

    const messages = captureMessages();
    try {
      for (const a of adventurers) {
        actAs(server, a, roomId);
        await server.escape();
      }
    } finally {
      messages.restore();
    }

    const match = await roomMatch(roomId);
    expect(match.result).toEqual({ winner: "adventurers", reason: "escaped", traitor });
    expect(match.escaped).toEqual(adventurers);
    const ended = messages.sent.filter((m) => m.type === "ended");
    expect(ended).toHaveLength(1);
    expect(ended[0].message.results).toHaveLength(4);
    expect((await $global.getUserState(adventurers[0])).profile).toMatchObject({ games: 1, wins: 1, escapes: 1 });
    expect((await $global.getUserState(traitor)).profile).toMatchObject({ games: 1, wins: 0, traitorGames: 1 });
  });
});
