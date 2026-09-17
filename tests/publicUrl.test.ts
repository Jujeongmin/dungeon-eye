import { describe, expect, it, vi } from "vitest";

describe("publicUrl", () => {
  it("joins a relative base and a path with exactly one slash", async () => {
    vi.stubEnv("BASE_URL", "./");
    const { publicUrl } = await import("../src/game/assets/publicUrl");
    expect(publicUrl("assets/models/manifest.json")).toBe("./assets/models/manifest.json");
    expect(publicUrl("/assets/a.glb")).toBe("./assets/a.glb");
  });
});
