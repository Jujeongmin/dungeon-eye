export interface Placement { model: string; x: number; y: number; z: number; rotationY: number }
export interface Point2 { x: number; z: number }
export interface LevelLayout {
  tileSize: number;
  cols: number;
  rows: number;
  solid: boolean[][];
  placements: Placement[];
  playerSpawn: Point2;
  zombieSpawns: Point2[];
}

export const TILE_SIZE = 4;
const CEILING_HEIGHT_TILES = 1;

export const LEVEL_1: string[] = [
  "###########",
  "#P....#...#",
  "#.B...T...#",
  "#.....#.Z.#",
  "##.####...#",
  "#.....#.C.#",
  "#..Z......#",
  "###########",
];

const PROP: Record<string, string> = { B: "dd_barrel", C: "chest_closed" };
const FLOOR_SYMBOLS = new Set([".", "P", "Z", "B", "C"]);
const SOLID_SYMBOLS = new Set(["#", "T"]);

// Neighbour offset -> rotation that turns a panel's +z toward the floor cell.
const EDGES = [
  { dc: 0, dr: -1, rotationY: 0 },
  { dc: 0, dr: 1, rotationY: Math.PI },
  { dc: -1, dr: 0, rotationY: Math.PI / 2 },
  { dc: 1, dr: 0, rotationY: -Math.PI / 2 },
];

export function parseLevel(rows: string[], tileSize: number): LevelLayout {
  const cols = rows[0]?.length ?? 0;
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`row ${r} has ${row.length} cells, expected ${cols}`);
    for (const ch of row) {
      if (!FLOOR_SYMBOLS.has(ch) && !SOLID_SYMBOLS.has(ch)) throw new Error(`unknown symbol "${ch}" in row ${r}`);
    }
  });

  const center = (c: number, r: number): Point2 => ({ x: (c + 0.5) * tileSize, z: (r + 0.5) * tileSize });
  const solid = rows.map((row) => [...row].map((ch) => SOLID_SYMBOLS.has(ch)));
  const isSolid = (c: number, r: number) => r < 0 || r >= rows.length || c < 0 || c >= cols || solid[r][c];

  const placements: Placement[] = [];
  const zombieSpawns: Point2[] = [];
  // Asserted so TS keeps the wide type; it is assigned inside the callbacks below.
  let playerSpawn = null as Point2 | null;

  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const { x, z } = center(c, r);
      if (ch === "T") {
        placements.push({ model: "dd_pillar_a", x, y: 0, z, rotationY: 0 });
        placements.push({ model: "dd_torch", x, y: tileSize * 0.5, z, rotationY: 0 });
        return;
      }
      if (ch === "#") return;

      placements.push({ model: "dd_floor_a", x, y: 0, z, rotationY: 0 });
      placements.push({ model: "dd_ceiling", x, y: tileSize * CEILING_HEIGHT_TILES, z, rotationY: 0 });
      for (const edge of EDGES) {
        if (!isSolid(c + edge.dc, r + edge.dr)) continue;
        placements.push({
          model: "dd_wall_a",
          x: x + (edge.dc * tileSize) / 2,
          y: 0,
          z: z + (edge.dr * tileSize) / 2,
          rotationY: edge.rotationY,
        });
      }
      if (PROP[ch]) placements.push({ model: PROP[ch], x, y: 0, z, rotationY: 0 });
      if (ch === "P") playerSpawn = { x, z };
      if (ch === "Z") zombieSpawns.push({ x, z });
    });
  });

  if (!playerSpawn) throw new Error("level has no player spawn (P)");
  return { tileSize, cols, rows: rows.length, solid, placements, playerSpawn, zombieSpawns };
}

export function solidAt(layout: LevelLayout, x: number, z: number): boolean {
  const c = Math.floor(x / layout.tileSize);
  const r = Math.floor(z / layout.tileSize);
  if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) return true;
  return layout.solid[r][c];
}
