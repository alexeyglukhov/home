/**
 * Габариты мебели только по видимому корпусу (bake + runtime).
 *
 * 1) невидимое / без материала / collision|helper — вне габарита;
 * 2) unit-хелперы ±1 м / blob ~2×2 — вне;
 * 3) якорь — панели/корпус/стекло/поддон (не ручки/растяжки/brace/hanger);
 * 4) фурнитура в W×D×H не входит; для посадки ног — selectFootParts (все
 *    видимые не-хелперы), иначе «только hanger frame» утапливает шкаф в пол.
 */

/** @typedef {{ name: string, min: number[], max: number[], visible?: boolean, hasShading?: boolean }} BoundsPart */

const HELPER_NAME_RE = /(shadow|collision|proxy|bound|helper|\bplane\b|collider|occluder)/i;

/** Корпус / панели / стекло / поддон — основа габарита W×D×H. */
const BODY_NAME_RE =
  /(glass|screen|tray|pan|enclosure|stile|panel|wall|carcass|case|cabinet|door(?!\s*pull)|(?<!hanger\s)frame|seat|cushion|top|shelf|drawer|leg|foot(?!\s*cap)|base|basin|bath|tub|bowl|cistern|toilet|sink|vanity|mattress|headboard|sofa|table|desk|chair|wardrobe|closet|cheek|pedestal|stand|housing|bezel|hanging\s*(bar|rail)|clothes\s*hanging)/i;

/** Фурнитура / тонкие растяжки — не раздувать габарит. */
const HARDWARE_NAME_RE =
  /(brace|rosette|pull|grip|handle|hinge|hanger|rail|rod|\bbar\b|screw|bolt|knob|hook|roller|track|glide|leveler|foot\s*cap|hardware)/i;

export function partSize(p) {
  return {
    w: p.max[0] - p.min[0],
    h: p.max[1] - p.min[1],
    d: p.max[2] - p.min[2],
  };
}

export function isUnitAxis(minV, maxV, size) {
  return Math.abs(size - 2) < 0.05 && Math.abs(minV + 1) < 0.08 && Math.abs(maxV - 1) < 0.08;
}

export function isHelperName(name) {
  const nm = (name || "").trim();
  return !nm ? false : HELPER_NAME_RE.test(nm);
}

export function isBodyPartName(name) {
  const nm = (name || "").trim();
  if (!nm) return false;
  // ручка / вешалка / растяжка — не корпус (иначе G02/G03 садятся на hanger frame)
  if (/(pull|grip|handle|brace|rosette|\bhanger\b)/i.test(nm)) return false;
  // штанга гардероба — корпус по объёму
  if (/(hanging\s*(bar|rail)|clothes\s*hanging)/i.test(nm)) return true;
  if (
    HARDWARE_NAME_RE.test(nm)
    && !/(panel|glass|screen|tray|pan|enclosure|stile|cabinet|wardrobe)/i.test(nm)
  ) {
    return false;
  }
  return BODY_NAME_RE.test(nm);
}

export function isHardwarePartName(name) {
  const nm = (name || "").trim();
  if (!nm) return false;
  if (/(pull|grip|handle|brace|rosette|\bhanger\b)/i.test(nm)) return true;
  return HARDWARE_NAME_RE.test(nm) && !isBodyPartName(nm);
}

/** Кандидаты: видимые, с материалом, не хелперы. */
export function filterBoundsCandidates(parts) {
  if (!parts?.length) return [];
  const candidates = parts.filter((p) => {
    if (p.visible === false) return false;
    if (p.hasShading === false) return false;
    const { w, h, d } = partSize(p);
    if (!(w > 1e-5 && h > 1e-5 && d > 1e-5)) return false;
    if (isHelperName(p.name) && h < 0.35) return false;
    if (isGeometricHelper(p)) return false;
    return true;
  });
  if (candidates.length) return candidates;
  return parts.filter((p) => {
    const { w, h, d } = partSize(p);
    return w > 1e-5 && h > 1e-5 && d > 1e-5 && !isGeometricHelper(p);
  });
}

/**
 * Все видимые детали для посадки ног (min.y).
 * Нельзя сажать только по «корпусу-якорю»: вешалка выше пола → шкаф в плите.
 */
export function selectFootParts(parts) {
  return filterBoundsCandidates(parts);
}

/** Геометрический хелпер: unit-span / безымянный широкий blob / тонкий столб ±1. */
export function isGeometricHelper(p) {
  const { w, h, d } = partSize(p);
  if (!(w > 1e-5 && h > 1e-5 && d > 1e-5)) return true;
  const name = (p.name || "").trim();
  const xU = isUnitAxis(p.min[0], p.max[0], w);
  const yU = isUnitAxis(p.min[1], p.max[1], h);
  const zU = isUnitAxis(p.min[2], p.max[2], d);
  if (!name && (xU || yU || zU)) return true;
  if (yU && w < 1.25 && d < 1.25) return true;
  if (!name && w > 1.85 && d > 1.85) return true;
  if (!name && ((w > 1.85 && h < 0.35) || (d > 1.85 && h < 0.35))) return true;
  if (!name && h < 0.12 && (w > 1.15 || d > 1.15)) return true;
  if (isHelperName(name) && h < 0.35) return true;
  return false;
}

function unionOf(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.min[i]);
      max[i] = Math.max(max[i], p.max[i]);
    }
  }
  return { min, max, ...partSize({ min, max }) };
}

/** Добавление p раздувает union сильнее factor по оси, где сам p крупный. */
function expandsAnchorExcessively(anchor, p, factor = 1.12) {
  const a = partSize(anchor);
  const s = partSize(p);
  const axes = [
    { a: a.w, s: s.w, i: 0 },
    { a: a.h, s: s.h, i: 1 },
    { a: a.d, s: s.d, i: 2 },
  ];
  for (const ax of axes) {
    if (!(ax.a > 1e-6)) continue;
    const nmin = Math.min(anchor.min[ax.i], p.min[ax.i]);
    const nmax = Math.max(anchor.max[ax.i], p.max[ax.i]);
    const nw = nmax - nmin;
    if (nw > ax.a * factor && ax.s > ax.a * 0.45) return true;
  }
  return false;
}

/**
 * Оставить только видимый корпус для габарита.
 * @param {BoundsPart[]} parts
 * @returns {BoundsPart[]}
 */
export function selectVisibleParts(parts) {
  if (!parts?.length) return [];

  const candidates = filterBoundsCandidates(parts);
  if (!candidates.length) return [];

  const body = candidates.filter((p) => isBodyPartName(p.name));
  const named = candidates.filter((p) => (p.name || "").trim());
  // якорь: корпус/панели; иначе все именованные без фурнитуры; иначе всё
  let anchors = body;
  if (!anchors.length) {
    anchors = named.filter((p) => !isHardwarePartName(p.name));
  }
  if (!anchors.length) anchors = named.length ? named : candidates;
  // при наличии корпуса фурнитуру в габарит не берём (ручка/brace раздувают AABB)
  if (body.length) return anchors;

  const anchorUnion = unionOf(anchors);
  const kept = anchors.slice();
  for (const p of candidates) {
    if (kept.includes(p)) continue;
    const nm = (p.name || "").trim();
    if (isHardwarePartName(nm)) continue;
    if (!nm && expandsAnchorExcessively(anchorUnion, p, 1.12)) continue;
    if (nm && expandsAnchorExcessively(anchorUnion, p, 1.25)) continue;
    kept.push(p);
  }
  return kept.length ? kept : anchors;
}

/**
 * Габарит W×D×H по корпусу; min.y / высота — с учётом ног (foot parts),
 * чтобы seatOffset не ставил шкаф на вешалку.
 * @param {BoundsPart[]} parts
 * @returns {{ min: number[], max: number[], dropped: number, kept: number } | null}
 */
export function unionVisibleBounds(parts) {
  const kept = selectVisibleParts(parts);
  if (!kept.length) return null;
  const u = unionOf(kept);
  const feet = selectFootParts(parts);
  const f = feet.length ? unionOf(feet) : u;
  // XZ из корпуса; низ — по всем видимым (leveler / cabinet side)
  const min = [u.min[0], f.min[1], u.min[2]];
  const max = [u.max[0], Math.max(u.max[1], f.max[1]), u.max[2]];
  return {
    min,
    max,
    dropped: Math.max(0, (parts?.length || 0) - kept.length),
    kept: kept.length,
  };
}
