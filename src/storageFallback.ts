/// <reference lib="dom" />
/**
 * A localStorage that never throws.
 *
 * The Verse8 editor frames the game from another site (create.verse8.io around
 * agent8.verse8.net), so in the preview we are a third-party context and the
 * browser may refuse storage outright. @agent8/gameserver reads and writes
 * localStorage while its module is being evaluated, unguarded, so a refusal takes
 * the module and the whole import chain down and the game never mounts.
 *
 * Nothing we keep there is worth that (settings and a costume choice). When the
 * real store is unusable it is swapped for an in-memory one for the session.
 * Imported first in main.tsx, ahead of anything that touches storage.
 */

function storageWorks(): boolean {
  try {
    const probe = "__th_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, String(value));
    },
  };
}

if (typeof window !== "undefined" && !storageWorks()) {
  try {
    Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
    console.warn("[traitor-hunt] localStorage is blocked here; using an in-memory store for this session.");
  } catch {
    // The property is locked; our own callers still guard their storage use.
  }
}

export {};
