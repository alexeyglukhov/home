// Свободная ходьба по варианту Д2. План: x на восток, y на север, до сдвига дома.
import * as THREE from "three";

const HOUSE_DX = -1;
const EYE = 1.60;
const WALK = 1.30;
const LOOK = 3;
const GAP = 0.20;
const GAP_REVEAL = 0.02;
const PITCH_MIN = -75 * Math.PI / 180;
const PITCH_MAX = 80 * Math.PI / 180;
const START = { x: -8.80, y: 12.220 };

function inside(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Высота пола под ногами: дом, крыльцо со ступенями, терраса, плитка двора.
function groundAt(x, y) {
  if (inside(x, y, -4.04, 2.84, 4.93, 18.50) || inside(x, y, 5.12, 9.43, 13.02, 18.50)) return 0.44;
  if (inside(x, y, 5.323, 3.140, 8.495, 9.05)) return 0.40;
  if (inside(x, y, 5.323, 2.461, 5.490, 3.140) || inside(x, y, 7.988, 2.461, 8.495, 3.140)) return 0.40;
  if (inside(x, y, -5.368, 9.681, -4.20, 12.390)) return 0.40;
  if (inside(x, y, -6.009, 9.05, -4.20, 9.681) || inside(x, y, -6.009, 12.390, -4.20, 13.05)) return 0.40;
  if (inside(x, y, -6.009, 9.681, -5.368, 12.390)) {
    const tread = (-5.368 - -6.009) / 2;
    const step = x < -6.009 + tread ? 1 : 2;
    return 0.40 * step / 3;
  }
  if (inside(x, y, 5.490, 2.499, 7.988, 3.140)) {
    const tread = (3.140 - 2.499) / 2;
    const step = y < 2.499 + tread ? 1 : 2;
    return 0.40 * step / 3;
  }
  if (inside(x, y, -4.55, 11.729, -3.90, 12.710) || inside(x, y, -4.55, 9.376, -3.90, 10.357)) return 0.44;
  return 0.035;
}

export function d2TourPose(planToWorld) {
  const [e, n] = planToWorld(START.x + HOUSE_DX, START.y);
  const [e1, n1] = planToWorld(START.x + HOUSE_DX + 1, START.y);
  return { east: e, north: n, yaw: Math.atan2(e1 - e, n1 - n) };
}

export function createD2Tour(planToWorld, boxes, segments = []) {
  function toWorld(x, y) {
    return planToWorld(x + HOUSE_DX, y);
  }

  function quadOf(x0, y0, x1, y1) {
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toWorld(x, y));
  }

  function bandOf(x0, y0, x1, y1, half) {
    const [e0, n0] = toWorld(x0, y0);
    const [e1, n1] = toWorld(x1, y1);
    const dx = e1 - e0;
    const dy = n1 - n0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * half;
    const ny = dx / len * half;
    return [[e0 + nx, n0 + ny], [e1 + nx, n1 + ny], [e1 - nx, n1 - ny], [e0 - nx, n0 - ny]];
  }

  const housePolys = boxes.map((b) => {
    let [x0, y0, x1, y1] = b;
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    return quadOf(x0, y0, x1, y1);
  });
  for (const [x0, y0, x1, y1, half] of segments) housePolys.push(bandOf(x0, y0, x1, y1, half || 0));

  const origin = planToWorld(HOUSE_DX, 0);
  const east = planToWorld(HOUSE_DX + 1, 0);
  const north = planToWorld(HOUSE_DX, 1);
  const bx = east[0] - origin[0];
  const bz = east[1] - origin[1];
  const by = north[0] - origin[0];
  const bw = north[1] - origin[1];
  const det = bx * bw - by * bz;

  function worldToWalk(e, n) {
    const dx = e - origin[0];
    const dz = n - origin[1];
    return [
      (bw * dx - by * dz) / det,
      (-bz * dx + bx * dz) / det,
    ];
  }

  function groundD2(e, n) {
    const [x, y] = worldToWalk(e, n);
    return groundAt(x, y);
  }

  let active = false;
  let camera = null;
  let controls = null;
  let obstacles = housePolys;
  let groundFn = groundD2;
  const home = d2TourPose(planToWorld);
  let e = home.east;
  let n = home.north;
  let eye = groundD2(e, n) + EYE;
  let yaw = home.yaw;
  let pitch = -7 * Math.PI / 180;
  let speed = 3;
  let vx = 0;
  let vy = 0;
  const held = new Set();
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function measure(poly) {
    if (poly.maxEdge != null) return;
    let minEdge = Infinity;
    let maxEdge = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < minEdge) minEdge = len;
      if (len > maxEdge) maxEdge = len;
    }
    poly.minEdge = minEdge;
    poly.maxEdge = maxEdge;
  }

  // Коробка и прочий узкий короткий выступ не держат дистанцию. Торец длинной стены тоже:
  // иначе запас 20 см с обеих сторон запирает межкомнатную дверь.
  function skip(poly) {
    return poly.minEdge < 0.12 && poly.maxEdge < 0.5;
  }

  function closestEdge(px, py, poly) {
    let best = Infinity;
    let qx = px;
    let qy = py;
    let tx = 1;
    let ty = 0;
    let atVertex = false;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      const raw = len2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
      const t = Math.max(0, Math.min(1, raw));
      const cx = a[0] + t * dx;
      const cy = a[1] + t * dy;
      const d = Math.hypot(px - cx, py - cy);
      if (d < best) {
        best = d;
        qx = cx;
        qy = cy;
        tx = dx;
        ty = dy;
        atVertex = raw <= 0 || raw >= 1;
      }
    }
    return { d: best, qx, qy, tx, ty, atVertex };
  }

  function clearance(poly, edge) {
    const len = Math.hypot(edge.tx, edge.ty);
    if (poly.maxEdge >= 0.75 && (len < 0.55 || edge.atVertex)) return GAP_REVEAL;
    return GAP;
  }

  function blocked(px, py) {
    for (const poly of obstacles) {
      if (skip(poly)) continue;
      if (pointInPoly(px, py, poly)) return true;
      const edge = closestEdge(px, py, poly);
      if (edge.d < clearance(poly, edge)) return true;
    }
    return false;
  }

  function pushOut(px, py) {
    for (let pass = 0; pass < 6; pass++) {
      let hit = false;
      for (const poly of obstacles) {
        if (skip(poly)) continue;
        const inside = pointInPoly(px, py, poly);
        const edge = closestEdge(px, py, poly);
        const gap = clearance(poly, edge);
        if (!inside && edge.d >= gap) continue;
        hit = true;
        if (inside) {
          const dist = Math.max(edge.d, 1e-6);
          const push = edge.d + gap + 0.001;
          px += (edge.qx - px) / dist * push;
          py += (edge.qy - py) / dist * push;
        } else if (edge.d < 1e-6) {
          const len = Math.hypot(edge.tx, edge.ty) || 1;
          px += -edge.ty / len * (gap + 0.001);
          py += edge.tx / len * (gap + 0.001);
        } else {
          const push = gap - edge.d + 0.001;
          px += (px - edge.qx) / edge.d * push;
          py += (py - edge.qy) / edge.d * push;
        }
      }
      if (!hit) break;
    }
    return [px, py];
  }

  function slide(px, py, dx, dy) {
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 0.04));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (!blocked(px + sx, py + sy)) {
        px += sx;
        py += sy;
        continue;
      }
      const freeX = !blocked(px + sx, py);
      const freeY = !blocked(px, py + sy);
      if (freeX) px += sx;
      if (freeY) py += sy;
      if (freeX || freeY) continue;
      let tangent = null;
      let bestD = Infinity;
      for (const poly of obstacles) {
        if (skip(poly)) continue;
        const edge = closestEdge(px, py, poly);
        if (edge.d > clearance(poly, edge) + 0.05 || edge.d >= bestD) continue;
        const len = Math.hypot(edge.tx, edge.ty) || 1;
        bestD = edge.d;
        tangent = [edge.tx / len, edge.ty / len];
      }
      if (!tangent) continue;
      const along = sx * tangent[0] + sy * tangent[1];
      if (along !== 0 && !blocked(px + tangent[0] * along, py + tangent[1] * along)) {
        px += tangent[0] * along;
        py += tangent[1] * along;
      }
    }
    return pushOut(px, py);
  }

  function place() {
    const cp = Math.cos(pitch);
    look.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(LOOK);
    pos.set(e, eye, n);
    camera.position.copy(pos);
    controls.target.copy(pos).add(look);
    camera.lookAt(controls.target);
  }

  function wish() {
    let fx = 0;
    let fy = 0;
    const fwdX = Math.sin(yaw);
    const fwdY = Math.cos(yaw);
    const leftX = Math.cos(yaw);
    const leftY = -Math.sin(yaw);
    if (held.has("ArrowUp")) { fx += fwdX; fy += fwdY; }
    if (held.has("ArrowDown")) { fx -= fwdX; fy -= fwdY; }
    if (held.has("ArrowLeft")) { fx += leftX; fy += leftY; }
    if (held.has("ArrowRight")) { fx -= leftX; fy -= leftY; }
    const len = Math.hypot(fx, fy);
    if (len > 1) { fx /= len; fy /= len; }
    return [fx * WALK * speed, fy * WALK * speed];
  }

  return {
    get active() { return active; },
    start(cam, ctrl, opts = {}) {
      camera = cam;
      controls = ctrl;
      active = true;
      const pose = opts.pose || home;
      e = pose.east;
      n = pose.north;
      yaw = pose.yaw;
      groundFn = opts.ground || groundD2;
      obstacles = (opts.keepHouse === false ? [] : housePolys).concat(opts.obstacles || []);
      for (const poly of obstacles) measure(poly);
      [e, n] = pushOut(e, n);
      eye = groundFn(e, n) + EYE;
      pitch = -7 * Math.PI / 180;
      speed = 3;
      vx = 0;
      vy = 0;
      held.clear();
      place();
    },
    stop() {
      active = false;
      held.clear();
      vx = 0;
      vy = 0;
    },
    setSpeed(v) {
      const n = Math.round(Number(v));
      speed = n >= 1 && n <= 9 ? n : 3;
    },
    setMove(code, down) {
      if (!active) return;
      if (down) held.add(code);
      else held.delete(code);
    },
    clearMove() {
      held.clear();
    },
    addLook(dx, dy) {
      if (!active || dx === 0 && dy === 0) return;
      const sens = 0.0022;
      yaw -= dx * sens;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch - dy * sens));
    },
    step(dt) {
      if (!active) return false;
      const stepDt = Math.min(Math.max(dt, 0), 0.05);
      const [tx, ty] = wish();
      const k = 1 - Math.exp(-8 * stepDt);
      vx += (tx - vx) * k;
      vy += (ty - vy) * k;
      if (Math.hypot(vx, vy) < 0.01 && Math.hypot(tx, ty) === 0) { vx = 0; vy = 0; }
      [e, n] = slide(e, n, vx * stepDt, vy * stepDt);
      const floor = groundFn(e, n) + EYE;
      const rise = 1 - Math.exp(-24 * stepDt);
      eye += (floor - eye) * rise;
      place();
      return true;
    },
  };
}

// Дневной свет из окон: без него внутренние стены красит только общая засветка
// и они выглядят одинаково. Прожектор стоит у проёма и светит в комнату.
const WINDOWS = [
  { x: -3.55, y: 4.22, dx: 1, dy: 0, h: 1.78, wide: 0.9 },
  { x: -3.55, y: 8.07, dx: 1, dy: 0, h: 1.78, wide: 0.55 },
  { x: -3.55, y: 9.87, dx: 1, dy: 0, h: 1.45, wide: 0.7 },
  { x: -3.55, y: 12.22, dx: 1, dy: 0, h: 1.45, wide: 0.7 },
  { x: -3.55, y: 14.32, dx: 1, dy: 0, h: 1.78, wide: 0.5 },
  { x: -3.55, y: 17.16, dx: 1, dy: 0, h: 1.78, wide: 1.0 },
  { x: -2.68, y: 3.35, dx: 0, dy: 1, h: 1.78, wide: 0.9 },
  { x: 2.84, y: 3.35, dx: 0, dy: 1, h: 1.50, wide: 1.15 },
  { x: 4.45, y: 4.85, dx: -1, dy: 0, h: 1.50, wide: 1.15 },
  { x: -0.69, y: 18.05, dx: 0, dy: -1, h: 1.78, wide: 0.7 },
  { x: 3.00, y: 18.05, dx: 0, dy: -1, h: 1.78, wide: 1.0 },
  { x: 6.75, y: 18.05, dx: 0, dy: -1, h: 1.78, wide: 0.5 },
  { x: 11.02, y: 18.05, dx: 0, dy: -1, h: 1.78, wide: 0.75 },
  { x: 12.55, y: 11.82, dx: -1, dy: 0, h: 1.78, wide: 1.0 },
  { x: 12.55, y: 16.60, dx: -1, dy: 0, h: 1.78, wide: 1.0 },
  { x: 6.74, y: 9.95, dx: 0, dy: 1, h: 1.78, wide: 0.5 },
  { x: 9.08, y: 9.95, dx: 0, dy: 1, h: 1.78, wide: 0.5 },
  { x: 11.42, y: 9.95, dx: 0, dy: 1, h: 1.78, wide: 0.75 },
];

export function createTourDaylight(planToWorld) {
  const group = new THREE.Group();
  group.name = "tour-daylight";
  group.visible = false;
  const spots = [];
  for (const win of WINDOWS) {
    const [e, n] = planToWorld(win.x + HOUSE_DX, win.y);
    const [te, tn] = planToWorld(win.x + HOUSE_DX + win.dx * 3.2, win.y + win.dy * 3.2);
    const spot = new THREE.SpotLight(0xfff3dc, 0, 8, 1.05, 0.85, 1.5);
    spot.position.set(e, win.h, n);
    spot.target.position.set(te, Math.min(3.2, win.h + 1.35), tn);
    spot.castShadow = false;
    spot.userData.base = 8 + win.wide * 5;
    group.add(spot, spot.target);
    spots.push(spot);
  }
  return {
    object: group,
    setElevation(el) {
      const day = el > 0 ? Math.max(0.4, Math.min(1, el / 20)) : 0.14;
      for (const spot of spots) spot.intensity = spot.userData.base * day;
    },
  };
}
