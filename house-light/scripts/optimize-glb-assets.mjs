#!/usr/bin/env node
/**
 * Сжимает мебель и машины: gltf-transform optimize (meshopt + webp + simplify).
 * Перезаписывает на месте; мультифайловые .gltf → один .glb + правки catalog.json.
 *
 *   node house-light/scripts/optimize-glb-assets.mjs
 *   node house-light/scripts/optimize-glb-assets.mjs --dry-run
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FURN_MODELS = path.join(ROOT, "furniture", "models");
const CATALOG = path.join(ROOT, "furniture", "catalog.json");
const CARS = [
  path.join(ROOT, "models", "geely-coolray.glb"),
  path.join(ROOT, "models", "mazda-cx5.glb"),
];

const dryRun = process.argv.includes("--dry-run");

/** catalog path → flat glb name */
const GLTF_FLAT = {
  "models/H16/electric_stove_1k.gltf": "models/H16.glb",
  "models/H17/drawer_cabinet_1k.gltf": "models/H17.glb",
  "models/X01/cardboard_box_01_1k.gltf": "models/X01.glb",
  "models/X02/wooden_crate_01_1k.gltf": "models/X02.glb",
  "models/X03/plastic_crate_01_1k.gltf": "models/X03.glb",
};

function fmt(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function runOptimize(src, dest) {
  const args = [
    "--yes",
    "@gltf-transform/cli@4.2.1",
    "optimize",
    src,
    dest,
    "--compress",
    "meshopt",
    "--texture-compress",
    "webp",
  ];
  if (dryRun) {
    console.log(`[dry-run] npx ${args.join(" ")}`);
    return true;
  }
  const r = spawnSync("npx", args, { stdio: "inherit", shell: false });
  return r.status === 0;
}

function optimizeInPlace(filePath) {
  const before = fs.statSync(filePath).size;
  const tmp = path.join(
    os.tmpdir(),
    `glb-opt-${path.basename(filePath)}-${process.pid}-${Date.now()}.glb`,
  );
  try {
    if (!runOptimize(filePath, tmp)) {
      console.error("FAIL", filePath);
      return { ok: false, before, after: before };
    }
    if (dryRun) return { ok: true, before, after: before };
    const after = fs.statSync(tmp).size;
    fs.renameSync(tmp, filePath);
    console.log(`OK  ${fmt(before)} → ${fmt(after)}  ${path.relative(ROOT, filePath)}`);
    return { ok: true, before, after };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function optimizeTo(src, dest) {
  const before = fs.existsSync(src) ? fs.statSync(src).size : 0;
  // for multi-file gltf, size is approximate (gltf only); still useful
  if (!runOptimize(src, dest)) {
    console.error("FAIL", src, "→", dest);
    return { ok: false, before, after: before };
  }
  if (dryRun) return { ok: true, before, after: before };
  const after = fs.statSync(dest).size;
  console.log(`OK  ${fmt(before)} → ${fmt(after)}  ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`);
  return { ok: true, before, after };
}

function listGlbs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) continue; // folder packs handled via GLTF_FLAT
    if (ent.name.endsWith(".glb")) out.push(p);
  }
  return out.sort();
}

function updateCatalog() {
  const raw = fs.readFileSync(CATALOG, "utf8");
  const data = JSON.parse(raw);
  let changed = 0;
  for (const item of data.items || []) {
    const next = GLTF_FLAT[item.file];
    if (next && item.file !== next) {
      item.file = next;
      changed += 1;
    }
  }
  if (changed && !dryRun) {
    fs.writeFileSync(CATALOG, JSON.stringify(data, null, 2) + "\n");
  }
  console.log(`catalog: ${changed} path(s) → flat .glb`);
}

function main() {
  let totalBefore = 0;
  let totalAfter = 0;
  let ok = 0;
  let fail = 0;

  console.log("=== furniture .glb ===");
  for (const file of listGlbs(FURN_MODELS)) {
    const r = optimizeInPlace(file);
    totalBefore += r.before;
    totalAfter += r.after;
    if (r.ok) ok += 1;
    else fail += 1;
  }

  console.log("=== furniture multi-file .gltf → .glb ===");
  for (const [relSrc, relDest] of Object.entries(GLTF_FLAT)) {
    const src = path.join(ROOT, "furniture", relSrc);
    const dest = path.join(ROOT, "furniture", relDest);
    if (!fs.existsSync(src)) {
      console.warn("skip missing", relSrc);
      continue;
    }
    const r = optimizeTo(src, dest);
    totalBefore += r.before;
    totalAfter += r.after;
    if (r.ok) ok += 1;
    else fail += 1;
  }
  updateCatalog();

  console.log("=== cars ===");
  for (const file of CARS) {
    if (!fs.existsSync(file)) {
      console.warn("skip missing", file);
      continue;
    }
    const r = optimizeInPlace(file);
    totalBefore += r.before;
    totalAfter += r.after;
    if (r.ok) ok += 1;
    else fail += 1;
  }

  console.log("---");
  console.log(
    `done: ${ok} ok, ${fail} fail; ${fmt(totalBefore)} → ${fmt(totalAfter)}` +
      (totalAfter ? ` (${(totalBefore / totalAfter).toFixed(2)}×)` : ""),
  );
  if (fail) process.exitCode = 1;
}

main();
