import * as THREE from "three";

const PLASTER = 0xe7e1d6;
const BRICK = 0x8d4b3c;
const BRICK_DARK = 0x4a342c;
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
const CORTEN = 0x8c4e32;
const CASS_A = 0xe6e2da;
const CASS_B = 0xb3aea4;
const SURROUND = 0xc4b49a;
const BELT = 0x8a8175;
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

function quoins(face, color, w = 0.4) {
  const ops = sorted(face);
  const first = ops[0];
  const last = ops[ops.length - 1];
  const left = first ? Math.min(w, Math.max(0.1, first.u0 - face.span0 - 0.04)) : w;
  const right = last ? Math.min(w, Math.max(0.1, face.span1 - last.u1 - 0.04)) : w;
  face.place(face.span0, face.span0 + left, 0.04, face.eave, color);
  face.place(face.span1 - right, face.span1, 0.04, face.eave, color);
}

function surround(face, op, color, band = 0.15) {
  const { left, right } = sideRoom(face, op, band);
  const z1 = op.z1 + 0.02;
  const top = 0.12;
  if (left > 0.025) face.place(op.u0 - left, op.u0 - 0.01, op.kind === "door" ? 0.02 : op.z0 - 0.1, z1 + top, color, 0.012);
  if (right > 0.025) face.place(op.u1 + 0.01, op.u1 + right, op.kind === "door" ? 0.02 : op.z0 - 0.1, z1 + top, color, 0.012);
  const a = op.u0 - left;
  const b = op.u1 + right;
  face.place(a, b, z1, z1 + top, color, 0.012);
  if (op.kind !== "door" && op.z0 > 0.12) face.place(a, b, op.z0 - 0.12, op.z0 - 0.01, color, 0.012);
}

function shutter(face, op, color) {
  if (op.kind === "door" || op.z0 < 0.45) return;
  const { left, right } = sideRoom(face, op, 0.2);
  if (left > 0.08) face.place(op.u0 - left, op.u0 - 0.03, op.z0, op.z1, color, 0.02);
  if (right > 0.08) face.place(op.u1 + 0.03, op.u1 + right, op.z0, op.z1, color, 0.02);
}

function slopeSpan(g, z) {
  const rise = g.peakZ - g.eave;
  if (rise < 0.05 || z <= g.eave) return [g.u0, g.u1];
  if (z >= g.peakZ) return [g.peakU, g.peakU];
  const t = (z - g.eave) / rise;
  return [g.u0 + (g.peakU - g.u0) * t, g.u1 - (g.u1 - g.peakU) * t];
}

function fillAbove(face, a, b, zFrom, color, proud = 0) {
  const g = face.gable;
  if (!g) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const peak = g.peakZ - 0.05;
  if (peak <= zFrom + 0.03) return;
  for (let z = zFrom; z < peak; z += 0.14) {
    const z1 = Math.min(z + 0.14, peak);
    const [s0, s1] = slopeSpan(g, z1);
    const ca = Math.max(lo, s0);
    const cb = Math.min(hi, s1);
    if (cb - ca > 0.02) face.place(ca, cb, z, z1, color, proud);
  }
}

function placeToRoof(face, a, b, z0, color, proud = 0) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (face.eave - z0 > 0.02) face.place(lo, hi, z0, face.eave, color, proud);
  fillAbove(face, lo, hi, face.eave, color, proud);
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
    for (const [a, b] of southPosts) placeBand(face, a, b, 0.16, face.eave, color, 0.01);
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
    placeBand(face, a, b, 0.16, face.eave, color, 0.01);
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

function paintZone(face, u0, u1, color, proud = 0) {
  for (const pier of piers(face)) {
    const a = Math.max(pier.a, u0);
    const b = Math.min(pier.b, u1);
    if (b - a > 0.015) face.place(a, b, 0.02, face.eave, color, proud);
  }
  for (const op of face.openings) {
    const a = Math.max(op.u0, u0);
    const b = Math.min(op.u1, u1);
    if (b - a < 0.04) continue;
    if (op.z0 > 0.08) face.place(a, b, 0.02, op.z0 - 0.02, color, proud);
    if (face.eave > op.z1 + 0.05) face.place(a, b, op.z1 + 0.02, face.eave, color, proud);
  }
}

function boardsIn(face, u0, u1, color) {
  for (let u = u0 + 0.08; u < u1 - 0.04; u += 0.32) {
    const hits = face.openings.filter((op) => u > op.u0 + 0.02 && u < op.u1 - 0.02);
    let z = 0.16;
    const ordered = hits.slice().sort((a, b) => a.z0 - b.z0);
    for (const op of ordered) {
      if (op.z0 - 0.02 > z + 0.05) face.place(u, u + 0.018, z, op.z0 - 0.02, color);
      z = Math.max(z, op.z1 + 0.02);
    }
    if (face.eave - 0.06 > z + 0.05) face.place(u, u + 0.018, z, face.eave - 0.06, color);
  }
}

function each(faces, fn) {
  for (const face of faces) fn(face);
}

function makeFaces(api, house) {
  const t = 0.07;
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
  const v0 = sign < 0 ? vOuter - t : vOuter - 0.01;
  const v1 = sign < 0 ? vOuter + 0.01 : vOuter + t;
  const vBeam = sign < 0 ? vOuter - t * 0.45 : vOuter + t * 0.45;
  return {
    name, openings, span0, span1, eave, gable, win: null,
    place(a, b, z0, z1, color, proud = 0) {
      const u0 = Math.min(a, b);
      const u1 = Math.max(a, b);
      const za = Math.min(z0, z1);
      const zb = Math.max(z0, z1);
      const parts = this.win ? rectsOutside(u0, u1, za, zb, this.win) : [[u0, u1, za, zb]];
      const extra = sign * proud;
      for (const [s0, s1, c0, c1] of parts) {
        if (s1 - s0 < 0.02 || c1 - c0 < 0.015) continue;
        api.rect(s0, v0 + extra, s1, v1 + extra, c0, c1, color);
      }
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
  const u0 = sign < 0 ? uOuter - t : uOuter - 0.01;
  const u1 = sign < 0 ? uOuter + 0.01 : uOuter + t;
  const uBeam = sign < 0 ? uOuter - t * 0.45 : uOuter + t * 0.45;
  return {
    name, openings, span0, span1, eave, gable: null,
    place(a, b, z0, z1, color, proud = 0) {
      if (b - a < 0.02 || z1 - z0 < 0.015) return;
      const extra = sign * proud;
      api.rect(u0 + extra, Math.min(a, b), u1 + extra, Math.max(a, b), Math.min(z0, z1), Math.max(z0, z1), color);
    },
    beam(a, z0, b, z1, size, color, proud = 0) {
      const u = uBeam + sign * proud;
      api.beam(u, a, z0, u, b, z1, size, color);
    },
    tri() {},
  };
}

export function wallFace(api, o) {
  const t = o.thick ?? 0.065;
  const sign = o.sign;
  const outer = o.outer;
  const alongX = o.along !== "y";
  const gable = o.gable ?? null;
  const nBeam = sign < 0 ? outer - t * 0.45 : outer + t * 0.45;
  const outN = sign < 0 ? outer - t - 0.02 : outer + t + 0.02;
  const face = {
    name: o.name,
    openings: o.openings,
    span0: o.span0,
    span1: o.span1,
    eave: o.eave,
    gable,
    place(a, b, z0, z1, color, proud = 0) {
      if (Math.abs(b - a) < 0.02 || Math.abs(z1 - z0) < 0.015) return;
      const extra = sign * proud;
      const n0 = (sign < 0 ? outer - t : outer - 0.008) + extra;
      const n1 = (sign < 0 ? outer + 0.008 : outer + t) + extra;
      const u0 = Math.min(a, b);
      const u1 = Math.max(a, b);
      const za = Math.min(z0, z1);
      const zb = Math.max(z0, z1);
      if (alongX) api.rect(u0, Math.min(n0, n1), u1, Math.max(n0, n1), za, zb, color);
      else api.rect(Math.min(n0, n1), u0, Math.max(n0, n1), u1, za, zb, color);
    },
    beam(a, z0, b, z1, size, color, proud = 0) {
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

  draw("2", () => each(faces, (f) => {
    quoins(f, BRICK);
    for (const op of f.openings) surround(f, op, BRICK, 0.16);
  }));
  draw("3", () => each(faces, (f) => quoins(f, BRICK_DARK, 0.46)));
  draw("4", () => each(faces, (f) => {
    if (f.gable) {
      paintZone(f, f.gable.u0, f.gable.u1, STONE);
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
  draw("8", () => each(faces, (f) => {
    f.place(f.span0, f.span1, f.eave - 0.16, f.eave - 0.03, BELT);
    const beltHeads = f.openings.filter((op) => op.kind !== "door").map((op) => op.z1);
    const beltHead = beltHeads.length ? Math.max(...beltHeads) : f.eave - 0.5;
    if (beltHead + 0.22 < f.eave) f.place(f.span0, f.span1, beltHead + 0.04, beltHead + 0.18, BELT);
    for (const pier of piers(f)) f.place(pier.a, pier.b, 0.64, 0.78, BELT);
    for (const op of f.openings) {
      if (op.z0 > 0.4) f.place(op.u0, op.u1, op.z0 - 0.14, op.z0 - 0.02, BELT);
    }
    if (f.gable) {
      const rise = f.gable.peakZ - f.gable.eave;
      for (let i = 1; i <= 3; i++) {
        const z = f.gable.eave + (rise * i) / 4;
        const [s0, s1] = slopeSpan(f.gable, z + 0.12);
        if (s1 - s0 > 0.5) f.place(s0 + 0.08, s1 - 0.08, z, z + 0.12, BELT);
      }
    }
  }));
  draw("10", () => each(faces, (f) => {
    if (!f.gable) return;
    paintZone(f, f.gable.u0 - 0.12, f.gable.u1 + 0.12, DARK);
    f.roofFill(DARK);
  }));
  draw("11", () => each(faces, (f) => {
    if (!f.gable) return;
    const w = 0.28;
    placeToRoof(f, f.gable.u0 - w * 0.5, f.gable.u0 + w * 0.5, 0.04, BLADE);
    placeToRoof(f, f.gable.u1 - w * 0.5, f.gable.u1 + w * 0.5, 0.04, BLADE);
  }));
  draw("12", () => each(faces, (f) => {
    for (const op of f.openings) surround(f, op, SURROUND, 0.22);
  }));
  draw("13", () => each(faces, (f) => {
    for (const [a, b] of wings(f)) boardsIn(f, a, b, BOARD);
  }));
  draw("14", () => each(faces, (f) => {
    timberPosts(f, BRICK, 0.04, f.eave, 0.22, true);
  }));
  draw("15", () => each(faces, (f) => {
    for (const op of f.openings) surround(f, op, BRICK, 0.14);
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
    for (const op of f.openings) surround(f, op, INK, 0.08);
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
        f.place(u, u + 0.045, 0.4, f.eave, SLAT);
      }
    }
    const g = f.gable;
    if (!g) return;
    for (let u = g.u0 + 0.25; u < g.u1 - 0.2; u += 0.16) {
      const top = gableTop(g, u + 0.03) - 0.06;
      if (top > g.eave + 0.25) f.place(u, u + 0.045, g.eave, top, SLAT);
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
  return paintFacadeFaces(api, makeFaces(api, house));
}

export const OVERLAY_FIELD = {
  2: PLASTER,
  3: 0xf3efe6,
  4: 0xe4e0d8,
  5: 0xd5d6d2,
  7: 0xf4e6d4,
  8: 0xf3efe6,
  10: 0xe6e2da,
  11: 0xefe8dc,
  13: 0xe4e7ea,
  14: 0xe7e2d8,
  15: 0xf3efe6,
  16: 0xd2b48c,
  18: 0xe4e6e2,
  20: 0xf7f5f0,
  21: 0xf0e2cc,
  22: 0xf4e7d4,
  24: 0xf6f1e6,
  27: 0xf3f0e8,
  25: 0xf7f4ef,
  28: 0xf6f3ec,
  29: 0x2a2f33,
};
