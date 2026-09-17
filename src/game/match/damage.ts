import {
  AKM_DAMAGE, AKM_FIRE_INTERVAL_MS, AKM_RANGE, BODY_HIT_STUN_MS, EXIT_RADIUS, LINK_DAMAGE_RATIO,
  MONSTER_DEATH_BODY_DAMAGE, PAIN_RADIUS, RANGE_SLACK, ZOMBIE_ATTACK_DAMAGE, ZOMBIE_ATTACK_INTERVAL_MS,
  ZOMBIE_ATTACK_RANGE,
} from "./constants";
import { isActive } from "./lifecycle";
import { endPossession, expirePossession } from "./possession";
import {
  RuleViolation, type MatchEvent, type Pose, type Poses, type PublicMatch, type SecretMatch, type Vec2,
} from "./types";
import { distance, nearbyAccounts } from "./view";

export interface MonsterPoseUpdate { id: string; x: number; z: number; yaw: number }

export function monsterAuthority(match: PublicMatch, secret: SecretMatch, monsterId: string): string | null {
  if (secret.possession?.monsterId === monsterId) return secret.traitor;
  return match.players.find((p) => isActive(match, p)) ?? null;
}

export function applyMonsterPoses(
  match: PublicMatch, secret: SecretMatch, caller: string, updates: MonsterPoseUpdate[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") return events;
  for (const u of updates) {
    const monster = match.monsters[u.id];
    if (!monster || !monster.alive) continue;
    if (![u.x, u.z, u.yaw].every(Number.isFinite)) continue;
    if (monsterAuthority(match, secret, u.id) !== caller) continue;
    monster.x = u.x;
    monster.z = u.z;
    monster.yaw = u.yaw;
  }
  return events;
}

export function shootMonster(
  match: PublicMatch, secret: SecretMatch, shooter: string, monsterId: string,
  shooterPose: Pose | null, poses: Poses, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginShot(match, secret, shooter, shooterPose, now);
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (distance(from, monster) > AKM_RANGE + RANGE_SLACK) throw new RuleViolation("out_of_range");

  secret.lastShotAt[shooter] = now;
  const dealt = Math.min(AKM_DAMAGE, monster.hp);
  monster.hp -= dealt;
  const stats = secret.stats[shooter];
  stats.monsterDamage += dealt;
  const killed = monster.hp === 0;
  if (killed) {
    monster.alive = false;
    stats.monsterKills += 1;
  }

  if (monster.possessed) {
    const traitor = secret.traitor;
    const body = Math.round(dealt * LINK_DAMAGE_RATIO) + (killed ? MONSTER_DEATH_BODY_DAMAGE : 0);
    const applied = Math.min(body, secret.hp[traitor] ?? 0);
    if (shooter !== traitor) stats.traitorDamage += applied;
    const bodyPose = poses[traitor];
    if (bodyPose) {
      events.push({ type: "pain", x: bodyPose.x, z: bodyPose.z, to: nearbyAccounts(poses, bodyPose, PAIN_RADIUS, traitor) });
    }
    events.push(...damageBody(match, secret, traitor, body, now));
    if (killed) events.push(...endPossession(match, secret, now));
  }
  return events;
}

export function shootPlayer(
  match: PublicMatch, secret: SecretMatch, shooter: string, target: string,
  shooterPose: Pose | null, targetPose: Pose | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginShot(match, secret, shooter, shooterPose, now);
  if (target === shooter || !isActive(match, target)) throw new RuleViolation("no_target");
  if (!targetPose || distance(from, targetPose) > AKM_RANGE + RANGE_SLACK) throw new RuleViolation("out_of_range");

  secret.lastShotAt[shooter] = now;
  const applied = Math.min(AKM_DAMAGE, secret.hp[target] ?? 0);
  const stats = secret.stats[shooter];
  stats.playerDamage += applied;
  if (target === secret.traitor) {
    stats.traitorDamage += applied;
    const possession = secret.possession;
    if (possession) {
      events.push(...endPossession(match, secret, now));
      const monster = match.monsters[possession.monsterId];
      if (monster) monster.stunnedUntil = now + BODY_HIT_STUN_MS;
    }
  }
  events.push(...damageBody(match, secret, target, AKM_DAMAGE, now));
  return events;
}

export function monsterAttack(
  match: PublicMatch, secret: SecretMatch, caller: string, monsterId: string,
  target: string, targetPose: Pose | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (monsterAuthority(match, secret, monsterId) !== caller) throw new RuleViolation("not_authority");
  if (now < monster.stunnedUntil) throw new RuleViolation("stunned");
  if (now < monster.attackReadyAt) throw new RuleViolation("too_fast");
  if (!isActive(match, target)) throw new RuleViolation("no_target");
  if (!targetPose || distance(monster, targetPose) > ZOMBIE_ATTACK_RANGE + RANGE_SLACK) {
    throw new RuleViolation("out_of_range");
  }

  monster.attackReadyAt = now + ZOMBIE_ATTACK_INTERVAL_MS;
  if (monster.possessed) {
    secret.stats[secret.traitor].possessedDamage += Math.min(ZOMBIE_ATTACK_DAMAGE, secret.hp[target] ?? 0);
  }
  events.push(...damageBody(match, secret, target, ZOMBIE_ATTACK_DAMAGE, now));
  return events;
}

export function reachExit(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, exits: Vec2[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (!pose || !exits.some((e) => distance(pose, e) <= EXIT_RADIUS)) throw new RuleViolation("not_at_exit");
  match.escaped.push(account);
  if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  return events;
}

function beginShot(match: PublicMatch, secret: SecretMatch, shooter: string, shooterPose: Pose | null, now: number): Pose {
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, shooter)) throw new RuleViolation("unavailable");
  // A possessing traitor's body stands frozen; it cannot shoot.
  if (secret.possession && secret.traitor === shooter) throw new RuleViolation("unavailable");
  const last = secret.lastShotAt[shooter];
  if (last !== undefined && now - last < AKM_FIRE_INTERVAL_MS) throw new RuleViolation("too_fast");
  if (!shooterPose) throw new RuleViolation("out_of_range");
  return shooterPose;
}

function damageBody(match: PublicMatch, secret: SecretMatch, account: string, amount: number, now: number): MatchEvent[] {
  const hp = Math.max(0, (secret.hp[account] ?? 0) - amount);
  secret.hp[account] = hp;
  const events: MatchEvent[] = [{ type: "private", account }];
  if (hp === 0 && !match.dead.includes(account)) {
    match.dead.push(account);
    if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  }
  return events;
}
