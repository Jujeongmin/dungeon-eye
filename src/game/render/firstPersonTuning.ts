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
  // Points in camera space each elbow bends toward; they decide where the upper arm and the sleeve go.
  elbowLeft: Vec3Like;
  elbowRight: Vec3Like;
  // Skin and sleeve brightness; the camera's lamp glares at full strength this close.
  shade: number;
}

export const FP_DEFAULTS: FirstPersonTuning = {
  // Fitted by the user in the tuning panel (2026-09-18).
  gun: { x: 0.15, y: -0.125, z: -0.305 },
  hold: { trigger: 0.31, barrel: 0.69, below: 0.035 },
  head: { x: -0.08, y: -0.045, z: 0.195 },
  twistLeft: { x: 0.038, y: -0.102, z: 0.138 },
  twistRight: { x: 0, y: 0, z: 0 },
  // Chosen by the user from side-by-side shots: down and forward keeps the dark sleeve out of view.
  elbowLeft: { x: -0.3, y: -1.5, z: 0.5 },
  elbowRight: { x: 0.6, y: -0.5, z: 0 },
  shade: 0.05,
};

export const fpTuning: FirstPersonTuning = structuredClone(FP_DEFAULTS);

export function resetFpTuning(): void {
  Object.assign(fpTuning, structuredClone(FP_DEFAULTS));
}
