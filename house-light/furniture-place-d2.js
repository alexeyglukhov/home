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
// Не грузить все GLB сразу: иначе Chromium роняет вкладку (Render process gone).
const LOAD_LIMIT = 4;
let loadActive = 0;
const loadWait = [];

function runLoadQueue() {
  while (loadActive < LOAD_LIMIT && loadWait.length) {
    const { start } = loadWait.shift();
    loadActive += 1;
    start().finally(() => {
      loadActive -= 1;
      runLoadQueue();
    });
  }
}

function enqueueLoad(job) {
  return new Promise((resolve, reject) => {
    loadWait.push({
      start: () => job().then(resolve, reject),
    });
    runLoadQueue();
  });
}

function fileUrl(file) {
  return new URL("./furniture/" + file, import.meta.url).href;
}

function loadModel(file) {
  const hit = cache.get(file);
  if (hit) return hit.then((scene) => scene.clone(true));
  const job = enqueueLoad(() => new Promise((resolve, reject) => {
    loader.load(fileUrl(file), (gltf) => resolve(gltf.scene), undefined, reject);
  }));
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
  const houseDx = api.houseDx ?? HOUSE_DX;
  const houseDy = api.houseDy ?? 0;
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

export const D2_FURNITURE = [];

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
  // Старая карта/жёсткая расстановка снята — мебель только из data/furniture/{variant}.json
  return mountFurniture(group, api, D2_FURNITURE);
}
