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

/** Вывод за стену: вниз на пол в свою полосу (laneX), затем за пределы комнаты. */
function floorWallExit(group, fromPt, outX, floorY, r, material, laneX = null) {
  const xLane = laneX == null ? fromPt[0] : laneX;
  const drop = pt(xLane, floorY, fromPt[2]);
  const outer = pt(outX, floorY, fromPt[2]);
  pipeRun(group, [fromPt, pt(fromPt[0], floorY, fromPt[2]), drop, outer], r, material);
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

/** Общие координаты: синхрон с plan-v3.svg (правки пользователя) + СТЭН mini-11. */
function layoutPorts() {
  const zN = -ROOM.d / 2;
  const zS = ROOM.d / 2;
  const xW = -ROOM.w / 2;
  const xE = ROOM.w / 2;

  // пятна с плана (м); ТТ — mini-11 у восточной стены, фронт в комнату (на запад)
  const gas = { x: -1.259, z: -0.826 };
  const el = { x: -0.729, z: -0.832 };
  const bkn = { x: 0.614, z: -0.709 };
  const fuel = { x: 1.317, z: 0.148 };
  const fe = { x: 1.495, z: -0.708 };
  const f1 = { x: 1.667, z: -0.194 };
  const f2 = { x: 1.659, z: -0.36 };
  const lap = { x: -1.422, z: 0.674 };
  const grebPos = { x: -1.672, z: -0.724 };
  const mixPos = { x: -1.677, z: -0.667 };

  const grebLen = 0.26;
  const mixLen = 0.26;
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
  const soNodes = {
    nSo: snap(-0.083),
    man: snap(0.21),
    gs: snap(0.497),
    svsh: snap(0.726),
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
  const frontZGas = snap(gasBoilerZ + boilerD / 2 - 0.04);
  const frontZEl = snap(elBoilerZ + boilerD / 2 - 0.04);
  const rbZ = snap(zN + 0.12);
  const rbY = Y.rb + 0.14;
  // ТТ: фронт на запад (−X), тыл к восточной стене
  const ttFrontX = snap(tt.x - ttD / 2);
  const ttRearX = snap(tt.x + ttD / 2);

  return {
    zN, zS, xW, xE, gas, el, bkn, tt, fe, f1, f2, lap, fuel,
    boilerD, boilerW, boilerZ: gasBoilerZ, gasBoilerZ, elBoilerZ,
    bknZ, bknR, ttZ, ttW, ttD, ttH, ttRotY, ttFrontX, ttRearX,
    grebZ, mixZ, grebLen, mixLen, grebPos, mixPos,
    nRail, wRail, sRail, eRail, xRise,
    wallOutW, wallOutS, wallOutN, wallOutE, soNodes,
    nZ: nRail, wX: wRail,
    avt: { x: -1.409, z: 0.914 },
    ibp: { x: -0.932, z: 0.901 },
    akb: { x: -0.62, z: 0.898 },
    vent: { x: 1.681, z: 0.009 },
    nTt: { x: 0.969, z: -0.896 },
    nBkn: { x: 1.14, z: -0.887 },
    ch4: { x: -0.378, z: -0.95 },
    port: {
      // ГАЗ/ЭЛ: все гидравлика снизу корпуса (типовой настенный)
      // спереди: слева подача СО, справа обратка
      gasSo: pt(gas.x - 0.1, gasY0 - 0.02, gasBoilerZ),
      gasFeed: pt(gas.x + 0.1, gasY0 - 0.02, gasBoilerZ),
      gasFuel: pt(gas.x, gasY0 - 0.02, gasBoilerZ),
      elSo: pt(el.x - 0.1, elY0 - 0.02, elBoilerZ),
      elFeed: pt(el.x + 0.1, elY0 - 0.02, elBoilerZ),
      // БКН: ХВС низ, ГВС верх; змеевик сбоку
      bknCold: pt(bkn.x - bknR + 0.02, 0.35, bknZ),
      bknHot: pt(bkn.x - bknR + 0.02, 1.15, bknZ),
      bknHeat: pt(bkn.x + bknR - 0.02, 0.78, bknZ),
      bknRet: pt(bkn.x + bknR - 0.02, 0.45, bknZ),
      // ТТ СТЭН mini-11: подача сзади сверху; обратка сбоку (север) низко; дымоход сверху
      ttSo: pt(ttRearX, 0.5, tt.z),
      ttFeed: pt(tt.x + ttD / 2 - 0.055, 0.113, tt.z - ttW / 2),
      ttFlue: pt(tt.x + 0.04, 0.04 + ttH * 0.88 + 0.12, tt.z),
      grebHvs: pt(wRail + 0.05, Y.hvs, grebZ - grebLen * 0.28),
      grebGvs: pt(wRail + 0.05, Y.gvs, grebZ + grebLen * 0.28),
      grebOutGvs: pt(wRail, Y.gvs, grebZ + grebLen * 0.38),
      grebOutHvs: pt(wRail, Y.hvs, grebZ - grebLen * 0.38),
      mixSoIn: pt(wRail + 0.05, Y.soLo + 0.06, mixZ - mixLen * 0.2),
      mixUfh: pt(wRail, Y.soLo + 0.06, mixZ + mixLen * 0.35),
      mixDrain: pt(wRail + 0.08, Y.drain, mixZ),
      gasMain: pt(wallOutW, Y.gas, gas.z),
      ventOut: pt(wallOutE, Y.vent, 0.1),
      // коаксиал ГАЗ: с верхней крышки котла
      gasCoax: pt(gas.x, gasY0 + 0.7, gasBoilerZ),
      nSoIn: pt(soNodes.nSo, Y.soMid + 0.06, nRail + 0.08),
      manIn: pt(soNodes.man, Y.soMid + 0.08, nRail + 0.08),
      gsIn: pt(soNodes.gs, Y.gs, nRail + 0.08),
      svshIn: pt(soNodes.svsh, Y.svsh, nRail + 0.08),
      // два РБ
      rbSo: pt(-0.127, rbY, rbZ),
      rbKotly: pt(0.176, rbY, rbZ),
      // Fe/Ф на восточной стене, фронт на запад
      f1In: pt(eRail + 0.03, yFil, f1.z),
      f1Out: pt(eRail, yFil, f1.z - 0.04),
      feIn: pt(eRail, yFil, fe.z + 0.18),
      feOut: pt(eRail, yFil + 0.06, fe.z + 0.18),
      feDrain: pt(eRail, Y.drain, fe.z),
      f2In: pt(eRail, yFil, f2.z + 0.04),
      f2Out: pt(eRail + 0.03, yFil, f2.z),
      lapDrain: pt(lap.x, Y.drain, lap.z),
      k1: pt(-0.344, 0.02, 0.888),
      soOut: pt(wRail, Y.so, grebZ),
      gasInWall: pt(wallOutW, Y.gas, gas.z),
      // ввод ХВС: прямой штуцер через вост. стену (+10 см), без поворотов снаружи
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

  const winW = 0.4;
  const winH = 0.8;
  const winSill = 0.55; // в зоне разреза (реальная ~1,15; здесь видно в стене)
  const winX = svgXZ(700, 796).x;
  const xOuterW = -ROOM.w / 2 - WALL;
  const xOuterE = ROOM.w / 2 + WALL;
  const leftW = winX - winW / 2 - xOuterW;
  const rightW = xOuterE - (winX + winW / 2);
  if (leftW > 0.05) wallSeg(leftW, CUT, WALL, xOuterW + leftW / 2, 0, zS);
  if (rightW > 0.05) wallSeg(rightW, CUT, WALL, xOuterE - rightW / 2, 0, zS);
  // подоконник (стенка под проёмом)
  wallSeg(winW + 0.04, winSill, WALL, winX, 0, zS);
  const winTop = winSill + winH;
  if (winTop < CUT) wallSeg(winW + 0.04, CUT - winTop, WALL, winX, winTop, zS);

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
    if (winTop < ROOM.h) wallSeg(winW + 0.04, ROOM.h - winTop, WALL, winX, winTop, zS, true);
  }

  return { doorZ, doorW, doorH, winX, winW, winH, winSill, xW, zN, zS, CUT };
}

function makeDoorLeaf(w, h) {
  const g = new THREE.Group();
  const frame = mat(0x5d4037, { roughness: 0.7 });
  const leaf = mat(0xa1887f, { roughness: 0.6 });
  const jl = meshBox(0.05, h + 0.06, 0.09, frame);
  jl.position.set(-w / 2 - 0.025, h / 2, 0);
  const jr = meshBox(0.05, h + 0.06, 0.09, frame);
  jr.position.set(w / 2 + 0.025, h / 2, 0);
  const head = meshBox(w + 0.1, 0.05, 0.09, frame);
  head.position.set(0, h + 0.025, 0);
  const panel = meshBox(w, h - 0.03, 0.04, leaf);
  panel.position.set(0, h / 2 + 0.015, 0.01);
  const handle = meshBox(0.02, 0.12, 0.045, mat(0x37474f, { metalness: 0.6, roughness: 0.3 }));
  handle.position.set(w * 0.3, h * 0.48, 0.04);
  g.add(jl, jr, head, panel, handle);
  return g;
}

function makeWindowInWall(w, h, depth) {
  const g = new THREE.Group();
  // рама в цвет коробки двери
  const frame = mat(0x5d4037, { roughness: 0.7 });
  const trim = mat(0x6d4c41, { roughness: 0.65 });
  const glass = mat(0xb3e5fc, {
    roughness: 0.05,
    metalness: 0.15,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const t = 0.045;
  const d = Math.max(depth, 0.1);

  const jl = meshBox(t, h + t * 2, d, frame);
  jl.position.set(-w / 2 - t / 2, 0, 0);
  const jr = meshBox(t, h + t * 2, d, frame);
  jr.position.set(w / 2 + t / 2, 0, 0);
  const head = meshBox(w + t * 2, t, d, frame);
  head.position.set(0, h / 2 + t / 2, 0);
  const sill = meshBox(w + t * 2 + 0.04, t * 0.85, d + 0.04, trim);
  sill.position.set(0, -h / 2 - t * 0.4, 0.02);

  const innerL = meshBox(0.018, h - 0.02, d * 0.55, trim);
  innerL.position.set(-w / 2 + 0.012, 0, 0);
  const innerR = meshBox(0.018, h - 0.02, d * 0.55, trim);
  innerR.position.set(w / 2 - 0.012, 0, 0);

  const paneOut = meshBox(w - 0.02, h - 0.02, 0.008, glass);
  paneOut.position.set(0, 0, d * 0.18);
  paneOut.castShadow = false;
  const paneIn = meshBox(w - 0.02, h - 0.02, 0.008, glass);
  paneIn.position.set(0, 0, -d * 0.18);
  paneIn.castShadow = false;
  paneOut.renderOrder = 2;
  paneIn.renderOrder = 2;

  const mullV = meshBox(0.022, h - 0.04, 0.028, frame);
  const mullH = meshBox(w - 0.04, 0.022, 0.028, frame);

  const handle = meshBox(0.012, 0.07, 0.028, mat(0x37474f, { metalness: 0.65, roughness: 0.25 }));
  handle.position.set(w * 0.28, 0, d * 0.35);

  g.add(jl, jr, head, sill, innerL, innerR, paneOut, paneIn, mullV, mullH, handle);
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

function makeFilter() {
  const g = new THREE.Group();
  const jar = meshCyl(0.05, 0.05, 0.2, mat(0x00838f, { metalness: 0.2, roughness: 0.4 }));
  jar.position.y = 0.12;
  const top = meshBox(0.1, 0.04, 0.1, mat(0x455a64, { metalness: 0.4, roughness: 0.4 }));
  top.position.y = 0.24;
  g.add(jar, top);
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

/** Лапамойка: неглубокая чаша, кран на южном борту, слив по центру. */
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

/** Группа безопасности у котла (не РБ). */
function makeSafetyGroup() {
  const g = new THREE.Group();
  const base = meshBox(0.08, 0.1, 0.06, mat(0xffe0b2, { metalness: 0.25, roughness: 0.45 }));
  base.position.y = 0.05;
  const valve = meshCyl(0.015, 0.015, 0.06, mat(0xb71c1c, { metalness: 0.4, roughness: 0.4 }), 8);
  valve.position.set(0.02, 0.12, 0);
  g.add(base, valve);
  return g;
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
  // фронты газа/эл — к югу от котлов; ТТ mini-11 — к западу от корпуса (≥1,25 м)
  for (const [x, z, w, d, name, face] of [
    [L.gas.x, L.gas.z + 0.65, 0.42, 1.0, "фронт газа ≥1 м", "N"],
    [L.el.x, L.el.z + 0.65, 0.4, 1.0, "фронт эл. ≥1 м", "N"],
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
  const drain = mat(0x5d4037, { metalness: 0.35, roughness: 0.5 });
  const outSan = mat(0x6a1b9a, { metalness: 0.4, roughness: 0.4 });
  const flue = mat(0x6d4c41, { metalness: 0.35, roughness: 0.45 });

  // ГАЗ/ЭЛ: патрубки вниз с низа корпуса
  portStub(group, P.gasFeed, "y", -1, 0.01, hvs, 0.06);
  portStub(group, P.gasSo, "y", -1, 0.012, so, 0.06);
  portStub(group, P.gasFuel, "y", -1, 0.01, gasM, 0.06);
  portStub(group, P.elFeed, "y", -1, 0.01, hvs, 0.06);
  portStub(group, P.elSo, "y", -1, 0.012, so, 0.06);
  portStub(group, P.bknCold, "x", 1, 0.014, hvs, 0.1);
  portStub(group, P.bknHot, "x", 1, 0.014, gvs, 0.1);
  portStub(group, P.bknHeat, "x", -1, 0.014, so, 0.1);
  portStub(group, P.bknRet, "x", -1, 0.012, so, 0.1);
  // ТТ: обратка на северном боку (−Z), подача на тыле (+X)
  portStub(group, P.ttFeed, "z", -1, 0.012, hvs, 0.06);
  portStub(group, P.ttSo, "x", 1, 0.014, so, 0.06);
  portStub(group, P.ttFlue, "y", 1, 0.057, flue, 0.06);
  portStub(group, P.feIn, "x", 1, 0.012, hvs);
  portStub(group, P.feOut, "x", 1, 0.012, hvs);
  portStub(group, P.feDrain, "y", 1, 0.012, drain, 0.05);
  portStub(group, P.f1In, "x", 1, 0.012, hvs, 0.05);
  portStub(group, P.f1Out, "z", 1, 0.011, hvs, 0.05);
  portStub(group, P.f2In, "z", -1, 0.011, hvs, 0.05);
  portStub(group, P.f2Out, "x", 1, 0.012, hvs, 0.05);
  portStub(group, P.grebHvs, "x", -1, 0.012, hvs);
  portStub(group, P.grebGvs, "x", -1, 0.012, gvs);
  portStub(group, P.mixSoIn, "x", -1, 0.011, so);
  for (const rb of [P.rbSo, P.rbKotly]) portStub(group, rb, "y", 1, 0.01, so, 0.05);

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
  const xDrain = rise + 0.08;
  pipeRun(group, [
    P.f2Out,
    pt(e, fl, P.f2Out[2]),
    pt(e, fl, L.grebZ),
    pt(xHvs, fl, L.grebZ),
    pt(xHvs, fl, L.grebZ),
    pt(w + 0.04, fl, L.grebZ),
    pt(w + 0.04, Y.hvs, L.grebZ),
    pt(w, Y.hvs, L.grebZ),
    pt(w, Y.hvs, n),
    pt(bknWest, Y.hvs, n),
  ], 0.014, hvs);
  nodeTag(group, "колл. ХВС", L.el.x, Y.hvs, n + 0.05, "N", { y: Y.hvs + 0.18, front: 0.07 });
  pipeRun(group, [pt(w, Y.hvs, L.grebZ), P.grebHvs], 0.013, hvs);
  // подпитка БКН: спуск с магистрали у стены прямо в патрубок
  pipeRun(group, [
    pt(bknWest, Y.hvs, n),
    pt(bknWest, P.bknCold[1], n),
    P.bknCold,
  ], 0.014, hvs);

  // 3. Подпитка → низы ГАЗ/ЭЛ и боковая обратка ТТ
  pipeRun(group, [pt(w, Y.hvs, n), pt(w, Y.feed, n), pt(P.ttFeed[0], Y.feed, n)], 0.011, hvs);
  nodeTag(group, "подпитка", L.el.x, Y.feed, n + 0.05, "N", { y: Y.feed + 0.16, front: 0.07 });
  for (const port of [P.gasFeed, P.elFeed]) {
    // с магистрали вниз под котёл и в нижний патрубок
    pipeRun(group, [
      pt(port[0], Y.feed, n),
      pt(port[0], port[1] - 0.08, n),
      pt(port[0], port[1] - 0.08, port[2]),
      port,
    ], 0.01, hvs);
  }
  // обратка ТТ: опуск к низкому боковому патрубку (север), не на фронт
  {
    const xf = P.ttFeed[0];
    const yf = P.ttFeed[1];
    const zf = P.ttFeed[2];
    pipeRun(group, [
      pt(xf, Y.feed, n),
      pt(xf, yf, n),
      pt(xf, yf, zf - 0.06),
      P.ttFeed,
    ], 0.011, hvs);
  }

  // 4. ГВС из БКН → магистраль у стены → гребёнка
  pipeRun(group, [
    P.bknHot,
    pt(bknWest, P.bknHot[1], n),
    pt(bknWest, Y.gvs, n),
    pt(w, Y.gvs, n),
    pt(w, Y.gvs, L.grebZ),
    P.grebGvs,
  ], 0.014, gvs);
  nodeTag(group, "ГВС", w + 0.08, Y.gvs, L.grebZ, "W", { y: Y.gvs + 0.18, front: 0.07, scale: 0.32 });
  // выводы после гребёнки — на пол разными полосами (по X), затем за стену
  floorWallExit(group, P.grebOutGvs, L.wallOutW, Y.flOut, 0.013, outSan, w + 0.02);
  floorWallExit(group, P.grebOutHvs, L.wallOutW, Y.flOut, 0.012, hvs, w + 0.08);
  nodeTag(group, "→санузлы", P.grebOutGvs[0], 0.25, P.grebOutGvs[2], "W", { y: 0.38, front: 0.07 });

  // 5. СО коллектор: от низа ГАЗ/ЭЛ вверх к магистрали
  pipeRun(group, [
    P.gasSo,
    pt(P.gasSo[0], P.gasSo[1] - 0.08, P.gasSo[2]),
    pt(P.gasSo[0], P.gasSo[1] - 0.08, n),
    pt(P.gasSo[0], Y.so, n),
    pt(L.bkn.x, Y.so, n),
  ], 0.014, so);
  pipeRun(group, [
    P.elSo,
    pt(P.elSo[0], P.elSo[1] - 0.08, P.elSo[2]),
    pt(P.elSo[0], P.elSo[1] - 0.08, n),
    pt(P.elSo[0], Y.so, n),
  ], 0.014, so);
  // подача ТТ: вдоль восточной стены, сразу вверх (выше Fe H1320), затем на север
  {
    const ys = P.ttSo[1];
    const zs = P.ttSo[2];
    const xe = L.eRail;
    pipeRun(group, [
      P.ttSo,
      pt(xe, ys, zs),
      pt(xe, Y.so, zs), // подъём у ТТ, не сквозь Fe
      pt(xe, Y.so, n),
      pt(L.el.x, Y.so, n),
    ], 0.014, so);
  }
  nodeTag(group, "колл. СО", L.bkn.x, Y.so, n + 0.05, "N", { y: Y.so + 0.18, front: 0.07 });
  // зарядка БКН с востока + обратка — короткие опуски у стены
  const bknEast = P.bknHeat[0];
  pipeRun(group, [
    pt(bknEast, Y.so, n),
    pt(bknEast, P.bknHeat[1], n),
    P.bknHeat,
  ], 0.013, so);
  pipeRun(group, [
    P.bknRet,
    pt(bknEast, P.bknRet[1], n),
    pt(bknEast, Y.soMid, n),
    pt(L.soNodes.man, Y.soMid, n),
  ], 0.011, so);
  pipeRun(group, [pt(L.el.x, Y.so, n), pt(w, Y.so, n), pt(w, Y.so, P.soOut[2]), P.soOut], 0.014, so);
  floorWallExit(group, P.soOut, L.wallOutW, Y.flOut, 0.014, so, w + 0.14);
  nodeTag(group, "СО→радиаторы", P.soOut[0], 0.35, P.soOut[2], "W", { y: 0.5, front: 0.07 });
  // РБ на стене: короткий подъём с магистрали СО (только два бака)
  for (const rb of [P.rbSo, P.rbKotly]) {
    pipeRun(group, [pt(rb[0], Y.so, n), pt(rb[0], rb[1], rb[2])], 0.009, so);
  }
  // СО→смес: по стене наверху, опуск только у смесителя (не через фронт ЭЛ низом)
  pipeRun(group, [
    pt(w, Y.so, n),
    pt(w, Y.so, L.mixZ),
    pt(w, Y.soLo, L.mixZ),
    P.mixSoIn,
  ], 0.012, so);
  // подпись высоко на западной стене — отдельно от «смес.+Н-ТП»
  nodeTag(group, "СО→смес", w + 0.08, Y.so, L.mixZ, "W", { y: 1.72, front: 0.07, scale: 0.3 });
  floorWallExit(group, P.mixUfh, L.wallOutW, Y.flOut, 0.012, ufh, w + 0.2);
  nodeTag(group, "→ТП", P.mixUfh[0], 0.2, P.mixUfh[2], "W", { y: 0.32, front: 0.07 });

  // 5b. Врезки колл.СО / Н-СО / ГС / СВШ с магистрали СО (подписи — в equipment)
  portStub(group, P.nSoIn, "z", -1, 0.011, so);
  portStub(group, P.manIn, "z", -1, 0.012, so);
  portStub(group, P.gsIn, "z", -1, 0.012, so);
  portStub(group, P.svshIn, "z", -1, 0.011, so);
  for (const port of [P.nSoIn, P.manIn, P.gsIn, P.svshIn]) {
    pipeRun(group, [
      pt(port[0], Y.so, n),
      pt(port[0], port[1], n),
      port,
    ], 0.011, so);
  }

  // 6. Газопровод: ввод (+10 см) → к низу ГАЗ
  pipeRun(group, [
    P.gasMain,
    pt(L.wallFaceW, Y.gas, P.gasFuel[2]),
    pt(P.gasFuel[0], Y.gas, P.gasFuel[2]),
    pt(P.gasFuel[0], P.gasFuel[1] - 0.08, P.gasFuel[2]),
    P.gasFuel,
  ], 0.016, gasM);
  nodeTag(group, "газопровод", L.xW + 0.15, Y.gas, L.gas.z, "W", { y: Y.gas + 0.16, front: 0.07, scale: 0.32 });
  nodeTag(group, "газ→котёл", L.gas.x, P.gasFuel[1] - 0.15, L.gasBoilerZ + 0.12, "N", {
    y: P.gasFuel[1] - 0.05, front: 0.12, scale: 0.28,
  });

  // 6b. Коаксиал ГАЗ Ø60/100: с верхней крышки → потолок → южная стена (+10 см)
  {
    const coaxOut = mat(0x78909c, { metalness: 0.55, roughness: 0.35 });
    const coaxIn = mat(0x455a64, { metalness: 0.6, roughness: 0.3 });
    const cx = P.gasCoax[0];
    const cy = P.gasCoax[1];
    const cz = P.gasCoax[2];
    const yCeil = snap(ROOM.h - 0.18);
    pipeRun(group, [
      P.gasCoax,
      pt(cx, yCeil, cz),
      pt(cx, yCeil, L.wallOutS),
    ], 0.042, coaxOut);
    pipeRun(group, [
      pt(cx, cy + 0.03, cz),
      pt(cx, yCeil, cz),
      pt(cx, yCeil, L.wallOutS),
    ], 0.024, coaxIn);
    const tip = meshCyl(0.048, 0.048, 0.05, coaxOut, 12);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(cx, yCeil, L.wallOutS);
    group.add(tip);
    nodeTag(group, "коаксиал (верх ГК)", cx, cy + 0.15, cz, "N", { y: cy + 0.28, front: 0.12, scale: 0.28 });
    nodeTag(group, "коаксиал→юг", cx, yCeil, L.zS - 0.25, "S", {
      y: yCeil + 0.12, front: 0.07, scale: 0.3,
    });
  }

  // 7. Дренаж — полоса xDrain; Fe на востоке → к К1 на юге
  pipeRun(group, [
    P.feDrain,
    pt(P.feDrain[0], Y.flDrain, P.feDrain[2]),
    pt(xDrain, Y.flDrain, P.feDrain[2]),
    pt(xDrain, Y.flDrain, P.k1[2]),
    pt(P.k1[0], Y.flDrain, P.k1[2]),
    P.k1,
  ], 0.014, drain);
  pipeRun(group, [
    P.mixDrain,
    pt(P.mixDrain[0], Y.flDrain, P.mixDrain[2]),
    pt(xDrain, Y.flDrain, P.mixDrain[2]),
    pt(xDrain, Y.flDrain, P.k1[2]),
    pt(P.k1[0], Y.flDrain, P.k1[2]),
    P.k1,
  ], 0.012, drain);
  pipeRun(group, [
    P.lapDrain,
    pt(P.lapDrain[0], Y.flDrain, P.lapDrain[2]),
    pt(xDrain, Y.flDrain, P.lapDrain[2]),
    pt(xDrain, Y.flDrain, P.k1[2]),
    pt(P.k1[0], Y.flDrain, P.k1[2]),
    P.k1,
  ], 0.012, drain);
  nodeTag(group, "дренаж→К1", P.k1[0], 0.05, P.k1[2], "S", { y: 0.42, front: 0.07, scale: 0.3 });

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
    zN, zS, xW, gas, el, bkn, tt, fe, f1, f2, lap, fuel, boilerD,
    gasBoilerZ, elBoilerZ, bknZ, ttZ, grebZ, mixZ, ttW, ttD, ttH, ttRotY, ttFrontX, ttRearX,
  } = L;

  // --- северная стена: настенные котлы ---
  try {
    const g1 = fitGlb(await loadGltf("./topochnaya/models/boiler-combi.glb"), 0.4, 0.68, boilerD);
    add(group, g1, gas.x, 1.15, gasBoilerZ, 0);
  } catch {
    add(group, meshBox(0.4, 0.68, boilerD, mat(0xffffff, { roughness: 0.4 })), gas.x, 1.15 + 0.34, gasBoilerZ);
  }
  wallTag(group, "ГАЗ H700", [gas.x, 1.7, gasBoilerZ], "N", { y: 1.95, front: boilerD / 2 + 0.07, scale: 0.34 });
  add(group, makeSafetyGroup(), gas.x + 0.18, 1.55, gasBoilerZ + boilerD / 2 + 0.04);
  wallTag(group, "ГБ", [gas.x + 0.18, 1.7, gasBoilerZ + boilerD / 2], "N", { y: 1.78, front: 0.12, scale: 0.22 });

  try {
    const g2 = fitGlb(await loadGltf("./topochnaya/models/boiler-combi.glb"), 0.38, 0.72, boilerD);
    add(group, g2, el.x, 1.12, elBoilerZ, 0);
  } catch {
    add(group, meshBox(0.38, 0.72, boilerD, mat(0xf5f5f5, { roughness: 0.4 })), el.x, 1.12 + 0.36, elBoilerZ);
  }
  wallTag(group, "ЭЛ H740", [el.x, 1.7, elBoilerZ], "N", { y: 1.95, front: boilerD / 2 + 0.07 });
  add(group, makeSafetyGroup(), el.x + 0.16, 1.55, elBoilerZ + boilerD / 2 + 0.04);
  wallTag(group, "ГБ", [el.x + 0.16, 1.7, elBoilerZ + boilerD / 2], "N", { y: 1.78, front: 0.12, scale: 0.22 });

  const N = L.soNodes;
  const railZ = zN + 0.14;
  add(group, meshBox(0.22, 0.05, 0.14, mat(0x607d8b, { metalness: 0.35, roughness: 0.4 })), N.nSo, L.Y.soMid, railZ);
  add(group, makePump(), N.nSo, L.Y.soMid + 0.02, railZ + 0.06);
  wallTag(group, "Н-СО", [N.nSo, L.Y.soMid, railZ], "N", { y: L.Y.soMid + 0.22, front: 0.07 });
  add(group, meshBox(0.26, 0.14, 0.14, mat(0x90a4ae, { metalness: 0.35, roughness: 0.4 })), N.man, L.Y.soMid + 0.08, railZ + 0.04);
  wallTag(group, "колл. СО", [N.man, L.Y.soMid + 0.08, railZ], "N", { y: L.Y.soMid + 0.26, front: 0.07 });
  add(group, meshCyl(0.08, 0.08, 0.42, mat(0xffccbc, { metalness: 0.25, roughness: 0.45 })), N.gs, L.Y.gs, railZ + 0.02);
  wallTag(group, "ГС", [N.gs, L.Y.gs, railZ], "N", { y: L.Y.gs + 0.22, front: 0.07 });
  add(group, meshBox(0.14, 0.26, 0.14, mat(0xffab91, { metalness: 0.2, roughness: 0.45 })), N.svsh, L.Y.svsh + 0.02, railZ + 0.04);
  wallTag(group, "СВШ", [N.svsh, L.Y.svsh, railZ], "N", { y: L.Y.svsh + 0.22, front: 0.07 });

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
  wallTag(group, "БКН H1300", [bkn.x, 1.1, bknZ], "N", { y: 1.4, front: L.bknR + 0.07 });

  {
    const yP = 0.55;
    add(group, makePump(), L.nTt.x, yP + 0.02, L.nTt.z);
    wallTag(group, "Н-ТТ", [L.nTt.x, yP, L.nTt.z], "N", { y: yP + 0.22, front: 0.07 });
    add(group, makePump(), L.nBkn.x, yP + 0.02, L.nBkn.z);
    wallTag(group, "Н-БКН", [L.nBkn.x, yP, L.nBkn.z], "N", { y: yP + 0.22, front: 0.07 });
  }

  // СТЭН mini-11: у восточной стены; вода: подача сзади, обратка сбоку; дверца на запад
  add(group, makeTt(ttW, ttD, ttH), tt.x, 0, ttZ, ttRotY);
  wallTag(group, "СТЭН mini-11", [tt.x, 0.7, ttZ], "E", { y: 0.85, front: ttD / 2 + 0.07, scale: 0.32 });
  wallTag(group, "ТТ обратка", L.port.ttFeed, "N", { y: 0.28, front: 0.1, scale: 0.24 });
  wallTag(group, "ТТ подача", L.port.ttSo, "E", { y: 0.62, front: 0.1, scale: 0.24 });
  // ГБ на подаче у тыла
  add(group, makeSafetyGroup(), ttRearX + 0.06, 0.62, ttZ - 0.08);
  wallTag(group, "ГБ", [ttRearX + 0.06, 0.75, ttZ - 0.08], "E", { y: 0.82, front: 0.08, scale: 0.22 });

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

  try {
    const manf = fitGlb(await loadGltf("./topochnaya/models/manifold-ufh.glb"), L.grebLen, 0.4, 0.12);
    add(group, manf, L.wRail + 0.06, L.Y.greb, grebZ, Math.PI / 2);
  } catch {
    add(group, meshBox(0.12, 0.4, L.grebLen, mat(0xb0bec5, { metalness: 0.4 })), L.wRail + 0.05, L.Y.greb, grebZ);
  }
  wallTag(group, "гребёнка", [L.wRail + 0.06, L.Y.greb, grebZ], "W", { y: L.Y.greb + 0.22, front: 0.07, scale: 0.3 });

  const mixBox = meshBox(0.12, 0.34, L.mixLen, mat(0xffe082, { roughness: 0.45, metalness: 0.15 }));
  add(group, mixBox, L.wRail + 0.05, L.Y.soLo, mixZ);
  add(group, makePump(), L.wRail + 0.16, L.Y.soLo - 0.02, mixZ - L.mixLen * 0.22);
  add(group, makePump(), L.wRail + 0.16, L.Y.soLo - 0.02, mixZ + L.mixLen * 0.22);
  wallTag(group, "смес.+Н-ТП", [L.wRail + 0.05, L.Y.soLo, mixZ], "W", { y: 0.55, front: 0.07, scale: 0.3 });

  const door = makeDoorLeaf(shell.doorW - 0.02, shell.doorH - 0.02);
  add(group, door, xW, 0, shell.doorZ, Math.PI / 2);
  wallTag(group, "дверь 0,70×H2100", [xW, 1.4, shell.doorZ], "W", { y: 1.65, front: 0.07 });

  add(group, makeSink(), lap.x, 0, lap.z);
  wallTag(group, "лапамойка", [lap.x, 0.28, lap.z], "W", { y: 0.4, front: 0.29 + 0.07 });

  // Fe / Ф1 / Ф2 на восточной стене (фронт в комнату)
  add(group, makeFe(1.32), fe.x, 0, fe.z, -Math.PI / 2);
  wallTag(group, "Fe H1320", [fe.x, 1.0, fe.z], "E", { y: 1.3, front: 0.2 + 0.07 });
  add(group, makeFilter(), f1.x, 0, f1.z, -Math.PI / 2);
  add(group, makeFilter(), f2.x, 0, f2.z, -Math.PI / 2);
  wallTag(group, "Ф1", [f1.x, 0.25, f1.z], "E", { y: 0.4, front: 0.07 });
  wallTag(group, "Ф2", [f2.x, 0.25, f2.z], "E", { y: 0.4, front: 0.07 });
  wallTag(group, "ХВС у Fe", [fe.x, 0.2, (f1.z + f2.z) / 2], "E", { y: 0.52, front: 0.07 });

  const avtH = 0.35 * 1.7;
  const avtTop = 1.35 + 0.35;
  add(group, makePanel(0.4, avtH, 0.12, "автоматика"), L.avt.x, avtTop - avtH, zS - 0.1, Math.PI);
  wallTag(group, "автоматика", [L.avt.x, avtTop - avtH / 2, zS - 0.1], "S", { y: avtTop - 0.08, front: 0.06 + 0.07 });
  add(group, makePanel(0.32, 0.4, 0.14, "ИБП"), L.ibp.x, 0, zS - 0.12, Math.PI);
  add(group, makePanel(0.3, 0.28, 0.14, "АКБ"), L.akb.x, 0, zS - 0.12, Math.PI);
  wallTag(group, "ИБП", [L.ibp.x, 0.3, zS - 0.12], "S", { y: 0.52, front: 0.14 });
  wallTag(group, "АКБ", [L.akb.x, 0.25, zS - 0.12], "S", { y: 0.42, front: 0.14 });

  const k1 = meshCyl(0.08, 0.08, 0.02, mat(0x5d4037, { roughness: 0.8 }));
  add(group, k1, L.port.k1[0], 0.01, L.port.k1[2]);
  wallTag(group, "К1", [L.port.k1[0], 0.02, L.port.k1[2]], "S", { y: 0.28, front: 0.07, scale: 0.28 });

  const win = makeWindowInWall(shell.winW, shell.winH, WALL * 0.95);
  add(group, win, shell.winX, shell.winSill + shell.winH / 2, shell.zS, Math.PI);
  wallTag(group, "окно 0,40×0,80", [shell.winX, shell.winSill + shell.winH / 2, zS], "S", {
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
