// Расстановка каталога на Д2.
//
// Перед/зад моделей (запомнить) — единый источник правды, не крутить wall «наугад»:
//   H* (Kenney кухня)     — лицо = +Z (дверцы/фасад)
//   H17/H03/H18           — лицо = +Z (комоды/остров; кабинет проверен)
//   W* (Innerscene шкафы) — лицо = +Z (дверцы)
//   G* (открытые)         — лицо = +Z (открытая сторона / одежда)
//   N* (тумбы)            — лицо = +Z (ящики / фасад)
//   K* (кровати)          — изголовье = −Z
//   T* (T01)              — чаша/перед = +Z в комнату; бачок = −Z к стене
//   R* V*                 — лицо/чаша = −Z в комнату
//   D*                    — сиденье = +Z; диван D08 ещё mirror по X при необходимости
//   A* C*                 — сиденье = +Z
//   S* P* M* B* J*        — лицо = −Z
//
// Шкафы W/G/H: спинка ВСЕГДА к стене (wall = сторона спинки), фасад в комнату.
// Если фасад в стену — wall указан наоборот (N↔S или E↔W), а не «крутить модель».
// FRONT_AXIS менять только когда одна модель везде системно смотрит не туда.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const HOUSE_DX = -1;
const FLOOR = 0.44;
const TERRACE_Y = 0.40;
export const COUNTER_H = 0.90;
const COUNTER_TOP = FLOOR + COUNTER_H;
const COUNTER_THICK = 0.04;
export const CAB_H = COUNTER_H - COUNTER_THICK;
export const RAISE = 0.03;
/** Напольные кухонные H04/H05 в файле ~45 см — тянем до 85 см под столешницу. */
const KITCHEN_BASE_IDS = new Set(["H04", "H05"]);
const KITCHEN_BASE_H = 0.85;
/** Макс. линейная деформация и перекос пропорций (иначе — неверная модель). */
const MAX_DEFORM = 2;

/** Куда смотрит лицо модели (+Z или −Z) по id/группе. */
const FRONT_AXIS = {
  H: "+z",
  W: "+z",
  G: "+z",
  N: "+z",
  K: "-z", // изголовье на −Z
  T: "+z", // чаша (+Z); бачок на −Z
  R: "-z",
  V: "-z",
  D: "+z",
  A: "+z",
  C: "+z",
  S: "-z",
  P: "-z",
  M: "-z",
  B: "-z",
  J: "-z",
  X: "+z",
};

/** Переопределения лица для отдельных id. */
const FRONT_AXIS_ID = {
  H03: "+z",
  H17: "+z",
  H18: "+z",
};

const loader = new GLTFLoader();
const cache = new Map();

function fileUrl(file) {
  return new URL("./furniture/" + file, import.meta.url).href;
}

function loadModel(file) {
  const hit = cache.get(file);
  if (hit) return hit.then((scene) => scene.clone(true));
  const job = new Promise((resolve, reject) => {
    loader.load(fileUrl(file), (gltf) => resolve(gltf.scene), undefined, reject);
  });
  cache.set(file, job);
  return job.then((scene) => scene.clone(true));
}

function planAxis(east, north, azX, azY) {
  return new THREE.Vector3(
    east * Math.sin(azX) + north * Math.sin(azY),
    0,
    east * Math.cos(azX) + north * Math.cos(azY)
  ).normalize();
}

function orientToPlan(holder, rotDeg, azX, azY) {
  const rad = (rotDeg * Math.PI) / 180;
  const xe = Math.cos(rad);
  const xn = Math.sin(rad);
  const xDir = planAxis(xe, xn, azX, azY);
  const zDir = planAxis(-xn, xe, azX, azY);
  const up = new THREE.Vector3(0, 1, 0);
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xDir, up, zDir));
}

/**
 * planToWorld зеркалит X (PLAN_W - x). Базис planAxis при этом остаётся
 * правым для N/S, но E/W для мебели надо поменять местами (90° ↔ 270°),
 * иначе объекты у восточных/западных стен смотрят в стену.
 */
function compensatePlanXMirror(rotDeg) {
  const r = ((Math.round(rotDeg) % 360) + 360) % 360;
  if (r === 90) return 270;
  if (r === 270) return 90;
  return r;
}

/**
 * rot 0: +Z=N −Z=S | 90: +Z=W −Z=E | 180: +Z=S −Z=N | 270: +Z=E −Z=W
 *
 * wall — стена за спиной предмета.
 * kind:
 *   "face" — фасад/сиденье в комнату (шкафы +Z, стулья/диваны −Z)
 *   "head" — изголовье (−Z) к стене (кровати)
 *   "tank" — бачок (−Z) к стене (T01); wall = стена за бачком
 */
function rotFromWall(wall, frontAxis, kind = "face") {
  const w = wall.toUpperCase();
  if (kind === "head") {
    // −Z к стене
    return { N: 180, S: 0, W: 270, E: 90 }[w];
  }
  // face: фасад в комнату (от стены)
  if (frontAxis === "+z") {
    return { N: 180, S: 0, W: 270, E: 90 }[w];
  }
  // −Z в комнату
  return { N: 0, S: 180, W: 90, E: 270 }[w];
}

/**
 * Стрелка на карте (frontDeg: 0=N 90=E 180=S 270=W) → rot модели.
 * Стрелка = перед в комнату = FRONT_AXIS (+Z или −Z).
 * head: изголовье на −Z; стрелка = изножье = +Z (FRONT_AXIS_ID/ось для K = −z → kind head).
 * T: FRONT_AXIS +z (чаша); бачок на −Z к стене.
 */
function rotFromFront(frontDeg, frontAxis, kind = "face") {
  // head: стрелка на изножье (+Z), даже если FRONT_AXIS группы = −z (изголовье)
  const axis = kind === "head" ? "+z" : frontAxis;
  let f = ((Number(frontDeg) % 360) + 360) % 360;
  f = ((Math.round(f / 90) * 90) % 360 + 360) % 360;
  if (axis === "+z") {
    return { 0: 0, 90: 270, 180: 180, 270: 90 }[f];
  }
  return { 0: 180, 90: 90, 180: 0, 270: 270 }[f];
}

function frontAxisOf(id) {
  if (FRONT_AXIS_ID[id]) return FRONT_AXIS_ID[id];
  return FRONT_AXIS[id[0]] || "-z";
}

function wallKindOf(id) {
  // T больше не "tank": FRONT_AXIS +z (чаша), как обычный face
  if (id[0] === "K") return "head";
  return "face";
}

/**
 * Ванны: длина по Z; wall-ориентация часто ставит длину поперёк пятна.
 * Явный rot в item надёжнее; longZ только если item.longZ === true.
 */
function longAxisZ(item) {
  return !!item.longZ;
}

function footprintBox(planW, planD, rot, longZ) {
  const sideways = rot === 90 || rot === 270;
  if (longZ) {
    return {
      boxW: sideways ? planW : planD,
      boxD: sideways ? planD : planW,
    };
  }
  return {
    boxW: sideways ? planD : planW,
    boxD: sideways ? planW : planD,
  };
}

function computeScales(natW, natD, natH, boxW, boxD, fitH, keepAspect, lockHeight = false) {
  let sx = boxW / Math.max(natW, 1e-4);
  let sz = boxD / Math.max(natD, 1e-4);
  if (keepAspect) {
    const s = Math.min(sx, sz);
    sx = sz = s;
  }
  let sy;
  if (lockHeight) {
    sy = 1;
  } else if (fitH != null) {
    sy = fitH / Math.max(natH, 1e-4);
  } else {
    sy = Math.min(Math.abs(sx), Math.abs(sz));
  }
  return { sx: Math.abs(sx), sy: Math.abs(sy), sz: Math.abs(sz) };
}

function deformOk(sx, sy, sz) {
  const scales = [sx, sy, sz];
  const mn = Math.min(...scales);
  const mx = Math.max(...scales);
  if (scales.some((s) => s > MAX_DEFORM || s < 1 / MAX_DEFORM)) return false;
  if (mn <= 0 || mx / mn > MAX_DEFORM) return false;
  return true;
}

function deformScore(sx, sy, sz) {
  return [sx, sy, sz].reduce((acc, s) => acc + Math.log(s) ** 2, 0);
}

function natSizeM(entry) {
  if (!entry?.cm || entry.cm.length < 3) return null;
  return {
    w: entry.cm[0] / 100,
    d: entry.cm[1] / 100,
    h: entry.cm[2] / 100,
  };
}

/** Подбор другой модели той же группы, если заданная даёт деформацию > MAX_DEFORM. */
function pickFittingEntry(catalog, preferId, boxW, boxD, fitH, keepAspect) {
  const prefer = catalog.items.find((row) => row.id === preferId);
  const group = prefer?.group || preferId[0];
  const candidates = catalog.items.filter((row) => row.group === group && row.cm);
  let best = null;
  for (const entry of candidates) {
    const nat = natSizeM(entry);
    if (!nat) continue;
    const { sx, sy, sz } = computeScales(nat.w, nat.d, nat.h, boxW, boxD, fitH, keepAspect);
    if (!deformOk(sx, sy, sz)) continue;
    const score = deformScore(sx, sy, sz) + (entry.id === preferId ? -0.05 : 0);
    if (!best || score < best.score) best = { entry, sx, sy, sz, score };
  }
  return best;
}

function fitToFootprint(model, boxW, boxD, fitH, mirror, keepAspect, lockHeight = false) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const { sx, sy, sz } = computeScales(
    size.x,
    size.z,
    size.y,
    boxW,
    boxD,
    fitH,
    keepAspect,
    lockHeight
  );
  model.scale.set(mirror ? -sx : sx, sy, sz);
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitted.min.y;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
  return { sx, sy, sz };
}

/**
 * item: { id, x0,y0,x1,y1, frontDeg?, footW?, footD?, wall?, rot?, h?, raise?, mirror?, floorY?, fromMap? }
 * Карта = истина: поворот (frontDeg), зеркало (mirror), пропорции пятна (footW×footD).
 * Высоту модели не трогаем (sy=1), кроме напольных кухонных H04/H05 (85 см).
 * raise/floorY только сдвигают базу.
 */
async function placeInBox(group, api, item, catalog) {
  const houseDx = api.houseDx ?? HOUSE_DX;
  const houseDy = api.houseDy ?? 0;
  const x0 = Math.min(item.x0, item.x1);
  const x1 = Math.max(item.x0, item.x1);
  const y0 = Math.min(item.y0, item.y1);
  const y1 = Math.max(item.y0, item.y1);
  const planW = x1 - x0;
  const planD = y1 - y0;
  const frontAxis = frontAxisOf(item.id);
  const kind = item.kind || wallKindOf(item.id);
  const fromMap = item.fromMap === true || item.stretch === true;
  let rot;
  if (fromMap && item.frontDeg != null && item.frontDeg !== "") {
    rot = rotFromFront(item.frontDeg, frontAxis, kind);
  } else if (item.rot != null && item.rot !== "") {
    rot = Number(item.rot);
  } else if (item.frontDeg != null && item.frontDeg !== "") {
    rot = rotFromFront(item.frontDeg, frontAxis, kind);
  } else if (item.wall) {
    rot = rotFromWall(item.wall, frontAxis, kind);
  } else {
    rot = 0;
  }
  rot = compensatePlanXMirror(rot);

  let boxW;
  let boxD;
  if (item.footW > 0 && item.footD > 0) {
    boxW = item.footW;
    boxD = item.footD;
  } else {
    ({ boxW, boxD } = footprintBox(planW, planD, rot, longAxisZ(item)));
  }

  const kitchenBase = KITCHEN_BASE_IDS.has(item.id);
  const keepAspect = fromMap ? false : !!item.keepAspect;
  const lockHeight = fromMap && !kitchenBase;
  const fitH = kitchenBase ? KITCHEN_BASE_H : (fromMap ? null : item.h);

  let entry = catalog.items.find((row) => row.id === item.id);
  if (!entry) {
    console.warn("catalog miss", item.id);
    return;
  }

  const nat = natSizeM(entry);
  if (nat && !fromMap) {
    const scales = computeScales(nat.w, nat.d, nat.h, boxW, boxD, fitH, keepAspect);
    if (!deformOk(scales.sx, scales.sy, scales.sz)) {
      const alt = pickFittingEntry(catalog, item.id, boxW, boxD, fitH, keepAspect);
      if (!alt) {
        console.warn(
          "furniture deform>2x, no alt",
          item.id,
          `box ${boxW.toFixed(2)}x${boxD.toFixed(2)}`,
          `nat ${nat.w.toFixed(2)}x${nat.d.toFixed(2)}x${nat.h.toFixed(2)}`,
          scales
        );
        return;
      }
      console.warn("furniture deform>2x, swap", item.id, "→", alt.entry.id, scales, "→", {
        sx: alt.sx,
        sy: alt.sy,
        sz: alt.sz,
      });
      entry = alt.entry;
    }
  }

  const model = await loadModel(entry.file);
  if (!nat) {
    model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const scales = computeScales(size.x, size.z, size.y, boxW, boxD, fitH, keepAspect, lockHeight);
    if (!fromMap && !deformOk(scales.sx, scales.sy, scales.sz)) {
      const alt = pickFittingEntry(catalog, item.id, boxW, boxD, fitH, keepAspect);
      if (!alt) {
        console.warn("furniture deform>2x (mesh), no alt", item.id, scales);
        return;
      }
      console.warn("furniture deform>2x (mesh), swap", item.id, "→", alt.entry.id);
      entry = alt.entry;
      const swapped = await loadModel(entry.file);
      const holder = new THREE.Group();
      holder.name = entry.id;
      fitToFootprint(swapped, boxW, boxD, fitH, item.mirror, keepAspect, lockHeight);
      holder.add(swapped);
      orientToPlan(holder, rot, api.azX, api.azY);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const [wx, wz] = api.planToWorld(cx + houseDx, cy + houseDy);
      const baseY = item.floorY != null ? item.floorY : FLOOR;
      holder.position.set(wx, baseY + (item.raise || 0), wz);
      group.add(holder);
      return;
    }
  }

  const holder = new THREE.Group();
  holder.name = entry.id;
  const placed = fitToFootprint(model, boxW, boxD, fitH, item.mirror, keepAspect, lockHeight);
  if (!fromMap && !deformOk(placed.sx, placed.sy, placed.sz)) {
    console.warn("furniture deform>2x after fit, skip", entry.id, placed);
    return;
  }
  holder.add(model);
  orientToPlan(holder, rot, api.azX, api.azY);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const [wx, wz] = api.planToWorld(cx + houseDx, cy + houseDy);
  const baseY = item.floorY != null ? item.floorY : FLOOR;
  holder.position.set(wx, baseY + (item.raise || 0), wz);
  group.add(holder);
}

function addCounterSlab(group, api, x0, y0, x1, y1, yBot, yTop, color) {
  const quad = [
    [x0 + houseDx, y0 + houseDy],
    [x1 + houseDx, y0 + houseDy],
    [x1 + houseDx, y1 + houseDy],
    [x0 + houseDx, y1 + houseDy],
  ];
  const ring = quad.map(([x, y]) => {
    const [e, n] = api.planToWorld(x, y);
    return [e, 0, n];
  });
  const geom = api.prismGeometry([{ ring, y0: yBot, y1: yTop }]);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildKitchenCounters(group, api) {
  const wood = 0xc4b49a;
  const stone = 0x8a8680;
  for (const [a, b, c, d] of [
    [-3.995, 2.879, -0.223, 3.42],
    [-4.005, 3.446, -3.463, 5.64],
    [-4.02, 5.64, -1.74, 6.18],
  ]) {
    addCounterSlab(group, api, a, b, c, d, FLOOR, COUNTER_TOP - COUNTER_THICK, wood);
    addCounterSlab(group, api, a, b, c, d, COUNTER_TOP - COUNTER_THICK, COUNTER_TOP, stone);
  }
  addCounterSlab(group, api, -2.70, 2.90, -1.90, 3.40, COUNTER_TOP, COUNTER_TOP + RAISE, stone);
  addCounterSlab(group, api, -3.30, 5.66, -2.50, 6.16, COUNTER_TOP, COUNTER_TOP + RAISE, stone);
}

function buildTV(group, api, x0, y0, x1, y1) {
  const yBot = FLOOR + 1.05;
  const yTop = FLOOR + 1.70;
  addCounterSlab(group, api, x0, y0, x1, y1, yBot, yTop, 0x2a2a2e);
  addCounterSlab(group, api, x0 + 0.02, y0 + 0.01, x1 - 0.02, y1 - 0.01, yBot + 0.04, yTop - 0.04, 0x1a1a1c);
}

export const D2_FURNITURE = [
  // Сгенерировано из furniture-map-d2.svg — правьте карту, затем sync_map_to_place.py
  { id: "H05", x0: -4.001, y0: 2.942, x1: -3.206, y1: 3.483, footW: 0.795, footD: 0.541, frontDeg: 0, fromMap: true, wall: "S", h: CAB_H },
  { id: "H04", x0: -3.202, y0: 2.951, x1: -2.702, y1: 3.492, footW: 0.500, footD: 0.541, frontDeg: 0, fromMap: true, wall: "S", h: CAB_H },
  { id: "H05", x0: -1.941, y0: 2.948, x1: -1.091, y1: 3.489, footW: 0.850, footD: 0.541, frontDeg: 0, fromMap: true, wall: "S", h: CAB_H },
  { id: "H04", x0: -1.079, y0: 2.949, x1: -0.252, y1: 3.490, footW: 0.827, footD: 0.541, frontDeg: 0, fromMap: true, wall: "S", h: CAB_H },
  { id: "H05", x0: -3.954, y0: 3.492, x1: -3.412, y1: 4.046, footW: 0.554, footD: 0.542, frontDeg: 90, fromMap: true, wall: "W", h: CAB_H },
  { id: "H04", x0: -3.953, y0: 4.067, x1: -3.411, y1: 4.617, footW: 0.550, footD: 0.542, frontDeg: 90, fromMap: true, wall: "W", h: CAB_H },
  { id: "H05", x0: -3.957, y0: 4.633, x1: -3.415, y1: 5.183, footW: 0.550, footD: 0.542, frontDeg: 90, fromMap: true, wall: "W", h: CAB_H },
  { id: "H04", x0: -3.957, y0: 5.190, x1: -3.415, y1: 5.583, footW: 0.393, footD: 0.542, frontDeg: 90, fromMap: true, wall: "W", h: CAB_H },
  { id: "H05", x0: -4.016, y0: 5.601, x1: -3.296, y1: 6.141, footW: 0.720, footD: 0.540, frontDeg: 180, fromMap: true, wall: "N", h: CAB_H },
  { id: "H11", x0: -3.298, y0: 5.601, x1: -2.498, y1: 6.101, footW: 0.800, footD: 0.500, frontDeg: 180, fromMap: true, wall: "N", raise: COUNTER_H + RAISE },
  { id: "H04", x0: -2.484, y0: 5.597, x1: -1.724, y1: 6.137, footW: 0.760, footD: 0.540, frontDeg: 180, fromMap: true, wall: "N", h: CAB_H },
  { id: "H18", x0: -0.232, y0: 2.889, x1: 0.711, y1: 4.833, footW: 1.944, footD: 0.943, frontDeg: 270, fromMap: true, wall: "E", h: 0.95 },
  { id: "S02", x0: 1.701, y0: 3.990, x1: 3.801, y1: 4.940, footW: 2.100, footD: 0.950, frontDeg: 0, fromMap: true, wall: "S", h: 0.75 },
  { id: "C01", x0: 1.701, y0: 3.540, x1: 2.101, y1: 3.940, footW: 0.400, footD: 0.400, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "C01", x0: 2.451, y0: 3.540, x1: 2.851, y1: 3.940, footW: 0.400, footD: 0.400, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "C01", x0: 3.251, y0: 3.540, x1: 3.651, y1: 3.940, footW: 0.400, footD: 0.400, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "C01", x0: 1.701, y0: 4.990, x1: 2.101, y1: 5.390, footW: 0.400, footD: 0.400, frontDeg: 180, fromMap: true, wall: "N" },
  { id: "C01", x0: 2.451, y0: 4.990, x1: 2.851, y1: 5.390, footW: 0.400, footD: 0.400, frontDeg: 180, fromMap: true, wall: "N" },
  { id: "C01", x0: 3.251, y0: 4.990, x1: 3.651, y1: 5.390, footW: 0.400, footD: 0.400, frontDeg: 180, fromMap: true, wall: "N" },
  { id: "C01", x0: 3.838, y0: 4.244, x1: 4.238, y1: 4.644, footW: 0.400, footD: 0.400, frontDeg: 270, fromMap: true, wall: "E" },
  { id: "C01", x0: 1.152, y0: 4.250, x1: 1.552, y1: 4.650, footW: 0.400, footD: 0.400, frontDeg: 90, fromMap: true, wall: "W" },
  { id: "D08", x0: 1.320, y0: 6.580, x1: 4.650, y1: 8.200, footW: 3.330, footD: 1.620, frontDeg: 0, fromMap: true, wall: "S", h: 0.90, mirror: true },
  { id: "J01", x0: 1.530, y0: 8.400, x1: 3.010, y1: 9.330, footW: 1.480, footD: 0.930, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "S01", x0: 6.410, y0: 5.040, x1: 7.360, y1: 7.140, footW: 2.100, footD: 0.950, frontDeg: 270, fromMap: true, wall: "E", h: 0.75, floorY: TERRACE_Y },
  { id: "C01", x0: 6.680, y0: 4.600, x1: 7.080, y1: 5.000, footW: 0.400, footD: 0.400, frontDeg: 0, fromMap: true, wall: "S", floorY: TERRACE_Y },
  { id: "C01", x0: 5.957, y0: 5.169, x1: 6.357, y1: 5.569, footW: 0.400, footD: 0.400, frontDeg: 90, fromMap: true, wall: "W", floorY: TERRACE_Y },
  { id: "C01", x0: 7.407, y0: 5.169, x1: 7.797, y1: 5.569, footW: 0.400, footD: 0.390, frontDeg: 270, fromMap: true, wall: "E", floorY: TERRACE_Y },
  { id: "C01", x0: 5.957, y0: 5.969, x1: 6.357, y1: 6.369, footW: 0.400, footD: 0.400, frontDeg: 90, fromMap: true, wall: "W", floorY: TERRACE_Y },
  { id: "C01", x0: 7.407, y0: 5.969, x1: 7.797, y1: 6.369, footW: 0.400, footD: 0.390, frontDeg: 270, fromMap: true, wall: "E", floorY: TERRACE_Y },
  { id: "C01", x0: 5.957, y0: 6.719, x1: 6.357, y1: 7.119, footW: 0.400, footD: 0.400, frontDeg: 90, fromMap: true, wall: "W", floorY: TERRACE_Y },
  { id: "C01", x0: 7.407, y0: 6.719, x1: 7.797, y1: 7.119, footW: 0.400, footD: 0.390, frontDeg: 270, fromMap: true, wall: "E", floorY: TERRACE_Y },
  { id: "C01", x0: 6.690, y0: 7.290, x1: 7.090, y1: 7.690, footW: 0.400, footD: 0.400, frontDeg: 180, fromMap: true, wall: "N", floorY: TERRACE_Y },
  { id: "P02", x0: -4.001, y0: 17.598, x1: -2.588, y1: 18.477, footW: 1.413, footD: 0.879, frontDeg: 0, fromMap: true, wall: "S", h: 0.75 },
  { id: "P02", x0: -2.628, y0: 17.604, x1: -1.220, y1: 18.476, footW: 1.408, footD: 0.872, frontDeg: 0, fromMap: true, wall: "S", h: 0.75 },
  { id: "A01", x0: -3.490, y0: 17.008, x1: -3.010, y1: 17.498, footW: 0.480, footD: 0.490, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "A01", x0: -2.220, y0: 17.084, x1: -1.588, y1: 17.722, footW: 0.632, footD: 0.638, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "H17", x0: -0.002, y0: 18.050, x1: 0.798, y1: 18.500, footW: 0.800, footD: 0.450, frontDeg: 180, fromMap: true, wall: "N", h: 0.75 },
  { id: "W07", x0: -2.127, y0: 15.543, x1: -0.298, y1: 16.138, footW: 1.829, footD: 0.595, frontDeg: 0, fromMap: true, wall: "S", h: 2.04 },
  { id: "G03", x0: -2.370, y0: 13.593, x1: -1.790, y1: 14.737, footW: 1.144, footD: 0.580, frontDeg: 270, fromMap: true, wall: "E", h: 2.20 },
  { id: "G07", x0: 6.788, y0: 16.541, x1: 8.159, y1: 17.141, footW: 1.371, footD: 0.600, frontDeg: 0, fromMap: true, wall: "S", h: 2.15 },
  { id: "G07", x0: 5.355, y0: 14.612, x1: 6.711, y1: 15.212, footW: 1.356, footD: 0.600, frontDeg: 0, fromMap: true, wall: "S", h: 2.15 },
  { id: "G03", x0: 8.918, y0: 10.761, x1: 9.498, y1: 11.661, footW: 0.900, footD: 0.580, frontDeg: 270, fromMap: true, wall: "E", h: 2.20 },
  { id: "G03", x0: 8.923, y0: 11.690, x1: 9.503, y1: 12.590, footW: 0.900, footD: 0.580, frontDeg: 270, fromMap: true, wall: "E", h: 2.20 },
  { id: "W08", x0: 8.020, y0: 12.090, x1: 8.890, y1: 12.610, footW: 0.870, footD: 0.520, frontDeg: 180, fromMap: true, wall: "N", h: 1.48 },
  { id: "K04", x0: 1.060, y0: 16.270, x1: 3.213, y1: 17.860, footW: 1.590, footD: 2.153, frontDeg: 90, fromMap: true, wall: "W", h: 1.27 },
  { id: "N01", x0: 1.044, y0: 15.750, x1: 1.544, y1: 16.250, footW: 0.500, footD: 0.500, frontDeg: 90, fromMap: true, wall: "W", h: 0.55 },
  { id: "N01", x0: 1.044, y0: 17.900, x1: 1.544, y1: 18.400, footW: 0.500, footD: 0.500, frontDeg: 90, fromMap: true, wall: "W", h: 0.55 },
  { id: "W01", x0: 4.319, y0: 16.617, x1: 4.908, y1: 18.476, footW: 1.859, footD: 0.589, frontDeg: 270, fromMap: true, wall: "E", h: 2.10 },
  { id: "P02", x0: 3.197, y0: 14.606, x1: 4.891, y1: 15.328, footW: 1.694, footD: 0.722, frontDeg: 0, fromMap: true, wall: "S", h: 0.75 },
  { id: "A02", x0: 4.070, y0: 15.440, x1: 4.470, y1: 15.830, footW: 0.400, footD: 0.390, frontDeg: 180, fromMap: true, wall: "N" },
  { id: "K01", x0: 9.896, y0: 14.621, x1: 11.776, y1: 16.779, footW: 1.880, footD: 2.158, frontDeg: 0, fromMap: true, wall: "S", h: 1.10 },
  { id: "N01", x0: 9.348, y0: 14.610, x1: 9.848, y1: 15.110, footW: 0.500, footD: 0.500, frontDeg: 0, fromMap: true, wall: "S", h: 0.55 },
  { id: "N01", x0: 11.822, y0: 14.639, x1: 12.322, y1: 15.139, footW: 0.500, footD: 0.500, frontDeg: 0, fromMap: true, wall: "S", h: 0.55 },
  { id: "M01", x0: 11.753, y0: 17.933, x1: 12.978, y1: 18.446, footW: 1.225, footD: 0.513, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "A02", x0: 12.190, y0: 17.140, x1: 12.590, y1: 17.530, footW: 0.400, footD: 0.390, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "K01", x0: 9.766, y0: 10.796, x1: 11.902, y1: 12.686, footW: 1.890, footD: 2.136, frontDeg: 90, fromMap: true, wall: "W", h: 1.10 },
  { id: "N02", x0: 9.740, y0: 10.182, x1: 10.350, y1: 10.732, footW: 0.610, footD: 0.550, frontDeg: 180, fromMap: true, wall: "N", h: 0.83 },
  { id: "N02", x0: 9.743, y0: 12.740, x1: 10.353, y1: 13.290, footW: 0.610, footD: 0.550, frontDeg: 180, fromMap: true, wall: "N", h: 0.83 },
  { id: "M01", x0: 11.870, y0: 13.880, x1: 12.970, y1: 14.350, footW: 1.100, footD: 0.470, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "B04", x0: 12.395, y0: 13.248, x1: 12.902, y1: 13.747, footW: 0.507, footD: 0.499, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "V03", x0: 1.800, y0: 10.950, x1: 2.600, y1: 12.660, footW: 0.800, footD: 1.710, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "W08", x0: 2.727, y0: 12.194, x1: 3.904, y1: 12.600, footW: 1.177, footD: 0.406, frontDeg: 180, fromMap: true, wall: "N", h: 1.48 },
  { id: "R02", x0: 3.962, y0: 10.911, x1: 4.902, y1: 11.471, footW: 0.940, footD: 0.560, frontDeg: 180, fromMap: true, wall: "N", h: 1.17 },
  { id: "T01", x0: 3.150, y0: 10.900, x1: 3.600, y1: 11.500, footW: 0.450, footD: 0.600, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "R02", x0: 5.326, y0: 9.516, x1: 5.886, y1: 10.456, footW: 0.940, footD: 0.560, frontDeg: 90, fromMap: true, wall: "W", h: 1.17 },
  { id: "V03", x0: 5.390, y0: 11.840, x1: 7.100, y1: 12.640, footW: 0.800, footD: 1.710, frontDeg: 270, fromMap: true, wall: "E" },
  { id: "T01", x0: -1.545, y0: 14.670, x1: -1.007, y1: 15.079, footW: 0.409, footD: 0.538, frontDeg: 90, fromMap: true, wall: "W" },
  { id: "R02", x0: -1.554, y0: 13.597, x1: -1.110, y1: 14.355, footW: 0.758, footD: 0.444, frontDeg: 270, fromMap: true, wall: "E", h: 1.17 },
  { id: "B03", x0: -3.010, y0: 10.950, x1: -2.140, y1: 11.490, footW: 0.870, footD: 0.540, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "W08", x0: -3.059, y0: 13.037, x1: -2.189, y1: 13.355, footW: 0.870, footD: 0.318, frontDeg: 180, fromMap: true, wall: "N", h: 1.48 },
  { id: "W06", x0: -2.141, y0: 13.041, x1: -1.275, y1: 13.346, footW: 0.866, footD: 0.305, frontDeg: 180, fromMap: true, wall: "N", h: 1.32 },
  { id: "W06", x0: -2.764, y0: 8.501, x1: -2.274, y1: 9.181, footW: 0.680, footD: 0.490, frontDeg: 270, fromMap: true, wall: "E", h: 1.32 },
  { id: "X06", x0: -2.763, y0: 9.247, x1: -2.268, y1: 9.949, footW: 0.495, footD: 0.702, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "W06", x0: -2.756, y0: 10.015, x1: -2.266, y1: 10.695, footW: 0.680, footD: 0.490, frontDeg: 270, fromMap: true, wall: "E", h: 1.32 },
  { id: "H17", x0: -0.800, y0: 9.084, x1: -0.350, y1: 9.812, footW: 0.728, footD: 0.450, frontDeg: 270, fromMap: true, wall: "E", h: 0.75 },
  { id: "H17", x0: -0.799, y0: 8.304, x1: -0.365, y1: 9.061, footW: 0.757, footD: 0.434, frontDeg: 270, fromMap: true, wall: "E", h: 0.75 },
  { id: "W08", x0: -0.739, y0: 9.829, x1: -0.335, y1: 10.699, footW: 0.870, footD: 0.404, frontDeg: 270, fromMap: true, wall: "E", h: 1.48 },
  { id: "H04", x0: -2.689, y0: 2.965, x1: -1.956, y1: 3.491, footW: 0.733, footD: 0.526, frontDeg: 0, fromMap: true, wall: "S", h: CAB_H },
  { id: "W08", x0: 8.463, y0: 15.931, x1: 8.925, y1: 16.970, footW: 1.039, footD: 0.462, frontDeg: 90, fromMap: true, wall: "W", h: 1.48, mirror: true },
  { id: "W08", x0: 8.500, y0: 18.031, x1: 10.392, y1: 18.492, footW: 1.892, footD: 0.461, frontDeg: 180, fromMap: true, wall: "N", h: 1.48 },
  { id: "G03", x0: 7.394, y0: 10.765, x1: 7.974, y1: 11.665, footW: 0.900, footD: 0.580, frontDeg: 90, fromMap: true, wall: "W", h: 2.20 },
  { id: "G03", x0: 7.394, y0: 11.705, x1: 7.974, y1: 12.605, footW: 0.900, footD: 0.580, frontDeg: 90, fromMap: true, wall: "W", h: 2.20 },
  { id: "T01", x0: 5.327, y0: 10.909, x1: 5.927, y1: 11.359, footW: 0.450, footD: 0.600, frontDeg: 90, fromMap: true, wall: "W" },
  { id: "G03", x0: 5.339, y0: 16.558, x1: 6.751, y1: 17.138, footW: 1.412, footD: 0.580, frontDeg: 0, fromMap: true, wall: "S", h: 2.20, mirror: true },
  { id: "G01", x0: 5.325, y0: 17.145, x1: 5.983, y1: 18.476, footW: 1.331, footD: 0.658, frontDeg: 90, fromMap: true, wall: "W", h: 2.08, mirror: true },
  { id: "G03", x0: 6.761, y0: 14.634, x1: 8.173, y1: 15.214, footW: 1.412, footD: 0.580, frontDeg: 0, fromMap: true, wall: "S", h: 2.20, mirror: true },
  { id: "X06", x0: 6.005, y0: 18.158, x1: 7.063, y1: 18.463, footW: 1.058, footD: 0.305, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "X06", x0: 7.141, y0: 18.170, x1: 8.169, y1: 18.475, footW: 1.028, footD: 0.305, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "G01", x0: 7.541, y0: 15.267, x1: 8.199, y1: 16.292, footW: 1.025, footD: 0.658, frontDeg: 270, fromMap: true, wall: "E", h: 2.08 },
  { id: "W07", x0: -4.009, y0: 15.532, x1: -2.179, y1: 16.127, footW: 1.830, footD: 0.595, frontDeg: 0, fromMap: true, wall: "S", h: 2.04 },
  { id: "G03", x0: -4.002, y0: 14.746, x1: -2.891, y1: 15.326, footW: 1.111, footD: 0.580, frontDeg: 180, fromMap: true, wall: "N", h: 2.20 },
  { id: "G03", x0: -2.873, y0: 14.748, x1: -1.788, y1: 15.328, footW: 1.085, footD: 0.580, frontDeg: 180, fromMap: true, wall: "N", h: 2.20 },
  { id: "X06", x0: -2.011, y0: 7.699, x1: -1.450, y1: 8.292, footW: 0.561, footD: 0.593, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "X06", x0: -1.430, y0: 7.700, x1: -0.869, y1: 8.293, footW: 0.561, footD: 0.593, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "X06", x0: -0.844, y0: 7.689, x1: -0.371, y1: 8.282, footW: 0.473, footD: 0.593, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "X06", x0: -2.770, y0: 7.733, x1: -2.275, y1: 8.435, footW: 0.495, footD: 0.702, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "J03", x0: -4.014, y0: 7.695, x1: -3.427, y1: 8.284, footW: 0.587, footD: 0.589, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "J03", x0: -3.410, y0: 7.704, x1: -2.799, y1: 8.301, footW: 0.611, footD: 0.597, frontDeg: 0, fromMap: true, wall: "S" },
  { id: "W08", x0: 6.803, y0: 10.558, x1: 7.171, y1: 11.634, footW: 1.076, footD: 0.368, frontDeg: 270, fromMap: true, wall: "E", h: 1.48 },
];

export async function mountFurniture(group, api, items) {
  const catalog = await fetch(fileUrl("catalog.json")).then((r) => r.json());
  await Promise.all(
    items.map((item) =>
      placeInBox(group, api, item, catalog).catch((err) => {
        console.warn("furniture", item.id, err);
      })
    )
  );
}

export async function mountD2Furniture(group, api) {
  const catalog = await fetch(fileUrl("catalog.json")).then((r) => r.json());
  buildKitchenCounters(group, api);
  buildTV(group, api, 1.93, 10.24, 3.88, 10.40);
  await Promise.all(
    D2_FURNITURE.map((item) =>
      placeInBox(group, api, item, catalog).catch((err) => {
        console.warn("furniture", item.id, err);
      })
    )
  );
}
