import type { LevelLayout, Placement } from "./levelLayout";

// Set dressing for a parsed level: swaps plain kit pieces for variants and adds clutter
// (the kit's grunge decals are left out: their transparency does not survive the web export)
// all from the same dungeon kit and all decided by cell position, so every client sees the same level.
export interface Dressed extends Placement {
  // Hung from the ceiling: the renderer lifts it so its top touches the ceiling.
  hang?: boolean;
}

const WALL_VARIANTS = ["dd_wall_a", "dd_wall_a", "dd_wall_b", "dd_wall_c", "dd_wall_d", "dd_wall_e"];
// Floor_B reads as a flat, smooth slab next to the kit's main floor, so floors stay Floor_A.
const FLOOR_VARIANTS = ["dd_floor_a"];
const ARCH_VARIANTS = ["dd_arch_a", "dd_arch_b", "dd_arch_c"];
const CHAIN_CHANCE = 0.04;
const HANGING_CHAIN_CHANCE = 0.05;
const WALL_TORCH_CHANCE = 0.07;
// Wall torches hang this high and this far out from the wall face.
const WALL_TORCH_HEIGHT = 2.2;
const WALL_TORCH_OUT = 0.35;

export const DRESSING_MODELS = [
  ...new Set([...WALL_VARIANTS, ...FLOOR_VARIANTS, ...ARCH_VARIANTS]),
  "dd_chain_c", "dd_chain_a", "dd_torch",
];

// A stable pseudo-random number in [0, 1) for a cell and a purpose.
export function cellNoise(col: number, row: number, salt: number): number {
  let h = (col * 374761393 + row * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pick<T>(list: readonly T[], noise: number): T {
  return list[Math.min(list.length - 1, Math.floor(noise * list.length))];
}

export function dressLevel(layout: LevelLayout): Dressed[] {
  const t = layout.tileSize;
  const cellOf = (v: number) => Math.floor(v / t);
  const solid = (c: number, r: number) => r < 0 || r >= layout.rows || c < 0 || c >= layout.cols || layout.solid[r][c];
  const key = (c: number, r: number) => `${c},${r}`;
  // Cells that hold something the players must see or use stay free of clutter.
  const busy = new Set<string>();
  for (const p of [
    layout.playerSpawn, ...layout.exits, ...layout.shards, ...layout.devices, ...layout.waveSpawns,
    ...(layout.altar ? [layout.altar] : []), ...(layout.bossSpawn ? [layout.bossSpawn] : []), ...layout.gates,
  ]) busy.add(key(cellOf(p.x), cellOf(p.z)));
  const gateCells = new Set(layout.gates.map((g) => key(cellOf(g.x), cellOf(g.z))));

  const torches: Dressed[] = [];
  const out: Dressed[] = layout.placements.map((p, i) => {
    const c = cellOf(p.x);
    const r = cellOf(p.z);
    if (p.model === "dd_wall_a") {
      if (cellNoise(c * 4 + i, r, 10) < WALL_TORCH_CHANCE) {
        // Wall panels face the floor along +z of their rotation.
        const out = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };
        torches.push({
          model: "dd_torch", x: p.x + out.x * WALL_TORCH_OUT, y: WALL_TORCH_HEIGHT, z: p.z + out.z * WALL_TORCH_OUT,
          rotationY: p.rotationY,
        });
      }
      return { ...p, model: pick(WALL_VARIANTS, cellNoise(c * 4 + i, r, 1)) };
    }
    if (p.model === "dd_floor_a") return { ...p, model: pick(FLOOR_VARIANTS, cellNoise(c, r, 2)) };
    return { ...p };
  });

  out.push(...torches);
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      if (solid(c, r)) continue;
      const x = (c + 0.5) * t;
      const z = (r + 0.5) * t;
      if (busy.has(key(c, r))) continue;

      const wallsX = solid(c - 1, r) && solid(c + 1, r) && !solid(c, r - 1) && !solid(c, r + 1);
      const wallsZ = solid(c, r - 1) && solid(c, r + 1) && !solid(c - 1, r) && !solid(c + 1, r);
      if ((wallsX || wallsZ) && !gateCells.has(key(c, r))) {
        // The arch model spans z; turn it to span a corridor whose walls are at -x and +x.
        out.push({ model: pick(ARCH_VARIANTS, cellNoise(c, r, 5)), x, y: 0, z, rotationY: wallsX ? Math.PI / 2 : 0 });
        continue;
      }
      const open = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].every(([dc, dr]) => !solid(c + dc, r + dr));
      // (The kit's hanging cage is taller than these rooms, so it is left out.)
      if (open && cellNoise(c, r, 11) < HANGING_CHAIN_CHANCE) {
        out.push({ model: "dd_chain_a", x, y: 0, z, rotationY: cellNoise(c, r, 12) * Math.PI * 2, hang: true });
      } else if (!open && cellNoise(c, r, 8) < CHAIN_CHANCE) {
        out.push({ model: "dd_chain_c", x, y: 0, z, rotationY: cellNoise(c, r, 9) * Math.PI * 2 });
      }
    }
  }
  return out;
}
