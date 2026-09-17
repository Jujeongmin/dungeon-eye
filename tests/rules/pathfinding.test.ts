import { describe, expect, it } from "vitest";
import { LEVEL_1, parseLevel, solidAt } from "../../src/game/rules/levelLayout";
import { cellCenter, cellOf, findPath } from "../../src/game/rules/pathfinding";

const level = parseLevel(LEVEL_1, 4);

describe("findPath", () => {
  it("walks from the spawn to the exit through open cells, one cell at a time", () => {
    const path = findPath(level, level.playerSpawn, level.exits[0]);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual(level.exits[0]);
    let prev = cellOf(level, level.playerSpawn);
    for (const p of path!) {
      const cell = cellOf(level, p);
      expect(Math.abs(cell.col - prev.col) + Math.abs(cell.row - prev.row)).toBe(1);
      expect(solidAt(level, p.x, p.z)).toBe(false);
      prev = cell;
    }
  });

  it("returns just the target inside the same cell", () => {
    expect(findPath(level, { x: 5, z: 5 }, { x: 7, z: 6 })).toEqual([{ x: 7, z: 6 }]);
  });

  it("returns null for a target inside a wall", () => {
    expect(findPath(level, level.playerSpawn, { x: 1, z: 1 })).toBeNull();
  });

  it("returns null when the target is walled off", () => {
    const boxed = parseLevel(["#####", "#P#.#", "#####"], 4);
    expect(findPath(boxed, boxed.playerSpawn, { x: 14, z: 6 })).toBeNull();
  });

  it("finds cell centers", () => {
    expect(cellCenter(level, { col: 2, row: 3 })).toEqual({ x: 10, z: 14 });
  });
});
