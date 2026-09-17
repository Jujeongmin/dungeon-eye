import {
  MATCH_DURATION_MS, MATCH_PLAYERS, PLAYER_HP, POSSESS_FIRST_READY_MS, ZOMBIE_HP,
} from "./constants";
import {
  RuleViolation, type MonsterSpawn, type PlayerStats, type PublicMatch, type SecretMatch, type Vec2,
} from "./types";

export function createLobby(now: number): PublicMatch {
  return {
    version: 1,
    phase: "lobby",
    players: [],
    createdAt: now,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    monsters: {},
    dead: [],
    escaped: [],
    result: null,
    results: null,
    secretRef: null,
    devClockOffsetMs: 0,
  };
}

export function joinLobby(match: PublicMatch, account: string): void {
  if (match.players.includes(account)) return;
  if (match.phase !== "lobby") throw new RuleViolation("unavailable");
  if (match.players.length >= MATCH_PLAYERS) throw new RuleViolation("match_full");
  match.players.push(account);
}

export function leaveLobby(match: PublicMatch, account: string): void {
  if (match.phase !== "lobby") throw new RuleViolation("unavailable");
  match.players = match.players.filter((p) => p !== account);
}

export function startMatch(match: PublicMatch, now: number, rng: () => number, spawns: MonsterSpawn[]): SecretMatch {
  if (match.phase !== "lobby" || match.players.length !== MATCH_PLAYERS) throw new RuleViolation("not_playing");
  const index = Math.min(match.players.length - 1, Math.floor(rng() * match.players.length));

  match.phase = "playing";
  match.startedAt = now;
  match.endsAt = now + MATCH_DURATION_MS;
  match.monsters = {};
  for (const spawn of spawns) {
    match.monsters[spawn.id] = {
      kind: "zombie", x: spawn.x, z: spawn.z, yaw: 0, hp: ZOMBIE_HP,
      alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
    };
  }

  const hp: Record<string, number> = {};
  const stats: Record<string, PlayerStats> = {};
  for (const p of match.players) {
    hp[p] = PLAYER_HP;
    stats[p] = emptyStats();
  }
  return {
    traitor: match.players[index], hp, possession: null,
    readyAt: now + POSSESS_FIRST_READY_MS, lastShotAt: {}, stats,
  };
}

export function emptyStats(): PlayerStats {
  return { monsterKills: 0, monsterDamage: 0, playerDamage: 0, traitorDamage: 0, possessions: 0, possessedDamage: 0 };
}

export function isActive(match: PublicMatch, account: string): boolean {
  return match.players.includes(account) && !match.dead.includes(account) && !match.escaped.includes(account);
}

export function monsterSpawnsFor(layout: { zombieSpawns: Vec2[] }): MonsterSpawn[] {
  return layout.zombieSpawns.map((s, i) => ({ id: `zombie-${i}`, x: s.x, z: s.z }));
}
