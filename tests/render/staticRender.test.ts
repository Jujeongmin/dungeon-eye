import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LightPool } from "../../src/game/render/lightPool";
import { bakedTint, buildStaticBatch } from "../../src/game/render/staticBatch";

function model(): { scene: THREE.Object3D } {
  const scene = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  a.position.set(0, 2, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  scene.add(a, b);
  return { scene };
}

describe("buildStaticBatch", () => {
  it("makes one instanced mesh per model part and keeps each part's offset", () => {
    const lib = model();
    const source = { get: () => lib };
    const pieces = [0, 10, 20].map((x) => ({ model: "box", matrix: new THREE.Matrix4().makeTranslation(x, 0, 0), tint: new THREE.Color(0.5, 0.5, 0.5) }));
    const batch = buildStaticBatch(source, pieces);
    const group = batch.group;
    expect(group.children).toHaveLength(2);
    const first = group.children[0] as THREE.InstancedMesh;
    expect(first.count).toBe(3);
    const m = new THREE.Matrix4();
    first.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([10, 2, 0]);
    const c = new THREE.Color();
    first.getColorAt(2, c);
    expect(c.r).toBeCloseTo(0.5);

    batch.move(1, new THREE.Matrix4().makeTranslation(0, 0, 7));
    first.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([0, 2, 7]);
    const second = group.children[1] as THREE.InstancedMesh;
    second.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([0, 0, 7]);
  });
});

describe("bakedTint", () => {
  const warm = { x: 0, y: 2, z: 0, color: new THREE.Color(1, 0.5, 0.25), strength: 1, range: 10 };
  const open = () => false;

  it("is ambient far away and brighter near a lamp", () => {
    const far = bakedTint(new THREE.Vector3(50, 0, 0), [warm], 0.3, open);
    expect([far.r, far.g, far.b]).toEqual([0.3, 0.3, 0.3]);
    const near = bakedTint(new THREE.Vector3(1, 2, 0), [warm], 0.3, open);
    expect(near.r).toBeGreaterThan(1);
    expect(near.r).toBeGreaterThan(near.b);
  });

  it("is blocked by walls between the point and the lamp", () => {
    const wall = (x: number) => x > 2 && x < 3;
    const behind = bakedTint(new THREE.Vector3(5, 2, 0), [warm], 0.3, wall);
    expect(behind.r).toBeCloseTo(0.3);
  });
});

describe("LightPool", () => {
  it("gives its slots to the nearest lit sources", () => {
    const scene = new THREE.Scene();
    const pool = new LightPool(scene, 2);
    const at = (x: number, power: number) => ({
      position: new THREE.Vector3(x, 0, 0), color: new THREE.Color(1, 1, 1), range: 5, intensity: () => power,
    });
    pool.add(at(1, 3));
    pool.add(at(2, 0));
    pool.add(at(5, 4));
    pool.add(at(9, 5));
    pool.update(new THREE.Vector3(0, 0, 0));
    const lights = scene.children as THREE.PointLight[];
    expect(lights.map((l) => [l.position.x, l.intensity])).toEqual([[1, 3], [5, 4]]);
    expect(pool.lit()).toBe(2);
  });
});
