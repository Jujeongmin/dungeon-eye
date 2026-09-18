import * as THREE from "three";
import type { Grips } from "./FirstPersonArms";
import { fpTuning } from "./firstPersonTuning";

export const WEAPON_LENGTH = 0.75;
export const WEAPON_ROTATION = new THREE.Euler(0, Math.PI, 0);

export class Viewmodel {
  private readonly root = new THREE.Group();
  private readonly flash = new THREE.PointLight(0xffb060, 0, 6, 2);
  private kick = 0;
  private flashLeft = 0;
  private bobPhase = 0;
  // The rifle's extent in the root's space; the stock is at max z, the muzzle at min z.
  private readonly box = new THREE.Box3();

  constructor(camera: THREE.Camera, weapon: THREE.Object3D) {
    const size = new THREE.Box3().setFromObject(weapon).getSize(new THREE.Vector3());
    weapon.scale.setScalar(WEAPON_LENGTH / Math.max(size.x, size.y, size.z));
    weapon.rotation.copy(WEAPON_ROTATION);
    // The weapon hugs the camera; frustum culling only makes it blink.
    weapon.traverse((o) => {
      o.frustumCulled = false;
      // Loose cartridges (cal_*) are reload-animation props that float in front of the gun.
      if (o.name.startsWith("cal_")) o.visible = false;
    });
    this.root.add(weapon);
    this.root.updateMatrixWorld(true);
    this.box.setFromObject(weapon);
    this.flash.position.set(0, 0.05, -WEAPON_LENGTH * 0.8);
    this.root.add(this.flash);
    this.root.position.set(fpTuning.gun.x, fpTuning.gun.y, fpTuning.gun.z);
    camera.add(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  fire(): void {
    this.kick = 1;
    this.flashLeft = 0.05;
  }

  // World positions for the right hand (trigger) and left hand (handguard), after bob and kick.
  grips(out: Grips): Grips {
    this.root.updateMatrixWorld(true);
    const b = this.box;
    const length = b.max.z - b.min.z;
    const x = (b.min.x + b.max.x) / 2;
    const { hold } = fpTuning;
    const y = (b.min.y + b.max.y) / 2 - hold.below;
    this.root.localToWorld(out.right.set(x, y, b.max.z - length * hold.trigger));
    this.root.localToWorld(out.left.set(x, y, b.max.z - length * hold.barrel));
    return out;
  }

  update(dt: number, moving: boolean): void {
    this.kick = Math.max(0, this.kick - dt * 12);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.flash.intensity = this.flashLeft > 0 ? 8 : 0;
    if (moving) this.bobPhase += dt * 9;
    const bob = moving ? Math.sin(this.bobPhase) * 0.012 : 0;
    const rest = fpTuning.gun;
    this.root.position.set(rest.x, rest.y + bob - this.kick * 0.01, rest.z + this.kick * 0.05);
    this.root.rotation.x = this.kick * 0.06;
  }
}
