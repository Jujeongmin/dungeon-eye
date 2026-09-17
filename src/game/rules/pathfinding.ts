import { solidAt, type LevelLayout, type Point2 } from "./levelLayout";

export interface Cell { col: number; row: number }

export function cellOf(layout: LevelLayout, p: Point2): Cell {
  return { col: Math.floor(p.x / layout.tileSize), row: Math.floor(p.z / layout.tileSize) };
}

export function cellCenter(layout: LevelLayout, cell: Cell): Point2 {
  return { x: (cell.col + 0.5) * layout.tileSize, z: (cell.row + 0.5) * layout.tileSize };
}

const STEPS: Cell[] = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];

export function findPath(layout: LevelLayout, from: Point2, to: Point2): Point2[] | null {
  const start = cellOf(layout, from);
  const goal = cellOf(layout, to);
  const walkable = (c: Cell) => {
    const p = cellCenter(layout, c);
    return !solidAt(layout, p.x, p.z);
  };
  if (!walkable(start) || !walkable(goal)) return null;

  const key = (c: Cell) => `${c.col},${c.row}`;
  const previous = new Map<string, Cell | null>([[key(start), null]]);
  const queue: Cell[] = [start];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell.col === goal.col && cell.row === goal.row) break;
    for (const s of STEPS) {
      const next = { col: cell.col + s.col, row: cell.row + s.row };
      if (previous.has(key(next)) || !walkable(next)) continue;
      previous.set(key(next), cell);
      queue.push(next);
    }
  }
  if (!previous.has(key(goal))) return null;

  const cells: Cell[] = [];
  for (let c: Cell | null = goal; c && key(c) !== key(start); c = previous.get(key(c)) ?? null) cells.unshift(c);
  const points = cells.map((c) => cellCenter(layout, c));
  if (points.length === 0) return [{ x: to.x, z: to.z }];
  points[points.length - 1] = { x: to.x, z: to.z };
  return points;
}
