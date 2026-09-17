import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { COSTUMES, costumeForSeat, isCostumePart } from "../../src/game/render/costumes";
import { isUpperBody, withUpperBodyPose } from "../../src/game/render/playerAnimation";

describe("costumes", () => {
  it("gives neighbouring seats different looks and wraps around", () => {
    expect(costumeForSeat(0).id).not.toBe(costumeForSeat(1).id);
    expect(costumeForSeat(COSTUMES.length)).toBe(costumeForSeat(0));
    expect(costumeForSeat(-1)).toBe(COSTUMES[COSTUMES.length - 1]);
  });

  it("matches mesh names the way three.js writes them", () => {
    const costume = { id: "t", name: "t", parts: ["Man_Half_ Body_Mesh", "Man_Head_Mesh"] };
    expect(isCostumePart(costume, "Man_Half__Body_Mesh")).toBe(true);
    expect(isCostumePart(costume, "Man_Head_Mesh")).toBe(true);
    expect(isCostumePart(costume, "Man_Jacket_Mesh")).toBe(false);
  });
});

describe("withUpperBodyPose", () => {
  const q = (name: string, times: number[], n: number) =>
    new THREE.QuaternionKeyframeTrack(name, times, times.flatMap((_, i) => [0, 0, i * 0.1 + n, 1]));

  it("keeps the legs moving and holds the arms in the first pose", () => {
    const run = new THREE.AnimationClip("run", 0.6, [q("thigh_l.quaternion", [0, 0.3, 0.6], 0), q("upperarm_l.quaternion", [0, 0.6], 0)]);
    const aim = new THREE.AnimationClip("aim", 2, [q("upperarm_l.quaternion", [0, 1, 2], 5), q("thigh_l.quaternion", [0, 2], 5)]);
    const clip = withUpperBodyPose(run, aim, "runAim");
    expect(clip.name).toBe("runAim");
    expect(clip.duration).toBe(0.6);
    const thigh = clip.tracks.find((t) => t.name === "thigh_l.quaternion")!;
    const arm = clip.tracks.find((t) => t.name === "upperarm_l.quaternion")!;
    expect(thigh.times).toHaveLength(3);
    expect(thigh.times[2]).toBeCloseTo(0.6);
    expect(Array.from(arm.times)).toEqual([0]);
    expect(Array.from(arm.values)).toEqual([0, 0, 5, 1]);
    expect(arm).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
    expect(isUpperBody(thigh)).toBe(false);
  });
});
