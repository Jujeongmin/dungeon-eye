import * as THREE from "three";

export interface LightSource {
  position: THREE.Vector3;
  color: THREE.Color;
  range: number;
  // Current strength; 0 means the source is off and takes no slot.
  intensity(): number;
}

// A fixed handful of point lights shared by every lamp in the level. Each frame the slots go to the
// lit sources nearest the camera, so the shaders never see more lights however many lamps there are.
export class LightPool {
  private readonly slots: THREE.PointLight[] = [];
  private readonly sources: LightSource[] = [];
  private readonly ranked: { source: LightSource; d: number; power: number }[] = [];

  constructor(scene: THREE.Scene, size: number) {
    for (let i = 0; i < size; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.slots.push(light);
      scene.add(light);
    }
  }

  add(source: LightSource): void {
    this.sources.push(source);
  }

  update(from: THREE.Vector3): void {
    this.ranked.length = 0;
    for (const source of this.sources) {
      const power = source.intensity();
      if (power <= 0) continue;
      this.ranked.push({ source, d: source.position.distanceToSquared(from), power });
    }
    this.ranked.sort((a, b) => a.d - b.d);
    this.slots.forEach((light, i) => {
      const pick = this.ranked[i];
      if (!pick) {
        light.intensity = 0;
        return;
      }
      light.position.copy(pick.source.position);
      light.color.copy(pick.source.color);
      light.distance = pick.source.range;
      light.intensity = pick.power;
    });
  }

  // For tests and tuning: which sources hold a slot right now.
  lit(): number {
    return this.slots.filter((l) => l.intensity > 0).length;
  }
}
