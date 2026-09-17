import * as THREE from "three";

// Bones above the hips. The run clip is an unarmed run, so these take the rifle pose instead.
const UPPER_BODY = /^(spine_|neck|head|clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/;

type TrackType = new (name: string, times: ArrayLike<number>, values: ArrayLike<number>) => THREE.KeyframeTrack;

function boneOf(track: THREE.KeyframeTrack): string {
  return track.name.slice(0, track.name.lastIndexOf("."));
}

export function isUpperBody(track: THREE.KeyframeTrack): boolean {
  return UPPER_BODY.test(boneOf(track));
}

// The first frame of each upper-body track, held still.
export function upperBodyPose(clip: THREE.AnimationClip): THREE.KeyframeTrack[] {
  return clip.tracks.filter(isUpperBody).map((track) => {
    const Type = track.constructor as TrackType;
    return new Type(track.name, [0], Array.from(track.values.slice(0, track.getValueSize())));
  });
}

// The legs of one clip under the held upper body of another, looping at the legs' length.
export function withUpperBodyPose(legs: THREE.AnimationClip, pose: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const lower = legs.tracks.filter((t) => !isUpperBody(t)).map((t) => t.clone());
  return new THREE.AnimationClip(name, legs.duration, [...lower, ...upperBodyPose(pose)]);
}
