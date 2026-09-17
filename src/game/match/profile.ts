import type { PlayerResult } from "./types";

export interface Profile {
  version: 1;
  games: number;
  wins: number;
  adventurerGames: number;
  adventurerWins: number;
  traitorGames: number;
  traitorWins: number;
  escapes: number;
  deaths: number;
  monsterKills: number;
  traitorDamage: number;
  possessions: number;
  lastPlayedAt: number;
}

type Counter = Exclude<keyof Profile, "version">;

const COUNTERS: Counter[] = [
  "games", "wins", "adventurerGames", "adventurerWins", "traitorGames", "traitorWins",
  "escapes", "deaths", "monsterKills", "traitorDamage", "possessions", "lastPlayedAt",
];

export function emptyProfile(): Profile {
  return {
    version: 1, games: 0, wins: 0, adventurerGames: 0, adventurerWins: 0, traitorGames: 0, traitorWins: 0,
    escapes: 0, deaths: 0, monsterKills: 0, traitorDamage: 0, possessions: 0, lastPlayedAt: 0,
  };
}

export function readProfile(raw: unknown): Profile {
  const profile = emptyProfile();
  if (!raw || typeof raw !== "object") return profile;
  const source = raw as Record<string, unknown>;
  for (const key of COUNTERS) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) profile[key] = value;
  }
  return profile;
}

export function addResult(profile: Profile, result: PlayerResult): Profile {
  const traitor = result.role === "traitor";
  const win = result.won ? 1 : 0;
  return {
    ...profile,
    games: profile.games + 1,
    wins: profile.wins + win,
    adventurerGames: profile.adventurerGames + (traitor ? 0 : 1),
    adventurerWins: profile.adventurerWins + (traitor ? 0 : win),
    traitorGames: profile.traitorGames + (traitor ? 1 : 0),
    traitorWins: profile.traitorWins + (traitor ? win : 0),
    escapes: profile.escapes + (result.escaped ? 1 : 0),
    deaths: profile.deaths + (result.died ? 1 : 0),
    monsterKills: profile.monsterKills + result.stats.monsterKills,
    traitorDamage: profile.traitorDamage + result.stats.traitorDamage,
    possessions: profile.possessions + result.stats.possessions,
    lastPlayedAt: Math.max(profile.lastPlayedAt, result.endedAt),
  };
}
