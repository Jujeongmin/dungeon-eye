const SAFE_NAME = /^[a-z0-9_]+$/;

/** @param {{ name: string, bytes: number, animations: string[] }[]} entries */
export function buildManifest(entries) {
  const models = {};
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!SAFE_NAME.test(entry.name)) throw new Error(`invalid model name: ${entry.name}`);
    models[entry.name] = {
      url: `assets/models/${entry.name}.glb`,
      bytes: entry.bytes,
      animations: entry.animations,
    };
  }
  return { models };
}
