export const PROTOCOL_VERSION = 1;
export const MATCH_PLAYERS = 4;
export const MATCH_DURATION_MS = 8 * 60_000;
export const PLAYER_HP = 100;

export const POSSESS_FIRST_READY_MS = 60_000;
export const POSSESS_DURATION_MS = 8_000;
export const POSSESS_COOLDOWN_MS = 45_000;
export const POSSESS_RANGE = 12;
export const LINK_DAMAGE_RATIO = 0.4;
export const MONSTER_DEATH_BODY_DAMAGE = 35;
export const PAIN_RADIUS = 10;

export const ZOMBIE_HP = 100;
export const ZOMBIE_ATTACK_DAMAGE = 20;
export const ZOMBIE_ATTACK_RANGE = 1.8;
export const ZOMBIE_ATTACK_INTERVAL_MS = 1_200;

export const AKM_DAMAGE = 34;
export const AKM_FIRE_INTERVAL_MS = 100;
export const AKM_RANGE = 60;

// Positions arrive throttled from clients, so range checks allow for lag.
export const RANGE_SLACK = 1.5;
export const EXIT_RADIUS = 2;
