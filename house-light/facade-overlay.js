import * as THREE from "three";

const PLASTER = 0xe7e1d6;
const BRICK = 0x8d4b3c;
const BRICK_DARK = 0x4a342c;
/** Тёмно-коричневый кирпич Райта (фото wright-plaster), не холодный графит. */
const BRICK_WRIGHT = 0x5a463c;
/** Песочный клинкер для оверлеев (euro-sand цоколь). */
const BRICK_SAND = 0xb89260;
const STONE = 0xb7aa96;
const JOINT = 0x5a5e5a;
const SHUTTER_P = 0x5e7c86;
const SHUTTER_T = 0x6b3a32;
const SHUTTER_M = 0x2f4a44;
const BLADE = 0x3a342c;
const PANEL = 0xc8cbc6;
const PANEL_EDGE = 0x4e5450;
const BATTEN = 0x2e3430;
const BEAM = 0x3a2418;
const BEAM_B = 0x2a211c;
const INK = 0x1c1a17;
const LOUVER = 0x3a4146;
const SLAT = 0x5c4a3a;
/** Сочный тёплый дуб для сканди-вставок (ярче серого #9a7850). */
export const WOOD_OAK = 0xd4a060;
/** Верх цоколя 3.1* — панели отделки садятся на него, не свисают ниже.
 *  У варианта A (локальный z от пола) buildFacadeOverlays временно ставит 0. */
let PLINTH_Z = 0.45;
/** Почти заподлицо со стеной (faces с thick ≈ 1.2 см). */
// ≥0.02 → наружная оболочка (не z-fight со стеной). Раньше 0.002 давал мерцание углов.
const FLUSH = 0.025;
const DARK_PANEL = 0x2a2e32;
// Средне-серая облицовка у проёмов (roof-d); неоднородность — паттерн darkClad в стиле 30.
export const DARK_CLAD = 0x5e666f;
const CORTEN = 0x8c4e32;
const CASS_A = 0xe6e2da;
const CASS_B = 0xb3aea4;
const SURROUND = 0xc4b49a;
const BELT = 0x8a8175;
/** Светлый пояс Райта — тёплый кремовый с фото (#f0d4b4), не белый. */
const CREAM = 0xf0d4b4;
/** Плоский светлый пояс (не штукатурка стены) — чтобы линия читалась на Райте. */
const WRIGHT_BAND = 0xfaf6ee;
const SIDING = 0x6a655c;
const DARK = 0x3a3e42;
const BOARD = 0x6e757c;

function sorted(face) {
  return face.openings.slice().sort((a, b) => a.u0 - b.u0);
}

function piers(face) {
  const out = [];
  let cursor = face.span0;
  for (const op of sorted(face)) {
    if (op.u0 > cursor + 0.02) out.push({ a: cursor, b: op.u0 });
    cursor = Math.max(cursor, op.u1);
  }
  if (face.span1 > cursor + 0.02) out.push({ a: cursor, b: face.span1 });
  return out;
}

function gableTop(g, u) {
  if (!g || u <= g.u0 || u >= g.u1) return g ? g.eave : 0;
  if (u <= g.peakU) return g.eave + (g.peakZ - g.eave) * ((u - g.u0) / (g.peakU - g.u0));
  return g.eave + (g.peakZ - g.eave) * ((g.u1 - u) / (g.u1 - g.peakU));
}

function wings(face) {
  if (!face.gable) return [[face.span0, face.span1]];
  return [[face.span0, face.gable.u0], [face.gable.u1, face.span1]];
}

function sideRoom(face, op, want) {
  const ops = sorted(face);
  const i = ops.indexOf(op);
  const prev = i > 0 ? ops[i - 1].u1 : face.span0;
  const next = i < ops.length - 1 ? ops[i + 1].u0 : face.span1;
  const left = Math.min(want, Math.max(0, (op.u0 - prev) / 2 - 0.015));
  const right = Math.min(want, Math.max(0, (next - op.u1) / 2 - 0.015));
  return { left, right };
}

function quoins(face, color, w = 0.4, opts = null) {
  const ops = sorted(face);
  const first = ops[0];
  const last = ops[ops.length - 1];
  const left = first ? Math.min(w, Math.max(0.1, first.u0 - face.span0 - 0.04)) : w;
  const right = last ? Math.min(w, Math.max(0.1, face.span1 - last.u1 - 0.04)) : w;
  // Углы ниже ленты и почти заподлицо — иначе торцы/верх кирпича z-fight с белой полосой.
  const proud = opts && Number.isFinite(opts.proud) ? opts.proud : 0.04;
  const bandDrop = opts && Number.isFinite(opts.bandDrop) ? opts.bandDrop : null;
  const underBandGap = 0.05;
  const climb = (a, b) => {
    if (bandDrop != null) {
      const t0 = eaveSoffitAt(face, a) - bandDrop - underBandGap;
      const t1 = eaveSoffitAt(face, b) - bandDrop - underBandGap;
      if (typeof face.placeSlope === "function" && Math.abs(t0 - t1) > 0.02) {
        face.placeSlope(a, b, PLINTH_Z, t0, PLINTH_Z, t1, color, proud);
      } else {
        face.place(a, b, PLINTH_Z, Math.min(t0, t1), color, proud);
      }
    } else if (face.gable) {
      placeToRoof(face, a, b, PLINTH_Z, color, proud);
    } else {
      face.place(a, b, PLINTH_Z, face.eave, color, proud);
    }
  };
  climb(face.span0, face.span0 + left);
  climb(face.span1 - right, face.span1);
}

/** Нормализация фронтонного окна: face.win (zTop) или gable.win {z0,z1} у Д*. */
function normalizeGableWin(face) {
  const w = face.win || (face.gable && face.gable.win) || null;
  if (!w || !(w.u1 > w.u0 + 0.2)) return null;
  if (typeof w.zTop === "function") {
    return {
      u0: w.u0,
      u1: w.u1,
      zBase: w.zBase ?? w.z0 ?? face.eave,
      zTop: w.zTop,
    };
  }
  if (Number.isFinite(w.z0) && Number.isFinite(w.z1)) {
    return {
      u0: w.u0,
      u1: w.u1,
      zBase: w.z0,
      zTop: () => w.z1,
    };
  }
  return null;
}

/** Фронтонное окно → проём с z1L/z1R для surround / белой полосы Райта. */
function gableWinAsOp(face) {
  const w = normalizeGableWin(face);
  if (!w) return null;
  const z1L = w.zTop(w.u0);
  const z1R = w.zTop(w.u1);
  return {
    u0: w.u0,
    u1: w.u1,
    z0: w.zBase,
    z1: Math.max(z1L, z1R),
    z1L,
    z1R,
    kind: "win",
  };
}

function faceOpenings(face) {
  const list = face.openings.slice();
  const gop = gableWinAsOp(face);
  if (gop) list.push(gop);
  return list;
}

/** Верх проёма: z1L/z1R из данных или из софита фронтона (второй свет / трапеция). */
function slantHeads(face, op) {
  let z1L = op.z1L != null ? op.z1L : op.z1;
  let z1R = op.z1R != null ? op.z1R : op.z1;
  const g = face.gable;
  if (g && typeof g.soffit === "function") {
    const marked = op.z1L != null || op.z1R != null;
    const tall = Math.max(z1L, z1R, op.z1) >= face.eave - 0.08;
    if (marked || tall) {
      // Тот же отступ, что у второго света в variant-31*: низ кровли − 0,50 м.
      const sL = g.soffit(op.u0) - 0.50;
      const sR = g.soffit(op.u1) - 0.50;
      if (op.z1L != null) z1L = op.z1L;
      else if (tall) z1L = Math.max(op.z1, sL);
      if (op.z1R != null) z1R = op.z1R;
      else if (tall) z1R = Math.max(op.z1, sR);
    }
  }
  return { z1L, z1R };
}

function surround(face, op, color, band = 0.15) {
  const { left, right } = sideRoom(face, op, band);
  const heads = slantHeads(face, op);
  // Верх обвода = низ рамы/стекла (op.z1), без +2 см — иначе «дверь и окна не совпадают».
  const z1L = heads.z1L;
  const z1R = heads.z1R;
  const slanted = Math.abs(z1L - z1R) > 0.02;
  const top = 0.12;
  const zBot = op.kind === "door" ? PLINTH_Z : Math.max(PLINTH_Z, op.z0 - 0.1);
  if (left > 0.025) {
    face.place(op.u0 - left, op.u0 - 0.01, zBot, z1L + top, color, FLUSH);
  }
  if (right > 0.025) {
    face.place(op.u1 + 0.01, op.u1 + right, zBot, z1R + top, color, FLUSH);
  }
  const a = op.u0 - left;
  const b = op.u1 + right;
  if (slanted && typeof face.placeSlope === "function") {
    face.placeSlope(a, b, z1L, z1L + top, z1R, z1R + top, color, FLUSH);
    face.beam(op.u0, z1L + top * 0.35, op.u1, z1R + top * 0.35, top * 0.7, color, FLUSH);
  } else if (slanted) {
    face.beam(op.u0, z1L + top * 0.35, op.u1, z1R + top * 0.35, top * 0.7, color, FLUSH);
  } else {
    face.place(a, b, z1L, z1L + top, color, FLUSH);
  }
  if (op.kind !== "door" && op.z0 > 0.12) face.place(a, b, op.z0 - 0.12, op.z0 - 0.01, color, FLUSH);
}

function shutter(face, op, color) {
  if (op.kind === "door" || op.z0 < 0.45) return;
  const { left, right } = sideRoom(face, op, 0.2);
  const { z1L, z1R } = slantHeads(face, op);
  if (left > 0.08) face.place(op.u0 - left, op.u0 - 0.03, op.z0, z1L, color, 0.02);
  if (right > 0.08) face.place(op.u1 + 0.03, op.u1 + right, op.z0, z1R, color, 0.02);
}

/** Камень/кирпич до реального подоконника выбранного фасада. */
function skirtBand(face, color, proud = FLUSH) {
  const sill = sillOf(face);
  if (sill == null || sill < 0.4) return;
  const z0 = PLINTH_Z;
  const z1 = sill;
  for (const pier of piers(face)) {
    if (pier.b - pier.a > 0.05) face.place(pier.a, pier.b, z0, z1, color, proud);
  }
  for (const op of face.openings) {
    if (op.z0 <= z0 + 0.05) continue;
    face.place(op.u0, op.u1, z0, Math.min(op.z0 - 0.02, z1), color, proud);
  }
}

function slopeSpan(g, z) {
  const rise = g.peakZ - g.eave;
  if (rise < 0.05 || z <= g.eave) return [g.u0, g.u1];
  if (z >= g.peakZ) return [g.peakU, g.peakU];
  const t = (z - g.eave) / rise;
  return [g.u0 + (g.peakU - g.u0) * t, g.u1 - (g.u1 - g.peakU) * t];
}

function opHeadAt(op, u) {
  if (op.z1L != null && op.z1R != null && op.u1 > op.u0 + 1e-6) {
    const t = Math.max(0, Math.min(1, (u - op.u0) / (op.u1 - op.u0)));
    return op.z1L + (op.z1R - op.z1L) * t;
  }
  return op.z1;
}

function roofAt(face, u) {
  const g = face.gable;
  if (!g) return face.eave;
  // На фронтоне — строго по софиту (секции до кровли поверх фронтона).
  if (typeof g.soffit === "function" && u >= g.u0 - 0.05 && u <= g.u1 + 0.05) {
    return g.soffit(u) - 0.002;
  }
  if (u >= (g.u0 ?? 0) - 0.05 && u <= (g.u1 ?? 0) + 0.05) {
    return gableCeiling(g, u) - 0.002;
  }
  return face.eave;
}

/** ≈ ROOF_THICK − ROOF_OVER_WALL: низ кровли у стены под обычным свесом. */
const EAVE_SOFFIT = 0.12;
/** Толщина скорлупы кровли Д* (roofDrop), если у фронтона нет soffit(). */
const GABLE_SHELL = 0.38;

/** Единая линия низа кровли: под свесом и на фронтоне без разрыва на пятке. */
function eaveSoffitAt(face, u) {
  const flat = face.eave - EAVE_SOFFIT;
  const g = face.gable;
  if (g && u >= g.u0 - 0.05 && u <= g.u1 + 0.05) {
    // peakZ у Д* = наружный конёк; без soffit опускаем на толщину скорлупы — иначе лента в теле кровли.
    // Не поднимать до flat: Math.max(flat, sof) загонял облицовку в толщу ската у пятки фронтона.
    const sof = typeof g.soffit === "function"
      ? g.soffit(u) - 0.002
      : gableCeiling(g, u) - (Number.isFinite(g.shell) ? g.shell : GABLE_SHELL) - 0.002;
    return sof;
  }
  return flat;
}

/**
 * Сплошная светлая лента под кровлей (в т.ч. над рамами второго света).
 * Фронтон: крылья + два ската — без нарезки и без вырезов у проёмов.
 */
function underRoofBand(face, drop = 0.36, color, proud = 0.10) {
  const lo = face.span0;
  const hi = face.span1;
  if (hi - lo < 0.04 || drop < 0.05) return;

  const paintRun = (a, b) => {
    if (b - a < 0.04) return;
    // −3 см от низа кровли: лента на стене, не в плоскости ската.
    const t0 = eaveSoffitAt(face, a) - 0.06;
    const t1 = eaveSoffitAt(face, b) - 0.06;
    if (typeof face.placeSlope === "function" && Math.abs(t0 - t1) > 0.04) {
      face.placeSlope(a, b, t0 - drop, t0, t1 - drop, t1, color, proud);
    } else {
      const top = (t0 + t1) * 0.5;
      face.place(a, b, top - drop, top, color, proud);
    }
  };

  const nSamp = Math.max(6, Math.ceil((hi - lo) / 0.25));
  const tops = [];
  for (let i = 0; i <= nSamp; i++) {
    tops.push(eaveSoffitAt(face, lo + ((hi - lo) * i) / nSamp));
  }
  const tMin = Math.min(...tops);
  const tMax = Math.max(...tops);
  if (tMax - tMin < 0.06) {
    paintRun(lo, hi);
    return;
  }

  const g = face.gable;
  const parts = [];
  if (g && Number.isFinite(g.peakU)) {
    if (lo < g.u0 - 0.02) parts.push([lo, g.u0]);
    parts.push([Math.max(lo, g.u0), Math.min(hi, g.peakU)]);
    parts.push([Math.max(lo, g.peakU), Math.min(hi, g.u1)]);
    if (hi > g.u1 + 0.02) parts.push([g.u1, hi]);
  } else {
    parts.push([lo, hi]);
  }
  for (const [u0, u1] of parts) paintRun(u0, u1);
}

// Вертикальные полосы к скату — без горизонтальных «ступеней» fillAbove.
function fillAbove(face, a, b, zFrom, color, proud = 0) {
  const g = face.gable;
  if (!g) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const step = 0.045;
  for (let u = lo; u < hi - 1e-4; u += step) {
    const u2 = Math.min(u + step, hi);
    const top = roofAt(face, (u + u2) * 0.5);
    if (top > zFrom + 0.03) face.place(u, u2, zFrom, top, color, proud);
  }
}

function placeToRoof(face, a, b, z0, color, proud = 0) {
  cladToRoof(face, Math.min(a, b), Math.max(a, b), z0, color, proud);
}

/** Верх облицовки: чуть ниже софита — не врезается в скат под углом. */
function cladTopAt(face, u, zTop = 1e3) {
  return Math.min(zTop, eaveSoffitAt(face, u) - 0.06);
}

/** Разрез у конька — на каждом скате верх линейный, одна трапеция без зубцов. */
function cladPeakParts(face, a, b) {
  const g = face.gable;
  if (g && Number.isFinite(g.peakU) && a < g.peakU - 0.01 && b > g.peakU + 0.01) {
    return [[a, g.peakU], [g.peakU, b]].filter(([u0, u1]) => u1 - u0 > 0.03);
  }
  return b - a > 0.03 ? [[a, b]] : [];
}

function placeCladRun(face, a, b, zBot, zTop, color, proud) {
  for (const [u0, u1] of cladPeakParts(face, a, b)) {
    const t0 = cladTopAt(face, u0, zTop);
    const t1 = cladTopAt(face, u1, zTop);
    if (Math.max(t0, t1) <= zBot + 0.03) continue;
    if (typeof face.placeSlope === "function" && Math.abs(t0 - t1) > 0.02) {
      face.placeSlope(
        u0, u1,
        zBot, Math.max(t0, zBot + 0.03),
        zBot, Math.max(t1, zBot + 0.03),
        color, proud
      );
    } else {
      const top = Math.min(t0, t1);
      if (top > zBot + 0.03) face.place(u0, u1, zBot, top, color, proud);
    }
  }
}

function placeCladAboveOp(face, a, b, op, zBot, zTop, color, proud) {
  for (const [u0, u1] of cladPeakParts(face, a, b)) {
    const h0 = Math.max(opHeadAt(op, u0), zBot);
    const h1 = Math.max(opHeadAt(op, u1), zBot);
    const t0 = cladTopAt(face, u0, zTop);
    const t1 = cladTopAt(face, u1, zTop);
    if (Math.max(t0, t1) <= Math.min(h0, h1) + 0.02) continue;
    if (typeof face.placeSlope === "function") {
      face.placeSlope(
        u0, u1,
        h0, Math.max(t0, h0 + 0.02),
        h1, Math.max(t1, h1 + 0.02),
        color, proud
      );
    } else {
      const above = Math.max(h0, h1);
      const top = Math.min(t0, t1);
      if (top > above + 0.02) face.place(u0, u1, above, top, color, proud);
    }
  }
}

/**
 * Облицовка до софита: цельные панели / трапеции по скату (не нарезка 5 см со ступеньками).
 * Проёмы вырезаются одним куском — без разрывов по краям окон.
 */
/** Соседние проёмы (щель ≤ gap) — один вырез: нет тонкой полоски облицовки между рамами 2-го света. */
function mergeOpeningsForClad(ops, gap = 0.14) {
  const out = [];
  for (const op of ops.slice().sort((a, b) => a.u0 - b.u0)) {
    const last = out[out.length - 1];
    if (last && op.u0 <= last.u1 + gap) {
      last.u1 = Math.max(last.u1, op.u1);
      last.z0 = Math.min(last.z0, op.z0);
      last.z1 = Math.max(last.z1, op.z1);
      if (last.z1L == null) last.z1L = last.z1;
      if (op.z1R != null) last.z1R = op.z1R;
      else if (op.z1L != null) last.z1R = op.z1;
      else last.z1R = Math.max(last.z1R != null ? last.z1R : last.z1, op.z1);
    } else {
      const copy = { ...op };
      if (copy.z1L != null || copy.z1R != null) {
        if (copy.z1L == null) copy.z1L = copy.z1;
        if (copy.z1R == null) copy.z1R = copy.z1;
      }
      out.push(copy);
    }
  }
  return out;
}

function cladBand(face, u0, u1, zBot, zTop, color, proud = 0) {
  const lo = Math.min(u0, u1);
  const hi = Math.max(u0, u1);
  if (hi - lo < 0.04 || zTop <= zBot + 0.03) return;

  const ops = mergeOpeningsForClad(
    face.openings.filter((op) => !op.inner && op.u1 > lo + 0.02 && op.u0 < hi - 0.02)
  );

  let cursor = lo;
  for (const op of ops) {
    const a = Math.max(op.u0, lo);
    const b = Math.min(op.u1, hi);
    if (b <= a + 0.02) continue;
    if (a > cursor + 0.03) placeCladRun(face, cursor, a, zBot, zTop, color, proud);
    const zLo = op.z0;
    if (zLo > zBot + 0.025) {
      const topBelow = Math.min(zLo, zTop);
      if (topBelow > zBot + 0.025) face.place(a, b, zBot, topBelow, color, proud);
    }
    placeCladAboveOp(face, a, b, op, zBot, zTop, color, proud);
    cursor = Math.max(cursor, b);
  }
  if (hi > cursor + 0.03) placeCladRun(face, cursor, hi, zBot, zTop, color, proud);
}

// Зашивка до крыши с вырезом проёмов по форме (в т.ч. косой z1L/z1R).
function cladToRoof(face, u0, u1, zBot, color, proud = 0) {
  cladBand(face, u0, u1, zBot, 1e3, color, proud);
}

function timberPosts(face, color, z0, z1, pw = 0.13, toRoof = false) {
  const paint = (a, b) => {
    if (toRoof) placeToRoof(face, a, b, z0, color);
    else face.place(a, b, z0, z1, color);
  };
  for (const pier of piers(face)) {
    const w = pier.b - pier.a;
    if (w < 0.05) continue;
    if (w < 0.32) paint(pier.a, pier.b);
    else {
      const p = Math.min(pw, w * 0.3);
      paint(pier.a, pier.a + p);
      paint(pier.b - p, pier.b);
    }
  }
}

const POSTS_22 = [
  [-1.698, -1.57], [-0.585, -0.457], [1.565, 1.693], [3.289, 3.417], [5.452, 5.58],
  [6.032, 6.16], [7.517, 7.645], [10.675, 10.803], [13.417, 13.545], [14.282, 14.41],
  [14.917, 15.045], [17.075, 17.203], [18.087, 18.215],
];

function joinBeam(face, u0, z0, u1, z1, size, color, proud = 0) {
  const du = u1 - u0;
  const dz = z1 - z0;
  const len = Math.hypot(du, dz) || 1;
  const e = size * 0.45;
  face.beam(u0 - (du / len) * e, z0 - (dz / len) * e, u1 + (du / len) * e, z1 + (dz / len) * e, size, color, proud);
}

function gableCeiling(g, u) {
  if (typeof g.soffit === "function") return g.soffit(u);
  const over = g.over ?? 0.3;
  const drop = g.drop ?? 0.45;
  const half = (g.u1 - g.u0) / 2 + over;
  const rise = g.peakZ - g.eave;
  const dist = Math.min(Math.abs(u - g.peakU), half);
  return g.eave + rise * (1 - dist / Math.max(half, 0.001)) - drop;
}

function placeBand(face, u0, u1, z0, z1, color, proud = 0) {
  const lo = Math.min(u0, u1);
  const hi = Math.max(u0, u1);
  const put = (s0, s1, za, zb) => {
    if (s1 - s0 > 0.03 && zb - za > 0.02) face.place(s0, s1, za, zb, color, proud);
  };
  const g = face.gable;
  if (!g) {
    put(lo, hi, z0, z1);
    return;
  }
  const over = g.over ?? 0.3;
  const a = g.u0 - over;
  const b = g.u1 + over;
  if (lo < a) put(lo, Math.min(hi, a), z0, z1);
  if (hi > b) put(Math.max(lo, b), hi, z0, z1);
  const m0 = Math.max(lo, a);
  const m1 = Math.min(hi, b);
  if (m1 - m0 < 0.03) return;
  const step = 0.28;
  for (let u = m0; u < m1 - 0.001; u += step) {
    const u2 = Math.min(u + step, m1);
    const cap = Math.min(gableCeiling(g, u), gableCeiling(g, u2), gableCeiling(g, (u + u2) / 2)) - 0.05;
    const top = Math.min(z1, cap);
    if (top - z0 > 0.03) put(u, u2, z0, top);
  }
}

function underGable(face, op) {
  return face.gable && op.u1 > face.gable.u0 + 0.2 && op.u0 < face.gable.u1 - 0.2;
}

function fachwerkPosts(face, color, southPosts, studs) {
  const pw = 0.128;
  if (face.name === "S" && southPosts) {
    for (const [a, b] of southPosts) placeBand(face, a, b, PLINTH_Z, face.eave, color, FLUSH);
    return;
  }
  const spots = [face.span0, face.span1 - pw];
  for (const op of sorted(face)) {
    spots.push(op.u0 - pw - 0.02, op.u1 + 0.02);
  }
  if (studs) {
    for (const pier of piers(face)) {
      if (pier.b - pier.a > 1.4) spots.push((pier.a + pier.b) / 2 - pw / 2);
    }
  }
  const used = [];
  for (const u of spots) {
    const a = Math.max(face.span0, u);
    const b = Math.min(face.span1, a + pw);
    if (b - a < 0.07) continue;
    if (used.some((p) => Math.abs(p - a) < 0.09)) continue;
    if (face.openings.some((op) => a < op.u1 - 0.015 && b > op.u0 + 0.015)) continue;
    used.push(a);
    placeBand(face, a, b, PLINTH_Z, face.eave, color, FLUSH);
  }
}

function sillOf(face) {
  const wins = sorted(face).filter((op) => op.kind !== "door" && op.z0 > 0.15);
  const wing = wins.filter((op) => !underGable(face, op));
  const pool = wing.length ? wing : wins;
  if (!pool.length) return null;
  return Math.min(...pool.map((op) => op.z0));
}

function fachwerkRails(face, color, midRail) {
  const eave0 = Math.max(face.eave - 0.12, 0.2);
  placeBand(face, face.span0, face.span1, eave0, face.eave, color, 0.014);
  const wins = sorted(face).filter((op) => op.kind !== "door" && op.z1 < face.eave - 0.04);
  const head = wins.length ? Math.max(...wins.map((op) => op.z1)) : null;
  if (head != null && head + 0.16 < eave0) {
    face.place(face.span0, face.span1, head + 0.02, Math.min(head + 0.14, eave0 - 0.04), color, 0.014);
  }
  if (midRail && head != null && eave0 - head > 0.5) {
    const mid = (head + 0.14 + eave0) / 2;
    face.place(face.span0, face.span1, mid - 0.05, mid + 0.05, color, 0.014);
  }
  const sill = sillOf(face);
  if (sill == null) return;
  const z0 = Math.max(0.08, sill - 0.16);
  const z1 = sill - 0.02;
  let cursor = face.span0;
  for (const op of sorted(face)) {
    if (op.z0 < z1 - 0.01 && op.z1 > z0) {
      if (op.u0 - cursor > 0.08) face.place(cursor, op.u0, z0, z1, color, 0.014);
      cursor = Math.max(cursor, op.u1);
    }
  }
  if (face.span1 - cursor > 0.08) face.place(cursor, face.span1, z0, z1, color, 0.014);
}

function fachwerkCrosses(face, color) {
  for (const op of sorted(face)) {
    if (op.kind === "door" || op.z0 < 0.45 || underGable(face, op)) continue;
    if (op.u1 - op.u0 < 0.7) continue;
    const zLo = op.z1 + 0.1;
    const zHi = face.eave - 0.16;
    if (zHi - zLo < 0.28) continue;
    joinBeam(face, op.u0, zLo, op.u1, zHi, 0.09, color);
    joinBeam(face, op.u0, zHi, op.u1, zLo, 0.09, color);
  }
  const list = piers(face);
  const ends = list.length <= 1 ? list : [list[0], list[list.length - 1]];
  const foot = sillOf(face);
  const zFoot = foot == null ? 0.2 : Math.max(0.12, foot - 0.02);
  for (const pier of ends) {
    if (!pier || pier.b - pier.a < 0.45 || pier.b - pier.a > 1.8) continue;
    if (face.eave - 0.2 - zFoot < 0.4) continue;
    const atStart = pier.a - face.span0 < 0.08;
    if (atStart) joinBeam(face, pier.a + 0.08, face.eave - 0.18, pier.b - 0.08, zFoot, 0.09, color);
    else joinBeam(face, pier.b - 0.08, face.eave - 0.18, pier.a + 0.08, zFoot, 0.09, color);
  }
}

function punched(face, u0, u1, z0, z1, color, proud = 0) {
  if (u1 - u0 < 0.04 || z1 - z0 < 0.04) return;
  const holes = sorted(face).filter((op) => op.u1 > u0 + 0.02 && op.u0 < u1 - 0.02 && op.z1 > z0 + 0.02 && op.z0 < z1 - 0.02);
  if (!holes.length) {
    face.place(u0, u1, z0, z1, color, proud);
    return;
  }
  let cursor = u0;
  for (const op of holes) {
    const left = Math.min(op.u0, u1);
    if (left - cursor > 0.03) face.place(cursor, left, z0, z1, color, proud);
    const ha = Math.max(op.u0, u0);
    const hb = Math.min(op.u1, u1);
    const top = Math.min(op.z0, z1);
    const bot = Math.max(op.z1, z0);
    if (top - z0 > 0.03) face.place(ha, hb, z0, top, color, proud);
    if (z1 - bot > 0.03) face.place(ha, hb, bot, z1, color, proud);
    cursor = Math.max(cursor, op.u1);
  }
  if (u1 - cursor > 0.03) face.place(cursor, u1, z0, z1, color, proud);
}

const CASS_BAYS = [
  [-1.57, 1.57, CASS_B, CASS_A],
  [1.64, 3.42, CASS_A, CASS_B],
  [3.51, 6.01, CASS_B, CASS_A],
  [14.44, 16.32, CASS_B, CASS_A],
  [16.41, 18.15, CASS_A, CASS_B],
];

const CASS_GABLE = [
  [6.11, 7.17, CASS_A],
  [7.26, 8.32, CASS_B],
  [8.41, 9.46, CASS_A],
  [9.56, 10.62, CASS_B],
  [10.71, 11.77, CASS_A],
  [11.86, 12.92, CASS_B],
  [13.01, 14.07, CASS_A],
];

function cortenBand(face) {
  const g = face.gable;
  if (!g) return;
  const ops = face.openings.filter((op) => op.u1 > g.u0 + 0.05 && op.u0 < g.u1 - 0.05);
  const head = ops.length ? Math.max(...ops.map((op) => op.z1)) : 2.15;
  if (face.eave - head < 0.12) return;
  face.place(g.u0, g.u1, head + 0.03, face.eave, CORTEN, 0.012);
}

function cassettes(face) {
  if (face.name === "S") {
    for (const [a, b, upper, lower] of CASS_BAYS) {
      const ops = face.openings.filter((op) => (op.u0 + op.u1) / 2 > a && (op.u0 + op.u1) / 2 < b && op.kind !== "door");
      const split = ops.length ? Math.max(...ops.map((op) => op.z1)) : 2.15;
      punched(face, a, b, 0.95, split, lower);
      punched(face, a, b, split + 0.03, face.eave, upper);
    }
    cortenBand(face);
    for (const [a, b, color] of CASS_GABLE) fillAbove(face, a, b, face.eave - 0.02, color);
    return;
  }
  const g = face.gable;
  let i = 0;
  for (const op of sorted(face)) {
    if (op.kind === "door") continue;
    if (g && op.u1 > g.u0 + 0.2 && op.u0 < g.u1 - 0.2) continue;
    const { left, right } = sideRoom(face, op, 0.45);
    const upper = i++ % 2 ? CASS_A : CASS_B;
    punched(face, op.u0 - left, op.u1 + right, 0.95, op.z1, upper === CASS_A ? CASS_B : CASS_A);
    punched(face, op.u0 - left, op.u1 + right, op.z1 + 0.03, face.eave, upper);
  }
  cortenBand(face);
  if (!g) return;
  let n = 0;
  for (let u = g.u0 + 0.2; u < g.u1 - 0.3; u += 1.15) {
    fillAbove(face, u, Math.min(u + 1.02, g.u1 - 0.1), face.eave - 0.02, n++ % 2 ? CASS_B : CASS_A);
  }
}

function fachwerkGable(face, color, fan) {
  const g = face.gable;
  if (!g) return;
  const over = g.over ?? 0.3;
  const half = (g.u1 - g.u0) / 2 + over;
  const scale = half / 4.05;
  const gap = 0.06;
  const ceil = (u, size) => gableCeiling(g, u) - size * 0.5 - gap;
  const top = ceil(g.peakU, 0.14);
  if (top < g.eave + 0.22) return;
  face.beam(g.peakU, Math.max(g.eave + 0.06, top - 0.56), g.peakU, top, 0.14, color, 0.02);
  if (fan) {
    const d = 1.94 * scale;
    const zFoot = g.eave + 0.04;
    face.beam(g.peakU, top - 0.02, g.peakU + d, zFoot, 0.11, color, 0.02);
    face.beam(g.peakU, top - 0.02, g.peakU - d, zFoot, 0.11, color, 0.02);
    return;
  }
  const collar = 0.12;
  const zc = g.eave + (top - g.eave) * 0.56;
  let dist = 0;
  for (let d = half * 0.82; d >= 0.28; d -= 0.04) {
    if (ceil(g.peakU - d, collar) >= zc && ceil(g.peakU + d, collar) >= zc) {
      dist = d;
      break;
    }
  }
  if (dist < 0.28) return;
  face.beam(g.peakU - dist, zc, g.peakU + dist, zc, collar, color, 0.02);
  const foot = Math.min(2.15 * scale, dist * 0.72);
  const topIn = Math.min(0.65 * scale, dist * 0.26);
  if (foot > topIn + 0.12) {
    face.beam(g.peakU + foot, g.eave + 0.03, g.peakU + topIn, zc, 0.1, color, 0.02);
    face.beam(g.peakU - foot, g.eave + 0.03, g.peakU - topIn, zc, 0.1, color, 0.02);
  }
}

function paintZone(face, u0, u1, color, proud = FLUSH) {
  for (const pier of piers(face)) {
    const a = Math.max(pier.a, u0);
    const b = Math.min(pier.b, u1);
    if (b - a > 0.015) face.place(a, b, PLINTH_Z, face.eave, color, proud);
  }
  for (const op of face.openings) {
    const a = Math.max(op.u0, u0);
    const b = Math.min(op.u1, u1);
    if (b - a < 0.04) continue;
    if (op.z0 > PLINTH_Z + 0.05) face.place(a, b, PLINTH_Z, op.z0 - 0.02, color, proud);
    if (face.eave > op.z1 + 0.05) face.place(a, b, op.z1 + 0.02, face.eave, color, proud);
  }
}

function boardCap(face, u) {
  const g = face.gable;
  if (!g || u <= g.u0 || u >= g.u1) return face.eave - 0.06;
  return Math.max(face.eave - 0.06, gableTop(g, u) - 0.04);
}

function boardsIn(face, u0, u1, color) {
  const win = face.gable && face.gable.win;
  for (let u = u0 + 0.08; u < u1 - 0.04; u += 0.32) {
    const hits = face.openings.filter((op) => u > op.u0 + 0.02 && u < op.u1 - 0.02);
    if (win && u > win.u0 + 0.02 && u < win.u1 - 0.02) hits.push(win);
    let z = PLINTH_Z;
    const ordered = hits.slice().sort((a, b) => a.z0 - b.z0);
    const cap = boardCap(face, u + 0.009);
    for (const op of ordered) {
      const z1 = Math.min(op.z0 - 0.02, cap);
      if (z1 > z + 0.05) face.place(u, u + 0.018, z, z1, color);
      z = Math.max(z, op.z1 + 0.02);
    }
    if (cap > z + 0.05) face.place(u, u + 0.018, z, cap, color);
  }
}

function each(faces, fn) {
  for (const face of faces) fn(face);
}

function makeFaces(api, house) {
  const t = 0.012;
  const southGable = gableOf(house.tEast, house.tWest, house.eave, house.gablePitch, house.southGable);
  const northGable = gableOf(house.pEast, house.pWest, house.eave, house.gablePitch, house.northGable);
  const south = faceU(api, "S", house.south, house.uOutE, house.uOutW, house.vOutS, -1, house.eave, southGable, t);
  const north = faceU(api, "N", house.north, house.uOutE, house.uOutW, house.vOutN, 1, house.eave, northGable, t);
  south.win = house.southWin || null;
  north.win = house.northWin || null;
  return [
    south,
    north,
    faceV(api, "E", house.east, house.vS, house.vN, house.uOutE, -1, house.eave, t),
    faceV(api, "W", house.west, house.vS, house.vN, house.uOutW, 1, house.eave, t),
  ];
}

function gableOf(u0, u1, eave, pitch, extra = null) {
  const peakU = (u0 + u1) / 2;
  const peakZ = extra?.peakZ ?? eave + ((u1 - u0) / 2) * pitch;
  const g = {
    u0, u1, peakU, peakZ, eave,
    over: extra?.over ?? 0.3,
    drop: extra?.drop ?? 0.45,
  };
  if (typeof extra?.soffit === "function") g.soffit = extra.soffit;
  return g;
}

function rectsOutside(u0, u1, z0, z1, win) {
  if (!win || u1 <= win.u0 + 0.001 || u0 >= win.u1 - 0.001 || z1 <= win.zBase + 0.001) return [[u0, u1, z0, z1]];
  const parts = [];
  const push = (a, b, c, d) => {
    if (b - a > 0.012 && d - c > 0.012) parts.push([a, b, c, d]);
  };
  if (u0 < win.u0) push(u0, Math.min(u1, win.u0), z0, z1);
  const a = Math.max(u0, win.u0);
  const b = Math.min(u1, win.u1);
  if (b > a + 0.001) {
    const steps = Math.max(1, Math.ceil((b - a) / 0.22));
    for (let i = 0; i < steps; i++) {
      const s0 = a + ((b - a) * i) / steps;
      const s1 = a + ((b - a) * (i + 1)) / steps;
      const zCut = Math.min(win.zTop(s0), win.zTop(s1));
      if (z0 < win.zBase) push(s0, s1, z0, Math.min(z1, win.zBase));
      if (z1 > zCut) push(s0, s1, Math.max(z0, zCut), z1);
    }
  }
  if (u1 > win.u1) push(Math.max(u0, win.u1), u1, z0, z1);
  return parts;
}

function segsOutside(u0, z0, u1, z1, win) {
  const inside = (u, z) => u > win.u0 && u < win.u1 && z > win.zBase + 0.01 && z < win.zTop(u) - 0.01;
  if (!inside(u0, z0) && !inside(u1, z1) && !inside((u0 + u1) / 2, (z0 + z1) / 2)) return [[u0, z0, u1, z1]];
  const n = 16;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = u0 + (u1 - u0) * t;
    const z = z0 + (z1 - z0) * t;
    pts.push([u, z, inside(u, z)]);
  }
  const segs = [];
  let start = null;
  for (let i = 0; i < pts.length; i++) {
    if (!pts[i][2]) {
      if (start == null) start = i;
    } else if (start != null) {
      segs.push([pts[start][0], pts[start][1], pts[i - 1][0], pts[i - 1][1]]);
      start = null;
    }
  }
  if (start != null) segs.push([pts[start][0], pts[start][1], pts[n][0], pts[n][1]]);
  return segs.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 0.05);
}

function faceU(api, name, openings, span0, span1, vOuter, sign, eave, gable, t) {
  const inset = Math.min(0.008, Math.max(0.002, t * 0.35));
  const v0 = sign < 0 ? vOuter - t : vOuter - inset;
  const v1 = sign < 0 ? vOuter + inset : vOuter + t;
  const vBeam = sign < 0 ? vOuter - t * 0.45 : vOuter + t * 0.45;
  function faceNormU(proud) {
    if (proud >= 0.015) {
      // Оболочка от плоскости стены наружу. standOff: лента поверх кирпича (не общая грань).
      const depth = Math.max(0.028, Math.min(0.2, proud));
      // Лента снаружи кирпича: standOff больше любого quoin/surround proud.
      // Лента чуть снаружи кирпича (~3 см), не «парит» в 8 см от стены.
      const standOff = proud >= 0.1 ? 0.032 : 0;
      if (sign < 0) return [vOuter - standOff - depth, vOuter - standOff];
      return [vOuter + standOff, vOuter + standOff + depth];
    }
    const extra = sign * proud;
    return [v0 + extra, v1 + extra];
  }
  return {
    name, openings, span0, span1, eave, gable, win: null,
    place(a, b, z0, z1, color, proud = 0) {
      const u0 = Math.min(a, b);
      const u1 = Math.max(a, b);
      let za = Math.min(z0, z1);
      const zb = Math.max(z0, z1);
      if (za < PLINTH_Z) za = PLINTH_Z;
      if (zb - za < 0.015) return;
      const parts = this.win ? rectsOutside(u0, u1, za, zb, this.win) : [[u0, u1, za, zb]];
      const [n0, n1] = faceNormU(proud);
      for (const [s0, s1, c0, c1] of parts) {
        if (s1 - s0 < 0.012 || c1 - c0 < 0.015) continue;
        api.rect(s0, Math.min(n0, n1), s1, Math.max(n0, n1), c0, c1, color);
      }
    },
    /** Лента по скату фронтона (вариант A) — не горизонтальный прямоугольник сквозь кровлю. */
    placeSlope(a, b, zBotA, zTopA, zBotB, zTopB, color, proud = 0) {
      let u0 = a;
      let u1 = b;
      let zb0 = zBotA;
      let zt0 = zTopA;
      let zb1 = zBotB;
      let zt1 = zTopB;
      if (u1 < u0) {
        u0 = b;
        u1 = a;
        zb0 = zBotB;
        zt0 = zTopB;
        zb1 = zBotA;
        zt1 = zTopA;
      }
      if (u1 - u0 < 0.012) return;
      zb0 = Math.max(zb0, PLINTH_Z);
      zb1 = Math.max(zb1, PLINTH_Z);
      if (zt0 - zb0 < 0.015 && zt1 - zb1 < 0.015) return;
      const win = this.win;
      // Вырез окна чердака / 2-го света на фронтоне — иначе секция до кровли его закрывает.
      if (win && u1 > win.u0 + 0.01 && u0 < win.u1 - 0.01) {
        const span = Math.max(1e-6, u1 - u0);
        const at = (u) => {
          const t = (u - u0) / span;
          return {
            zb: zb0 + (zb1 - zb0) * t,
            zt: zt0 + (zt1 - zt0) * t,
          };
        };
        const paint = (ua, ub, b0, t0, b1, t1) => {
          if (ub - ua < 0.012) return;
          if (Math.max(t0, t1) <= Math.min(b0, b1) + 0.015) return;
          this.placeSlope(ua, ub, b0, t0, b1, t1, color, proud);
        };
        // Сбрасываем win на время рекурсии сырых кусков.
        this.win = null;
        try {
          if (u0 < win.u0) {
            const L = at(u0);
            const R = at(Math.min(u1, win.u0));
            paint(u0, Math.min(u1, win.u0), L.zb, L.zt, R.zb, R.zt);
          }
          if (u1 > win.u1) {
            const L = at(Math.max(u0, win.u1));
            const R = at(u1);
            paint(Math.max(u0, win.u1), u1, L.zb, L.zt, R.zb, R.zt);
          }
          const mid0 = Math.max(u0, win.u0);
          const mid1 = Math.min(u1, win.u1);
          if (mid1 > mid0 + 0.012) {
            const n = Math.max(1, Math.ceil((mid1 - mid0) / 0.18));
            for (let i = 0; i < n; i++) {
              const s0 = mid0 + ((mid1 - mid0) * i) / n;
              const s1 = mid0 + ((mid1 - mid0) * (i + 1)) / n;
              const L = at(s0);
              const R = at(s1);
              const zCut0 = win.zTop(s0);
              const zCut1 = win.zTop(s1);
              paint(s0, s1, L.zb, Math.min(L.zt, win.zBase), R.zb, Math.min(R.zt, win.zBase));
              paint(s0, s1, Math.max(L.zb, zCut0), L.zt, Math.max(R.zb, zCut1), R.zt);
            }
          }
        } finally {
          this.win = win;
        }
        return;
      }
      const [n0, n1] = faceNormU(proud);
      const tris = [];
      const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) => {
        tris.push([ax, ay, az, bx, by, bz, cx, cy, cz], [ax, ay, az, cx, cy, cz, dx, dy, dz]);
      };
      quad(u0, n0, zb0, u1, n0, zb1, u1, n0, zt1, u0, n0, zt0);
      quad(u0, n1, zb0, u0, n1, zt0, u1, n1, zt1, u1, n1, zb1);
      quad(u0, n0, zt0, u1, n0, zt1, u1, n1, zt1, u0, n1, zt0);
      quad(u0, n0, zb0, u0, n1, zb0, u1, n1, zb1, u1, n0, zb1);
      quad(u0, n0, zb0, u0, n0, zt0, u0, n1, zt0, u0, n1, zb0);
      quad(u1, n0, zb1, u1, n1, zb1, u1, n1, zt1, u1, n0, zt1);
      if (typeof api.tris === "function") api.tris(tris, color);
      else for (const t of tris) api.tri(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], color);
    },
    beam(a, z0, b, z1, size, color, proud = 0) {
      const v = vBeam + sign * proud;
      const segs = this.win ? segsOutside(a, z0, b, z1, this.win) : [[a, z0, b, z1]];
      for (const [s0, c0, s1, c1] of segs) api.beam(s0, v, c0, s1, v, c1, size, color);
    },
    tri(color, proud = 0) {
      if (!gable) return;
      const v = vBeam + sign * proud;
      api.tri(gable.u0, v, gable.eave, gable.peakU, v, gable.peakZ, gable.u1, v, gable.eave, color);
    },
    roofFill(color) {
      if (!gable) return;
      const drop = gable.drop ?? 0.45;
      const over = gable.over ?? 0.3;
      const rise = gable.peakZ - gable.eave;
      const half = (gable.u1 - gable.u0) / 2 + over;
      const dist = half * Math.max(0.08, (rise - drop) / rise);
      const outV = sign < 0 ? vOuter - t - 0.025 : vOuter + t + 0.025;
      const zPeak = gable.peakZ - drop;
      const uL = gable.peakU - dist;
      const uR = gable.peakU + dist;
      const win = this.win;
      if (!win || rise < 0.15) {
        api.tri(uR, outV, gable.eave, gable.peakU, outV, zPeak, uL, outV, gable.eave, color);
        return;
      }
      const zOf = (u) => {
        const k = Math.min(1, Math.abs(u - gable.peakU) / Math.max(dist, 0.001));
        return gable.eave + (zPeak - gable.eave) * (1 - k);
      };
      const us = [uL, uR];
      if (win.u0 > uL && win.u0 < uR) us.push(win.u0);
      if (win.u1 > uL && win.u1 < uR) us.push(win.u1);
      const n = 18;
      for (let i = 1; i < n; i++) us.push(uL + ((uR - uL) * i) / n);
      us.sort((p, q) => p - q);
      const quad = (ua, za0, za1, ub, zb0, zb1) => {
        if (za1 - za0 < 0.02 && zb1 - zb0 < 0.02) return;
        api.tri(ua, outV, za0, ub, outV, zb0, ub, outV, zb1, color);
        api.tri(ua, outV, za0, ub, outV, zb1, ua, outV, za1, color);
      };
      for (let i = 0; i < us.length - 1; i++) {
        const a = us[i];
        const b = us[i + 1];
        if (b - a < 0.001) continue;
        const topA = zOf(a);
        const topB = zOf(b);
        const mid = (a + b) / 2;
        if (mid <= win.u0 || mid >= win.u1) {
          quad(a, gable.eave, topA, b, gable.eave, topB);
          continue;
        }
        const headA = Math.min(win.zTop(a), topA);
        const headB = Math.min(win.zTop(b), topB);
        quad(a, gable.eave, Math.min(win.zBase, topA), b, gable.eave, Math.min(win.zBase, topB));
        quad(a, headA, topA, b, headB, topB);
      }
    },
  };
}

function faceV(api, name, openings, span0, span1, uOuter, sign, eave, t) {
  const inset = Math.min(0.008, Math.max(0.002, t * 0.35));
  const u0 = sign < 0 ? uOuter - t : uOuter - inset;
  const u1 = sign < 0 ? uOuter + inset : uOuter + t;
  const uBeam = sign < 0 ? uOuter - t * 0.45 : uOuter + t * 0.45;
  return {
    name, openings, span0, span1, eave, gable: null,
    place(a, b, z0, z1, color, proud = 0) {
      let za = Math.min(z0, z1);
      const zb = Math.max(z0, z1);
      if (za < PLINTH_Z) za = PLINTH_Z;
      if (Math.abs(b - a) < 0.012 || zb - za < 0.015) return;
      const extra = sign * proud;
      api.rect(u0 + extra, Math.min(a, b), u1 + extra, Math.max(a, b), za, zb, color);
    },
    beam(a, z0, b, z1, size, color, proud = 0) {
      const u = uBeam + sign * proud;
      api.beam(u, a, z0, u, b, z1, size, color);
    },
    tri() {},
  };
}

export function wallFace(api, o) {
  const t = o.thick ?? 0.012;
  const sign = o.sign;
  const outer = o.outer;
  const alongX = o.along !== "y";
  const gable = o.gable ?? null;
  const inset = Math.min(0.008, Math.max(0.002, t * 0.35));
  const nBeam = sign < 0 ? outer - t * 0.45 : outer + t * 0.45;
  const outN = sign < 0 ? outer - t - 0.02 : outer + t + 0.02;
  function faceNorm(proud) {
    if (proud >= 0.015) {
      // Оболочка от плоскости стены наружу. standOff: лента поверх кирпича (не общая грань).
      const depth = Math.max(0.028, Math.min(0.2, proud));
      // Лента снаружи кирпича: standOff больше любого quoin/surround proud.
      // Лента чуть снаружи кирпича (~3 см), не «парит» в 8 см от стены.
      const standOff = proud >= 0.1 ? 0.032 : 0;
      if (sign < 0) return [outer - standOff - depth, outer - standOff];
      return [outer + standOff, outer + standOff + depth];
    }
    const extra = sign * proud;
    return [
      (sign < 0 ? outer - t : outer - inset) + extra,
      (sign < 0 ? outer + inset : outer + t) + extra,
    ];
  }
  const face = {
    name: o.name,
    openings: o.openings,
    span0: o.span0,
    span1: o.span1,
    eave: o.eave,
    gable,
    win: null,
    place(a, b, z0, z1, color, proud = 0) {
      if (o.gableOnly) {
        const cut = o.eave;
        const lo = Math.min(z0, z1);
        const hi = Math.max(z0, z1);
        if (hi <= cut + 0.012) return;
        z0 = Math.max(lo, cut);
        z1 = hi;
      }
      let za = Math.min(z0, z1);
      const zb = Math.max(z0, z1);
      if (za < PLINTH_Z) za = PLINTH_Z;
      if (Math.abs(b - a) < 0.012 || zb - za < 0.015) return;
      const [n0, n1] = faceNorm(proud);
      const u0 = Math.min(a, b);
      const u1 = Math.max(a, b);
      const parts = this.win ? rectsOutside(u0, u1, za, zb, this.win) : [[u0, u1, za, zb]];
      for (const [s0, s1, c0, c1] of parts) {
        if (s1 - s0 < 0.012 || c1 - c0 < 0.015) continue;
        if (alongX) api.rect(s0, Math.min(n0, n1), s1, Math.max(n0, n1), c0, c1, color);
        else api.rect(Math.min(n0, n1), s0, Math.max(n0, n1), s1, c0, c1, color);
      }
    },
    /** Лента с разной высотой на концах (параллелограмм по скату фронтона). */
    placeSlope(a, b, zBotA, zTopA, zBotB, zTopB, color, proud = 0) {
      let u0 = a;
      let u1 = b;
      let zb0 = zBotA;
      let zt0 = zTopA;
      let zb1 = zBotB;
      let zt1 = zTopB;
      if (u1 < u0) {
        u0 = b;
        u1 = a;
        zb0 = zBotB;
        zt0 = zTopB;
        zb1 = zBotA;
        zt1 = zTopA;
      }
      if (u1 - u0 < 0.012) return;
      if (o.gableOnly) {
        const cut = o.eave;
        if (Math.max(zt0, zt1) <= cut + 0.012) return;
        zb0 = Math.max(zb0, cut);
        zb1 = Math.max(zb1, cut);
      }
      zb0 = Math.max(zb0, PLINTH_Z);
      zb1 = Math.max(zb1, PLINTH_Z);
      if (zt0 - zb0 < 0.015 && zt1 - zb1 < 0.015) return;
      const win = this.win;
      if (win && u1 > win.u0 + 0.01 && u0 < win.u1 - 0.01) {
        const span = Math.max(1e-6, u1 - u0);
        const at = (u) => {
          const t = (u - u0) / span;
          return { zb: zb0 + (zb1 - zb0) * t, zt: zt0 + (zt1 - zt0) * t };
        };
        const paint = (ua, ub, b0, t0, b1, t1) => {
          if (ub - ua < 0.012) return;
          if (Math.max(t0, t1) <= Math.min(b0, b1) + 0.015) return;
          this.placeSlope(ua, ub, b0, t0, b1, t1, color, proud);
        };
        this.win = null;
        try {
          if (u0 < win.u0) {
            const L = at(u0);
            const R = at(Math.min(u1, win.u0));
            paint(u0, Math.min(u1, win.u0), L.zb, L.zt, R.zb, R.zt);
          }
          if (u1 > win.u1) {
            const L = at(Math.max(u0, win.u1));
            const R = at(u1);
            paint(Math.max(u0, win.u1), u1, L.zb, L.zt, R.zb, R.zt);
          }
          const mid0 = Math.max(u0, win.u0);
          const mid1 = Math.min(u1, win.u1);
          if (mid1 > mid0 + 0.012) {
            const n = Math.max(1, Math.ceil((mid1 - mid0) / 0.18));
            for (let i = 0; i < n; i++) {
              const s0 = mid0 + ((mid1 - mid0) * i) / n;
              const s1 = mid0 + ((mid1 - mid0) * (i + 1)) / n;
              const L = at(s0);
              const R = at(s1);
              const zCut0 = win.zTop(s0);
              const zCut1 = win.zTop(s1);
              paint(s0, s1, L.zb, Math.min(L.zt, win.zBase), R.zb, Math.min(R.zt, win.zBase));
              paint(s0, s1, Math.max(L.zb, zCut0), L.zt, Math.max(R.zb, zCut1), R.zt);
            }
          }
        } finally {
          this.win = win;
        }
        return;
      }
      const [n0, n1] = faceNorm(proud);
      // Один mesh на панель (не 12 отдельных tri) — меньше нагрузка на WebGL.
      const tris = [];
      const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) => {
        tris.push([ax, ay, az, bx, by, bz, cx, cy, cz], [ax, ay, az, cx, cy, cz, dx, dy, dz]);
      };
      if (alongX) {
        quad(u0, n0, zb0, u1, n0, zb1, u1, n0, zt1, u0, n0, zt0);
        quad(u0, n1, zb0, u0, n1, zt0, u1, n1, zt1, u1, n1, zb1);
        quad(u0, n0, zt0, u1, n0, zt1, u1, n1, zt1, u0, n1, zt0);
        quad(u0, n0, zb0, u0, n1, zb0, u1, n1, zb1, u1, n0, zb1);
        quad(u0, n0, zb0, u0, n0, zt0, u0, n1, zt0, u0, n1, zb0);
        quad(u1, n0, zb1, u1, n1, zb1, u1, n1, zt1, u1, n0, zt1);
      } else {
        quad(n0, u0, zb0, n0, u1, zb1, n0, u1, zt1, n0, u0, zt0);
        quad(n1, u0, zb0, n1, u0, zt0, n1, u1, zt1, n1, u1, zb1);
        quad(n0, u0, zt0, n0, u1, zt1, n1, u1, zt1, n1, u0, zt0);
        quad(n0, u0, zb0, n1, u0, zb0, n1, u1, zb1, n0, u1, zb1);
        quad(n0, u0, zb0, n0, u0, zt0, n1, u0, zt0, n1, u0, zb0);
        quad(n0, u1, zb1, n1, u1, zb1, n1, u1, zt1, n0, u1, zt1);
      }
      if (typeof api.tris === "function") api.tris(tris, color);
      else for (const t of tris) api.tri(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], color);
    },
    beam(a, z0, b, z1, size, color, proud = 0) {
      if (o.gableOnly && Math.max(z0, z1) <= o.eave) return;
      const n = nBeam + sign * proud;
      if (alongX) api.beam(a, n, z0, b, n, z1, size, color);
      else api.beam(n, a, z0, n, b, z1, size, color);
    },
    tri(color) {
      face.roofFill(color);
    },
    roofFill(color) {
      if (!gable) return;
      const drop = gable.drop ?? 0.45;
      const over = gable.over ?? 0.3;
      const rise = gable.peakZ - gable.eave;
      if (rise < 0.15) return;
      const half = (gable.u1 - gable.u0) / 2 + over;
      const dist = half * Math.max(0.02, (rise - drop) / rise);
      const zPeak = gable.peakZ - drop;
      const p0 = gable.peakU + dist;
      const p1 = gable.peakU;
      const p2 = gable.peakU - dist;
      if (alongX) api.tri(p0, outN, gable.eave, p1, outN, zPeak, p2, outN, gable.eave, color);
      else api.tri(outN, p0, gable.eave, outN, p1, zPeak, outN, p2, gable.eave, color);
    },
  };
  face.win = normalizeGableWin(face);
  return face;
}

export function paintFacadeFaces(api, faces) {
  const root = new THREE.Group();
  root.name = "facade-overlays";

  function draw(id, fn) {
    const g = new THREE.Group();
    g.name = "facade-overlay-" + id;
    g.userData.facadeOverlay = id;
    g.visible = false;
    root.add(g);
    api.begin(g);
    fn();
  }

  // Юбка до реального подоконника фасада (не фиксированные 1,10 м).
  draw("1", () => each(faces, (f) => skirtBand(f, STONE, FLUSH)));
  draw("9", () => each(faces, (f) => skirtBand(f, BRICK, FLUSH)));
  draw("19", () => each(faces, (f) => {
    skirtBand(f, STONE, FLUSH);
    const sill = sillOf(f);
    if (sill == null) return;
    f.place(f.span0, f.span1, sill - 0.02, sill + 0.06, BLADE, 0.014);
  }));
  draw("2", () => each(faces, (f) => {
    quoins(f, BRICK);
    for (const op of faceOpenings(f)) surround(f, op, BRICK, 0.16);
  }));
  draw("3", () => each(faces, (f) => {
    quoins(f, BRICK_DARK, 0.46);
    for (const op of faceOpenings(f)) surround(f, op, BRICK_DARK, 0.12);
  }));
  draw("4", () => each(faces, (f) => {
    if (f.gable) {
      paintZone(f, f.gable.u0, f.gable.u1, STONE);
      fillAbove(f, f.gable.u0, f.gable.u1, f.eave, STONE);
      f.roofFill(STONE);
    }
    for (const [a, b] of wings(f)) {
      for (let z = 0.22; z < f.eave - 0.08; z += 0.2) {
        for (const pier of piers(f)) {
          const pa = Math.max(pier.a, a);
          const pb = Math.min(pier.b, b);
          if (pb - pa > 0.08) f.place(pa, pb, z, z + 0.028, SIDING, 0.012);
        }
        for (const op of f.openings) {
          if (z + 0.02 > op.z0 && z < op.z1) continue;
          const pa = Math.max(op.u0, a);
          const pb = Math.min(op.u1, b);
          if (pb - pa > 0.08) f.place(pa, pb, z, z + 0.028, SIDING, 0.012);
        }
      }
    }
  }));
  draw("5", () => each(faces, (f) => {
    for (const op of f.openings) {
      placeToRoof(f, op.u0 - 0.04, op.u0, 0.12, JOINT);
      placeToRoof(f, op.u1, op.u1 + 0.04, 0.12, JOINT);
    }
    const levels = [];
    for (const op of f.openings) {
      if (op.z0 > 0.25) levels.push(op.z0);
      // Горизонтальный шов только у прямоугольных проёмов — у трапеции верх косой.
      const { z1L, z1R } = slantHeads(f, op);
      if (Math.abs(z1L - z1R) > 0.02) continue;
      if (op.z1 < f.eave - 0.08) levels.push(op.z1);
    }
    for (const z of levels) {
      for (const pier of piers(f)) f.place(pier.a, pier.b, z - 0.02, z + 0.02, JOINT);
    }
  }));
  draw("7", () => each(faces, (f) => {
    quoins(f, STONE, 0.36);
    for (const op of f.openings) shutter(f, op, SHUTTER_P);
  }));
  // Прерии / Райт: тёмный кирпич цоколя и обводов + горизонтальные пояса.
  draw("8", () => each(faces, (f) => {
    const sill = sillOf(f);
    const plinthTop = sill != null ? Math.min(sill - 0.04, 1.05) : 0.95;
    for (const pier of piers(f)) {
      if (pier.b - pier.a > 0.05) f.place(pier.a, pier.b, PLINTH_Z, plinthTop, BRICK_WRIGHT, FLUSH);
    }
    for (const op of f.openings) {
      if (op.z0 > PLINTH_Z) f.place(op.u0, op.u1, PLINTH_Z, Math.min(op.z0 - 0.02, plinthTop), BRICK_WRIGHT, FLUSH);
    }
    for (const op of faceOpenings(f)) surround(f, op, BRICK_WRIGHT, 0.1);
    f.place(f.span0, f.span1, f.eave - 0.16, f.eave - 0.03, BELT, 0.012);
    // Пояс по прямоугольным головам; трапеции второго света не тянут пояс вверх.
    const beltHeads = f.openings.filter((op) => {
      if (op.kind === "door") return false;
      const { z1L, z1R } = slantHeads(f, op);
      return Math.abs(z1L - z1R) <= 0.02;
    }).map((op) => op.z1);
    const beltHead = beltHeads.length ? Math.max(...beltHeads) : f.eave - 0.5;
    if (beltHead + 0.22 < f.eave) f.place(f.span0, f.span1, beltHead + 0.04, beltHead + 0.18, BELT, 0.012);
    for (const pier of piers(f)) f.place(pier.a, pier.b, plinthTop - 0.02, plinthTop + 0.12, BELT, 0.012);
    if (f.gable) {
      const rise = f.gable.peakZ - f.gable.eave;
      for (let i = 1; i <= 3; i++) {
        const z = f.gable.eave + (rise * i) / 4;
        const [s0, s1] = slopeSpan(f.gable, z + 0.12);
        if (s1 - s0 > 0.5) f.place(s0 + 0.08, s1 - 0.08, z, z + 0.12, BELT, 0.012);
      }
    }
  }));
  draw("10", () => each(faces, (f) => {
    if (!f.gable) return;
    paintZone(f, f.gable.u0 - 0.12, f.gable.u1 + 0.12, DARK);
    fillAbove(f, f.gable.u0, f.gable.u1, f.eave, DARK);
    f.roofFill(DARK);
  }));
  draw("11", () => each(faces, (f) => {
    if (!f.gable) return;
    const w = 0.28;
    placeToRoof(f, f.gable.u0 - w * 0.5, f.gable.u0 + w * 0.5, PLINTH_Z, BLADE, FLUSH);
    placeToRoof(f, f.gable.u1 - w * 0.5, f.gable.u1 + w * 0.5, PLINTH_Z, BLADE, FLUSH);
  }));
  draw("12", () => each(faces, (f) => {
    for (const op of faceOpenings(f)) surround(f, op, SURROUND, 0.22);
  }));
  draw("13", () => each(faces, (f) => {
    let spans = wings(f);
    const g = f.gable;
    if (g && g.u0 <= f.span0 + 0.08 && g.u1 >= f.span1 - 0.08) spans = [[f.span0, f.span1]];
    for (const [a, b] of spans) boardsIn(f, a, b, BOARD);
  }));
  // Сканди-модерн: дерево как roof-d (полосы + woodBoards), высота — до голов обычных окон.
  draw("nordic", () => {
    const zBot = PLINTH_Z;
    const proud = FLUSH;
    const heads = [];
    for (const f of faces) {
      for (const op of sorted(f)) {
        if (op.inner || op.kind === "door") continue;
        // Обычные окна: без второго света (высокий z1 у панорам гостиной).
        if (Number.isFinite(op.z1) && op.z1 < 2.85) heads.push(op.z1);
      }
    }
    const zWood = heads.length ? Math.max(...heads) + 0.01 : 2.35;
    each(faces, (f) => {
      const zTop = Math.min(zWood, f.eave - 0.28);
      const name = String(f.name || "");
      // Сдвиг фазы: юг/восток — дерево с первого простенка; север/запад — со второго.
      let wood = !(
        name.includes("N") || name.includes("W") || name === "N" || name === "W"
      );
      if (name.includes("Court") || name.includes("Liv")) wood = !wood;
      const list = piers(f);
      list.forEach((pier, i) => {
        const atEnd = i === 0 || i === list.length - 1;
        // Углы всегда в дереве с обеих сторон — ровный стык в углу стены.
        const useWood = atEnd ? true : wood;
        const w = pier.b - pier.a;
        if (useWood && w >= 0.4) {
          // У торца фасада — ровно span0/span1; у проёмов чуть отступ.
          let a = atEnd && i === 0 ? f.span0 : pier.a + 0.01;
          let b = atEnd && i === list.length - 1 ? f.span1 : pier.b - 0.01;
          if (!atEnd && w > 2.4) {
            const bay = Math.min(1.55, Math.max(0.9, w * 0.38));
            b = Math.min(b, a + bay);
          }
          if (b - a >= 0.35) cladBand(f, a, b, zBot, zTop, WOOD_OAK, proud);
        }
        wood = !wood;
      });
    });
  });
  // Райт · штукатурка (фото): кремовое поле, тёмный кирпичный пояс, светлый выступающий кант по верху пояса,
  // кирпичные углы и бока окон, светлые подоконник/перемычка (в т.ч. под чердаком / 2-м светом).
  draw("wright-plaster", () => each(faces, (f) => {
    const sill = sillOf(f);
    const zTop = sill != null ? Math.min(sill, 1.15) : 1.05;
    const bandDrop = 0.36;
    // Белая лента чуть снаружи кирпича, без «парения» (proud < 0.1 → без standOff).
    const bandProud = 0.055;
    const qw = 0.48;
    const ops = sorted(f);
    const first = ops[0];
    const last = ops[ops.length - 1];
    const qL = first ? Math.min(qw, Math.max(0.1, first.u0 - f.span0 - 0.04)) : qw;
    const qR = last ? Math.min(qw, Math.max(0.1, f.span1 - last.u1 - 0.04)) : qw;
    // Пояс без углов — иначе двойной кирпич на лопатках z-fight («угол разъезжается»).
    const mid0 = f.span0 + qL;
    const mid1 = f.span1 - qR;
    if (mid1 - mid0 > 0.08) punched(f, mid0, mid1, PLINTH_Z, zTop, BRICK_WRIGHT, FLUSH);
    quoins(f, BRICK_WRIGHT, qw, { bandDrop, proud: FLUSH });
    for (const op of faceOpenings(f)) surround(f, op, BRICK_WRIGHT, 0.11);
    punched(f, f.span0, f.span1, zTop - 0.03, zTop + 0.11, WRIGHT_BAND, bandProud);
    // Подоконники у всех проёмов, включая фронтонные — только на ширину окна (+обвод).
    for (const op of faceOpenings(f)) {
      if (op.kind === "door" || op.z0 < 0.35) continue;
      const { left, right } = sideRoom(f, op, 0.11);
      f.place(op.u0 - left, op.u1 + right, op.z0 - 0.12, op.z0 - 0.01, WRIGHT_BAND, bandProud);
    }
    // Перемычки: и плоские, и косые у фронтонных / 2-го света.
    for (const op of faceOpenings(f)) {
      if (op.kind === "door") continue;
      const { z1L, z1R } = slantHeads(f, op);
      const { left, right } = sideRoom(f, op, 0.11);
      const a = op.u0 - left;
      const b = op.u1 + right;
      if (Math.abs(z1L - z1R) > 0.02 && typeof f.placeSlope === "function") {
        f.placeSlope(a, b, z1L, z1L + 0.12, z1R, z1R + 0.12, WRIGHT_BAND, bandProud);
      } else {
        f.place(a, b, z1L, z1L + 0.12, WRIGHT_BAND, bandProud);
      }
    }
    underRoofBand(f, bandDrop, WRIGHT_BAND, bandProud);
  }));
  draw("wright-warm", () => each(faces, (f) => {
    const sill = sillOf(f);
    const beltLo = sill != null ? Math.max(0.85, sill - 0.04) : 1.0;
    const bandProud = 0.055;
    punched(f, f.span0, f.span1, beltLo, beltLo + 0.14, WRIGHT_BAND, bandProud);
    const gop = gableWinAsOp(f);
    if (gop) {
      f.place(gop.u0 - 0.08, gop.u1 + 0.08, gop.z0 - 0.12, gop.z0 - 0.01, WRIGHT_BAND, bandProud);
    }
    underRoofBand(f, 0.36, WRIGHT_BAND, bandProud);
  }));
  // Европейский: штукатурка сверху, клинкер до подоконника (как на фото euro-*).
  draw("euro", () => each(faces, (f) => skirtBand(f, BRICK_WRIGHT, FLUSH)));
  draw("euro-sand", () => each(faces, (f) => skirtBand(f, BRICK_SAND, FLUSH)));
  // Прованс · камень: каменные углы/обводы + ставни (как на фото).
  draw("provence-stone", () => each(faces, (f) => {
    quoins(f, STONE, 0.36);
    for (const op of faceOpenings(f)) surround(f, op, STONE, 0.12);
    for (const op of f.openings) shutter(f, op, SHUTTER_P);
  }));
  draw("14", () => each(faces, (f) => {
    timberPosts(f, BRICK, PLINTH_Z, f.eave, 0.22, true);
  }));
  // Баварский: кирпичные обводы (трапеция второго света) + подоконник «на ребро».
  draw("15", () => each(faces, (f) => {
    for (const op of faceOpenings(f)) {
      surround(f, op, BRICK, 0.14);
      if (op.kind === "door" || op.z0 < 0.35) continue;
      const { left, right } = sideRoom(f, op, 0.06);
      f.place(op.u0 - left, op.u1 + right, op.z0 - 0.08, op.z0 - 0.01, BRICK, 0.018);
    }
  }));
  draw("16", () => each(faces, (f) => {
    quoins(f, STONE, 0.38);
    for (const op of f.openings) shutter(f, op, SHUTTER_T);
  }));
  draw("18", () => each(faces, (f) => {
    const boxes = f.name === "S"
      ? [[14.595, 17.845], [3.265, 5.715], [-1.073, 2.177]]
      : f.openings.filter((op) => op.kind !== "door" && op.z0 > 0.4).map((op) => {
        const { left, right } = sideRoom(f, op, 0.55);
        return [op.u0 - left, op.u1 + right, op];
      });
    for (const box of boxes) {
      const u0 = box[0];
      const u1 = box[1];
      const hole = box[2] || f.openings.find((op) => (op.u0 + op.u1) / 2 > u0 && (op.u0 + op.u1) / 2 < u1 && op.kind !== "door");
      const z0 = hole ? Math.max(0.4, hole.z0 - 0.22) : 0.9;
      const z1 = hole ? Math.min(f.eave - 0.08, hole.z1 + 1.05) : f.eave - 0.2;
      const shade = (a, b, c, d, color, proud) => {
        if (!hole) {
          f.place(a, b, c, d, color, proud);
          return;
        }
        const hu0 = Math.max(hole.u0, a);
        const hu1 = Math.min(hole.u1, b);
        const hz0 = Math.max(hole.z0, c);
        const hz1 = Math.min(hole.z1, d);
        if (hu1 - hu0 < 0.02 || hz1 - hz0 < 0.02) {
          f.place(a, b, c, d, color, proud);
          return;
        }
        if (hz0 - c > 0.02) f.place(a, b, c, hz0, color, proud);
        if (d - hz1 > 0.02) f.place(a, b, hz1, d, color, proud);
        if (hu0 - a > 0.02) f.place(a, hu0, hz0, hz1, color, proud);
        if (b - hu1 > 0.02) f.place(hu1, b, hz0, hz1, color, proud);
      };
      shade(u0, u1, z0, z1, PANEL, 0);
      const edge = 0.05;
      shade(u0, u1, z1 - edge, z1, PANEL_EDGE, 0.012);
      shade(u0, u1, z0, z0 + edge, PANEL_EDGE, 0.012);
      shade(u0, u0 + edge, z0, z1, PANEL_EDGE, 0.012);
      shade(u1 - edge, u1, z0, z1, PANEL_EDGE, 0.012);
    }
  }));
  draw("20", () => each(faces, (f) => {
    timberPosts(f, BATTEN, 0.2, f.eave - 0.08, 0.08, true);
    f.place(f.span0, f.span1, 2.42, 2.54, BATTEN, 0.01);
    f.place(f.span0, f.span1, f.eave - 0.2, f.eave - 0.08, BATTEN, 0.01);
    for (const op of f.openings) {
      if (op.z0 > 0.35) f.place(op.u0, op.u1, op.z0 - 0.12, op.z0 - 0.02, BATTEN, 0.01);
    }
  }));
  draw("21", () => each(faces, (f) => {
    quoins(f, STONE, 0.36);
    for (const op of f.openings) shutter(f, op, SHUTTER_M);
  }));
  draw("22", () => each(faces, (f) => {
    fachwerkPosts(f, BEAM, POSTS_22, false);
    fachwerkRails(f, BEAM, false);
    fachwerkCrosses(f, BEAM);
    fachwerkGable(f, BEAM, false);
  }));
  draw("23", () => each(faces, (f) => {
    fachwerkPosts(f, BEAM, POSTS_22, false);
    fachwerkRails(f, BEAM, false);
    fachwerkCrosses(f, BEAM);
    fachwerkGable(f, BEAM, false);
  }));
  draw("24", () => each(faces, (f) => {
    for (const op of faceOpenings(f)) surround(f, op, INK, 0.08);
    for (const [a, b] of wings(f)) {
      const step = 0.72;
      for (let u = a + 0.08; u < b - 0.3; u += step) {
        const u2 = Math.min(u + step, b - 0.04);
        const mid = (u + u2) / 2;
        f.beam(u, f.eave - 0.08, mid, f.eave - 0.62, 0.055, INK);
        f.beam(mid, f.eave - 0.62, u2, f.eave - 0.08, 0.055, INK);
      }
    }
    const g = f.gable;
    if (!g) return;
    for (let i = 0; i <= 6; i++) {
      const u = g.u0 + ((g.u1 - g.u0) * i) / 6;
      f.beam(g.peakU, g.peakZ, u, g.eave, 0.05, INK, 0.04);
    }
  }));
  draw("27", () => each(faces, (f) => {
    for (const [a, b] of wings(f)) {
      for (const dz of [0.22, 0.4, 0.58, 0.76]) {
        const z = f.eave - dz;
        if (z > 2.35) f.place(a, b, z, z + 0.07, LOUVER);
      }
    }
    const g = f.gable;
    if (!g) return;
    for (let i = 1; i <= 4; i++) {
      const z = g.eave + ((g.peakZ - g.eave) * i) / 5;
      const tRise = (g.peakZ - z) / (g.peakZ - g.eave);
      const left = g.peakU - (g.peakU - g.u0) * tRise;
      const right = g.peakU + (g.u1 - g.peakU) * tRise;
      f.place(left + 0.08, right - 0.08, z, z + 0.07, LOUVER);
    }
  }));
  draw("28", () => each(faces, (f) => {
    for (const pier of piers(f)) {
      if (pier.b - pier.a < 0.55) continue;
      for (let u = pier.a + 0.08; u < pier.b - 0.08; u += 0.15) {
        f.place(u, u + 0.045, PLINTH_Z, f.eave, SLAT, FLUSH);
      }
    }
    const g = f.gable;
    if (!g) return;
    for (let u = g.u0 + 0.25; u < g.u1 - 0.2; u += 0.16) {
      const top = gableTop(g, u + 0.03) - 0.06;
      if (top > f.eave + 0.25) f.place(u, u + 0.045, f.eave, top, SLAT);
    }
  }));
  // Рендер roof-d: тёмные/дерево до софита; окна чердака / 2-го света вырезаются (place + placeSlope).
  draw("30", () => each(faces, (f) => {
    const zBot = PLINTH_Z;
    const PAD = 0.10;
    const ON_WALL = 0.035;
    // Ровно до span0/span1 — угол стены без щели и без вылета за соседнюю грань.
    const paint = (u0, u1, color) => {
      const a = Math.max(u0, f.span0);
      const b = Math.min(u1, f.span1);
      if (b - a > 0.12) cladToRoof(f, a, b, zBot, color, ON_WALL);
    };
    const ops = sorted(f).filter((op) => !op.inner);
    let porch0 = null;
    let porch1 = null;
    if (f.name === "v31dN" || f.name === "v31cN") {
      const door = ops.find((op) => op.kind === "door" && op.u0 > 3.2 && op.u1 < 5.5);
      const wins = ops.filter((op) => op.kind === "win" || op.kind === "pan");
      const left = door && wins.filter((w) => w.u1 <= door.u0 + 0.05).sort((a, b) => b.u1 - a.u1)[0];
      const right = door && wins.filter((w) => w.u0 >= door.u1 - 0.05).sort((a, b) => a.u0 - b.u0)[0];
      if (door && left && right && right.u0 - left.u1 > 0.4) {
        porch0 = left.u1 + 0.02;
        porch1 = right.u0 - 0.02;
      }
    }
    const cutPorch = (u0, u1) => {
      if (porch0 == null || u1 <= porch0 + 0.04 || u0 >= porch1 - 0.04) return [[u0, u1]];
      const out = [];
      if (u0 < porch0 - 0.02) out.push([u0, porch0]);
      if (u1 > porch1 + 0.02) out.push([porch1, u1]);
      return out.filter(([a, b]) => b - a > 0.08);
    };
    const darkRaw = [];
    for (const op of ops) {
      const u0 = Math.max(f.span0, op.u0 - PAD);
      const u1 = Math.min(f.span1, op.u1 + PAD);
      if (u1 - u0 < 0.12) continue;
      for (const [a, b] of cutPorch(u0, u1)) darkRaw.push({ u0: a, u1: b });
    }
    // Слить пересекающиеся PAD — одна панель на группу окон, без двойных швов.
    const bays = [];
    for (const bay of darkRaw.slice().sort((a, b) => a.u0 - b.u0)) {
      const last = bays[bays.length - 1];
      if (last && bay.u0 <= last.u1 + 0.04) last.u1 = Math.max(last.u1, bay.u1);
      else bays.push({ u0: bay.u0, u1: bay.u1 });
    }
    for (const bay of bays) paint(bay.u0, bay.u1, DARK_CLAD);
    const solid = [];
    let cursor = f.span0;
    for (const bay of bays) {
      if (bay.u0 > cursor + 0.06) solid.push([cursor, bay.u0]);
      cursor = Math.max(cursor, bay.u1);
    }
    if (f.span1 > cursor + 0.06) solid.push([cursor, f.span1]);
    let wood = false;
    for (let i = 0; i < solid.length; i++) {
      const [a0, b0] = solid[i];
      const atEnd = i === 0 || i === solid.length - 1;
      if (atEnd || wood) {
        for (const [a, b] of cutPorch(a0, b0)) {
          if (b - a <= 0.35) continue;
          // Угол стены — ровно до a0/b0; к соседней тёмной панели — 1 см шов.
          const u0 = i === 0 ? a0 : a + 0.01;
          const u1 = i === solid.length - 1 ? b0 : b - 0.01;
          if (u1 - u0 > 0.12) paint(u0, u1, WOOD_OAK);
        }
      }
      wood = !wood;
    }
    // Крыльцо: дерево до софита (дверь и окно чердака вырезаются).
    if (porch0 != null && porch1 - porch0 > 0.4) {
      paint(porch0, porch1, WOOD_OAK);
    }
  }));
  draw("25", () => each(faces, (f) => {
    if (f.name !== "S") return;
    const planes = [
      [-1.63, -0.57, 0.91, 3.83, 0xd23a2e],
      [1.74, 2.98, 0.93, 2.57, 0xe0b01a],
      [3.34, 5.83, 1.29, 3.83, 0x1e4e9e],
      [12.2, 14.04, 2.79, 3.83, 0xe0b01a],
      [14.39, 18.05, 2.77, 3.83, 0xd23a2e],
    ];
    for (const [a, b, z0, z1, color] of planes) punched(f, a, b, z0, z1, color, 0.01);
  }));
  draw("29", () => each(faces, (f) => cassettes(f)));

  return root;
}

export function buildFacadeOverlays(api, house) {
  const prev = PLINTH_Z;
  // Вариант A: z от пола над цоколем → панели с 0, иначе щель над цоколем.
  if (Number.isFinite(house?.plinthZ)) PLINTH_Z = house.plinthZ;
  try {
    return paintFacadeFaces(api, makeFaces(api, house));
  } finally {
    PLINTH_Z = prev;
  }
}

export const OVERLAY_FIELD = {
  1: PLASTER,
  2: PLASTER,
  3: 0xf3efe6,
  4: 0xe4e0d8,
  5: 0xd5d6d2,
  7: 0xf4e6d4,
  8: 0xf3efe6,
  9: PLASTER,
  10: 0xe6e2da,
  11: 0xefe8dc,
  13: 0xe4e7ea,
  14: 0xe7e2d8,
  15: 0xf3efe6,
  16: 0xd2b48c,
  18: 0xe4e6e2,
  19: 0xf4f1ea,
  20: 0xf7f5f0,
  21: 0xf0e2cc,
  22: 0xf4e7d4,
  24: 0xf6f1e6,
  27: 0xf3f0e8,
  25: 0xf7f4ef,
  28: 0xf6f3ec,
  29: 0x2a2f33,
};
