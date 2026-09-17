import * as THREE from "three";

export interface StaticPiece {
  model: string;
  matrix: THREE.Matrix4;
  // Multiplies the model's colours; used for baked light.
  tint?: THREE.Color;
}

export interface ModelSource {
  get(name: string): { scene: THREE.Object3D };
}

export interface StaticBatch {
  group: THREE.Group;
  // Moves one piece (by its index in the list given to the builder).
  move(piece: number, matrix: THREE.Matrix4): void;
}

// Draws every copy of a model with one instanced mesh per model part: a few dozen draw calls
// for the whole level instead of one per wall panel.
export function buildStaticBatch(library: ModelSource, pieces: StaticPiece[]): StaticBatch {
  const group = new THREE.Group();
  const byModel = new Map<string, number[]>();
  pieces.forEach((piece, i) => {
    const list = byModel.get(piece.model) ?? [];
    list.push(i);
    byModel.set(piece.model, list);
  });
  // For each piece: the instanced meshes it appears in, its slot there, and the part's offset.
  const slots: { mesh: THREE.InstancedMesh; slot: number; relative: THREE.Matrix4 }[][] = pieces.map(() => []);
  const part = new THREE.Matrix4();
  for (const [model, list] of byModel) {
    const template = library.get(model).scene;
    template.updateMatrixWorld(true);
    const rootInverse = template.matrixWorld.clone().invert();
    template.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      const relative = rootInverse.clone().multiply(mesh.matrixWorld);
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
      instanced.name = `${model}:${mesh.name}`;
      list.forEach((index, slot) => {
        const piece = pieces[index];
        instanced.setMatrixAt(slot, part.multiplyMatrices(piece.matrix, relative));
        if (piece.tint) instanced.setColorAt(slot, piece.tint);
        slots[index].push({ mesh: instanced, slot, relative });
      });
      instanced.instanceMatrix.needsUpdate = true;
      if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    });
  }
  const moved = new Set<THREE.InstancedMesh>();
  return {
    group,
    move(piece, matrix) {
      for (const { mesh, slot, relative } of slots[piece]) {
        mesh.setMatrixAt(slot, part.multiplyMatrices(matrix, relative));
        mesh.instanceMatrix.needsUpdate = true;
        moved.add(mesh);
      }
      // Moving pieces can leave the old bounds; skip culling for anything that has moved.
      for (const mesh of moved) mesh.frustumCulled = false;
    },
  };
}

export interface BakeLight { x: number; y: number; z: number; color: THREE.Color; strength: number; range: number }

// Light reaching a point from fixed lamps, with a line-of-sight test so walls block it.
export function bakedTint(
  point: THREE.Vector3, lights: BakeLight[], ambient: number, blocked: (x: number, z: number) => boolean, into = new THREE.Color(),
): THREE.Color {
  into.setRGB(ambient, ambient, ambient);
  for (const light of lights) {
    const d = Math.hypot(point.x - light.x, point.y - light.y, point.z - light.z);
    if (d >= light.range) continue;
    if (!clearLine(point.x, point.z, light.x, light.z, blocked)) continue;
    const falloff = (1 - d / light.range) ** 2 * light.strength;
    into.r += light.color.r * falloff;
    into.g += light.color.g * falloff;
    into.b += light.color.b * falloff;
  }
  return into;
}

function clearLine(ax: number, az: number, bx: number, bz: number, blocked: (x: number, z: number) => boolean): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}
