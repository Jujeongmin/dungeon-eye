// Verse8 serves from a sub-path, so hand-built fetch URLs must be base-relative.
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "./";
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}
