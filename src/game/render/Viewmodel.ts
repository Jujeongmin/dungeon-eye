import * as THREE from "three";

const REST = new THREE.Vector3(0.22, -0.2, -0.45);
export const WEAPON_LENGTH = 0.75;
export const WEAPON_ROTATION = new THREE.Euler(0, Math.PI, 0);

export class Viewmodel {
  private readonly root = new THREE.Group();
  private readonly flash = new THREE.PointLight(0xffb060, 0, 6, 2);
  private kick = 0;
  private flashLeft = 0;
  private bobPhase = 0;

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
    this.flash.position.set(0, 0.05, -WEAPON_LENGTH * 0.8);
    this.root.add(this.flash);
    this.root.position.copy(REST);
    camera.add(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  fire(): void {
    this.kick = 1;
    this.flashLeft = 0.05;
  }

  update(dt: number, moving: boolean): void {
    this.kick = Math.max(0, this.kick - dt * 12);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.flash.intensity = this.flashLeft > 0 ? 8 : 0;
    if (moving) this.bobPhase += dt * 9;
    const bob = moving ? Math.sin(this.bobPhase) * 0.012 : 0;
    this.root.position.set(REST.x, REST.y + bob - this.kick * 0.01, REST.z + this.kick * 0.05);
    this.root.rotation.x = this.kick * 0.06;
  }
}
