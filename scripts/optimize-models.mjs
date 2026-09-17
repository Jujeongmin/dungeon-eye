/**
 * art-src/_glb -> public/assets/models (+ manifest.json)
 *
 *   node scripts/optimize-models.mjs
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { buildManifest } from "./lib/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "art-src/_glb");
const outDir = join(root, "public/assets/models");
mkdirSync(outDir, { recursive: true });

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const entries = [];
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".glb"))) {
  const name = basename(file, ".glb");
  const doc = await io.read(join(srcDir, file));
  const skinned = doc.getRoot().listSkins().length > 0;

  const steps = [
    weld(),
    dedup(),
    resample(),
    prune({ keepLeaves: skinned }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }),
  ];
  // Static kit pieces stay unquantized so their raw geometry can be instanced later.
  if (skinned) steps.push(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
  await doc.transform(...steps);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const outFile = join(outDir, file);
  await io.write(outFile, doc);
  const animations = doc.getRoot().listAnimations().map((a) => a.getName());
  entries.push({ name, bytes: statSync(outFile).size, animations });
  console.log(`${name}: ${Math.round(statSync(join(srcDir, file)).size / 1024)} KB -> ${Math.round(statSync(outFile).size / 1024)} KB`);
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(buildManifest(entries), null, 2) + "\n");
console.log(`wrote ${entries.length} models`);
