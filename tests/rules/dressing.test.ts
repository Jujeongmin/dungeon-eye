import { describe, expect, it } from "vitest";
import { cellNoise, dressLevel } from "../../src/game/rules/dressing";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";

const level = parseLevel(RUINS, TILE_SIZE);
const cellKey = (x: number, z: number) => `${Math.floor(x / TILE_SIZE)},${Math.floor(z / TILE_SIZE)}`;

describe("dressLevel", () => {
  const dressed = dressLevel(level);

  it("is the same every time", () => {
    expect(dressLevel(level)).toEqual(dressed);
    expect(cellNoise(3, 4, 5)).toBe(cellNoise(3, 4, 5));
    expect(cellNoise(3, 4, 5) >= 0 && cellNoise(3, 4, 5) < 1).toBe(true);
  });

  it("keeps one wall and floor per original piece, only swapping variants", () => {
    const walls = (list: { model: string }[]) => list.filter((p) => p.model.startsWith("dd_wall_")).length;
    const floors = (list: { model: string }[]) => list.filter((p) => p.model.startsWith("dd_floor_")).length;
    expect(walls(dressed)).toBe(walls(level.placements));
    expect(floors(dressed)).toBe(floors(level.placements));
    expect(new Set(dressed.filter((p) => p.model.startsWith("dd_wall_")).map((p) => p.model)).size).toBeGreaterThan(1);
  });

  it("adds arches, torches and cages, but never clutters objective or gate cells", () => {
    const extras = dressed.slice(level.placements.length);
    expect(extras.some((p) => p.model.startsWith("dd_arch_"))).toBe(true);
    expect(extras.some((p) => p.model === "dd_torch")).toBe(true);
    const busy = new Set([
      level.playerSpawn, ...level.exits, ...level.shards, ...level.devices, ...level.waveSpawns,
      level.altar!, level.bossSpawn!, ...level.gates,
    ].map((p) => cellKey(p.x, p.z)));
    for (const p of extras) {
      if (p.model === "dd_torch") continue;
      expect(busy.has(cellKey(p.x, p.z))).toBe(false);
    }
    for (const p of extras.filter((e) => e.model === "dd_chain_a")) expect(p.hang).toBe(true);
  });
});
