import { stepPlayer, type SolidTest } from "../rules/movement";
import { ZOMBIE_ATTACK_RANGE } from "./constants";
import type { MonsterPoseUpdate } from "./damage";
import { isActive } from "./lifecycle";
import type { Poses, PublicMatch } from "./types";
import { distance } from "./view";

export const ZOMBIE_SPEED = 1.8;
export const ZOMBIE_AGGRO_RANGE = 14;
const STOP_DISTANCE = ZOMBIE_ATTACK_RANGE * 0.8;

export interface MonsterOrder { monsterId: string; target: string }
export interface AiStep { updates: MonsterPoseUpdate[]; attacks: MonsterOrder[] }

export function stepMonsterAi(
  match: PublicMatch, poses: Poses, isSolid: SolidTest, dt: number, now: number, skip: (monsterId: string) => boolean,
): AiStep {
  const updates: MonsterPoseUpdate[] = [];
  const attacks: MonsterOrder[] = [];
  for (const [id, monster] of Object.entries(match.monsters)) {
    if (!monster.alive || monster.possessed || now < monster.stunnedUntil || skip(id)) continue;

    let target: { account: string; x: number; z: number; d: number } | null = null;
    for (const account of match.players) {
      const pose = poses[account];
      if (!pose || !isActive(match, account)) continue;
      const d = distance(pose, monster);
      if (d <= ZOMBIE_AGGRO_RANGE && (!target || d < target.d)) target = { account, x: pose.x, z: pose.z, d };
    }
    if (!target) continue;

    const yaw = Math.atan2(-(target.x - monster.x), -(target.z - monster.z));
    if (target.d > STOP_DISTANCE) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, isSolid, ZOMBIE_SPEED);
      updates.push({ id, x: moved.x, z: moved.z, yaw });
    } else {
      updates.push({ id, x: monster.x, z: monster.z, yaw });
      if (now >= monster.attackReadyAt) attacks.push({ monsterId: id, target: target.account });
    }
  }
  return { updates, attacks };
}
