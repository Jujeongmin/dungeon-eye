import { describe, expect, it } from "vitest";
import { bustCssImports } from "../vite-plugins/cssCacheBust";

const version = (file: string) => (file.endsWith("index.css") ? "111" : "222");

describe("bustCssImports", () => {
  it("adds a version to relative stylesheet imports", () => {
    const code = `import "./index.css";\nimport App from "./App";\nimport '../ui/panel.css';`;
    expect(bustCssImports(code, "/p/src/main.tsx", version)).toBe(
      `import "./index.css?v=111";\nimport App from "./App";\nimport '../ui/panel.css?v=222';`,
    );
  });

  it("leaves package stylesheets and non-css imports alone", () => {
    const code = `import "@fontsource/cinzel/600.css";\nimport x from "./data.json";`;
    expect(bustCssImports(code, "/p/src/ui/theme.ts", version)).toBeNull();
  });

  it("returns null when there is nothing to change", () => {
    expect(bustCssImports(`import App from "./App";`, "/p/src/main.tsx", version)).toBeNull();
  });
});
