import type { MatchClient } from "../../net/matchClient";
import { EXIT_RADIUS, POSSESS_RANGE, ZOMBIE_ATTACK_RANGE } from "../match/constants";
import { isActive } from "../match/lifecycle";
import { ZOMBIE_SPEED } from "../match/monsterAi";
import type { MonsterState, Pose, PublicMatch, Vec2 } from "../match/types";
import { distance } from "../match/view";
import { wallDistance } from "../rules/combat";
import { solidAt, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, WALK_SPEED, stepPlayer } from "../rules/movement";
import { findPath } from "../rules/pathfinding";

const SHOOT_RANGE = 12;
const BOT_FIRE_INTERVAL_MS = 400;
const REPATH_MS = 1000;
const WAYPOINT_REACHED = 0.3;

function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export class BotBrain {
  pose: Pose | null = null;
  private path: Vec2[] = [];
  private pathGoal: Vec2 | null = null;
  private pathAt = Number.NEGATIVE_INFINITY;
  private lastShotAt = Number.NEGATIVE_INFINITY;
  private busy = false;
  private readonly isSolid: (x: number, z: number) => boolean;

  constructor(
    private readonly client: MatchClient,
    private readonly layout: LevelLayout,
  ) {
    this.isSolid = (x, z) => solidAt(layout, x, z);
  }

  update(dt: number): void {
    const { phase, match, you } = this.client.state;
    if (phase !== "playing" || !match) return;
    const me = this.client.account;
    if (!this.pose) {
      const spot = spawnPoint(this.layout, Math.max(0, match.players.indexOf(me)));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
    }
    if (!isActive(match, me)) return;

    const now = this.client.serverNow();
    if (you.role === "traitor") this.traitorStep(match, dt, now);
    else this.adventurerStep(match, dt, now);
    if (!this.client.state.you.possession) this.client.reportPose(this.pose);
  }

  private adventurerStep(match: PublicMatch, dt: number, now: number): void {
    const pose = this.pose!;
    const target = this.nearestMonster(match, pose, SHOOT_RANGE, true);
    if (target) {
      pose.yaw = yawTo(pose, target.monster);
      if (now - this.lastShotAt >= BOT_FIRE_INTERVAL_MS && this.run(() => this.client.fireAtMonster(target.id))) {
        this.lastShotAt = now;
      }
      return;
    }
    const exit = this.layout.exits[0];
    if (distance(pose, exit) <= EXIT_RADIUS * 0.8) {
      this.run(() => this.client.escape());
      return;
    }
    this.walkTo(exit, dt, now);
  }

  private traitorStep(match: PublicMatch, dt: number, now: number): void {
    const { you } = this.client.state;
    if (you.possession) {
      this.driveMonster(match, you.possession.monsterId, dt, now);
      return;
    }
    const pose = this.pose!;
    const nearest = this.nearestMonster(match, pose, Number.POSITIVE_INFINITY, false);
    if (!nearest) {
      this.walkTo(this.layout.exits[0], dt, now);
      return;
    }
    const ready = you.possessReadyAt !== null && now >= you.possessReadyAt;
    if (ready && nearest.distance <= POSSESS_RANGE - 1) {
      this.run(() => this.client.possess(nearest.id));
      return;
    }
    if (nearest.distance > POSSESS_RANGE - 2) this.walkTo(nearest.monster, dt, now);
  }

  private driveMonster(match: PublicMatch, monsterId: string, dt: number, now: number): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const me = this.client.account;
    let best: { account: string; pose: Pose; d: number } | null = null;
    for (const account of match.players) {
      const pose = this.client.state.poses[account];
      if (account === me || !pose || !isActive(match, account)) continue;
      const d = distance(pose, monster);
      if (!best || d < best.d) best = { account, pose, d };
    }
    if (!best) return;
    const yaw = yawTo(monster, best.pose);
    if (best.d > ZOMBIE_ATTACK_RANGE * 0.8) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, this.isSolid, ZOMBIE_SPEED * 1.2);
      this.client.reportMonsters([{ id: monsterId, x: moved.x, z: moved.z, yaw }]);
    } else if (now >= monster.attackReadyAt) {
      const victim = best;
      this.run(() => this.client.attackWithMonster(monsterId, victim.account));
    }
  }

  private nearestMonster(
    match: PublicMatch, from: Vec2, range: number, mustSee: boolean,
  ): { id: string; monster: MonsterState; distance: number } | null {
    let best: { id: string; monster: MonsterState; distance: number } | null = null;
    for (const [id, monster] of Object.entries(match.monsters)) {
      if (!monster.alive || monster.possessed) continue;
      const d = distance(from, monster);
      if (d > range || (best && d >= best.distance)) continue;
      if (mustSee && !this.canSee(from, monster, d)) continue;
      best = { id, monster, distance: d };
    }
    return best;
  }

  private canSee(from: Vec2, to: Vec2, d: number): boolean {
    if (d < 0.01) return true;
    const ray = { ox: from.x, oy: EYE_HEIGHT, oz: from.z, dx: (to.x - from.x) / d, dy: 0, dz: (to.z - from.z) / d };
    return wallDistance(ray, this.isSolid, d, this.layout.tileSize) >= d;
  }

  private walkTo(goal: Vec2, dt: number, now: number): void {
    const pose = this.pose!;
    const stale = !this.pathGoal || distance(this.pathGoal, goal) > 1 || now - this.pathAt > REPATH_MS;
    if (stale || this.path.length === 0) {
      this.path = findPath(this.layout, pose, goal) ?? [];
      this.pathGoal = { x: goal.x, z: goal.z };
      this.pathAt = now;
    }
    while (this.path.length > 0 && distance(pose, this.path[0]) < WAYPOINT_REACHED) this.path.shift();
    const next = this.path[0];
    if (!next) return;
    const yaw = yawTo(pose, next);
    const speed = Math.min(WALK_SPEED, distance(pose, next) / Math.max(dt, 1e-3));
    this.pose = stepPlayer({ x: pose.x, z: pose.z, yaw }, { forward: 1, strafe: 0 }, dt, this.isSolid, speed);
  }

  // Sends one action at a time; skips the action while an earlier one is pending.
  private run(action: () => Promise<unknown>): boolean {
    if (this.busy) return false;
    this.busy = true;
    void action().finally(() => {
      this.busy = false;
    });
    return true;
  }
}
