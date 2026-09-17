export type Phase = "lobby" | "playing" | "ended";
export type Winner = "adventurers" | "traitor";
export type EndReason = "escaped" | "wiped" | "timeout";

export interface Vec2 { x: number; z: number }
export interface Pose extends Vec2 { yaw: number }
export type Poses = Record<string, Pose | null>;

export interface MonsterState {
  kind: "zombie";
  x: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
  possessed: boolean;
  stunnedUntil: number;
  attackReadyAt: number;
}

export interface SecretRef { collection: string; id: string }
export interface MatchResult { winner: Winner; reason: EndReason; traitor: string }

export interface PublicMatch {
  version: 1;
  phase: Phase;
  players: string[];
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  endedAt: number | null;
  monsters: Record<string, MonsterState>;
  dead: string[];
  escaped: string[];
  result: MatchResult | null;
  // Filled by the server when the match ends; the traitor is public by then.
  results: PlayerResult[] | null;
  secretRef: SecretRef | null;
  devClockOffsetMs: number;
}

export interface Possession { monsterId: string; endsAt: number }

// Per-player counters for one match. Kept secret: traitor-side numbers would reveal the traitor.
export interface PlayerStats {
  monsterKills: number;
  monsterDamage: number;
  playerDamage: number;
  traitorDamage: number;
  possessions: number;
  possessedDamage: number;
}

export interface SecretMatch {
  traitor: string;
  hp: Record<string, number>;
  possession: Possession | null;
  readyAt: number;
  lastShotAt: Record<string, number>;
  stats: Record<string, PlayerStats>;
}

export interface PlayerResult {
  account: string;
  role: "adventurer" | "traitor";
  won: boolean;
  escaped: boolean;
  died: boolean;
  reason: EndReason;
  durationMs: number;
  endedAt: number;
  stats: PlayerStats;
}

export type MatchEvent =
  | { type: "private"; account: string }
  | { type: "pain"; x: number; z: number; to: string[] }
  | { type: "possession"; monsterId: string; active: boolean; endsAt: number | null }
  | { type: "ended" };

export type RuleError =
  | "not_playing" | "not_traitor" | "not_ready" | "already_possessing" | "not_possessing"
  | "unavailable" | "no_monster" | "monster_dead" | "out_of_range" | "too_fast"
  | "not_authority" | "stunned" | "no_target" | "not_at_exit" | "match_full";

export class RuleViolation extends Error {
  readonly code: RuleError;
  constructor(code: RuleError) {
    super(code);
    this.code = code;
    this.name = "RuleViolation";
  }
}

export interface MonsterSpawn { id: string; x: number; z: number }
