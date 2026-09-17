import { addResult, readProfile } from "../../src/game/match/profile";
import type {
  PlayerResult, Pose, Poses, PublicMatch, SecretMatch, SecretRef,
} from "../../src/game/match/types";

export const RESULTS_COLLECTION = "match_results";

export function token(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

export function newRoomId(now: number): string {
  return `de-${now.toString(36)}-${token(6)}`;
}

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  return $lock(`de-room-${roomId}`, fn);
}

export function withMatchmakingLock<T>(fn: () => Promise<T>): Promise<T> {
  return $lock("de-matchmaking", fn);
}

function isMatch(value: unknown): value is PublicMatch {
  return !!value && typeof value === "object" && (value as { version?: unknown }).version === 1;
}

export async function readMatch(roomId: string): Promise<PublicMatch | null> {
  const state = await $global.getRoomState(roomId);
  return isMatch(state.match) ? state.match : null;
}

export async function writeMatch(roomId: string, match: PublicMatch): Promise<void> {
  await $global.updateRoomState(roomId, { match });
}

export async function listLobbies(): Promise<{ roomId: string; match: PublicMatch }[]> {
  const lobbies: { roomId: string; match: PublicMatch }[] = [];
  for (const state of await $global.getAllRoomStates()) {
    if (typeof state.roomId === "string" && isMatch(state.match) && state.match.phase === "lobby") {
      lobbies.push({ roomId: state.roomId, match: state.match });
    }
  }
  return lobbies;
}

// Readable by any client that learns the name: obscurity only, by design (see plan decisions).
export async function createSecret(secret: SecretMatch): Promise<SecretRef> {
  const collection = `ds_${token(24)}`;
  const item = await $global.addCollectionItem(collection, { secret });
  return { collection, id: item.__id };
}

export async function readSecret(match: PublicMatch): Promise<SecretMatch | null> {
  const ref = match.secretRef;
  if (!ref) return null;
  const item = await $global.getCollectionItem(ref.collection, ref.id);
  return (item.secret as SecretMatch | undefined) ?? null;
}

export async function writeSecret(match: PublicMatch, secret: SecretMatch): Promise<void> {
  const ref = match.secretRef;
  if (ref) await $global.updateCollectionItem(ref.collection, { __id: ref.id, secret });
}

export async function deleteSecret(match: PublicMatch): Promise<void> {
  if (match.secretRef) await $global.deleteCollection(match.secretRef.collection);
}

export function isPose(value: unknown): value is Pose {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return [p.x, p.z, p.yaw].every((n) => typeof n === "number" && Number.isFinite(n));
}

export async function readPose(roomId: string, account: string): Promise<Pose | null> {
  const pose: unknown = (await $global.getRoomUserState(roomId, account)).pose;
  return isPose(pose) ? { x: pose.x, z: pose.z, yaw: pose.yaw } : null;
}

export async function readPoses(roomId: string, accounts: string[]): Promise<Poses> {
  const poses: Poses = {};
  for (const account of accounts) poses[account] = await readPose(roomId, account);
  return poses;
}

export async function writePose(roomId: string, account: string, pose: Pose, at: number): Promise<void> {
  await $global.updateRoomUserState(roomId, account, { pose: { x: pose.x, z: pose.z, yaw: pose.yaw, at } });
}

export async function saveResults(matchId: string, results: PlayerResult[]): Promise<void> {
  for (const result of results) {
    await $global.addCollectionItem(RESULTS_COLLECTION, { ...result, matchId });
    const state = await $global.getUserState(result.account);
    await $global.updateUserState(result.account, { profile: addResult(readProfile(state.profile), result) });
  }
}
