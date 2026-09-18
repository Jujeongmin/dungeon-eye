import { afterEach, describe, expect, it, vi } from "vitest";

const scope = globalThis as Record<string, unknown>;

afterEach(() => {
  delete scope.window;
  vi.resetModules();
});

describe("storageFallback", () => {
  it("swaps a refusing localStorage for a working in-memory one", async () => {
    const refusing = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("SecurityError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    const win: Record<string, unknown> = {};
    Object.defineProperty(win, "localStorage", { get: () => refusing, configurable: true });
    scope.window = win;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await import("../src/storageFallback");
    const store = win.localStorage as Storage;
    store.setItem("agent8:temporary_account", "abc");
    expect(store.getItem("agent8:temporary_account")).toBe("abc");
    expect(store.length).toBe(1);
  });

  it("leaves a working localStorage alone", async () => {
    const entries = new Map<string, string>();
    const working = {
      getItem: (k: string) => entries.get(k) ?? null,
      setItem: (k: string, v: string) => void entries.set(k, v),
      removeItem: (k: string) => void entries.delete(k),
    };
    scope.window = { localStorage: working };
    await import("../src/storageFallback");
    expect((scope.window as { localStorage: unknown }).localStorage).toBe(working);
  });
});
