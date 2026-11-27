/**
 * Габариты мебели только по видимым деталям (общая логика bake + runtime).
 *
 * Идея:
 * 1) отбросить невидимое / без материала / helper|collision по имени;
 * 2) якорь — именованные детали (или все, если имён нет);
 * 3) безымянные хелперы (±1 м, blob ~2×2) и то, что раздувает AABB якоря — не в габарит.
 */

/** @typedef {{ name: string, min: number[], max: number[], visible?: boolean, hasShading?: boolean }} BoundsPart */

const HELPER_NAME_RE = /(shadow|collision|proxy|bound|helper|\bplane\b|collider|occluder)/i;

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
    // раздув >12% и кусок сам заметно шире половины якоря по этой оси
    if (nw > ax.a * factor && ax.s > ax.a * 0.45) return true;
  }
  return false;
}

/**
 * Оставить только видимые / полезные для габарита части.
 * @param {BoundsPart[]} parts
 * @returns {BoundsPart[]}
 */
export function selectVisibleParts(parts) {
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

  if (!candidates.length) {
    // всё отфильтровали — хотя бы не-пустые без unit-хелперов
    return parts.filter((p) => {
      const { w, h, d } = partSize(p);
      return w > 1e-5 && h > 1e-5 && d > 1e-5 && !isGeometricHelper(p);
    });
  }

  const named = candidates.filter((p) => (p.name || "").trim());
  const anchors = named.length ? named : candidates;
  const anchorUnion = unionOf(anchors);
  const kept = anchors.slice();

  // безымянные (и прочие) — только если не раздувают якорь (типичный ±1 м хелпер)
  for (const p of candidates) {
    if (kept.includes(p)) continue;
    const nm = (p.name || "").trim();
    if (!nm && expandsAnchorExcessively(anchorUnion, p, 1.12)) continue;
    if (nm && expandsAnchorExcessively(anchorUnion, p, 1.35)) continue;
    kept.push(p);
  }

  return kept.length ? kept : anchors;
}

/**
 * @param {BoundsPart[]} parts
 * @returns {{ min: number[], max: number[], dropped: number, kept: number } | null}
 */
export function unionVisibleBounds(parts) {
  const kept = selectVisibleParts(parts);
  if (!kept.length) return null;
  const u = unionOf(kept);
  return {
    min: u.min,
    max: u.max,
    dropped: Math.max(0, (parts?.length || 0) - kept.length),
    kept: kept.length,
  };
}
