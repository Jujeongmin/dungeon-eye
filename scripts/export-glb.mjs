/**
 * Exports the models listed in unity/export-list.json to art-src/_glb.
 *
 *   node scripts/export-glb.mjs
 *
 * Close "My project" in the Unity Editor first: batchmode refuses a project
 * that is already open.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unityExe = process.env.UNITY_EXE ?? "C:/Program Files/Unity/Hub/Editor/6000.5.2f1/Editor/Unity.exe";
const project = process.env.UNITY_PROJECT ?? resolve(root, "../My project");
const list = JSON.parse(readFileSync(join(root, "unity/export-list.json"), "utf8"));
const outDir = join(root, "art-src/_glb");
// Unity gets an absolute output path, so the repo folder can have any name.
const listPath = join(root, "art-src/export-list.json");
mkdirSync(outDir, { recursive: true });
writeFileSync(listPath, JSON.stringify({ ...list, outDir }));

mkdirSync(join(project, "Assets/Editor"), { recursive: true });
copyFileSync(join(root, "unity/ExportGlb.cs"), join(project, "Assets/Editor/ExportGlb.cs"));

const run = spawnSync(
  unityExe,
  ["-batchmode", "-quit", "-projectPath", project, "-executeMethod", "ExportGlb.Run", "-exportList", listPath, "-logFile", "-"],
  { stdio: "inherit" },
);
if (run.status !== 0) throw new Error(`Unity exited with ${run.status}`);

const io = new NodeIO();
const problems = [];
for (const item of list.items) {
  const file = join(outDir, `${item.name}.glb`);
  if (!existsSync(file)) {
    problems.push(`${item.name}: missing`);
    continue;
  }
  if (item.kind !== "character") continue;
  const doc = await io.read(file);
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  const expected = item.clips.map((c) => c.split("/").pop().replace(/\.[^.]+$/, ""));
  const lost = expected.filter((n) => !names.includes(n));
  if (lost.length) problems.push(`${item.name}: missing clips ${lost.join(", ")} (has ${names.join(", ") || "none"})`);
}
if (problems.length) throw new Error("export incomplete:\n" + problems.join("\n"));
console.log(`exported ${list.items.length} models to ${outDir}`);
