// How your rifle and arms sit in the first-person view. The viewmodel and the arms read these every
// frame, so the tuning panel (backquote key, dev builds) can move them live; bake the copied values
// back into FP_DEFAULTS.
export interface Vec3Like { x: number; y: number; z: number }

export interface FirstPersonTuning {
  // Rifle position in camera space (metres; +x right, +y up, -z forward).
  gun: Vec3Like;
  // Where the hands hold the rifle, as fractions of its length from the stock, and how far below
  // its centre line (metres).
  hold: { trigger: number; barrel: number; below: number };
  // The body's head bone in camera space; the shoulders follow it.
  head: Vec3Like;
  // Hand turns after the IK (radians, in each hand bone's own axes).
  twistLeft: Vec3Like;
  twistRight: Vec3Like;
  // Skin and sleeve brightness; the camera's lamp glares at full strength this close.
  shade: number;
}

export const FP_DEFAULTS: FirstPersonTuning = {
  gun: { x: 0.22, y: -0.2, z: -0.45 },
  hold: { trigger: 0.2, barrel: 0.7, below: 0.035 },
  head: { x: 0, y: -0.02, z: 0.3 },
  twistLeft: { x: Math.PI / 2, y: 0, z: 0 },
  twistRight: { x: 0, y: 0, z: 0 },
  shade: 0.3,
};

export const fpTuning: FirstPersonTuning = structuredClone(FP_DEFAULTS);

export function resetFpTuning(): void {
  Object.assign(fpTuning, structuredClone(FP_DEFAULTS));
}
