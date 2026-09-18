import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const RELATIVE_CSS_IMPORT = /(import\s+)(["'])(\.{1,2}\/[^"']+\.css)\2/g;

// Appends ?v=<version> to relative stylesheet imports; null when the code has none.
export function bustCssImports(code: string, importer: string, version: (file: string) => string): string | null {
  let changed = false;
  const out = code.replace(RELATIVE_CSS_IMPORT, (_match, keyword: string, quote: string, spec: string) => {
    changed = true;
    return `${keyword}${quote}${spec}?v=${version(resolve(dirname(importer), spec))}${quote}`;
  });
  return changed ? out : null;
}

// The Verse8 editor's container serves .css files with `Cache-Control: max-age=14400`, so a browser
// keeps whatever /src/index.css it saw first for four hours (for one PC that was the template's
// Tailwind-only file, and the game came up unstyled and black). Versioning the import by the file's
// modification time gives every edit a fresh URL. Dev server only; builds hash their file names.
export function cssCacheBust(): Plugin {
  return {
    name: "css-cache-bust",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("/node_modules/") || !/\.[jt]sx?$/.test(id.split("?")[0])) return null;
      const out = bustCssImports(code, id.split("?")[0], (file) => {
        try {
          return String(Math.round(statSync(file).mtimeMs));
        } catch {
          return "0";
        }
      });
      return out === null ? null : { code: out, map: null };
    },
  };
}
