#!/usr/bin/env node
/**
 * Предрасчёт габаритов мебели → furniture/model-meta.json.
 * Сохраняет lastPose из уже существующего meta (не затирает).
 *
 *   node house-light/scripts/bake-furniture-meta.mjs
 *   node house-light/scripts/bake-furniture-meta.mjs --id T01
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { unionVisibleBounds } from "../furniture-visible-bounds.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATALOG = path.join(ROOT, "furniture", "catalog.json");
const META = path.join(ROOT, "furniture", "model-meta.json");
const FURN = path.join(ROOT, "furniture");
const DEPS = path.join(__dirname, ".deps");

const onlyId = (() => {
  const i = process.argv.indexOf("--id");
  return i >= 0 ? process.argv[i + 1] : null;
})();

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function defaultPose() {
  return { sx: 1, sy: 1, sz: 1, mirror: false, mirrorZ: false };
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function loadGltfTransform() {
  fs.mkdirSync(DEPS, { recursive: true });
  if (!fs.existsSync(path.join(DEPS, "node_modules", "@gltf-transform", "core"))) {
    console.log("installing @gltf-transform + meshoptimizer into scripts/.deps …");
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
  };
}

function normalizePose(p) {
  if (!p || typeof p !== "object") return defaultPose();
  return {
    sx: Math.max(0.05, Math.abs(p.sx || 1)),
    sy: Math.max(0.05, Math.abs(p.sy || 1)),
    sz: Math.max(0.05, Math.abs(p.sz || 1)),
    mirror: !!p.mirror,
    mirrorZ: !!p.mirrorZ,
  };
}

/** Есть ли у меша материал, который реально рисуется. */
function meshHasShading(mesh) {
  if (!mesh) return false;
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (!mat) continue;
    const mode = (mat.getAlphaMode?.() || "OPAQUE").toUpperCase();
    const base = mat.getBaseColorFactor?.() || [1, 1, 1, 1];
    const a = base[3] != null ? base[3] : 1;
    if (mode === "OPAQUE") return true;
    if (a > 0.02) return true;
  }
  return false;
}

/**
 * AABB только по видимым деталям — общая логика `furniture-visible-bounds.js`.
 */
function robustSceneBounds(doc, getBounds) {
  const parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let b;
    try {
      b = getBounds(node);
    } catch {
      continue;
    }
    if (!b?.min || !b?.max) continue;
    parts.push({
      name: (node.getName() || "").trim(),
      min: [b.min[0], b.min[1], b.min[2]],
      max: [b.max[0], b.max[1], b.max[2]],
      visible: true,
      hasShading: meshHasShading(mesh),
    });
  }
  return unionVisibleBounds(parts);
}

async function main() {
  const { NodeIO, getBounds, ALL_EXTENSIONS, MeshoptDecoder } = await loadGltfTransform();
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

  const catalog = loadJson(CATALOG, { items: [] });
  const prev = loadJson(META, { v: 1, models: {} });
  const prevModels = prev.models && typeof prev.models === "object" ? prev.models : {};

  const models = onlyId ? { ...prevModels } : {};
  let ok = 0;
  let fail = 0;

  for (const item of catalog.items || []) {
    if (!item?.id || !item?.file) continue;
    if (onlyId && item.id !== onlyId) continue;
    const abs = path.join(FURN, item.file);
    if (!fs.existsSync(abs)) {
      console.warn("missing", item.id, item.file);
      fail += 1;
      continue;
    }
    let measured;
    try {
      const doc = await io.read(abs);
      const bounds = robustSceneBounds(doc, getBounds);
      if (!bounds) throw new Error("no mesh bounds");
      const min = bounds.min;
      const max = bounds.max;
      const w = max[0] - min[0];
      const h = max[1] - min[1];
      const d = max[2] - min[2];
      if (!(w > 1e-6 && h > 1e-6 && d > 1e-6)) throw new Error("empty bbox");
      const cx = (min[0] + max[0]) / 2;
      const cy = (min[1] + max[1]) / 2;
      const cz = (min[2] + max[2]) / 2;
      measured = {
        nativeM: { w: round3(w), d: round3(d), h: round3(h) },
        nativeMin: [round3(min[0]), round3(min[1]), round3(min[2])],
        nativeMax: [round3(max[0]), round3(max[1]), round3(max[2])],
        nativeCenter: [round3(cx), round3(cy), round3(cz)],
        // position при scale=1: низ в y=0, центр XZ в нуле
        seatOffset: [round3(-cx), round3(-min[1]), round3(-cz)],
        feetY: round3(min[1]),
        droppedMeshes: bounds.dropped || 0,
      };
    } catch (err) {
      console.warn("FAIL", item.id, err.message || err);
      fail += 1;
      continue;
    }
    const old = prevModels[item.id] || {};
    const cm = Array.isArray(item.cm) ? item.cm : null;
    let fit = null;
    let fittedM = null;
    if (cm && cm.length >= 3) {
      fit = round3(
        Math.min(
          cm[0] / 100 / measured.nativeM.w,
          cm[1] / 100 / measured.nativeM.d,
          cm[2] / 100 / measured.nativeM.h,
        ),
      );
      fittedM = {
        w: round3(measured.nativeM.w * fit),
        d: round3(measured.nativeM.d * fit),
        h: round3(measured.nativeM.h * fit),
      };
    }
    models[item.id] = {
      file: item.file,
      catalogCm: cm,
      fit,
      fittedM,
      ...measured,
      lastPose: normalizePose(old.lastPose),
    };
    ok += 1;
    console.log(
      `${item.id}  ${measured.nativeM.w}×${measured.nativeM.d}×${measured.nativeM.h} m` +
        (fit != null ? `  fit×${fit} → ${fittedM.w}×${fittedM.d}×${fittedM.h}` : "") +
        `  feetY=${measured.nativeMin[1]}`,
    );
  }

  if (onlyId && !models[onlyId]?.nativeM) {
    console.error("no model baked for", onlyId);
    process.exitCode = 1;
    return;
  }

  const payload = {
    v: 1,
    updated: new Date().toISOString(),
    models,
  };
  fs.writeFileSync(META, JSON.stringify(payload, null, 2) + "\n");
  console.log(`---\nwrote ${path.relative(ROOT, META)} (${ok} ok, ${fail} fail, ${Object.keys(models).length} entries)`);
  if (fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
