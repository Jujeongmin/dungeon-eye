import { endPossession, expirePossession } from "./possession";
import {
  RuleViolation, type EndReason, type MatchEvent, type PlayerResult, type PublicMatch, type SecretMatch, type Winner,
} from "./types";

export function markLeft(match: PublicMatch, secret: SecretMatch | null, account: string, now: number): MatchEvent[] {
  if (match.phase !== "playing" || !secret) return [];
  if (!match.players.includes(account) || match.dead.includes(account) || match.escaped.includes(account)) return [];
  match.dead.push(account);
  secret.hp[account] = 0;
  return account === secret.traitor ? endPossession(match, secret, now) : [];
}

export function resolveOutcome(match: PublicMatch, secret: SecretMatch | null, now: number): MatchEvent[] {
  if (match.phase !== "playing" || !secret) return [];
  const events = expirePossession(match, secret, now);
  const adventurers = match.players.filter((p) => p !== secret.traitor);
  const inside = adventurers.filter((p) => !match.dead.includes(p) && !match.escaped.includes(p));
  const escaped = adventurers.filter((p) => match.escaped.includes(p));

  let end: { winner: Winner; reason: EndReason; at: number } | null = null;
  if (inside.length === 0) {
    end = escaped.length > 0
      ? { winner: "adventurers", reason: "escaped", at: now }
      : { winner: "traitor", reason: "wiped", at: now };
  }
  if (!end) return events;

  events.push(...endPossession(match, secret, end.at));
  match.phase = "ended";
  match.endedAt = end.at;
  match.result = { winner: end.winner, reason: end.reason, traitor: secret.traitor };
  events.push({ type: "ended" });
  return events;
}

export function settleResults(match: PublicMatch, secret: SecretMatch): PlayerResult[] {
  const result = match.result;
  if (match.phase !== "ended" || !result || match.startedAt === null || match.endedAt === null) {
    throw new RuleViolation("not_playing");
  }
  const startedAt = match.startedAt;
  const endedAt = match.endedAt;
  return match.players.map((account) => {
    const role = account === secret.traitor ? "traitor" : "adventurer";
    return {
      account,
      role,
      won: (role === "traitor") === (result.winner === "traitor"),
      escaped: match.escaped.includes(account),
      died: match.dead.includes(account),
      reason: result.reason,
      durationMs: endedAt - startedAt,
      endedAt,
      stats: { ...secret.stats[account] },
    };
  });
}
