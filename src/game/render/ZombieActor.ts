import * as THREE from "three";
import { ZOMBIE_HEIGHT, ZOMBIE_HP, ZOMBIE_RADIUS, applyDamage, type HitTarget } from "../rules/combat";

const IDLE_CLIP = "Z_Idle";
const DEATH_CLIP = "Z_FallingBack";
const HIT_FLASH_SECONDS = 0.08;

// A fresh SkeletonUtils clone has stale bone matrices until its first render,
// so its skinned bounds are wrong unless the skeletons are updated first.
function skinnedHeight(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    mesh.computeBoundingBox();
  });
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).y;
}

export class ZombieActor {
  hp = ZOMBIE_HP;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private flashLeft = 0;

  constructor(
    readonly id: string,
    readonly object: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly x: number,
    private readonly z: number,
  ) {
    object.scale.setScalar(ZOMBIE_HEIGHT / skinnedHeight(object));
    object.position.set(x, 0, z);

    // Own material copies so one zombie's hit flash does not light up the others.
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
      for (const m of own) if (m instanceof THREE.MeshStandardMaterial) this.materials.push(m);
    });

    this.mixer = new THREE.AnimationMixer(object);
    const clip = (name: string) => {
      const found = THREE.AnimationClip.findByName(clips, name);
      if (!found) throw new Error(`zombie clip missing: ${name} (has ${clips.map((c) => c.name).join(", ")})`);
      return found;
    };
    this.idle = this.mixer.clipAction(clip(IDLE_CLIP)).play();
    this.death = this.mixer.clipAction(clip(DEATH_CLIP));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  target(): HitTarget {
    return { id: this.id, x: this.x, z: this.z, radius: ZOMBIE_RADIUS, height: ZOMBIE_HEIGHT, alive: this.alive };
  }

  takeHit(damage: number): boolean {
    const result = applyDamage(this.hp, damage);
    this.hp = result.hp;
    this.flashLeft = HIT_FLASH_SECONDS;
    if (result.killed) this.death.reset().play().crossFadeFrom(this.idle, 0.1, false);
    return result.killed;
  }

  update(dt: number, lookAtX: number, lookAtZ: number): void {
    if (this.alive) this.object.rotation.y = Math.atan2(lookAtX - this.x, lookAtZ - this.z);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const glow = this.flashLeft > 0 ? 1.5 : 0;
    for (const m of this.materials) m.emissive.setRGB(glow, glow * 0.2, glow * 0.2);
    this.mixer.update(dt);
  }
}
