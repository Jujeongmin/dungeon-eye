import * as THREE from "three";

// A fresh SkeletonUtils clone has stale bone matrices until its first render,
// so its skinned bounds are wrong unless the skeletons are updated first.
export function skinnedHeight(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    mesh.computeBoundingBox();
  });
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).y;
}

// Own material copies so one actor's hit flash does not light up the others.
export function ownMaterials(object: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
    mesh.material = Array.isArray(mesh.material) ? own : own[0];
    for (const m of own) if (m instanceof THREE.MeshStandardMaterial) materials.push(m);
  });
  return materials;
}

export function clipByName(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = THREE.AnimationClip.findByName(clips, name);
  if (!clip) throw new Error(`animation clip missing: ${name} (has ${clips.map((c) => c.name).join(", ")})`);
  return clip;
}

export class ActionBlender {
  private current: THREE.AnimationAction;

  constructor(first: THREE.AnimationAction) {
    this.current = first.play();
  }

  fadeTo(next: THREE.AnimationAction, seconds = 0.15): void {
    if (next === this.current) return;
    next.reset().play().crossFadeFrom(this.current, seconds, false);
    this.current = next;
  }
}
