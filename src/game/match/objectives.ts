import type { LevelLayout } from "../rules/levelLayout";
import {
  DEVICE_ACTIVE_MS, INTERACT_RANGE, RANGE_SLACK, SEAL_DURATION_MS, SEAL_RADIUS, SEAL_TICK_CAP_MS,
  SEAL_WAVE_AT_MS, WAVE_SIZE,
} from "./constants";
import { isActive, isBound, newMonster } from "./lifecycle";
import {
  RuleViolation, STAGES, type Poses, type PublicMatch, type SecretMatch, type Stage, type Vec2,
} from "./types";
import { distance } from "./view";

export type ObjectiveLayout = Pick<LevelLayout, "shards" | "devices" | "altar" | "waveSpawns" | "bossSpawn" | "gates">;

export const BOSS_ID = "boss";
const REACH = INTERACT_RANGE + RANGE_SLACK;

export type Interactable =
  | { kind: "shard"; index: number; at: Vec2 }
  | { kind: "gate"; at: Vec2 }
  | { kind: "device"; index: number; at: Vec2 }
  | { kind: "altar"; at: Vec2 };

// What a player standing here could use right now, nearest first. The server and the HUD share it.
export function interactableNear(match: PublicMatch, level: ObjectiveLayout, pose: Vec2, now: number): Interactable | null {
  const o = match.objectives;
  const options: Interactable[] = [];
  if (o.stage === "shards") {
    level.shards.forEach((at, index) => {
      if (!o.shards[index]) options.push({ kind: "shard", index, at });
    });
    const gate = level.gates.find((g) => g.n === 1);
    if (gate && o.shards.every(Boolean)) options.push({ kind: "gate", at: gate });
  }
  if (o.stage === "devices") {
    level.devices.forEach((at, index) => {
      if (o.devices[index] <= now) options.push({ kind: "device", index, at });
    });
  }
  if (o.stage === "seal" && level.altar && o.seal.lastAt === null) options.push({ kind: "altar", at: level.altar });

  let best: Interactable | null = null;
  let bestDistance = REACH;
  for (const option of options) {
    const d = distance(pose, option.at);
    if (d <= bestDistance) {
      best = option;
      bestDistance = d;
    }
  }
  return best;
}

export function operateObjective(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Vec2 | null, level: ObjectiveLayout, now: number,
): void {
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  // A possessing traitor's body stands frozen.
  if (secret.possession && secret.traitor === account) throw new RuleViolation("unavailable");
  if (isBound(match, account, now)) throw new RuleViolation("bound");
  if (!pose) throw new RuleViolation("nothing_here");

  const o = match.objectives;
  const target = interactableNear(match, level, pose, now);
  if (!target) {
    const gate = level.gates.find((g) => g.n === 1);
    if (o.stage === "shards" && gate && distance(pose, gate) <= REACH) throw new RuleViolation("need_shards");
    throw new RuleViolation("nothing_here");
  }

  switch (target.kind) {
    case "shard":
      o.shards[target.index] = true;
      break;
    case "gate":
      openGate(match, 1);
      o.stage = "devices";
      break;
    case "device":
      o.devices[target.index] = now + DEVICE_ACTIVE_MS;
      if (o.devices.every((until) => until > now)) {
        openGate(match, 2);
        o.stage = "seal";
      }
      break;
    case "altar":
      o.seal.lastAt = now;
      spawnWave(match, level);
      break;
  }
}

// Clock-driven progress. The seal needs positions, so it only moves when poses are given (server ticks).
export function advanceObjectives(match: PublicMatch, poses: Poses | null, level: ObjectiveLayout, now: number): void {
  if (match.phase !== "playing") return;
  const o = match.objectives;
  const altar = level.altar;
  if (o.stage === "seal" && o.seal.lastAt !== null && poses && altar) {
    const guarded = match.players.some((p) => {
      const pose = poses[p];
      return !!pose && isActive(match, p) && distance(pose, altar) <= SEAL_RADIUS;
    });
    const step = Math.min(Math.max(0, now - o.seal.lastAt), SEAL_TICK_CAP_MS);
    o.seal.lastAt = now;
    if (guarded) o.seal.progressMs = Math.min(SEAL_DURATION_MS, o.seal.progressMs + step);
    while (o.seal.waves < SEAL_WAVE_AT_MS.length && o.seal.progressMs >= SEAL_WAVE_AT_MS[o.seal.waves]) {
      spawnWave(match, level);
    }
    if (o.seal.progressMs >= SEAL_DURATION_MS) wakeBoss(match, level);
  }
  if (o.stage === "boss") {
    const boss = match.monsters[BOSS_ID];
    if (!boss || !boss.alive) o.stage = "exit";
  }
}

// Development shortcut: jump forward to a stage with everything before it done.
export function skipToStage(match: PublicMatch, level: ObjectiveLayout, stage: Stage, now: number): void {
  const order = STAGES.indexOf(stage);
  if (order < 0) throw new RuleViolation("unavailable");
  const o = match.objectives;
  if (order >= 1) {
    o.shards = o.shards.map(() => true);
    openGate(match, 1);
  }
  if (order >= 2) openGate(match, 2);
  if (order >= 3) {
    o.seal = { progressMs: SEAL_DURATION_MS, lastAt: now, waves: SEAL_WAVE_AT_MS.length };
    wakeBoss(match, level);
  }
  const boss = match.monsters[BOSS_ID];
  if (order >= 4 && boss) {
    boss.hp = 0;
    boss.alive = false;
  }
  o.stage = stage;
  // Skipping past gates would queue a vote for each; keep only the latest gate's vote.
  match.vote.held = Math.max(match.vote.held, o.gates.length - 1);
}

function openGate(match: PublicMatch, n: number): void {
  if (!match.objectives.gates.includes(n)) match.objectives.gates.push(n);
}

function wakeBoss(match: PublicMatch, level: ObjectiveLayout): void {
  openGate(match, 3);
  match.objectives.stage = "boss";
  if (level.bossSpawn && !match.monsters[BOSS_ID]) {
    match.monsters[BOSS_ID] = newMonster("boss", level.bossSpawn.x, level.bossSpawn.z);
  }
}

function spawnWave(match: PublicMatch, level: ObjectiveLayout): void {
  const seal = match.objectives.seal;
  const spots = level.waveSpawns;
  for (let i = 0; i < WAVE_SIZE && spots.length > 0; i++) {
    const at = spots[(seal.waves * WAVE_SIZE + i) % spots.length];
    match.monsters[`wave-${seal.waves}-${i}`] = newMonster("zombie", at.x, at.z);
  }
  seal.waves += 1;
}
