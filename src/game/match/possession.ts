import { POSSESS_COOLDOWN_MS, POSSESS_DURATION_MS, POSSESS_RANGE } from "./constants";
import { isActive } from "./lifecycle";
import { RuleViolation, type MatchEvent, type PublicMatch, type SecretMatch, type Vec2 } from "./types";
import { distance } from "./view";

export function endPossession(match: PublicMatch, secret: SecretMatch, endedAt: number): MatchEvent[] {
  const possession = secret.possession;
  if (!possession) return [];
  const monster = match.monsters[possession.monsterId];
  if (monster) monster.possessed = false;
  secret.possession = null;
  secret.readyAt = endedAt + POSSESS_COOLDOWN_MS;
  return [
    { type: "possession", monsterId: possession.monsterId, active: false, endsAt: null },
    { type: "private", account: secret.traitor },
  ];
}

export function expirePossession(match: PublicMatch, secret: SecretMatch, now: number): MatchEvent[] {
  const possession = secret.possession;
  if (!possession || now < possession.endsAt) return [];
  return endPossession(match, secret, possession.endsAt);
}

export function startPossession(
  match: PublicMatch, secret: SecretMatch, account: string, monsterId: string, bodyPose: Vec2 | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (account !== secret.traitor) throw new RuleViolation("not_traitor");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (match.revealed === account) throw new RuleViolation("sealed");
  if (secret.possession) throw new RuleViolation("already_possessing");
  if (now < secret.readyAt) throw new RuleViolation("not_ready");
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (monster.kind === "boss") throw new RuleViolation("unavailable");
  if (!bodyPose || distance(bodyPose, monster) > POSSESS_RANGE) throw new RuleViolation("out_of_range");

  const endsAt = now + POSSESS_DURATION_MS;
  secret.possession = { monsterId, endsAt };
  monster.possessed = true;
  secret.stats[account].possessions += 1;
  return [
    ...events,
    { type: "possession", monsterId, active: true, endsAt },
    { type: "private", account },
  ];
}

export function releasePossession(match: PublicMatch, secret: SecretMatch, account: string, now: number): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (account !== secret.traitor) throw new RuleViolation("not_traitor");
  if (!secret.possession) throw new RuleViolation("not_possessing");
  return [...events, ...endPossession(match, secret, now)];
}
