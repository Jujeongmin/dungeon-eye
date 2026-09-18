import { describe, expect, it } from "vitest";
import { displayName } from "../../src/game/render/names";

describe("displayName", () => {
  it("names practice and online fill bots the same way", () => {
    expect(displayName("test-bot-2", "me")).toBe("봇 2");
    expect(displayName("bot-3", "me")).toBe("봇 3");
  });

  it("shortens other accounts", () => {
    expect(displayName("0x7b47aa40357441418909", "me")).toBe("0x7b47aa403…");
  });
});
