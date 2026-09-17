import { BIND_MS, PLATE_HOLD_MS, PLATE_LOCK_MS, PLATE_RADIUS } from "./constants";
import { isActive } from "./lifecycle";
import { endPossession } from "./possession";
import type { MatchEvent, Poses, PublicMatch, SecretMatch, Vec2 } from "./types";
import { distance } from "./view";

export interface PlateTally { plate: number; accused: string; votes: number; needed: number; voters: string[] }

// Plate i names match.players[i]. It carries once more than half of the other living players stand on it.
export function tallyPlates(match: PublicMatch, poses: Poses, plates: Vec2[]): PlateTally[] {
  const tallies: PlateTally[] = [];
  plates.forEach((plate, i) => {
    const accused = match.players[i];
    if (!accused || !isActive(match, accused)) return;
    const others = match.players.filter((p) => p !== accused && isActive(match, p));
    if (others.length === 0) return;
    const voters = others.filter((p) => {
      const pose = poses[p];
      return !!pose && distance(pose, plate) <= PLATE_RADIUS;
    });
    tallies.push({ plate: i, accused, votes: voters.length, needed: Math.floor(others.length / 2) + 1, voters });
  });
  return tallies;
}

export function votingOpen(match: PublicMatch, now: number): boolean {
  return match.phase === "playing" && match.revealed === null && now >= match.vote.lockedUntil;
}

export function stepVote(match: PublicMatch, secret: SecretMatch, poses: Poses, plates: Vec2[], now: number): MatchEvent[] {
  const vote = match.vote;
  if (!votingOpen(match, now)) {
    vote.plate = null;
    return [];
  }
  const carried = tallyPlates(match, poses, plates).find((t) => t.votes >= t.needed) ?? null;
  if (!carried) {
    vote.plate = null;
    return [];
  }
  if (vote.plate !== carried.plate) {
    vote.plate = carried.plate;
    vote.since = now;
    return [];
  }
  if (now - vote.since < PLATE_HOLD_MS) return [];

  vote.plate = null;
  const guilty = carried.accused === secret.traitor;
  vote.last = { accused: carried.accused, guilty, at: now };
  if (guilty) {
    match.revealed = carried.accused;
    return endPossession(match, secret, now);
  }
  match.bound[carried.accused] = now + BIND_MS;
  vote.lockedUntil = now + PLATE_LOCK_MS;
  return [];
}
