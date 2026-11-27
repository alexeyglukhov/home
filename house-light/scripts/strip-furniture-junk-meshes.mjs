#!/usr/bin/env node
/**
 * Удаляет из GLB хелперы, которые не входят в видимый габарит
 * (та же логика, что furniture-visible-bounds.js).
 *
 *   node house-light/scripts/strip-furniture-junk-meshes.mjs
 *   node house-light/scripts/strip-furniture-junk-meshes.mjs --id W08
 *   node house-light/scripts/strip-furniture-junk-meshes.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isGeometricHelper, partSize } from "../furniture-visible-bounds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "furniture", "catalog.json");
const FURN = path.join(ROOT, "furniture");
const DEPS = path.join(__dirname, ".deps");

const dryRun = process.argv.includes("--dry-run");
const onlyId = (() => {
  const i = process.argv.indexOf("--id");
  return i >= 0 ? process.argv[i + 1] : null;
})();

async function loadGltfTransform() {
  fs.mkdirSync(DEPS, { recursive: true });
  if (!fs.existsSync(path.join(DEPS, "node_modules", "@gltf-transform", "core"))) {
    const r = spawnSync(
      "npm",
      [
        "install",
        "--prefix",
        DEPS,
        "--no-save",
        "--no-package-lock",
        "@gltf-transform/core@4.2.1",
        "@gltf-transform/extensions@4.2.1",
        "meshoptimizer@0.22.0",
      ],
      { stdio: "inherit", shell: false },
    );
    if (r.status !== 0) throw new Error("npm install failed");
  }
  const req = createRequire(path.join(DEPS, "package.json"));
  const core = await import(pathToFileURL(req.resolve("@gltf-transform/core")).href);
  const extensions = await import(pathToFileURL(req.resolve("@gltf-transform/extensions")).href);
  const meshoptimizer = await import(pathToFileURL(req.resolve("meshoptimizer")).href);
  return {
    NodeIO: core.NodeIO,
    getBounds: core.getBounds,
    ALL_EXTENSIONS: extensions.ALL_EXTENSIONS,
    MeshoptDecoder: meshoptimizer.MeshoptDecoder,
    MeshoptEncoder: meshoptimizer.MeshoptEncoder,
  };
}

async function main() {
  const { NodeIO, getBounds, ALL_EXTENSIONS, MeshoptDecoder, MeshoptEncoder } =
    await loadGltfTransform();
  if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
  if (MeshoptEncoder.ready) await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });

  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  let changed = 0;
  let stripped = 0;

  for (const item of catalog.items || []) {
    if (!item?.id || !item?.file) continue;
    if (onlyId && item.id !== onlyId) continue;
    const abs = path.join(FURN, item.file);
    if (!fs.existsSync(abs)) continue;

    const doc = await io.read(abs);
    const drop = [];
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh()) continue;
      let b;
      try {
        b = getBounds(node);
      } catch {
        continue;
      }
      if (!b?.min || !b?.max) continue;
      const part = {
        name: (node.getName() || "").trim(),
        min: [b.min[0], b.min[1], b.min[2]],
        max: [b.max[0], b.max[1], b.max[2]],
      };
      if (!isGeometricHelper(part)) continue;
      const { w, h, d } = partSize(part);
      drop.push({
        node,
        label: `${part.name || "(empty)"} ${w.toFixed(2)}×${h.toFixed(2)}×${d.toFixed(2)}`,
      });
    }
    if (!drop.length) continue;

    console.log(`${item.id}: strip ${drop.length} — ${drop.map((d) => d.label).join("; ")}`);
    stripped += drop.length;
    if (dryRun) continue;

    for (const { node } of drop) node.setMesh(null);
    await io.write(abs, doc);
    changed += 1;
  }

  console.log(
    dryRun
      ? `dry-run: would strip ${stripped} meshes`
      : `wrote ${changed} files, stripped ${stripped} meshes`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
