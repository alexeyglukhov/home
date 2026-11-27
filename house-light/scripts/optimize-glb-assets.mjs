#!/usr/bin/env node
/**
 * Сжимает ассеты GLB.
 * Мебель/топочная: optimize (meshopt + webp + simplify).
 * Машины: мягко (dedup/prune/meshopt) — без simplify и webp, иначе ломается
 * KHR_materials_pbrSpecularGlossiness (пятна, пропавший блеск).
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
const TOPO_MODELS = path.join(ROOT, "topochnaya", "models");

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

function npxCli(args) {
  if (dryRun) {
    console.log(`[dry-run] npx ${args.join(" ")}`);
    return true;
  }
  const r = spawnSync("npx", args, { stdio: "inherit", shell: false });
  return r.status === 0;
}

/**
 * Optimize для мебели: meshopt + webp.
 * --join false: иначе полки/дно (Cabinet top bottom) сливаются в боковину (G03).
 * --instance false: иначе unit-меши ±1 и инстансы ломают bbox/посадку (G01 в воздухе).
 * --simplify false: не выкидывать мелкую геометрию полок.
 */
function runOptimize(src, dest) {
  return npxCli([
    "--yes",
    "@gltf-transform/cli@4.2.1",
    "optimize",
    src,
    dest,
    "--compress",
    "meshopt",
    "--texture-compress",
    "webp",
    "--join",
    "false",
    "--simplify",
    "false",
    "--instance",
    "false",
  ]);
}

/**
 * Мягко для машин: сохранить UV/материалы/JPEG|PNG.
 * Цепочка во временный файл → dest.
 */
function runGentleMeshopt(src, dest) {
  const mid = `${dest}.mid-${process.pid}.glb`;
  try {
    if (!npxCli(["--yes", "@gltf-transform/cli@4.2.1", "dedup", src, mid])) return false;
    if (!npxCli(["--yes", "@gltf-transform/cli@4.2.1", "prune", mid, mid])) return false;
    if (!npxCli(["--yes", "@gltf-transform/cli@4.2.1", "meshopt", mid, dest, "--level", "medium"])) {
      return false;
    }
    return true;
  } finally {
    try {
      fs.unlinkSync(mid);
    } catch {
      /* ignore */
    }
  }
}

function optimizeInPlace(filePath, { gentle = false } = {}) {
  const before = fs.statSync(filePath).size;
  const tmp = path.join(
    os.tmpdir(),
    `glb-opt-${path.basename(filePath)}-${process.pid}-${Date.now()}.glb`,
  );
  try {
    const ok = gentle ? runGentleMeshopt(filePath, tmp) : runOptimize(filePath, tmp);
    if (!ok) {
      console.error("FAIL", filePath);
      return { ok: false, before, after: before };
    }
    if (dryRun) return { ok: true, before, after: before };
    const after = fs.statSync(tmp).size;
    fs.renameSync(tmp, filePath);
    console.log(
      `OK  ${fmt(before)} → ${fmt(after)}  ${path.relative(ROOT, filePath)}` +
        (gentle ? " [gentle]" : ""),
    );
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

  console.log("=== cars (gentle: no simplify / no webp) ===");
  for (const file of CARS) {
    if (!fs.existsSync(file)) {
      console.warn("skip missing", file);
      continue;
    }
    const r = optimizeInPlace(file, { gentle: true });
    totalBefore += r.before;
    totalAfter += r.after;
    if (r.ok) ok += 1;
    else fail += 1;
  }

  console.log("=== topochnaya ===");
  if (fs.existsSync(TOPO_MODELS)) {
    for (const file of listGlbs(TOPO_MODELS)) {
      const r = optimizeInPlace(file);
      totalBefore += r.before;
      totalAfter += r.after;
      if (r.ok) ok += 1;
      else fail += 1;
    }
  }

  console.log("---");
  console.log(
    `done: ${ok} ok, ${fail} fail; ${fmt(totalBefore)} → ${fmt(totalAfter)}` +
      (totalAfter ? ` (${(totalBefore / totalAfter).toFixed(2)}×)` : ""),
  );

  console.log("=== strip junk helper meshes (±1 / empty blobs) ===");
  if (!dryRun) {
    const strip = spawnSync(
      process.execPath,
      [path.join(__dirname, "strip-furniture-junk-meshes.mjs")],
      { stdio: "inherit", shell: false },
    );
    if (strip.status !== 0) fail += 1;
  } else {
    console.log("[dry-run] skip strip-furniture-junk-meshes.mjs");
  }

  console.log("=== furniture model-meta (габариты) ===");
  if (!dryRun) {
    const bake = spawnSync(process.execPath, [path.join(__dirname, "bake-furniture-meta.mjs")], {
      stdio: "inherit",
      shell: false,
    });
    if (bake.status !== 0) fail += 1;
  } else {
    console.log("[dry-run] skip bake-furniture-meta.mjs");
  }

  if (fail) process.exitCode = 1;
}

main();
