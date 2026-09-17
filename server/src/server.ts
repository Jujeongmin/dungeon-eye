import { MATCH_PLAYERS, PROTOCOL_VERSION } from "../../src/game/match/constants";
import {
  applyMonsterPoses, monsterAttack, reachExit, shootMonster, type MonsterPoseUpdate,
} from "../../src/game/match/damage";
import { createLobby, joinLobby, leaveLobby, monsterSpawnsFor, startMatch } from "../../src/game/match/lifecycle";
import { advanceObjectives, operateObjective, skipToStage } from "../../src/game/match/objectives";
import { markLeft, resolveOutcome, settleResults } from "../../src/game/match/outcome";
import { releasePossession, startPossession } from "../../src/game/match/possession";
import {
  RuleViolation, STAGES, type MatchEvent, type PublicMatch, type SecretMatch, type Stage,
} from "../../src/game/match/types";
import { privateView, type PrivateView } from "../../src/game/match/view";
import { stepVote } from "../../src/game/match/vote";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import {
  createSecret, deleteSecret, isPose, listLobbies, newRoomId, readMatch, readPose, readPoses, readSecret,
  saveResults, withMatchmakingLock, withRoomLock, writeMatch, writePose, writeSecret,
} from "./store";

const LEVEL = parseLevel(RUINS, TILE_SIZE);
const SPAWNS = monsterSpawnsFor(LEVEL);

interface RoomContext {
  roomId: string;
  account: string;
  match: PublicMatch;
  secret: SecretMatch | null;
  now: number;
  events: MatchEvent[];
}

export interface MatchSnapshot {
  roomId: string;
  serverNow: number;
  match: PublicMatch;
  you: PrivateView;
}

function clock(match: PublicMatch): number {
  return Date.now() + match.devClockOffsetMs;
}

function currentRoom(): string {
  const roomId = $sender.roomId;
  if (typeof roomId !== "string" || roomId.length === 0) throw new RuleViolation("unavailable");
  return roomId;
}

function requireText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new RuleViolation("unavailable");
  return value;
}

function requireLive(ctx: RoomContext): SecretMatch {
  if (ctx.match.phase !== "playing" || !ctx.secret) throw new RuleViolation("not_playing");
  return ctx.secret;
}

function requireTestAccount(): void {
  if (!$sender.account.startsWith("test-")) throw new RuleViolation("unavailable");
}

// Every in-room request: lock, load, apply rules, settle the clock, save, then notify.
async function inRoom<T>(work: (ctx: RoomContext) => T | Promise<T>): Promise<T> {
  const roomId = currentRoom();
  return withRoomLock(roomId, async () => {
    const match = await readMatch(roomId);
    if (!match) throw new RuleViolation("unavailable");
    const ctx: RoomContext = {
      roomId, account: $sender.account, match, secret: await readSecret(match), now: clock(match), events: [],
    };
    const value = await work(ctx);
    advanceObjectives(ctx.match, null, LEVEL, ctx.now);
    ctx.events.push(...resolveOutcome(ctx.match, ctx.secret, ctx.now));
    await commit(ctx);
    notify(ctx);
    return value;
  });
}

async function commit(ctx: RoomContext): Promise<void> {
  const { roomId, match, secret } = ctx;
  if (secret && match.phase === "ended" && match.secretRef) {
    const results = settleResults(match, secret);
    match.results = results;
    await saveResults(roomId, results);
    await deleteSecret(match);
    match.secretRef = null;
  } else if (secret) {
    await writeSecret(match, secret);
  }
  await writeMatch(roomId, match);
}

function notify(ctx: RoomContext): void {
  const { match, secret, events } = ctx;
  const privates = new Set<string>();
  for (const event of events) {
    switch (event.type) {
      case "private":
        privates.add(event.account);
        break;
      case "pain":
        for (const to of event.to) $room.sendMessageToUser("pain", to, { x: event.x, z: event.z });
        break;
      case "possession":
        $room.broadcastToRoom("possession", { monsterId: event.monsterId, active: event.active, endsAt: event.endsAt });
        break;
      case "ended":
        $room.broadcastToRoom("ended", { result: match.result, results: match.results });
        break;
    }
  }
  for (const account of privates) $room.sendMessageToUser("private", account, privateView(match, secret, account));
}

export class Server {
  async getServerVersion(): Promise<{ protocol: number }> {
    return { protocol: PROTOCOL_VERSION };
  }

  async findMatch(): Promise<{ roomId: string }> {
    const account = $sender.account;
    return withMatchmakingLock(async () => {
      const lobbies = await listLobbies();
      const target = lobbies.find((l) => l.match.players.includes(account))
        ?? lobbies.find((l) => l.match.players.length < MATCH_PLAYERS);
      const roomId = target?.roomId ?? newRoomId(Date.now());
      await $global.joinRoom(roomId);
      await withRoomLock(roomId, async () => {
        const match = (await readMatch(roomId)) ?? createLobby(Date.now());
        joinLobby(match, account);
        if (match.players.length === MATCH_PLAYERS) {
          match.secretRef = await createSecret(startMatch(match, clock(match), Math.random, SPAWNS));
        }
        await writeMatch(roomId, match);
      });
      return { roomId };
    });
  }

  async leaveMatch(): Promise<void> {
    await inRoom((ctx) => {
      if (ctx.match.phase === "lobby") leaveLobby(ctx.match, ctx.account);
      else ctx.events.push(...markLeft(ctx.match, ctx.secret, ctx.account, ctx.now));
    });
    await $global.leaveRoom();
  }

  async getMatchState(): Promise<MatchSnapshot> {
    return inRoom((ctx) => ({
      roomId: ctx.roomId,
      serverNow: ctx.now,
      match: ctx.match,
      you: privateView(ctx.match, ctx.secret, ctx.account),
    }));
  }

  async syncMatch(): Promise<void> {
    await inRoom(() => undefined);
  }

  async devAdvanceClock(ms: number): Promise<number> {
    requireTestAccount();
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) throw new RuleViolation("unavailable");
    return inRoom((ctx) => {
      ctx.match.devClockOffsetMs += ms;
      ctx.now += ms;
      return ctx.now;
    });
  }

  async devSetStage(stage: unknown): Promise<void> {
    requireTestAccount();
    if (typeof stage !== "string" || !(STAGES as readonly string[]).includes(stage)) {
      throw new RuleViolation("unavailable");
    }
    await inRoom((ctx) => {
      requireLive(ctx);
      skipToStage(ctx.match, LEVEL, stage as Stage, ctx.now);
    });
  }

  async reportPose(pose: unknown): Promise<void> {
    const roomId = currentRoom();
    if (!isPose(pose)) throw new RuleViolation("unavailable");
    await writePose(roomId, $sender.account, pose, Date.now());
  }

  async reportMonsters(updates: unknown): Promise<void> {
    if (!Array.isArray(updates) || updates.length > 32) throw new RuleViolation("unavailable");
    const valid = updates.filter((u): u is MonsterPoseUpdate => isPose(u) && typeof (u as { id?: unknown }).id === "string");
    await inRoom((ctx) => {
      const secret = requireLive(ctx);
      ctx.events.push(...applyMonsterPoses(ctx.match, secret, ctx.account, valid, ctx.now));
    });
  }

  async possess(monsterId: unknown): Promise<PrivateView> {
    const id = requireText(monsterId);
    return inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const body = await readPose(ctx.roomId, ctx.account);
      ctx.events.push(...startPossession(ctx.match, secret, ctx.account, id, body, ctx.now));
      return privateView(ctx.match, secret, ctx.account);
    });
  }

  async release(): Promise<PrivateView> {
    return inRoom((ctx) => {
      const secret = requireLive(ctx);
      ctx.events.push(...releasePossession(ctx.match, secret, ctx.account, ctx.now));
      return privateView(ctx.match, secret, ctx.account);
    });
  }

  async fireAtMonster(monsterId: unknown): Promise<void> {
    const id = requireText(monsterId);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const poses = await readPoses(ctx.roomId, ctx.match.players);
      ctx.events.push(...shootMonster(ctx.match, secret, ctx.account, id, poses[ctx.account] ?? null, poses, ctx.now));
    });
  }

  async attackWithMonster(monsterId: unknown, target: unknown): Promise<void> {
    const id = requireText(monsterId);
    const who = requireText(target);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const to = await readPose(ctx.roomId, who);
      ctx.events.push(...monsterAttack(ctx.match, secret, ctx.account, id, who, to, ctx.now));
    });
  }

  async interact(): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const pose = await readPose(ctx.roomId, ctx.account);
      operateObjective(ctx.match, secret, ctx.account, pose, LEVEL, ctx.now);
    });
  }

  async escape(): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const pose = await readPose(ctx.roomId, ctx.account);
      ctx.events.push(...reachExit(ctx.match, secret, ctx.account, pose, LEVEL.exits, ctx.now));
    });
  }

  // Platform hook (every 200-1000 ms per active room). Drives the clock-based rules:
  // plate votes, the seal channel and the deadline. Saves only when something changed.
  async $roomTick(_deltaMillis: number, roomId: string): Promise<void> {
    const peek = await readMatch(roomId);
    if (!peek || peek.phase !== "playing") return;
    await withRoomLock(roomId, async () => {
      const match = await readMatch(roomId);
      const secret = match ? await readSecret(match) : null;
      if (!match || !secret || match.phase !== "playing") return;
      const before = JSON.stringify([match, secret]);
      const now = clock(match);
      const ctx: RoomContext = { roomId, account: "", match, secret, now, events: [] };
      const poses = await readPoses(roomId, match.players);
      ctx.events.push(...stepVote(match, secret, poses, LEVEL.plates, now));
      advanceObjectives(match, poses, LEVEL, now);
      ctx.events.push(...resolveOutcome(match, secret, now));
      // No $room outside a request: clients see the changes through the room state.
      if (JSON.stringify([match, secret]) !== before) await commit(ctx);
    });
  }
}
