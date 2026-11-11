// Топочная Вариант 3 — комната 3,50×1,98×2,70 м по topochnaya-…-v2-stena.svg
// X: запад→восток, Z: север→юг, Y: вверх. (0,0,0) = центр пола.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const ROOM = { w: 3.5, d: 1.98, h: 2.7 };
const WALL = 0.15;
const S = 200; // svg px / m

const loader = new GLTFLoader();
const cache = new Map();

function assetUrl(rel) {
  return new URL(rel, import.meta.url).href;
}

function loadGltf(rel) {
  if (!cache.has(rel)) {
    cache.set(
      rel,
      new Promise((resolve, reject) => {
        loader.load(assetUrl(rel), (g) => resolve(g.scene), undefined, reject);
      })
    );
  }
  return cache.get(rel).then((s) => s.clone(true));
}

/** SVG → локальные метры: (0,0) у NW угла пола, +X восток, +Z юг. */
function svgXZ(sx, sy) {
  return {
    x: (sx - 300) / S - ROOM.w / 2,
    z: (sy - 400) / S - ROOM.d / 2,
  };
}

function svgRect(sx, sy, sw, sh) {
  const a = svgXZ(sx, sy);
  const b = svgXZ(sx + sw, sy + sh);
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    w: Math.abs(b.x - a.x),
    d: Math.abs(b.z - a.z),
    x0: Math.min(a.x, b.x),
    z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x),
    z1: Math.max(a.z, b.z),
  };
}

/** Высота трубы: svg-y на верхней стене (y<400) → высота от пола. */
function northWallY(svgY) {
  // верхняя стена: y=400 пол, y=200 потолок развёртки → грубо H * (400-y)/200, clamp
  const t = (400 - svgY) / 200;
  return THREE.MathUtils.clamp(t * ROOM.h, 0.15, ROOM.h - 0.15);
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.12,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
}

function meshBox(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function meshCyl(rTop, rBot, h, material, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function fitGlb(root, tw, th, td) {
  const wrap = new THREE.Group();
  wrap.add(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y += size.y / 2;
  const s = Math.min(tw / size.x, th / size.y, td / size.z);
  wrap.scale.setScalar(s);
  return wrap;
}

function add(group, obj, x, y, z, rotY = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  group.add(obj);
  return obj;
}

/** Billboard-подписи: у объекта, со стороны комнаты (перед ним изнутри), без «разлёта» к стенам. */
const _tagSlots = [];
const MARGIN = 0.14;

function resetTags() {
  _tagSlots.length = 0;
}

function label(text, scale = 0.4) {
  const c = document.createElement("canvas");
  const W = 1024;
  const H = 256;
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(15,15,15,0.78)";
  ctx.fillRect(24, 56, W - 48, 144);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 80px DejaVu Sans, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  spr.scale.set(scale, scale * 0.25, 1);
  spr.renderOrder = 6;
  return spr;
}

function _clampRoom(x, y, z) {
  return [
    Math.min(ROOM.w / 2 - MARGIN, Math.max(-ROOM.w / 2 + MARGIN, x)),
    Math.min(ROOM.h - 0.1, Math.max(0.12, y)),
    Math.min(ROOM.d / 2 - MARGIN, Math.max(-ROOM.d / 2 + MARGIN, z)),
  ];
}

function _slotFree(x, y, z, rx, ry, rz = 0.16) {
  for (const s of _tagSlots) {
    if (
      Math.abs(s.x - x) < s.rx + rx &&
      Math.abs(s.y - y) < s.ry + ry &&
      Math.abs(s.z - z) < (s.rz ?? 0.16) + rz
    ) {
      return false;
    }
  }
  return true;
}

/** Держим подпись у якоря: сначала Y, иначе сдвиг вдоль стены. */
function _placeNear(x0, y0, z0, rx, ry, along = "x") {
  const take = (x, y, z) => {
    if (!_slotFree(x, y, z, rx, ry)) return null;
    _tagSlots.push({ x, y, z, rx, ry, rz: 0.16 });
    return [x, y, z];
  };
  let hit = take(x0, y0, z0);
  if (hit) return hit;
  for (let i = 0; i < 24; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const step = 0.06 + Math.floor(i / 4) * 0.045;
    const dy = sign * step;
    const da = sign * (0.07 + Math.floor(i / 2) * 0.05);
    hit = take(x0, y0 + dy, z0);
    if (hit) return hit;
    if (along === "x") {
      hit = take(x0 + da, y0, z0);
      if (hit) return hit;
      hit = take(x0 + da, y0 + dy * 0.4, z0);
      if (hit) return hit;
    } else {
      hit = take(x0, y0, z0 + da);
      if (hit) return hit;
      hit = take(x0, y0 + dy * 0.4, z0 + da);
      if (hit) return hit;
    }
  }
  _tagSlots.push({ x: x0, y: y0, z: z0, rx, ry, rz: 0.16 });
  return [x0, y0, z0];
}

/**
 * face: сторона объекта к центру комнаты (N/S/E/W).
 * Подпись чуть перед объектом внутри комнаты (узкая глубина 1,98 м → front малый).
 */
function wallTag(group, text, anchor, face, opts = {}) {
  const scale = opts.scale ?? 0.3;
  const spr = label(text, scale);
  const front = opts.front ?? 0.07;
  let x = anchor[0];
  let z = anchor[2];
  if (face === "N") z = anchor[2] + front;
  else if (face === "S") z = anchor[2] - front;
  else if (face === "W") x = anchor[0] + front;
  else if (face === "E") x = anchor[0] - front;

  const yWant = opts.y ?? anchor[1] + (opts.lift ?? 0.1);
  const rx = scale * 0.48;
  const ry = scale * 0.13;
  const along = face === "N" || face === "S" ? "x" : "z";
  const [px, py, pz] = _placeNear(x, yWant, z, rx, ry, along);
  const [cx, cy, cz] = _clampRoom(px, py, pz);
  spr.position.set(cx, cy, cz);
  group.add(spr);
  return spr;
}

function floorTag(group, text, anchor, face = "N", opts = {}) {
  return wallTag(group, text, [anchor[0], 0.15, anchor[2]], face, {
    front: opts.front ?? 0.07,
    y: opts.y ?? 0.32,
    scale: opts.scale ?? 0.42,
  });
}

const EPS = 1e-4;
const snap = (v) => Math.round(v * 1000) / 1000;
const pt = (x, y, z) => [snap(x), snap(y), snap(z)];

/** Только ортогональные сегменты (меняется ровно одна ось). */
function isOrtho(a, b) {
  const eq = (u, v) => Math.abs(u - v) < EPS;
  return (eq(a[0], b[0]) ? 1 : 0) + (eq(a[1], b[1]) ? 1 : 0) + (eq(a[2], b[2]) ? 1 : 0) === 2;
}

/** Манхэттен: Y → X → Z (параллельно осям комнаты, без диагоналей). */
function expandOrtho(points) {
  const out = [pt(...points[0])];
  for (let i = 1; i < points.length; i++) {
    let a = out[out.length - 1];
    const b = pt(...points[i]);
    if (isOrtho(a, b)) {
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > EPS) out.push(b);
      continue;
    }
    if (Math.abs(a[1] - b[1]) > EPS) {
      a = pt(a[0], b[1], a[2]);
      out.push(a);
    }
    if (Math.abs(a[0] - b[0]) > EPS) {
      a = pt(b[0], a[1], a[2]);
      out.push(a);
    }
    if (Math.abs(a[2] - b[2]) > EPS) {
      a = pt(a[0], a[1], b[2]);
      out.push(a);
    }
  }
  return out;
}

function portStub(group, p, axis, sign, r, material, len = 0.07) {
  const m = meshCyl(r * 1.35, r * 1.35, len, material, 8);
  const half = (len / 2) * sign;
  if (axis === "x") {
    m.rotation.z = Math.PI / 2;
    m.position.set(p[0] + half, p[1], p[2]);
  } else if (axis === "z") {
    m.rotation.x = Math.PI / 2;
    m.position.set(p[0], p[1], p[2] + half);
  } else {
    m.position.set(p[0], p[1] + half, p[2]);
  }
  group.add(m);
  const flange = meshCyl(r * 1.85, r * 1.85, r * 0.55, material, 8);
  if (axis === "x") flange.rotation.z = Math.PI / 2;
  else if (axis === "z") flange.rotation.x = Math.PI / 2;
  flange.position.set(p[0], p[1], p[2]);
  group.add(flange);
}

function wallExit(group, innerPt, outerPt, r, material) {
  pipeRun(group, [innerPt, outerPt], r, material);
  const plate = meshBox(0.07, 0.09, 0.07, mat(0x455a64, { metalness: 0.45, roughness: 0.4 }));
  plate.position.set(outerPt[0], outerPt[1], outerPt[2]);
  group.add(plate);
}

/** Вывод за западную стену: вниз на пол в полосу laneX, затем +10 см наружу. */
function floorWallExit(group, fromPt, outX, floorY, r, material, laneX = null) {
  const xLane = laneX == null ? fromPt[0] : laneX;
  const drop = pt(xLane, floorY, fromPt[2]);
  const outer = pt(outX, floorY, fromPt[2]);
  pipeRun(group, [fromPt, pt(fromPt[0], floorY, fromPt[2]), drop, outer], r, material);
  const plate = meshBox(0.08, 0.08, 0.08, mat(0x455a64, { metalness: 0.45, roughness: 0.4 }));
  plate.position.set(outer[0], outer[1], outer[2]);
  group.add(plate);
}

/** Вывод за северную стену: вниз и прямо наружу по Z (без прогона в СЗ угол). */
function floorWallExitN(group, fromPt, outZ, floorY, r, material) {
  const outer = pt(fromPt[0], floorY, outZ);
  pipeRun(group, [fromPt, pt(fromPt[0], floorY, fromPt[2]), outer], r, material);
  const plate = meshBox(0.08, 0.08, 0.08, mat(0x455a64, { metalness: 0.45, roughness: 0.4 }));
  plate.position.set(outer[0], outer[1], outer[2]);
  group.add(plate);
}

function pipeRun(group, points, r, material) {
  const pts = expandOrtho(points);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!isOrtho(a, b)) {
      console.warn("topo pipe non-ortho", a, b);
      continue;
    }
    const pa = new THREE.Vector3(a[0], a[1], a[2]);
    const pb = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = pb.clone().sub(pa);
    const len = dir.length();
    if (len < EPS) continue;
    const m = meshCyl(r, r, len, material, 8);
    m.position.copy(pa).add(pb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(m);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 10, 8), material);
    elbow.position.set(pts[i][0], pts[i][1], pts[i][2]);
    elbow.castShadow = true;
    group.add(elbow);
  }
}

/**
 * Горизонталь вдоль северной стены: не сквозь щит автоматики.
 * Если нитка пересекает габарит щита по X и ниже его верха — подъём над щитом (yClear).
 */
function northRunX(group, xA, xB, yNom, z, r, material, L, yClearOpt = null) {
  const avtX0 = L.avt.x - L.avtW / 2 - 0.05;
  const avtX1 = L.avt.x + L.avtW / 2 + 0.05;
  const yClear = yClearOpt != null ? yClearOpt : L.avtTop + 0.08;
  const xLo = Math.min(xA, xB);
  const xHi = Math.max(xA, xB);
  if (xHi <= avtX0 + EPS || xLo >= avtX1 - EPS || yNom >= yClear - EPS) {
    pipeRun(group, [pt(xA, yNom, z), pt(xB, yNom, z)], r, material);
    return;
  }
  const eastward = xB > xA;
  let xEnter = eastward ? avtX0 : avtX1;
  let xExit = eastward ? avtX1 : avtX0;
  xEnter = THREE.MathUtils.clamp(xEnter, xLo, xHi);
  xExit = THREE.MathUtils.clamp(xExit, xLo, xHi);
  const pts = [pt(xA, yNom, z)];
  if (Math.abs(xA - xEnter) > EPS) pts.push(pt(xEnter, yNom, z));
  pts.push(pt(xEnter, yClear, z), pt(xExit, yClear, z), pt(xExit, yNom, z));
  if (Math.abs(xB - xExit) > EPS) pts.push(pt(xB, yNom, z));
  pipeRun(group, pts, r, material);
}

/**
 * Горизонталь вдоль западной стены: над дверью, без пересечения проёма.
 * x — полоса магистрали (xWest.*); разные нитки — разный x, yLift и zPad.
 */
function westRunZ(group, x, yNom, zA, zB, r, material, L, yLiftOpt = null, zPad = 0.08) {
  const z0 = L.doorZ0;
  const z1 = L.doorZ1;
  const yLift = yLiftOpt != null ? yLiftOpt : Math.max(yNom, L.yOverDoor);
  const zLo = Math.min(zA, zB);
  const zHi = Math.max(zA, zB);
  if (zHi <= z0 + EPS || zLo >= z1 - EPS || yNom >= yLift - EPS) {
    pipeRun(group, [pt(x, yNom, zA), pt(x, yNom, zB)], r, material);
    return;
  }
  const southward = zB > zA;
  let zEnter = southward ? z0 - zPad : z1 + zPad;
  let zExit = southward ? z1 + zPad : z0 - zPad;
  zEnter = THREE.MathUtils.clamp(zEnter, zLo, zHi);
  zExit = THREE.MathUtils.clamp(zExit, zLo, zHi);
  const pts = [pt(x, yNom, zA)];
  if (Math.abs(zA - zEnter) > EPS) pts.push(pt(x, yNom, zEnter));
  pts.push(pt(x, yLift, zEnter), pt(x, yLift, zExit), pt(x, yNom, zExit));
  if (Math.abs(zB - zExit) > EPS) pts.push(pt(x, yNom, zB));
  pipeRun(group, pts, r, material);
}

/** Общие координаты: синхрон с plan-v3.svg (правки пользователя) + СТЭН mini-11. */
function layoutPorts() {
  const zN = -ROOM.d / 2;
  const zS = ROOM.d / 2;
  const xW = -ROOM.w / 2;
  const xE = ROOM.w / 2;

  // пятна с plan-v3.svg (правки пользователя); ТТ — mini-11 у востока
  const gas = { x: -1.39, z: 0.827 }; // южная стена, фронт на север
  const el = { x: -0.942, z: 0.827 }; // южная стена, фронт на север
  const bkn = { x: 0.614, z: -0.709 }; // термоаккумулятор со змеевиком
  const fuel = { x: 1.317, z: 0.148 };
  const fe = { x: 1.495, z: -0.708 };
  const f1 = { x: 1.68, z: -0.222 };
  const f2 = { x: 1.682, z: -0.392 };
  const lap = { x: -1.443, z: -0.693 }; // западная стена, сдвиг от наличника двери
  const lapRotY = -Math.PI / 2;
  const grebPos = { x: -0.834, z: -0.916 }; // северная стена
  const mixPos = { x: -0.791, z: -0.916 };

  const grebLen = 0.26;
  const mixLen = 0.34;
  const grebZ = snap(grebPos.z);
  const mixZ = snap(mixPos.z);
  const boilerD = 0.3;
  const boilerW = 0.4;
  const boilerZ = (o) => snap(o.z); // якорь с плана
  const gasY0 = 1.15;
  const elY0 = 1.12;
  const bknR = 0.25;
  const bknZ = snap(bkn.z);

  // АОТВ СТЭН mini-11: Д×Ш×В 660×338×560; у вост. стены, зад ≥0,10, фронт ≥1,25 на запад
  const ttW = 0.338; // вдоль Z
  const ttD = 0.66; // вдоль X (глубина корпуса)
  const ttH = 0.56;
  const ttRear = 0.1;
  const tt = { x: snap(xE - ttRear - ttD / 2), z: 0.6 }; // x≈1,32
  const ttZ = tt.z;
  const ttRotY = -Math.PI / 2; // дверца на −X (в комнату)

  const sRail = snap(zS - 0.18);
  const eRail = snap(xE - 0.18);
  const yFil = 0.18;
  const Y = {
    rb: 2.2,
    so: 1.9,
    feed: 1.66,
    hvs: 1.44,
    soMid: 1.22,
    gs: 1.55,
    svsh: 1.38,
    gvs: 1.16,
    greb: 1.35,
    soLo: 0.62,
    low: 0.18,
    floor: 0.045,
    flHvs: 0.045,
    flOut: 0.045,
    flDrain: 0.045,
    drain: 0.045,
    gas: 1.55,
    vent: 1.45,
  };
  // СВШ западнее Н-ТА (bknEast≈0,84) и Н-ТТ (0,97) — зазор ≥25 см
  const soNodes = {
    nSo: snap(-0.083),
    man: snap(0.18),
    gs: snap(0.36),
    svsh: snap(0.52),
  };
  const nRail = snap(zN + 0.1);
  const wRail = snap(xW + 0.12);
  const BEYOND = 0.1;
  const wallOutW = snap(xW - WALL - BEYOND);
  const wallOutS = snap(zS + WALL + BEYOND);
  const wallOutN = snap(zN - WALL - BEYOND);
  const wallOutE = snap(xE + WALL + BEYOND);
  const xRise = snap(-0.55);
  const gasBoilerZ = boilerZ(gas);
  const elBoilerZ = boilerZ(el);
  // ГАЗ и ЭЛ на юге: фронт на −Z (в комнату)
  const frontZGas = snap(gasBoilerZ - boilerD / 2 + 0.04);
  const frontZEl = snap(elBoilerZ - boilerD / 2 + 0.04);
  const rbZ = snap(zN + 0.12);
  const rbY = Y.rb + 0.14;
  // ТТ: фронт на запад (−X), тыл к восточной стене
  const ttFrontX = snap(tt.x - ttD / 2);
  const ttRearX = snap(tt.x + ttD / 2);
  // дверь на западе: трубы вдоль wRail не пересекают проём
  const doorZ = 0;
  const doorW = 0.7;
  const doorH = 2.1;
  const doorZ0 = snap(doorZ - doorW / 2);
  const doorZ1 = snap(doorZ + doorW / 2);
  const yOverDoor = snap(doorH + 0.12); // 2,22 — база над притолокой
  // Магистрали: разные полосы от стены (≥6 см) + разнос по Y/zPad.
  // Нельзя вести разные нитки в одной линии X или Z — сливаются и пересекаются.
  const xWest = {
    hvs: snap(xW + 0.06),
    gvs: snap(xW + 0.12),
    so: snap(xW + 0.18),
    soOut: snap(xW + 0.24),
  };
  const zNorth = {
    feed: snap(zN + 0.08),
    gvs: snap(zN + 0.14),
    so: snap(zN + 0.20),
  };
  const zSouth = {
    hvs: snap(zS - 0.10),
    gvs: snap(zS - 0.16),
    so: snap(zS - 0.22),
  };
  const xWestPipe = xWest.hvs; // алиас для старых вызовов
  const yDoorHvs = snap(yOverDoor); // 2,22
  const yDoorGvs = snap(yOverDoor + 0.12); // 2,34
  const yDoorSo = snap(yOverDoor + 0.24); // 2,46
  const yDoorSoOut = snap(yOverDoor + 0.36); // 2,58
  const zPadHvs = 0.05;
  const zPadGvs = 0.14;
  const zPadSo = 0.23;
  const zPadSoOut = 0.32;

  return {
    zN, zS, xW, xE, gas, el, bkn, tt, fe, f1, f2, lap, fuel,
    boilerD, boilerW, boilerZ: gasBoilerZ, gasBoilerZ, elBoilerZ,
    bknZ, bknR, ttZ, ttW, ttD, ttH, ttRotY, ttFrontX, ttRearX,
    grebZ, mixZ, grebLen, mixLen, grebPos, mixPos, lapRotY,
    nRail, wRail, sRail, eRail, xRise,
    wallOutW, wallOutS, wallOutN, wallOutE, soNodes,
    doorZ, doorW, doorH, doorZ0, doorZ1, yOverDoor,
    xWest, zNorth, zSouth, xWestPipe,
    yDoorHvs, yDoorGvs, yDoorSo, yDoorSoOut,
    zPadHvs, zPadGvs, zPadSo, zPadSoOut,
    // устаревшие алиасы (если где-то остались)
    yDoorCold: yDoorHvs, yDoorHot: yDoorSo, zPadCold: zPadHvs, zPadHot: zPadSo,
    nZ: nRail, wX: wRail,
    avt: { x: -1.416, z: -0.927 }, // северная стена, фронт на юг
    avtW: 0.4,
    avtD: 0.12,
    avtH: 0.35 * 1.7,
    avtTop: 1.35 + 0.35, // 1,70
    // ИБП / АКБ — пятна с plan-v3.svg (южная стена)
    ibp: { x: -1.248, z: 0.899 },
    akb: { x: -1.566, z: 0.897 },
    vent: { x: 1.681, z: 0.009 },
    // насосы: труба сквозь корпус; корпуса вне объёма ТА (R=bknR)
    nTt: { x: snap(bkn.x + bknR + 0.38), z: nRail }, // ~1,24 — восток от ТА и Н-ТА
    nBkn: {
      x: snap(bkn.x + bknR + 0.14), // снаружи восточной стенки ТА
      z: nRail,
    },
    yPump: Y.so,
    yPumpTa: snap((Y.so + 0.78) / 2), // на вертикали к змеевику
    ch4: { x: -0.298, z: -0.941 },
    port: {
      // ГАЗ/ЭЛ на юге: смотрим с севера — слева (+X) подача, справа (−X) обратка
      gasSo: pt(gas.x + 0.1, gasY0 - 0.02, gasBoilerZ),
      gasFeed: pt(gas.x - 0.1, gasY0 - 0.02, gasBoilerZ),
      gasFuel: pt(gas.x, gasY0 - 0.02, gasBoilerZ),
      elSo: pt(el.x + 0.1, elY0 - 0.02, elBoilerZ),
      elFeed: pt(el.x - 0.1, elY0 - 0.02, elBoilerZ),
      // ЭЛ-комби: ГВС снизу по центру → гребёнка
      elGvs: pt(el.x, elY0 - 0.02, elBoilerZ),
      // термоаккумулятор со змеевиком: ХВС низ, ГВС верх; змеевик сбоку
      bknCold: pt(bkn.x - bknR + 0.02, 0.35, bknZ),
      bknHot: pt(bkn.x - bknR + 0.02, 1.15, bknZ),
      bknHeat: pt(bkn.x + bknR - 0.02, 0.78, bknZ),
      bknRet: pt(bkn.x + bknR - 0.02, 0.45, bknZ),
      ttSo: pt(ttRearX, 0.5, tt.z),
      ttFeed: pt(tt.x + ttD / 2 - 0.055, 0.113, tt.z - ttW / 2),
      ttFlue: pt(tt.x + 0.04, 0.04 + ttH * 0.88 + 0.12, tt.z),
      // гребёнка выдвинута (zN+0.28); порты на тыле гребёнки
      grebHvs: pt(grebPos.x - grebLen * 0.28, Y.hvs, zN + 0.28),
      grebGvs: pt(grebPos.x + grebLen * 0.28, Y.gvs, zN + 0.28),
      grebOutGvs: pt(grebPos.x + grebLen * 0.38, Y.gvs, zN + 0.22),
      grebOutHvs: pt(grebPos.x - grebLen * 0.38, Y.hvs, zN + 0.22),
      mixSoIn: pt(mixPos.x - mixLen * 0.2, Y.soLo + 0.06, zN + 0.22),
      mixUfh: pt(mixPos.x + mixLen * 0.35, Y.soLo + 0.06, zN + 0.2),
      mixDrain: pt(mixPos.x, Y.soLo - 0.02, zN + 0.28),
      // Н-ТП на полу: прямая нитка сквозь оба насоса (z южнее ХВС на n)
      nTpZ: snap(zN + 0.22),
      nTpB: pt(mixPos.x + mixLen * 0.38, 0.08, snap(zN + 0.22)),
      nTpA: pt(mixPos.x - mixLen * 0.38, 0.08, snap(zN + 0.22)),
      gasMain: pt(wallOutW, Y.gas, gas.z),
      ventOut: pt(wallOutE, Y.vent, 0.1),
      // коаксиал: на крышке корпуса ГК (центр верха), затем через южную стену
      gasCoax: pt(gas.x, gasY0 + 0.68, gasBoilerZ),
      nSoIn: pt(soNodes.nSo, Y.soMid + 0.06, nRail + 0.08),
      manIn: pt(soNodes.man, Y.soMid + 0.08, nRail + 0.08),
      gsIn: pt(soNodes.gs, Y.gs, nRail + 0.08),
      svshIn: pt(soNodes.svsh, Y.svsh, nRail + 0.08),
      rbSo: pt(-0.093, rbY, rbZ),
      rbKotly: pt(0.22, rbY, rbZ),
      f1In: pt(eRail + 0.03, yFil, f1.z),
      f1Out: pt(eRail, yFil, f1.z - 0.04),
      feIn: pt(eRail, yFil, fe.z + 0.18),
      feOut: pt(eRail, yFil + 0.06, fe.z + 0.18),
      feDrain: pt(eRail, Y.drain, fe.z),
      f2In: pt(eRail, yFil, f2.z + 0.04),
      f2Out: pt(eRail + 0.03, yFil, f2.z),
      lapDrain: pt(lap.x, Y.drain, lap.z),
      k1: pt(0.045, 0.02, -0.013),
      soOut: pt(snap(xW + 0.24), Y.so, snap(zS - 0.22)),
      gasInWall: pt(wallOutW, Y.gas, gas.z),
      hvsInWall: pt(wallOutE, yFil, f1.z),
    },
    Y,
    wallFaceW: xW - WALL,
    wallFaceS: zS + WALL,
    wallFaceN: zN - WALL,
    wallFaceE: xE + WALL,
  };
}

function nodeTag(group, text, x, y, z, face = "N", opts = {}) {
  wallTag(group, text, [x, y, z], face, opts);
}

/** Стены с проёмами. Низ (cut) всегда; верх + потолок — userData.roof (кнопка «Крыша»). */
function buildShell(group) {
  const wallM = mat(0xe8eef2, { roughness: 0.92, metalness: 0.02 });
  const wallHi = mat(0xdde4ea, { roughness: 0.92, metalness: 0.02, opacity: 0.55 });
  const floorM = mat(0xcfd8dc, { roughness: 0.88, metalness: 0.04 });
  const ceilM = mat(0xf5f7fa, { roughness: 0.95, metalness: 0 });
  const CUT = 1.55; // разрез чуть выше подоконника, окно остаётся в стене

  const floor = meshBox(ROOM.w, 0.06, ROOM.d, floorM);
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = meshBox(ROOM.w, 0.05, ROOM.d, ceilM);
  ceil.position.y = ROOM.h + 0.025;
  ceil.userData.roof = true;
  group.add(ceil);

  const zN = -ROOM.d / 2 - WALL / 2;
  const zS = ROOM.d / 2 + WALL / 2;
  const xW = -ROOM.w / 2 - WALL / 2;
  const xE = ROOM.w / 2 + WALL / 2;

  function wallSeg(w, h, d, x, y0, z, roofOnly = false) {
    const m = meshBox(w, h, d, roofOnly ? wallHi : wallM);
    m.position.set(x, y0 + h / 2, z);
    if (roofOnly) m.userData.roof = true;
    group.add(m);
    return m;
  }

  // --- низ (разрез): углы встык — N/S на всю внешнюю ширину, E/W на всю внешнюю глубину ---
  wallSeg(ROOM.w + WALL * 2, CUT, WALL, 0, 0, zN);
  wallSeg(WALL, CUT, ROOM.d + WALL * 2, xE, 0, 0);

  const door = svgRect(300, 528, 1, 140);
  const doorW = 0.7;
  const doorH = 2.1;
  const doorZ = door.z;
  const westLeftZ1 = doorZ - doorW / 2;
  const westRightZ0 = doorZ + doorW / 2;
  const zOuterN = -ROOM.d / 2 - WALL;
  const zOuterS = ROOM.d / 2 + WALL;
  const lenN = westLeftZ1 - zOuterN;
  const lenS = zOuterS - westRightZ0;
  if (lenN > 0.05) wallSeg(WALL, CUT, lenN, xW, 0, zOuterN + lenN / 2);
  if (lenS > 0.05) wallSeg(WALL, CUT, lenS, xW, 0, zOuterS - lenS / 2);

  const winW = 0.8;
  const winH = 0.8;
  const winSill = 0.55; // в зоне разреза (реальная ~1,15; здесь видно в стене)
  const winX = 0; // середина южной стены
  // проём шире рамы (рама 0,80 + 2×0,045), зазор ~1 см — без z-fight боковин с торцом стены
  const winHole = winW + 0.12;
  const xOuterW = -ROOM.w / 2 - WALL;
  const xOuterE = ROOM.w / 2 + WALL;
  const leftW = winX - winHole / 2 - xOuterW;
  const rightW = xOuterE - (winX + winHole / 2);
  if (leftW > 0.05) wallSeg(leftW, CUT, WALL, xOuterW + leftW / 2, 0, zS);
  if (rightW > 0.05) wallSeg(rightW, CUT, WALL, xOuterE - rightW / 2, 0, zS);
  // подоконник (стенка под проёмом)
  wallSeg(winHole + 0.02, winSill, WALL, winX, 0, zS);
  const winTop = winSill + winH;
  if (winTop < CUT) wallSeg(winHole + 0.02, CUT - winTop, WALL, winX, winTop, zS);

  // --- верх стен (полная высота, скрыт без «Крыши») ---
  const hi = ROOM.h - CUT;
  if (hi > 0.05) {
    wallSeg(ROOM.w + WALL * 2, hi, WALL, 0, CUT, zN, true);
    wallSeg(WALL, hi, ROOM.d + WALL * 2, xE, CUT, 0, true);
    if (lenN > 0.05) wallSeg(WALL, hi, lenN, xW, CUT, zOuterN + lenN / 2, true);
    if (lenS > 0.05) wallSeg(WALL, hi, lenS, xW, CUT, zOuterS - lenS / 2, true);
    wallSeg(WALL, ROOM.h - doorH, doorW + 0.04, xW, doorH, doorZ, true);
    if (leftW > 0.05) wallSeg(leftW, hi, WALL, xOuterW + leftW / 2, CUT, zS, true);
    if (rightW > 0.05) wallSeg(rightW, hi, WALL, xOuterE - rightW / 2, CUT, zS, true);
    if (winTop < ROOM.h) wallSeg(winHole + 0.02, ROOM.h - winTop, WALL, winX, winTop, zS, true);
  }

  return { doorZ, doorW, doorH, winX, winW, winH, winSill, xW, zN, zS, CUT };
}

/**
 * Дверь в западной стене: локально X в комнату (+), Z север→юг (−→+).
 * Петли на севере; полотно открыто наружу (−X). Ручки с обеих сторон.
 */
function makeDoorLeaf(w, h) {
  const root = new THREE.Group();
  const frameM = mat(0x5d4037, { roughness: 0.7 });
  const leafM = mat(0xa1887f, { roughness: 0.6 });
  const metal = mat(0x37474f, { metalness: 0.6, roughness: 0.3 });

  const jambN = meshBox(0.09, h + 0.06, 0.05, frameM);
  jambN.position.set(0, h / 2, -w / 2 - 0.025);
  const jambS = meshBox(0.09, h + 0.06, 0.05, frameM);
  jambS.position.set(0, h / 2, w / 2 + 0.025);
  const head = meshBox(0.09, 0.05, w + 0.1, frameM);
  head.position.set(0, h + 0.025, 0);
  root.add(jambN, jambS, head);

  const hinge = new THREE.Group();
  hinge.position.set(0, 0, -w / 2); // северный косяк
  const leafW = w - 0.02;
  const panel = meshBox(0.04, h - 0.03, leafW, leafM);
  panel.position.set(0, h / 2 + 0.015, leafW / 2);
  const hy = h * 0.48;
  const hz = leafW * 0.78; // у южного края, напротив петель
  const handleIn = meshBox(0.045, 0.12, 0.02, metal);
  handleIn.position.set(0.042, hy, hz);
  const handleOut = meshBox(0.045, 0.12, 0.02, metal);
  handleOut.position.set(-0.042, hy, hz);
  for (const yH of [0.28 * h, 0.72 * h]) {
    const barrel = meshCyl(0.012, 0.012, 0.07, metal, 8);
    barrel.position.set(0, yH, 0.01);
    hinge.add(barrel);
  }
  hinge.add(panel, handleIn, handleOut);
  // приоткрыта наружу (−X): ~35°, не настежь
  hinge.rotation.y = -Math.PI * 0.19;
  root.add(hinge);
  return root;
}

function makeWindowInWall(w, h, depth) {
  const g = new THREE.Group();
  // рама в цвет коробки двери; polygonOffset — страховка от дрожания с откосом
  const frame = mat(0x5d4037, { roughness: 0.7 });
  frame.polygonOffset = true;
  frame.polygonOffsetFactor = -1;
  frame.polygonOffsetUnits = -1;
  const trim = mat(0x6d4c41, { roughness: 0.65 });
  trim.polygonOffset = true;
  trim.polygonOffsetFactor = -1;
  trim.polygonOffsetUnits = -1;
  const glass = mat(0xb3e5fc, {
    roughness: 0.05,
    metalness: 0.15,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const t = 0.045;
  // чуть тоньше стены — торцы рамы не в одной плоскости с наружными гранями стены
  const d = Math.max(depth * 0.88, 0.1);

  const jl = meshBox(t, h + t * 2, d, frame);
  jl.position.set(-w / 2 - t / 2, 0, 0);
  const jr = meshBox(t, h + t * 2, d, frame);
  jr.position.set(w / 2 + t / 2, 0, 0);
  const head = meshBox(w + t * 2, t, d, frame);
  head.position.set(0, h / 2 + t / 2, 0);
  const sill = meshBox(w + t * 2 + 0.04, t * 0.85, d + 0.02, trim);
  sill.position.set(0, -h / 2 - t * 0.4, 0.01);

  // одно стекло в середине проёма — без двойных панелей у рамы
  const pane = meshBox(w - 0.04, h - 0.04, 0.01, glass);
  pane.castShadow = false;
  pane.renderOrder = 2;

  const mullV = meshBox(0.022, h - 0.06, 0.03, frame);
  const mullH = meshBox(w - 0.06, 0.022, 0.03, frame);

  const handle = meshBox(0.012, 0.07, 0.028, mat(0x37474f, { metalness: 0.65, roughness: 0.25 }));
  handle.position.set(w * 0.28, 0, d * 0.28);

  g.add(jl, jr, head, sill, pane, mullV, mullH, handle);
  return g;
}

function makeExpansion() {
  const g = new THREE.Group();
  const body = meshCyl(0.12, 0.12, 0.28, mat(0xc62828, { metalness: 0.35, roughness: 0.4 }));
  body.position.y = 0.16;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0xb71c1c, { metalness: 0.35, roughness: 0.35 })
  );
  cap.position.y = 0.3;
  g.add(body, cap);
  return g;
}

function makePump() {
  const g = new THREE.Group();
  const base = meshBox(0.14, 0.08, 0.18, mat(0x37474f, { metalness: 0.45, roughness: 0.4 }));
  base.position.y = 0.04;
  const head = meshCyl(0.05, 0.05, 0.1, mat(0x263238, { metalness: 0.5, roughness: 0.35 }));
  head.position.y = 0.14;
  g.add(base, head);
  return g;
}

/** Гребёнка ХВС/ГВС: коллектор с вентилями, рукоятки в комнату (+Z). */
function makeGrebManifold(len, h = 0.32) {
  const g = new THREE.Group();
  const brass = mat(0x90a4ae, { metalness: 0.55, roughness: 0.32 });
  const blue = mat(0x0277bd, { metalness: 0.35, roughness: 0.4 });
  const red = mat(0xc62828, { metalness: 0.35, roughness: 0.4 });
  const bar = meshCyl(0.02, 0.02, len, brass, 12);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, h * 0.4, 0);
  const plate = meshBox(len + 0.04, h * 0.55, 0.025, mat(0x607d8b, { metalness: 0.4, roughness: 0.4 }));
  plate.position.set(0, h * 0.4, -0.055);
  g.add(bar, plate);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.025 + (i / (n - 1)) * (len - 0.05);
    const col = i < n / 2 ? blue : red;
    const stem = meshCyl(0.009, 0.009, 0.07, brass, 8);
    stem.position.set(x, h * 0.4 + 0.035, 0.025);
    const hand = meshBox(0.038, 0.01, 0.01, col);
    hand.position.set(x, h * 0.4 + 0.075, 0.025);
    const drop = meshCyl(0.007, 0.007, 0.1, brass, 8);
    drop.position.set(x, h * 0.4 - 0.055, 0);
    g.add(stem, hand, drop);
  }
  return g;
}

/** Смесительный узел ТП: ряд мелких вентилей как гребёнка (+ одна термоголовка). */
function makeMixValveBlock(len, h = 0.28) {
  const g = new THREE.Group();
  const brass = mat(0xd4a017, { metalness: 0.55, roughness: 0.32 });
  const blue = mat(0x1565c0, { metalness: 0.35, roughness: 0.4 });
  const red = mat(0xc62828, { metalness: 0.35, roughness: 0.4 });
  const y0 = h * 0.4;
  const bar = meshCyl(0.014, 0.014, len, brass, 12);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, y0, 0);
  const plate = meshBox(len + 0.03, h * 0.45, 0.02, mat(0x78909c, { metalness: 0.4, roughness: 0.4 }));
  plate.position.set(0, y0, -0.045);
  g.add(bar, plate);
  const n = 10;
  const thermoIdx = 4;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.02 + (i / (n - 1)) * (len - 0.04);
    const col = i < n / 2 ? blue : red;
    const stem = meshCyl(0.006, 0.006, 0.045, brass, 8);
    stem.position.set(x, y0 + 0.022, 0.018);
    const hand = meshBox(0.024, 0.007, 0.007, col);
    hand.position.set(x, y0 + 0.048, 0.018);
    const drop = meshCyl(0.005, 0.005, 0.07, brass, 8);
    drop.position.set(x, y0 - 0.04, 0);
    g.add(stem, hand, drop);
    if (i === thermoIdx) {
      const head = meshCyl(0.016, 0.02, 0.032, mat(0xf5f5f5, { roughness: 0.45 }), 10);
      head.position.set(x, y0 + 0.07, 0.018);
      g.add(head);
    }
  }
  const gauge = meshCyl(0.012, 0.012, 0.01, mat(0xfafafa, { metalness: 0.2 }), 10);
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(len * 0.28, y0 + 0.06, 0.04);
  g.add(gauge);
  return g;
}

/** Грязевик / фильтр ХВС: крупный колбовый, с дренажом. */
function makeFilter() {
  const g = new THREE.Group();
  const brass = mat(0xb08d57, { metalness: 0.55, roughness: 0.35 });
  const steel = mat(0x455a64, { metalness: 0.45, roughness: 0.4 });
  const glass = mat(0x00838f, { metalness: 0.15, roughness: 0.35 });
  // кронштейн у стены
  const bracket = meshBox(0.06, 0.36, 0.2, steel);
  bracket.position.set(-0.08, 0.32, 0);
  // корпус-голова (Ø≈16 см; Ф1/Ф2 рядом — не шире шага пятен)
  const head = meshCyl(0.08, 0.088, 0.14, brass, 12);
  head.position.y = 0.48;
  const nut = meshCyl(0.06, 0.06, 0.055, brass, 8);
  nut.position.y = 0.57;
  // колба высокая
  const jar = meshCyl(0.078, 0.07, 0.4, glass, 14);
  jar.position.y = 0.22;
  // патрубки вход/выход
  const inN = meshCyl(0.024, 0.024, 0.11, brass, 8);
  inN.rotation.z = Math.PI / 2;
  inN.position.set(0.02, 0.48, 0.11);
  const outN = meshCyl(0.024, 0.024, 0.11, brass, 8);
  outN.rotation.z = Math.PI / 2;
  outN.position.set(0.02, 0.48, -0.11);
  // дренажный кран снизу
  const drain = meshCyl(0.016, 0.016, 0.08, steel, 8);
  drain.position.y = 0.02;
  const knob = meshBox(0.04, 0.02, 0.02, brass);
  knob.position.set(0.03, 0.02, 0);
  g.add(bracket, head, nut, jar, inN, outN, drain, knob);
  return g;
}

function makeTt(w, d, h) {
  const g = new THREE.Group();
  // паспорт: высота 560; рисуем корпус ближе к габариту
  const bodyH = h * 0.88;
  const bodyTop = 0.04 + bodyH;
  const body = meshBox(w, bodyH, d, mat(0x4e342e, { roughness: 0.55, metalness: 0.2 }));
  body.position.y = 0.04 + bodyH / 2;
  const base = meshBox(w * 1.05, 0.04, d * 1.05, mat(0x3e2723, { roughness: 0.6 }));
  base.position.y = 0.02;
  // дверца загрузки только на фронте (лок. +Z → мир −X)
  const door = meshBox(w * 0.55, h * 0.32, 0.03, mat(0x5d4037, { roughness: 0.5 }));
  door.position.set(0, 0.32, d / 2 + 0.01);
  const glow = meshBox(w * 0.28, h * 0.12, 0.02, mat(0xff6f00, { emissive: 0xff3d00, emissiveIntensity: 0.4, roughness: 0.35 }));
  glow.position.set(0, 0.38, d / 2 + 0.02);
  const hvsM = mat(0x0277bd, { metalness: 0.55, roughness: 0.32 });
  const soM = mat(0xd84315, { metalness: 0.5, roughness: 0.35 });
  // подача: задняя стенка сверху (лок. −Z → мир +X), ось ≈500 мм
  const nipSup = meshCyl(0.016, 0.016, 0.1, soM, 10);
  nipSup.rotation.x = Math.PI / 2;
  nipSup.position.set(0, 0.5, -d / 2 - 0.045);
  // обратка: северный бок низко (лок. −X → мир −Z), ≈113 мм, 55 мм от тыла
  const nipRet = meshCyl(0.014, 0.014, 0.1, hvsM, 10);
  nipRet.rotation.z = Math.PI / 2;
  nipRet.position.set(-w / 2 - 0.045, 0.113, -d / 2 + 0.055);
  // дымоход Ø115 на верхней панели
  const flueM = mat(0x6d4c41, { metalness: 0.35, roughness: 0.45 });
  const collar = meshCyl(0.057, 0.057, 0.12, flueM, 12);
  collar.position.set(0, bodyTop + 0.06, -0.04);
  const lid = meshCyl(0.075, 0.075, 0.04, flueM, 12);
  lid.position.set(0, bodyTop + 0.02, -0.04);
  g.add(body, base, door, glow, nipSup, nipRet, lid, collar);
  return g;
}

function makeFe(h = 1.32) {
  const g = new THREE.Group();
  const base = meshBox(0.48, 0.05, 0.48, mat(0x546e7a, { metalness: 0.3, roughness: 0.5 }));
  base.position.y = 0.025;
  const tankH = h - 0.12;
  const tank = meshCyl(0.2, 0.2, tankH, mat(0x80deea, { metalness: 0.15, roughness: 0.45 }));
  tank.position.y = 0.05 + tankH / 2;
  const head = meshCyl(0.16, 0.18, 0.1, mat(0x00838f, { metalness: 0.25, roughness: 0.4 }));
  head.position.y = 0.05 + tankH + 0.04;
  g.add(base, tank, head);
  return g;
}

/** Лапамойка: неглубокая чаша; кран на борту +Z (после rotY −π/2 — на восток, в комнату). */
function makeSink() {
  const g = new THREE.Group();
  const outer = mat(0xb0bec5, { roughness: 0.5, metalness: 0.15 });
  const inner = mat(0x455a64, { roughness: 0.45, metalness: 0.1 });
  const chrome = mat(0x78909c, { metalness: 0.7, roughness: 0.25 });
  const s = 0.58;
  const h = 0.28; // невысокая
  const t = 0.045;
  const bottom = 0.045;
  const open = s - t * 2;
  const depth = h - bottom; // чаша ≈ 0,23 м

  const base = meshBox(s, bottom, s, outer);
  base.position.y = bottom / 2;

  const mkWall = (ww, hh, dd, x, y, z) => {
    const m = meshBox(ww, hh, dd, outer);
    m.position.set(x, y, z);
    return m;
  };
  const wy = bottom + depth / 2;
  g.add(
    base,
    mkWall(s, depth, t, 0, wy, -s / 2 + t / 2),
    mkWall(s, depth, t, 0, wy, s / 2 - t / 2),
    mkWall(t, depth, open, -s / 2 + t / 2, wy, 0),
    mkWall(t, depth, open, s / 2 - t / 2, wy, 0)
  );

  const floor = meshBox(open - 0.01, 0.015, open - 0.01, inner);
  floor.position.y = bottom + 0.008;
  const well = meshCyl(0.035, 0.035, 0.025, mat(0x1a1a1a, { roughness: 0.85 }), 20);
  well.position.y = bottom + 0.018;
  const grate = meshCyl(0.042, 0.042, 0.008, chrome, 20);
  grate.position.y = bottom + 0.03;
  const bar1 = meshBox(0.06, 0.005, 0.009, chrome);
  bar1.position.y = bottom + 0.035;
  const bar2 = meshBox(0.009, 0.005, 0.06, chrome);
  bar2.position.y = bottom + 0.035;

  // кран на южном борту (противоположная сторона)
  const faucet = meshCyl(0.012, 0.012, 0.1, chrome, 10);
  faucet.position.set(0, h - 0.01, open / 2 - 0.02);
  const spout = meshCyl(0.01, 0.01, 0.1, chrome, 8);
  spout.rotation.x = -Math.PI / 2; // излив в чашу (на север)
  spout.position.set(0, h + 0.03, open / 2 - 0.07);

  const water = meshBox(open * 0.85, 0.01, open * 0.85, mat(0x4fc3f7, {
    roughness: 0.1, metalness: 0.05, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
  }));
  water.position.y = bottom + 0.04;
  water.castShadow = false;

  g.add(floor, well, grate, bar1, bar2, faucet, spout, water);
  return g;
}

/** Открытый деревянный ящик с углём (без крышки). */
function makeCrate() {
  const g = new THREE.Group();
  const wood = mat(0x6d4c41, { roughness: 0.88, metalness: 0.04 });
  const plank = mat(0x8d6e63, { roughness: 0.82, metalness: 0.05 });
  const coal = mat(0x1a1a1a, { roughness: 0.95, metalness: 0.06 });
  const coalHi = mat(0x2c2c2c, { roughness: 0.9, metalness: 0.1 });
  const w = 0.55;
  const d = 0.5;
  const h = 0.55;
  const t = 0.035;
  const innerW = w - t * 2;
  const innerD = d - t * 2;

  const bottom = meshBox(w, 0.05, d, wood);
  bottom.position.y = 0.025;
  g.add(bottom);

  const sideH = h - 0.05;
  const sy = 0.05 + sideH / 2;
  g.add(
    (() => { const m = meshBox(w, sideH, t, wood); m.position.set(0, sy, -d / 2 + t / 2); return m; })(),
    (() => { const m = meshBox(w, sideH, t, wood); m.position.set(0, sy, d / 2 - t / 2); return m; })(),
    (() => { const m = meshBox(t, sideH, innerD, wood); m.position.set(-w / 2 + t / 2, sy, 0); return m; })(),
    (() => { const m = meshBox(t, sideH, innerD, wood); m.position.set(w / 2 - t / 2, sy, 0); return m; })()
  );
  // только кромка борта — верх открыт
  const rimY = h - 0.015;
  g.add(
    (() => { const m = meshBox(w, 0.03, 0.03, plank); m.position.set(0, rimY, -d / 2 + 0.015); return m; })(),
    (() => { const m = meshBox(w, 0.03, 0.03, plank); m.position.set(0, rimY, d / 2 - 0.015); return m; })(),
    (() => { const m = meshBox(0.03, 0.03, innerD, plank); m.position.set(-w / 2 + 0.015, rimY, 0); return m; })(),
    (() => { const m = meshBox(0.03, 0.03, innerD, plank); m.position.set(w / 2 - 0.015, rimY, 0); return m; })()
  );

  // насыпь угля внутри (видна сверху)
  const heapH = 0.28;
  const heap = meshBox(innerW - 0.02, heapH, innerD - 0.02, coal);
  heap.position.y = 0.05 + heapH / 2;
  g.add(heap);
  // бугор по центру
  const mound = meshCyl(0.14, 0.2, 0.12, coalHi, 10);
  mound.position.y = 0.05 + heapH + 0.02;
  g.add(mound);
  for (let i = 0; i < 12; i++) {
    const r = 0.025 + (i % 4) * 0.01;
    const lump = meshCyl(r, r * 0.75, r * 1.1, i % 2 ? coal : coalHi, 6);
    lump.rotation.set(i * 0.6, i * 0.8, i * 0.3);
    const ang = (i / 12) * Math.PI * 2;
    lump.position.set(
      Math.cos(ang) * 0.12,
      0.05 + heapH - 0.02 + (i % 3) * 0.035,
      Math.sin(ang) * 0.1
    );
    g.add(lump);
  }
  return g;
}

function makePanel(w, h, d, _title) {
  const g = new THREE.Group();
  const body = meshBox(w, h, d, mat(0xeceff1, { roughness: 0.5, metalness: 0.15 }));
  body.position.y = h / 2;
  const door = meshBox(w * 0.9, h * 0.85, 0.02, mat(0xcfd8dc, { roughness: 0.45 }));
  door.position.set(0, h / 2, d / 2 + 0.01);
  g.add(body, door);
  return g;
}

/** Группа безопасности у котла (не РБ) — компактный блок на корпусе. */
function makeSafetyGroup() {
  const g = new THREE.Group();
  const base = meshBox(0.06, 0.08, 0.045, mat(0xef6c00, { metalness: 0.35, roughness: 0.4 }));
  base.position.y = 0.04;
  const gauge = meshCyl(0.014, 0.014, 0.02, mat(0xfafafa, { metalness: 0.25, roughness: 0.35 }), 10);
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(0, 0.05, 0.028);
  const valve = meshCyl(0.011, 0.011, 0.04, mat(0xb71c1c, { metalness: 0.45, roughness: 0.35 }), 8);
  valve.position.set(0.016, 0.095, 0);
  g.add(base, gauge, valve);
  return g;
}

/**
 * ГБ на номинальном корпусе (w×h×d), не по bbox GLB.
 * Локально: низ по центру; фронт = +Z; подача слева = −X; блок на переднем углу.
 */
function mountSafetyOnBoiler(asm, w, h, d) {
  const x = -w / 2 + 0.03;
  const y = h * 0.58;
  const z = d / 2 + 0.005; // чуть выступая с фронта, но на корпусе
  const plate = meshBox(0.05, 0.11, 0.03, mat(0x546e7a, { metalness: 0.5, roughness: 0.4 }));
  plate.position.set(x, y, z - 0.02);
  asm.add(plate);
  const gb = makeSafetyGroup();
  gb.position.set(x, y - 0.04, z);
  asm.add(gb);
  return gb;
}

/** Сборка настенного котла: GLB (экран/панель), ГБ на номинальном габарите; коробка — только fallback. */
async function makeWallBoilerAsm(w, h, d, color) {
  const asm = new THREE.Group();
  try {
    asm.add(fitGlb(await loadGltf("./topochnaya/models/boiler-combi.glb"), w, h, d));
  } catch {
    const casing = meshBox(w, h, d, mat(color, { roughness: 0.42 }));
    casing.position.y = h / 2;
    asm.add(casing);
  }
  mountSafetyOnBoiler(asm, w, h, d);
  return asm;
}

function buildFronts(group) {
  const m = mat(0xffe566, {
    opacity: 0.42,
    roughness: 1,
    metalness: 0,
    emissive: 0xffc107,
    emissiveIntensity: 0.18,
    depthWrite: false,
  });
  const L = layoutPorts();
  // ГАЗ и ЭЛ на юге — фронт на север; ТТ — на запад
  for (const [x, z, w, d, name, face] of [
    [L.gas.x, L.gas.z - 0.65, 0.42, 1.0, "фронт газа ≥1 м", "S"],
    [L.el.x, L.el.z - 0.65, 0.4, 1.0, "фронт эл. ≥1 м", "S"],
    [L.tt.x - L.ttD / 2 - 0.625, L.tt.z, 1.25, 0.4, "фронт ТТ ≥1,25 м", "E"],
  ]) {
    const mesh = meshBox(w, 0.015, d, m);
    mesh.position.set(x, 0.008, z);
    group.add(mesh);
    floorTag(group, name, [x, 0.02, z], face, { y: 0.35, front: 0.07 });
  }
}

function buildPipes(group) {
  const L = layoutPorts();
  const P = L.port;
  const Y = L.Y;
  const n = L.nRail;
  const w = L.wRail;
  const s = L.sRail;
  const rise = L.xRise;
  const hvs = mat(0x0277bd, { metalness: 0.55, roughness: 0.32 });
  const gvs = mat(0xc62828, { metalness: 0.55, roughness: 0.32 });
  const so = mat(0xd84315, { metalness: 0.5, roughness: 0.35 });
  const ufh = mat(0x00695c, { metalness: 0.45, roughness: 0.4 });
  const gasM = mat(0xf9a825, { metalness: 0.45, roughness: 0.4 });
  const drain = mat(0x78909c, { metalness: 0.4, roughness: 0.45 });
  const outSan = mat(0x6a1b9a, { metalness: 0.4, roughness: 0.4 });
  const flue = mat(0x6d4c41, { metalness: 0.35, roughness: 0.45 });

  // ГАЗ/ЭЛ: патрубки вниз с низа корпуса
  portStub(group, P.gasFeed, "y", -1, 0.01, hvs, 0.06);
  portStub(group, P.gasSo, "y", -1, 0.012, so, 0.06);
  portStub(group, P.gasFuel, "y", -1, 0.01, gasM, 0.06);
  portStub(group, P.elFeed, "y", -1, 0.01, hvs, 0.06);
  portStub(group, P.elSo, "y", -1, 0.012, so, 0.06);
  portStub(group, P.elGvs, "y", -1, 0.012, gvs, 0.06);
  portStub(group, P.bknCold, "x", -1, 0.014, hvs, 0.08);
  portStub(group, P.bknHot, "x", -1, 0.014, gvs, 0.08);
  portStub(group, P.bknHeat, "x", -1, 0.014, so, 0.1);
  portStub(group, P.bknRet, "x", -1, 0.012, so, 0.1);
  // ТТ: обратка на северном боку (−Z), подача на тыле (+X)
  portStub(group, P.ttFeed, "z", -1, 0.012, hvs, 0.06);
  portStub(group, P.ttSo, "x", 1, 0.014, so, 0.06);
  portStub(group, P.ttFlue, "y", 1, 0.057, flue, 0.06);
  portStub(group, P.feIn, "x", 1, 0.012, hvs);
  portStub(group, P.feOut, "x", 1, 0.012, hvs);
  portStub(group, P.feDrain, "y", 1, 0.018, drain, 0.05);
  portStub(group, P.mixDrain, "y", -1, 0.016, drain, 0.04);
  portStub(group, P.f1In, "x", 1, 0.012, hvs, 0.05);
  portStub(group, P.f1Out, "z", 1, 0.011, hvs, 0.05);
  portStub(group, P.f2In, "z", -1, 0.011, hvs, 0.05);
  portStub(group, P.f2Out, "x", 1, 0.012, hvs, 0.05);
  portStub(group, P.grebHvs, "z", -1, 0.012, hvs);
  portStub(group, P.grebGvs, "z", -1, 0.012, gvs);
  portStub(group, P.mixSoIn, "z", -1, 0.011, so);
  for (const rb of [P.rbSo, P.rbKotly]) portStub(group, rb, "y", 1, 0.01, so, 0.05);

  /** Котёл → вверх/вниз до yRail → к zRail → к xRail. Без лишних колен. */
  const boilerToRail = (port, yRail, zRail, xRail, r, matl) => {
    pipeRun(group, [
      port,
      pt(port[0], yRail, port[2]),
      pt(port[0], yRail, zRail),
      pt(xRail, yRail, zRail),
    ], r, matl);
  };

  // 1. ХВС восток: прямой ввод (+10 см за стену) → Ф1 → Fe → Ф2
  const yF = Y.low;
  const e = L.eRail;
  pipeRun(group, [
    P.hvsInWall,
    pt(e, P.hvsInWall[1], P.hvsInWall[2]),
    P.f1In,
  ], 0.015, hvs);
  nodeTag(group, "ввод ХВС", e, 0.35, P.f1In[2], "E", { y: 0.42, front: 0.07 });
  pipeRun(group, [P.f1Out, pt(e, yF, P.feIn[2]), P.feIn], 0.014, hvs);
  pipeRun(group, [
    P.feOut,
    pt(e, yF, P.feOut[2]),
    pt(e, yF, P.f2In[2]),
    P.f2In,
  ], 0.014, hvs);

  // 2. ХВС по полу своей полосой (x = rise − 0,06), дренаж — соседней; без наложения
  const bknWest = P.bknCold[0];
  const fl = Y.flHvs;
  const xHvs = rise - 0.06;
  pipeRun(group, [
    P.f2Out,
    pt(e, fl, P.f2Out[2]),
    pt(e, fl, n),
    pt(P.grebHvs[0], fl, n),
    pt(P.grebHvs[0], Y.hvs, n),
    pt(bknWest, Y.hvs, n),
  ], 0.014, hvs);
  nodeTag(group, "колл. ХВС", L.grebPos.x, Y.hvs, n + 0.05, "N", { y: Y.hvs + 0.18, front: 0.07 });
  pipeRun(group, [pt(P.grebHvs[0], Y.hvs, n), P.grebHvs], 0.013, hvs);
  // подпитка термоаккумулятора
  pipeRun(group, [
    pt(bknWest, Y.hvs, n),
    pt(bknWest, P.bknCold[1], n),
    P.bknCold,
  ], 0.014, hvs);

  // 3. Подпитка: стояк от коллектора ХВС у гребёнки (без оторванного штуцера в СЗ углу)
  const xMake = P.grebHvs[0];
  pipeRun(group, [
    pt(xMake, Y.hvs, n),
    pt(xMake, Y.feed, n),
    pt(P.ttFeed[0], Y.feed, n),
  ], 0.011, hvs);
  nodeTag(group, "подпитка", L.grebPos.x, Y.feed, n + 0.05, "N", { y: Y.feed + 0.16, front: 0.07 });
  // ГАЗ и ЭЛ на юге: ХВС своей полосой (xWest.hvs / zNorth.feed / zSouth.hvs)
  const xH = L.xWest.hvs;
  const xG = L.xWest.gvs;
  const xSo = L.xWest.so;
  const xSoOut = L.xWest.soOut;
  const zNf = L.zNorth.feed;
  const zNg = L.zNorth.gvs;
  const zNs = L.zNorth.so;
  const zSh = L.zSouth.hvs;
  const zSg = L.zSouth.gvs;
  const zSs = L.zSouth.so;
  // feed: север → запад над дверью → юг; к котлам — подъём у котла и на рельс
  pipeRun(group, [pt(xMake, Y.feed, n), pt(xMake, Y.feed, zNf)], 0.01, hvs);
  northRunX(group, xMake, xH, Y.feed, zNf, 0.01, hvs, L, L.avtTop + 0.08);
  westRunZ(group, xH, Y.feed, zNf, zSh, 0.01, hvs, L, L.yDoorHvs, L.zPadHvs);
  // южная полоса feed + опуск у каждого котла (без дублей рельса)
  pipeRun(group, [pt(xH, Y.feed, zSh), pt(P.elFeed[0], Y.feed, zSh)], 0.01, hvs);
  for (const p of [P.gasFeed, P.elFeed]) {
    pipeRun(group, [p, pt(p[0], Y.feed, p[2]), pt(p[0], Y.feed, zSh)], 0.01, hvs);
  }
  // обратка ТТ: с шины feed вниз к патрубку
  pipeRun(group, [
    pt(P.ttFeed[0], Y.feed, n),
    pt(P.ttFeed[0], P.ttFeed[1], n),
    P.ttFeed,
  ], 0.011, hvs);

  // 4. ГВС: ТА и ЭЛ → гребёнка
  pipeRun(group, [
    P.bknHot,
    pt(P.bknHot[0], P.bknHot[1], n),
    pt(P.bknHot[0], Y.gvs, n),
    pt(P.grebGvs[0], Y.gvs, n),
    P.grebGvs,
  ], 0.014, gvs);
  // ГВС ЭЛ: вся магистраль высоко (над дверью и щитом), один опуск у гребёнки — без петель
  const yGvsRun = Math.max(L.yDoorGvs, L.avtTop + 0.18);
  boilerToRail(P.elGvs, yGvsRun, zSg, xG, 0.012, gvs);
  westRunZ(group, xG, yGvsRun, zSg, zNg, 0.012, gvs, L, yGvsRun, L.zPadGvs);
  northRunX(group, xG, P.grebGvs[0], yGvsRun, zNg, 0.012, gvs, L, yGvsRun);
  pipeRun(group, [
    pt(P.grebGvs[0], yGvsRun, zNg),
    pt(P.grebGvs[0], Y.gvs, zNg),
    pt(P.grebGvs[0], Y.gvs, n),
    P.grebGvs,
  ], 0.012, gvs);
  nodeTag(group, "ГВС", P.grebGvs[0], Y.gvs, n + 0.05, "N", { y: Y.gvs + 0.22, front: 0.1, scale: 0.32 });
  pipeRun(group, [P.grebGvs, P.grebOutGvs], 0.013, gvs);
  pipeRun(group, [P.grebHvs, P.grebOutHvs], 0.012, hvs);
  floorWallExitN(group, P.grebOutGvs, L.wallOutN, Y.flOut, 0.013, outSan);
  floorWallExitN(group, P.grebOutHvs, L.wallOutN, Y.flOut, 0.012, hvs);
  nodeTag(group, "→санузлы", P.grebGvs[0], Y.gvs, P.grebGvs[2], "N", {
    y: Y.gvs + 0.38, front: 0.14, scale: 0.3,
  });

  // 5. СО: ГАЗ/ЭЛ → южная полоса → запад → север; ТТ сквозь Н-ТТ; зарядка сквозь Н-ТА
  for (const p of [P.gasSo, P.elSo]) {
    pipeRun(group, [p, pt(p[0], Y.so, p[2]), pt(p[0], Y.so, zSs)], 0.014, so);
  }
  pipeRun(group, [pt(P.elSo[0], Y.so, zSs), pt(xSo, Y.so, zSs)], 0.014, so);
  westRunZ(group, xSo, Y.so, zSs, zNs, 0.014, so, L, L.yDoorSo, L.zPadSo);
  northRunX(group, xSo, L.bkn.x, Y.so, zNs, 0.014, so, L);
  pipeRun(group, [pt(L.bkn.x, Y.so, zNs), pt(L.bkn.x, Y.so, n)], 0.014, so);
  // ТТ подача: восток → шина → сквозь Н-ТТ → коллектор
  {
    const xe = L.eRail;
    pipeRun(group, [
      P.ttSo,
      pt(xe, P.ttSo[1], P.ttSo[2]),
      pt(xe, Y.so, P.ttSo[2]),
      pt(xe, Y.so, n),
      pt(L.nTt.x, Y.so, n), // сквозь Н-ТТ
      pt(L.bkn.x, Y.so, n),
    ], 0.014, so);
  }
  // северная шина СО на nRail: от коллектора на запад к смес / врезкам (одна прямая)
  pipeRun(group, [
    pt(L.bkn.x, Y.so, n),
    pt(P.mixSoIn[0], Y.so, n),
  ], 0.014, so);
  nodeTag(group, "колл. СО", L.bkn.x, Y.so, n + 0.05, "N", { y: Y.so + 0.18, front: 0.07 });
  // зарядка ТА: с шины восток от корпуса → вниз сквозь Н-ТА → в штуцер
  const bknEast = P.bknHeat[0];
  const xTa = L.nBkn.x;
  pipeRun(group, [
    pt(bknEast, Y.so, n),
    pt(xTa, Y.so, n),
    pt(xTa, P.bknHeat[1], n), // сквозь Н-ТА
    pt(bknEast, P.bknHeat[1], n),
    P.bknHeat,
  ], 0.013, so);
  // обратка ТА → шина soMid → сквозь Н-СО → колл.СО
  pipeRun(group, [
    P.bknRet,
    pt(bknEast, P.bknRet[1], n),
    pt(bknEast, Y.soMid, n),
    pt(L.soNodes.man, Y.soMid, n),
    pt(L.soNodes.nSo, Y.soMid, n), // сквозь Н-СО
  ], 0.011, so);
  // СО→радиаторы
  pipeRun(group, [pt(xSo, Y.so, zNs), pt(xSoOut, Y.so, zNs)], 0.014, so);
  westRunZ(group, xSoOut, Y.so, zNs, P.soOut[2], 0.014, so, L, L.yDoorSoOut, L.zPadSoOut);
  pipeRun(group, [pt(xSoOut, Y.so, P.soOut[2]), P.soOut], 0.014, so);
  floorWallExit(group, P.soOut, L.wallOutW, Y.flOut, 0.014, so, xSoOut);
  nodeTag(group, "СО→радиаторы", P.soOut[0], 0.35, P.soOut[2], "W", { y: 0.5, front: 0.07 });
  for (const rb of [P.rbSo, P.rbKotly]) {
    pipeRun(group, [pt(rb[0], Y.so, n), pt(rb[0], rb[1], rb[2])], 0.009, so);
  }
  // СО→смес
  pipeRun(group, [
    pt(P.mixSoIn[0], Y.so, n),
    pt(P.mixSoIn[0], Y.soLo, n),
    P.mixSoIn,
  ], 0.012, so);
  nodeTag(group, "СО→смес", P.mixSoIn[0], Y.so, n + 0.05, "N", { y: 1.72, front: 0.07, scale: 0.3 });
  // ТП: смесь → пол → прямая сквозь Н-ТП → запад
  {
    const fl = Y.flOut;
    const zTp = P.nTpZ;
    pipeRun(group, [
      P.mixUfh,
      pt(P.mixUfh[0], fl, P.mixUfh[2]),
      pt(P.mixUfh[0], fl, zTp),
      pt(P.nTpB[0], fl, zTp), // сквозь Н-ТП (B)
      pt(P.nTpA[0], fl, zTp), // сквозь Н-ТП (A)
      pt(P.nTpA[0] - 0.15, fl, zTp),
    ], 0.012, ufh);
    floorWallExit(group, pt(P.nTpA[0] - 0.15, fl, zTp), L.wallOutW, fl, 0.012, ufh, w + 0.2);
    nodeTag(group, "→ТП", P.nTpA[0], 0.25, zTp, "N", { y: 0.42, front: 0.1, scale: 0.28 });
  }

  // 5b. Врезки с магистрали СО: один опуск на узел (без узлов из колен)
  portStub(group, P.manIn, "z", -1, 0.012, so);
  portStub(group, P.gsIn, "z", -1, 0.012, so);
  portStub(group, P.svshIn, "z", -1, 0.011, so);
  // колл.СО / ГС / СВШ: с шины вниз к устройству
  for (const port of [P.manIn, P.gsIn, P.svshIn]) {
    pipeRun(group, [
      pt(port[0], Y.so, n),
      pt(port[0], port[1], n),
      port,
    ], 0.011, so);
  }
  // Н-СО уже на soMid-нитке (обратка ТА); связь с верхней шиной — один стояк
  pipeRun(group, [
    pt(L.soNodes.nSo, Y.so, n),
    pt(L.soNodes.nSo, Y.soMid, n),
  ], 0.011, so);

  // 6. Газопровод: ввод (+10 см) → вдоль запада/юга → низ ГАЗ
  pipeRun(group, [
    P.gasMain,
    pt(L.wallFaceW, Y.gas, P.gasFuel[2]),
    pt(P.gasFuel[0], Y.gas, P.gasFuel[2]),
    pt(P.gasFuel[0], P.gasFuel[1] - 0.08, P.gasFuel[2]),
    P.gasFuel,
  ], 0.016, gasM);
  nodeTag(group, "газопровод", L.xW + 0.15, Y.gas, L.gas.z, "W", { y: Y.gas + 0.16, front: 0.07, scale: 0.32 });
  nodeTag(group, "газ→котёл", L.gas.x, P.gasFuel[1] - 0.15, L.gasBoilerZ - 0.12, "S", {
    y: P.gasFuel[1] - 0.05, front: 0.12, scale: 0.28,
  });

  // 6b. Коаксиал ГАЗ: с крышки корпуса → к южной грани → через стену (+10 см)
  {
    const coaxOut = mat(0x78909c, { metalness: 0.55, roughness: 0.35 });
    const coaxIn = mat(0x455a64, { metalness: 0.6, roughness: 0.3 });
    const cx = P.gasCoax[0];
    const cy = P.gasCoax[1];
    const cz = P.gasCoax[2];
    const zRear = L.gasBoilerZ + L.boilerD / 2;
    // воротник на крышке
    const collar = meshCyl(0.05, 0.05, 0.04, coaxOut, 12);
    collar.position.set(cx, cy + 0.02, cz);
    group.add(collar);
    pipeRun(group, [
      P.gasCoax,
      pt(cx, cy, zRear),
      pt(cx, cy, L.wallOutS),
    ], 0.042, coaxOut);
    pipeRun(group, [
      pt(cx, cy, cz + 0.02),
      pt(cx, cy, L.wallOutS),
    ], 0.024, coaxIn);
    const tip = meshCyl(0.048, 0.048, 0.05, coaxOut, 12);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(cx, cy, L.wallOutS);
    group.add(tip);
    nodeTag(group, "коаксиал ГК", cx, cy + 0.12, L.gasBoilerZ, "S", {
      y: cy + 0.22, front: 0.12, scale: 0.28,
    });
  }

  // 7. Дренаж → К1 кратчайшим ортогональным путём (опуск → X → Z), без полосы xDrain
  const rDr = 0.022;
  const flD = Y.flDrain;
  const drainToK1 = (from) => {
    const pts = [from];
    if (Math.abs(from[1] - flD) > EPS) pts.push(pt(from[0], flD, from[2]));
    if (Math.abs(from[0] - P.k1[0]) > EPS) pts.push(pt(P.k1[0], flD, from[2]));
    if (Math.abs(from[2] - P.k1[2]) > EPS) pts.push(pt(P.k1[0], flD, P.k1[2]));
    pts.push(P.k1);
    pipeRun(group, pts, rDr, drain);
  };
  drainToK1(P.feDrain);
  drainToK1(P.mixDrain);
  drainToK1(P.lapDrain);
  nodeTag(group, "дренаж→К1", P.k1[0], 0.05, P.k1[2], "N", { y: 0.42, front: 0.07, scale: 0.3 });

  // 8. Дымоход ТТ mini-11: с крышки котла вертикально вверх и через кровлю (Ø115)
  {
    const fx = P.ttFlue[0];
    const fy = P.ttFlue[1];
    const fz = P.ttFlue[2];
    pipeRun(group, [
      P.ttFlue,
      pt(fx, ROOM.h - 0.02, fz),
    ], 0.057, flue);
    const above = meshCyl(0.057, 0.057, 0.55, flue, 10);
    above.position.set(fx, ROOM.h + 0.25, fz);
    above.userData.roof = true;
    group.add(above);
    const cap = meshCyl(0.07, 0.05, 0.08, flue, 10);
    cap.position.set(fx, ROOM.h + 0.55, fz);
    cap.userData.roof = true;
    group.add(cap);
    nodeTag(group, "дымоход ТТ", fx, fy + 0.55, fz, "W", { y: fy + 0.62, front: 0.08 });
  }
}

async function buildEquipment(group, shell) {
  const L = layoutPorts();
  const {
    zN, zS, xW, gas, el, bkn, tt, fe, f1, f2, lap, fuel, boilerD, boilerW,
    gasBoilerZ, elBoilerZ, bknZ, ttZ, grebZ, mixZ, ttW, ttD, ttH, ttRotY, ttFrontX, ttRearX,
  } = L;

  // ГАЗ на южной стене (фронт на север); ГБ на корпусе сборки
  {
    const gasH = 0.68;
    const asm = await makeWallBoilerAsm(boilerW, gasH, boilerD, 0xffffff);
    add(group, asm, gas.x, 1.15, gasBoilerZ, Math.PI);
    wallTag(group, "ГАЗ H700", [gas.x, 1.7, gasBoilerZ], "S", { y: 1.95, front: boilerD / 2 + 0.07, scale: 0.34 });
    // подпись у левого верхнего угла корпуса (после π: локальный −X → мир +X)
    wallTag(group, "ГБ", [gas.x + boilerW / 2 - 0.02, 1.15 + gasH * 0.6, gasBoilerZ - boilerD / 2 + 0.02], "S", {
      y: 1.15 + gasH * 0.6 + 0.14, front: 0.08, scale: 0.22,
    });
  }

  // ЭЛ на южной стене (фронт на север); ГБ на корпусе сборки
  {
    const elW = 0.38;
    const elH = 0.72;
    const asm = await makeWallBoilerAsm(elW, elH, boilerD, 0xf5f5f5);
    add(group, asm, el.x, 1.12, elBoilerZ, Math.PI);
    wallTag(group, "ЭЛ H740", [el.x, 1.7, elBoilerZ], "S", { y: 1.95, front: boilerD / 2 + 0.07 });
    wallTag(group, "ГБ", [el.x + elW / 2 - 0.02, 1.12 + elH * 0.55, elBoilerZ - boilerD / 2 + 0.02], "S", {
      y: 1.12 + elH * 0.55 + 0.14, front: 0.08, scale: 0.22,
    });
  }

  const N = L.soNodes;
  const railZ = L.nRail;
  // Н-СО на шине soMid (труба проходит сквозь)
  add(group, makePump(), N.nSo, L.Y.soMid - 0.08, railZ);
  wallTag(group, "Н-СО", [N.nSo, L.Y.soMid, railZ], "N", { y: L.Y.soMid + 0.22, front: 0.07 });
  add(group, meshBox(0.26, 0.14, 0.14, mat(0x90a4ae, { metalness: 0.35, roughness: 0.4 })), N.man, L.Y.soMid + 0.08, railZ + 0.08);
  wallTag(group, "колл. СО", [N.man, L.Y.soMid + 0.08, railZ + 0.08], "N", { y: L.Y.soMid + 0.26, front: 0.07 });
  add(group, meshCyl(0.08, 0.08, 0.42, mat(0xffccbc, { metalness: 0.25, roughness: 0.45 })), N.gs, L.Y.gs, railZ + 0.08);
  wallTag(group, "ГС гидрострелка", [N.gs, L.Y.gs, railZ + 0.08], "N", { y: L.Y.gs + 0.22, front: 0.07, scale: 0.28 });
  add(group, meshBox(0.14, 0.26, 0.14, mat(0xffab91, { metalness: 0.2, roughness: 0.45 })), N.svsh, L.Y.svsh + 0.02, railZ + 0.08);
  wallTag(group, "СВШ сепаратор", [N.svsh, L.Y.svsh, railZ + 0.08], "N", { y: L.Y.svsh + 0.22, front: 0.07, scale: 0.28 });

  {
    const R = L.bknR;
    const body = meshCyl(R, R, 1.25, mat(0x9fa8da, { roughness: 0.42, metalness: 0.08 }));
    add(group, body, bkn.x, 0.625, bknZ);
    try {
      const cyl = fitGlb(await loadGltf("./topochnaya/models/cylinder-bkn.glb"), R * 2 * 0.92, 1.2, R * 2 * 0.92);
      add(group, cyl, bkn.x, 0, bknZ, Math.PI);
    } catch { /* procedural */ }
    for (const [p, col] of [
      [L.port.bknCold, 0x0277bd],
      [L.port.bknHot, 0xc62828],
      [L.port.bknHeat, 0xd84315],
      [L.port.bknRet, 0xbf360c],
    ]) {
      const nip = meshCyl(0.028, 0.028, 0.08, mat(col, { metalness: 0.5, roughness: 0.35 }));
      nip.rotation.z = Math.PI / 2;
      nip.position.set((p[0] + bkn.x) / 2, p[1], p[2]);
      group.add(nip);
    }
  }
  wallTag(group, "термоаккумулятор", [bkn.x, 1.1, bknZ], "N", { y: 1.35, front: L.bknR + 0.07, scale: 0.32 });
  wallTag(group, "со змеевиком", [bkn.x, 1.1, bknZ], "N", { y: 1.12, front: L.bknR + 0.07, scale: 0.28 });

  {
    // Н-ТТ: корпус на шине СО (труба проходит сквозь)
    const yTt = L.yPump - 0.08;
    add(group, makePump(), L.nTt.x, yTt, L.nTt.z);
    wallTag(group, "Н-ТТ", [L.nTt.x, yTt, L.nTt.z], "N", { y: yTt + 0.22, front: 0.07 });
    // Н-ТА: на вертикали к змеевику (труба проходит сквозь)
    const yTa = L.yPumpTa - 0.08;
    add(group, makePump(), L.nBkn.x, yTa, L.nBkn.z);
    wallTag(group, "Н-ТА", [L.nBkn.x, yTa, L.nBkn.z], "N", { y: yTa + 0.22, front: 0.07 });
  }

  // СТЭН mini-11: у восточной стены; вода: подача сзади, обратка сбоку; дверца на запад
  {
    const ttAsm = new THREE.Group();
    ttAsm.add(makeTt(ttW, ttD, ttH));
    // ГБ на тыле у подачи: в локали makeTt до rotY −π/2 тыл = +Z? makeTt без поворота: дверца +Z.
    // После ttRotY=−π/2 дверца на −X; тыл на +X. В локали сборки до поворота крепим на −Z (станет тыл).
    // тыл = лок. −Z (подача); ttD — глубина корпуса
    const gb = makeSafetyGroup();
    gb.position.set(0.02, 0.5, -ttD / 2 + 0.02);
    const plate = meshBox(0.04, 0.08, 0.02, mat(0x546e7a, { metalness: 0.45, roughness: 0.4 }));
    plate.position.set(0.02, 0.52, -ttD / 2 + 0.01);
    ttAsm.add(plate, gb);
    add(group, ttAsm, tt.x, 0, ttZ, ttRotY);
  }
  wallTag(group, "СТЭН mini-11", [tt.x, 0.7, ttZ], "E", { y: 0.85, front: ttD / 2 + 0.07, scale: 0.32 });
  wallTag(group, "ТТ обратка", L.port.ttFeed, "N", { y: 0.28, front: 0.1, scale: 0.24 });
  wallTag(group, "ТТ подача", L.port.ttSo, "E", { y: 0.62, front: 0.1, scale: 0.24 });
  wallTag(group, "ГБ", [ttRearX - 0.02, 0.55, tt.z], "E", { y: 0.7, front: 0.08, scale: 0.22 });

  add(group, makeCrate(), fuel.x, 0, fuel.z);
  wallTag(group, "топливо (уголь)", [fuel.x, 0.45, fuel.z], "E", { y: 0.62, front: 0.275 + 0.07, scale: 0.34 });

  for (const [port, name] of [
    [L.port.rbSo, "РБ-СО"],
    [L.port.rbKotly, "РБ-котлы"],
  ]) {
    const baseY = port[1] - 0.14;
    const bracket = meshBox(0.08, 0.04, 0.12, mat(0x607d8b, { metalness: 0.4, roughness: 0.45 }));
    add(group, bracket, port[0], baseY - 0.02, zN + 0.06);
    add(group, makeExpansion(), port[0], baseY, zN + 0.12);
    wallTag(group, name, [port[0], port[1], zN + 0.12], "N", { y: port[1] + 0.18, front: 0.12 + 0.07 });
  }

  add(group, meshBox(0.12, 0.07, 0.05, mat(0xffcdd2)), L.ch4.x, 2.35, zN + 0.04);
  wallTag(group, "СН4+СО", [L.ch4.x, 2.35, zN + 0.04], "N", { y: 2.42, front: 0.07, scale: 0.28 });

  // гребёнка и смес — перед магистралями на nRail; вентили/ручки в комнату
  {
    const grebMountZ = zN + 0.28;
    const mixMountZ = zN + 0.28;
    add(group, makeGrebManifold(L.grebLen, 0.36), L.grebPos.x, L.Y.greb - 0.1, grebMountZ);
    wallTag(group, "гребёнка", [L.grebPos.x, L.Y.greb, grebMountZ], "N", {
      y: L.Y.greb + 0.22, front: 0.12, scale: 0.3,
    });

    const mixY = L.Y.soLo - 0.06;
    add(group, makeMixValveBlock(L.mixLen, 0.28), L.mixPos.x, mixY, mixMountZ);
    wallTag(group, "смес.", [L.mixPos.x, L.Y.soLo, mixMountZ], "N", {
      y: 1.05, front: 0.14, scale: 0.3,
    });
    // Н-ТП: на полу, прямая нитка сквозь оба корпуса
    const { nTpA, nTpB } = L.port;
    add(group, makePump(), nTpA[0], 0, nTpA[2]);
    add(group, makePump(), nTpB[0], 0, nTpB[2]);
    wallTag(group, "Н-ТП", [L.mixPos.x, 0.08, nTpA[2]], "N", {
      y: 0.32, front: 0.12, scale: 0.28,
    });
  }

  const door = makeDoorLeaf(shell.doorW - 0.02, shell.doorH - 0.02);
  add(group, door, xW, 0, shell.doorZ); // без поворота: петли на севере, открыта наружу
  wallTag(group, "дверь 0,70×H2100 наружу", [xW, 1.4, shell.doorZ], "W", { y: 1.65, front: 0.07 });

  add(group, makeSink(), lap.x, 0, lap.z, L.lapRotY);
  wallTag(group, "лапамойка", [lap.x, 0.28, lap.z], "W", { y: 0.4, front: 0.29 + 0.07 });

  // Fe / Ф1 / Ф2 на восточной стене (фронт в комнату)
  add(group, makeFe(1.32), fe.x, 0, fe.z, -Math.PI / 2);
  wallTag(group, "Fe H1320", [fe.x, 1.0, fe.z], "E", { y: 1.3, front: 0.2 + 0.07 });
  add(group, makeFilter(), f1.x, 0, f1.z, -Math.PI / 2);
  add(group, makeFilter(), f2.x, 0, f2.z, -Math.PI / 2);
  wallTag(group, "Ф1", [f1.x, 0.48, f1.z], "E", { y: 0.68, front: 0.1 });
  wallTag(group, "Ф2", [f2.x, 0.48, f2.z], "E", { y: 0.68, front: 0.1 });
  wallTag(group, "ХВС у Fe", [fe.x, 0.2, (f1.z + f2.z) / 2], "E", { y: 0.52, front: 0.07 });

  // северная стена: ширина вдоль X, глубина 0,12, дверца на +Z (в комнату)
  add(group, makePanel(L.avtW, L.avtH, L.avtD, "автоматика"), L.avt.x, L.avtTop - L.avtH, L.avt.z);
  wallTag(group, "автоматика", [L.avt.x, L.avtTop - L.avtH / 2, L.avt.z], "N", {
    y: L.avtTop - 0.08, front: 0.06 + 0.07,
  });
  add(group, makePanel(0.32, 0.4, 0.14, "ИБП"), L.ibp.x, 0, L.ibp.z, Math.PI);
  add(group, makePanel(0.3, 0.28, 0.14, "АКБ"), L.akb.x, 0, L.akb.z, Math.PI);
  wallTag(group, "ИБП", [L.ibp.x, 0.3, L.ibp.z], "S", { y: 0.52, front: 0.14 });
  wallTag(group, "АКБ", [L.akb.x, 0.25, L.akb.z], "S", { y: 0.42, front: 0.14 });

  const k1 = meshCyl(0.09, 0.09, 0.025, mat(0x78909c, { roughness: 0.75, metalness: 0.25 }));
  add(group, k1, L.port.k1[0], 0.01, L.port.k1[2]);
  wallTag(group, "К1", [L.port.k1[0], 0.02, L.port.k1[2]], "N", { y: 0.28, front: 0.07, scale: 0.28 });

  const win = makeWindowInWall(shell.winW, shell.winH, WALL * 0.95);
  add(group, win, shell.winX, shell.winSill + shell.winH / 2, shell.zS, Math.PI);
  wallTag(group, "окно 0,80×0,80", [shell.winX, shell.winSill + shell.winH / 2, zS], "S", {
    y: shell.winSill + shell.winH + 0.12, front: 0.07,
  });

  {
    const vx = L.vent.x;
    const vz = L.vent.z;
    const ventM = mat(0x4fc3f7, { roughness: 0.35, metalness: 0.15 });
    const ductM = mat(0x90caf9, { roughness: 0.45, metalness: 0.1 });
    add(group, meshBox(0.08, 1.6, 0.14, ductM), vx, 0.9, vz);
    add(group, meshBox(0.1, 0.28, 0.22, ventM), vx, L.Y.vent, vz);
    add(group, meshBox(0.18, 0.12, 0.12, ductM), vx + 0.1, L.Y.vent, vz);
    wallTag(group, "вентканал притока", [vx, L.Y.vent, vz], "E", { y: L.Y.vent + 0.22, front: 0.07 });
    wallTag(group, "приток", [vx, L.Y.vent, vz], "E", { y: L.Y.vent - 0.18, front: 0.07 });
  }
}

function addLights(group) {
  const key = new THREE.PointLight(0xfff4e5, 1.2, 9, 1.5);
  key.position.set(0.15, 2.4, 0.05);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  group.add(key);
  const fill = new THREE.PointLight(0xddeeff, 0.45, 7, 2);
  fill.position.set(-0.9, 2.1, 0.4);
  group.add(fill);
  group.add(new THREE.HemisphereLight(0xf0f4ff, 0x8d8578, 0.4));
}

export function buildTopochnayaV3() {
  resetTags();
  const group = new THREE.Group();
  group.name = "topochnaya-v3";
  const shell = buildShell(group);
  buildFronts(group);
  buildPipes(group);
  addLights(group);
  const ready = buildEquipment(group, shell);
  return {
    group,
    focus: new THREE.Vector3(0, 1.15, 0),
    room: ROOM,
    ready,
  };
}

export function topoCameraRigs(focus = new THREE.Vector3(0, 0.85, 0)) {
  const d = 3.6;
  return {
    iso: { pos: focus.clone().add(new THREE.Vector3(2.1, 3.4, 2.3)), target: focus.clone() },
    north: { pos: focus.clone().add(new THREE.Vector3(0.1, 2.4, -d)), target: focus.clone() },
    south: { pos: focus.clone().add(new THREE.Vector3(0.1, 2.4, d)), target: focus.clone() },
    west: { pos: focus.clone().add(new THREE.Vector3(-d, 2.3, 0.15)), target: focus.clone() },
    east: { pos: focus.clone().add(new THREE.Vector3(d, 2.3, 0.1)), target: focus.clone() },
    top: { pos: focus.clone().add(new THREE.Vector3(0.02, 5.0, 0.02)), target: focus.clone() },
  };
}
