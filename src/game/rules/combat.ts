import type { SolidTest } from "./movement";

export const AKM = { damage: 34, fireInterval: 0.1, range: 60 } as const;
export const ZOMBIE_HP = 100;
export const ZOMBIE_RADIUS = 0.4;
export const ZOMBIE_HEIGHT = 1.8;

const MARCH_STEP = 0.05;
const EPSILON = 1e-9;

export interface Ray3 { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }
export interface HitTarget { id: string; x: number; z: number; radius: number; height: number; alive: boolean }
export interface ShotHit { id: string; distance: number }

export function pickTarget(ray: Ray3, targets: HitTarget[], maxRange: number): ShotHit | null {
  let best: ShotHit | null = null;
  for (const target of targets) {
    if (!target.alive) continue;
    const t = cylinderHit(ray, target);
    if (t === null || t > maxRange) continue;
    if (!best || t < best.distance) best = { id: target.id, distance: t };
  }
  return best;
}

export function wallDistance(ray: Ray3, isSolid: SolidTest, maxRange: number, ceilingY: number): number {
  const steps = Math.ceil(maxRange / MARCH_STEP);
  for (let i = 1; i <= steps; i++) {
    const t = i * MARCH_STEP;
    const y = ray.oy + ray.dy * t;
    if (y <= 0 || y >= ceilingY || isSolid(ray.ox + ray.dx * t, ray.oz + ray.dz * t)) return t;
  }
  return maxRange;
}

export function resolveShot(
  ray: Ray3, targets: HitTarget[], isSolid: SolidTest, range: number, ceilingY: number,
): ShotHit | null {
  const hit = pickTarget(ray, targets, range);
  if (!hit) return null;
  return hit.distance < wallDistance(ray, isSolid, range, ceilingY) ? hit : null;
}

export function applyDamage(hp: number, damage: number): { hp: number; killed: boolean } {
  const next = Math.max(0, hp - damage);
  return { hp: next, killed: hp > 0 && next === 0 };
}

export function canFire(lastShotAt: number, now: number, interval: number): boolean {
  return now - lastShotAt >= interval - EPSILON;
}

// Nearest t >= 0 where the ray meets the side of an upright cylinder within its height.
function cylinderHit(ray: Ray3, target: HitTarget): number | null {
  const fx = ray.ox - target.x;
  const fz = ray.oz - target.z;
  const a = ray.dx * ray.dx + ray.dz * ray.dz;
  if (a < EPSILON) return null;
  const b = 2 * (fx * ray.dx + fz * ray.dz);
  const c = fx * fx + fz * fz - target.radius * target.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < 0) continue;
    const y = ray.oy + ray.dy * t;
    if (y >= 0 && y <= target.height) return t;
  }
  return null;
}
