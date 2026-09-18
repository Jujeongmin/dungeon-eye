import { describe, expect, it } from "vitest";
import { parseNickname } from "../../src/game/account/nickname";

describe("parseNickname", () => {
  it("accepts Korean, latin letters, digits and underscores, trimmed", () => {
    expect(parseNickname("  유적_Hunter7 ").name).toBe("유적_Hunter7");
  });

  it("keys names case-insensitively so Hunter and hunter collide", () => {
    expect(parseNickname("Hunter").key).toBe(parseNickname("hUNTER").key);
  });

  it("treats decomposed Hangul as the same name as composed", () => {
    const decomposed = "한글";
    expect(parseNickname(decomposed)).toEqual(parseNickname("한글"));
  });

  it("allows 2 to 12 characters", () => {
    expect(parseNickname("가나").name).toBe("가나");
    expect(parseNickname("가나다라마바사아자차카타").name).toHaveLength(12);
    expect(() => parseNickname("가")).toThrow("nickname_invalid");
    expect(() => parseNickname("가나다라마바사아자차카타파")).toThrow("nickname_invalid");
  });

  it("rejects spaces, symbols, jamo and non-strings", () => {
    for (const bad of ["봇 1", "hi!", "a.b", "ㅋㅋㅋ", "", 42, null, undefined]) {
      expect(() => parseNickname(bad)).toThrow("nickname_invalid");
    }
  });
});
