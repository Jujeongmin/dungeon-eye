import { COSTUMES, type Costume } from "../game/render/costumes";

// Your own look, kept in this browser until the account profile lands on the server.
const STORAGE_KEY = "traitor-hunt:costume";
const listeners = new Set<(costume: Costume) => void>();

function load(): Costume {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return COSTUMES.find((c) => c.id === id) ?? COSTUMES[0];
  } catch {
    return COSTUMES[0];
  }
}

let current = load();

export function myCostume(): Costume {
  return current;
}

export function setMyCostume(costume: Costume): void {
  current = costume;
  try {
    localStorage.setItem(STORAGE_KEY, costume.id);
  } catch {
    // Without storage the choice still holds until the page closes.
  }
  for (const listener of listeners) listener(current);
}

export function onMyCostume(listener: (costume: Costume) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
