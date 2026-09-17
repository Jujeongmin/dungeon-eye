import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { buildManifest } from "../scripts/lib/manifest.mjs";

describe("buildManifest", () => {
  it("keys models by name with a public-relative url, sorted", () => {
    const manifest = buildManifest([
      { name: "zombie1", bytes: 2048, animations: ["Z_Idle", "Z_Attack"] },
      { name: "dd_floor_a", bytes: 512, animations: [] },
    ]);
    expect(Object.keys(manifest.models)).toEqual(["dd_floor_a", "zombie1"]);
    expect(manifest.models.zombie1).toEqual({
      url: "assets/models/zombie1.glb",
      bytes: 2048,
      animations: ["Z_Idle", "Z_Attack"],
    });
  });

  it("rejects a name that is not a safe file stem", () => {
    expect(() => buildManifest([{ name: "../evil", bytes: 1, animations: [] }])).toThrow(/invalid model name/);
  });
});
