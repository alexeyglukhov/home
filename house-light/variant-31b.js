// Вариант 3.1b: план agency/var3.1.svg — вальцевая крыша, расширенное северное крыльцо, без навеса.
// Посадка: abrikosovaya-22-layout-variant-3.1b-1-100.svg.
// Координаты — метры плана участка (как у Д4): x на восток, y на север.
import * as THREE from "three";
import { addVar31FurnitureFloor, V31_FLOOR_WEST, V31_FLOOR_EAST } from "./var31-furniture-floor.js?v=6";

export const V31B_BASE = { x: 0, y: 0 };

const WALLS = [
  [-5.358, 7.318, 3.157, 7.720],
  [-5.358, 17.859, 14.804, 18.260],
  [8.277, 0.846, 14.787, 1.248],
  [2.736, 9.304, 8.676, 9.706],
  [-1.251, 13.439, 8.644, 13.840],
  [14.403, 0.840, 14.804, 18.244],
  [8.265, 13.432, 8.666, 18.139],
  [8.265, 0.845, 8.666, 12.017],
  [-5.359, 7.302, -4.908, 18.276],
  [2.756, 7.294, 3.158, 12.063],
  [5.416, 9.307, 5.566, 12.057],
  [10.154, 3.718, 10.304, 13.570],
  [10.653, 14.864, 10.803, 18.172],
  [8.757, 14.905, 8.908, 18.239],
  [5.377, 15.373, 5.527, 17.959],
  [3.015, 13.501, 3.165, 18.159],
  [4.928, 13.515, 5.078, 14.497],
  [1.675, 13.529, 1.825, 15.880],
  [-0.625, 15.267, -0.475, 18.197],
  [4.943, 15.332, 8.453, 15.483],
  [-0.617, 15.742, 3.103, 15.892],
  [1.730, 15.534, 3.147, 15.684],
  [2.809, 11.395, 5.538, 11.545],
  [5.412, 11.912, 8.673, 12.062],
  [7.289, 11.688, 8.610, 11.839],
  [7.208, 11.118, 7.358, 12.019],
  [8.358, 13.437, 11.892, 13.587],
  [8.294, 14.864, 10.805, 15.015],
  [10.177, 11.102, 14.761, 11.252],
  [13.622, 6.544, 14.761, 6.694],
  [10.177, 3.716, 14.761, 3.866],
  [8.297, 5.335, 10.272, 5.486],
  [-0.625, 13.477, -0.475, 14.508],
  [10.207, 6.544, 12.850, 6.694],
  [10.207, 8.270, 10.753, 8.421],
  [11.519, 8.270, 14.534, 8.421],
  [12.874, 13.437, 14.696, 13.587],
  [6.524, 9.523, 6.674, 10.424],
  [12.285, 11.138, 12.436, 12.191],
  [8.400, 16.115, 9.453, 16.266],
  [12.274, 6.592, 12.425, 8.368],
];

const OPENINGS = [
  [11.379, 17.976, 12.757, 18.185, 'y'],
  [-3.330, 17.976, -1.951, 18.185, 'y'],
  [14.490, 4.649, 14.699, 6.028, 'y'],
  [14.490, 9.409, 14.699, 10.788, 'y'],
  [14.490, 13.831, 14.699, 14.522, 'y'],
  [9.414, 17.968, 10.105, 18.177, 'y'],
  [6.250, 17.976, 7.322, 18.185, 'y'],
  [1.459, 17.976, 2.532, 18.185, 'y'],
  [8.359, 3.214, 8.568, 4.287, 'y'],
  [8.359, 5.599, 8.568, 6.672, 'y'],
  [6.708, 9.406, 7.399, 9.615, 'y'],
  [11.879, 0.939, 13.258, 1.148, 'y'],
  // Панорамные окна на террасу (не двери).
  [-4.654, 7.418, -3.461, 7.627, 'p'],
  [-3.433, 7.418, -2.240, 7.627, 'p'],
  [0.047, 7.418, 1.239, 7.627, 'p'],
  [1.265, 7.418, 2.457, 7.627, 'p'],
  // двери: d — входная (прозрачное полотно), i — внутренние (только коробка)
  [3.808, 17.859, 4.793, 18.260, 'd'],
  // Три двери на террасу — один тип: коробка и прозрачное полотно.
  [2.756, 8.044, 3.158, 9.029, 'd'],
  [3.015, 14.405, 3.165, 15.389, 'i'],
  [3.015, 16.397, 3.165, 17.381, 'i'],
  [3.794, 9.304, 4.779, 9.706, 'd'],
  [6.000, 15.332, 6.985, 15.483, 'i'],
  // Тамбур → коридор.
  [3.930, 13.439, 4.920, 13.840, 'i'],
  [8.265, 8.061, 8.666, 9.045, 'd'],
  [8.265, 10.347, 8.666, 11.331, 'i'],
  [8.834, 5.335, 9.819, 5.486, 'i'],
  [9.106, 13.437, 10.091, 13.587, 'i'],
  [9.200, 14.864, 10.185, 15.015, 'i'],
  // Спальня у кабинета → коридор.
  [10.154, 5.501, 10.304, 6.485, 'i'],
  [10.154, 10.017, 10.304, 11.002, 'i'],
  // Гардеробная при мастер-спальне → коридор: на плане проёма нет (был 11.617–12.602).
];

const COLUMNS = [
  // южная терраса (колонн на северном крыльце нет)
  [-5.128, 5.681, -4.725, 6.083],
  [2.789, 5.681, 3.193, 6.083],
  [-1.192, 5.681, -0.788, 6.083],
];

// Южная терраса по обводке rect2279: без выреза, до x≈8,26.
const TERRACE = [-5.35, 4.79, 8.26, 7.44];

const PLINTH = 0.45;
const FLOOR = PLINTH + 0.12;
const ROOM_H = 3.00;
const SLAB = 0.20;
const CEIL_BOT = FLOOR + ROOM_H;
const CEIL_TOP = CEIL_BOT + SLAB;
const WALL_TOP = CEIL_TOP;
const HEAD = 2.45;
const YELL_SILL = 0.80;
const PAN_SILL = PLINTH + 0.10;
const WALL_C = 0xd9d3c8;
const FRAME_Y = 0xe0b83a;
const FRAME_W = 0xf7f6f2;
const GLASS = 0xb7d4e4;
const ROOF_C = 0x3a332c;
const WOOD = 0x6b5344;
const FLOOR_C = 0xf3f0ea;

function hit(wall, op) {
  const [x0, y0, x1, y1] = wall;
  const [a, b, c, d] = op;
  const vertical = (x1 - x0) < (y1 - y0);
  if (vertical) {
    const across = Math.min(x1, c) - Math.max(x0, a);
    const along = Math.min(y1, d + 0.08) - Math.max(y0, b - 0.08);
    return across > (x1 - x0) * 0.35 && along > 0.2;
  }
  const across = Math.min(y1, d) - Math.max(y0, b);
  const along = Math.min(x1, c + 0.08) - Math.max(x0, a - 0.08);
  return across > (y1 - y0) * 0.35 && along > 0.2;
}

export function v31bWalkBoxes() {
  const doors = OPENINGS.filter((op) => op[4] === "d" || op[4] === "i");
  const boxes = [];
  const norm = (box) => {
    let [x0, y0, x1, y1] = box;
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    return [x0, y0, x1, y1];
  };
  for (const wall of WALLS) {
    const [x0, y0, x1, y1] = norm(wall);
    const vertical = (x1 - x0) < (y1 - y0);
    const cuts = [];
    for (const op of doors) {
      const [a, b, c, d] = norm(op);
      if (vertical) {
        const across = Math.min(x1, c) - Math.max(x0, a);
        if (across > (x1 - x0) * 0.4 && d - b > 0.2) {
          const span = Math.min(y1, d) - Math.max(y0, b);
          if (span > 0.2) cuts.push([Math.max(y0, b), Math.min(y1, d)]);
        }
      } else {
        const across = Math.min(y1, d) - Math.max(y0, b);
        if (across > (y1 - y0) * 0.4 && c - a > 0.2) {
          const span = Math.min(x1, c) - Math.max(x0, a);
          if (span > 0.2) cuts.push([Math.max(x0, a), Math.min(x1, c)]);
        }
      }
    }
    cuts.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const cut of cuts) {
      const last = merged[merged.length - 1];
      if (last && cut[0] <= last[1]) last[1] = Math.max(last[1], cut[1]);
      else merged.push(cut.slice());
    }
    if (vertical) {
      let y = y0;
      for (const [a, b] of merged) {
        if (a - y > 0.02) boxes.push([x0, y, x1, a]);
        y = Math.max(y, b);
      }
      if (y1 - y > 0.02) boxes.push([x0, y, x1, y1]);
    } else {
      let x = x0;
      for (const [a, b] of merged) {
        if (a - x > 0.02) boxes.push([x, y0, a, y1]);
        x = Math.max(x, b);
      }
      if (x1 - x > 0.02) boxes.push([x, y0, x1, y1]);
    }
  }
  for (const col of COLUMNS) boxes.push(norm(col));
  return boxes;
}

// Северный забор: ворота 4 м по линии зап. стены дома (x −9,36…−5,36), калитка восточнее.
const V31B_GATE = { x0: -9.36, x1: -5.36, ped0: -4.96, ped1: -4.06, y: 22.877 };

export function v31bFenceSegments(houseShift = null) {
  const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
  const nw = plot[0];
  const sw = plot[3];
  const dx = sw[0] - nw[0];
  const dy = sw[1] - nw[1];
  const len = Math.hypot(dx, dy);
  const along = (s) => [nw[0] + dx / len * s, nw[1] + dy / len * s];
  const g = V31B_GATE;
  const runs = [
    // север: два пролёта вокруг ворот и калитки
    [plot[0], [g.x0, g.y], 0.06],
    [[g.x1, g.y], [g.ped0, g.y], 0.06],
    [[g.ped1, g.y], plot[1], 0.06],
    [plot[1], plot[2], 0.06],
    [plot[2], plot[3], 0.06],
    [along(0), plot[3], 0.06], // запад сплошной
    // калитка (полотно)
    [[g.ped0 + 0.05, g.y], [g.ped1 - 0.05, g.y], 0.025],
    // створка ворот открыта на запад (карман)
    [[g.x0 - 3.90, g.y - 0.20], [g.x0 - 0.10, g.y - 0.20], 0.04],
    [[g.x0 - 3.90, g.y - 0.38], [g.x0 - 0.10, g.y - 0.38], 0.04],
  ];
  const mx = houseShift ? houseShift.x : 0;
  const my = houseShift ? houseShift.y : 0;
  return runs.map(([a, b, half]) => [
    a[0] - mx, a[1] - my, b[0] - mx, b[1] - my, half,
  ]);
}

export function buildVariant31b(api) {
  const HOUSE_DX = V31B_BASE.x;
  const HOUSE_DY = V31B_BASE.y;
  const shiftX = (x) => x + HOUSE_DX;
  const shiftY = (y) => y + HOUSE_DY;
  const shiftP = (x, y) => [shiftX(x), shiftY(y)];
  const { addBeam, asRoof, withFinish, geometryFromTriangles, addMesh } = api;
  const planToWorld = (x, y) => api.planToWorld(shiftX(x), shiftY(y));
  const planBox = (quad, y0, y1, color, cast = true) => api.planBox(
    quad.map(([x, y]) => shiftP(x, y)), y0, y1, color, cast
  );
  const saved = api.sectionHeight();
  api.sectionHeight(3.5);

  const glass = (x0, y0, x1, y1, z0, z1) => {
    const mesh = planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, GLASS, false);
    delete mesh.userData.finish;
    mesh.material.transparent = true;
    mesh.material.opacity = 0.16;
    mesh.material.depthWrite = false;
    mesh.castShadow = false;
    mesh.userData.roof = true;
    return mesh;
  };
  const frameBar = (x0, y0, x1, y1, z0, z1, color) => {
    withFinish("frame", () => planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, color));
  };

  // Вальцевая кровля 22°: L-контур, ендова, полные вальмы, без навеса.
  const pitch = 22 * Math.PI / 180;
  const tanP = Math.tan(pitch);
  const ROOF_THICK = 0.10;
  const yR0 = 12.88;
  const x0W = -6.15, x0E = 15.42;
  const y0N = 19.00, y0S = 5.50;
  // Крыльцо 8,26×2,54 ≈ 20,96 м² — только ступени, без выноса кровли.
  const run0 = Math.max(y0N - yR0, yR0 - y0S);
  const xPlateW = -5.36;
  const xPlateE = 14.80;
  const yPlateS = 7.30;
  const xR1 = 11.48;
  const y1S = 0.18;
  const x1W = 7.50, x1E = 15.46;
  const run1 = Math.max(xR1 - x1W, x1E - xR1);
  const Ze = WALL_TOP + ROOF_THICK - tanP * (run0 - Math.abs(yPlateS - yR0));
  const Ze1 = WALL_TOP + ROOF_THICK - tanP * (run1 - Math.abs(xPlateE - xR1));
  const Zr0 = Ze + tanP * run0;
  const Zr1 = Ze1 + tanP * run1;
  const yValley = (x) => yR0 - (run0 - run1) - Math.abs(x - xR1) - (Ze - Ze1) / tanP;
  const yClip = (x) => Math.max(y0S, yValley(x));
  // Восточная вальма полная — иначе на востоке выглядит как фронтон.
  const hipMain = Math.min(yR0 - y0S, y0N - yR0);
  const xRW = x0W + hipMain;
  const xRE = x0E - hipMain;
  const yRS = y1S + run1;
  const zMain = (x, y) => {
    let dx = 0;
    if (x < xRW) dx = xRW - x;
    else if (x > xRE) dx = x - xRE;
    const dy = Math.abs(y - yR0);
    return Zr0 - tanP * Math.max(dx, dy);
  };
  const zEast = (x, y) => {
    const dy = y < yRS ? yRS - y : 0;
    const dx = Math.abs(x - xR1);
    return Zr1 - tanP * Math.max(dx, dy);
  };
  const xCorr = 8.265;
  // Запад/терраса до стены коридора. Восток от коридора — общая ендова (один меш).
  // Крыло над террасой (x1W…xCorr) — отдельный слой внахлёст.
  const inMain = (x, y) => {
    if (x < x0W - 0.02 || x > x0E + 0.02) return false;
    const yMin = (x > xCorr + 0.02) ? yClip(x) : y0S;
    if (y < yMin - 0.02) return false;
    return y <= y0N + 0.02;
  };
  const inEast = (x, y) => (
    x >= x1W - 0.02 && x <= x1E + 0.02
    && y >= y1S - 0.02 && y <= yClip(x) + 0.02
  );
  const houseZ = (x, y) => {
    let best = -Infinity;
    if (inMain(x, y)) best = Math.max(best, zMain(x, y));
    if (inEast(x, y)) best = Math.max(best, zEast(x, y));
    return best > -Infinity ? best : null;
  };
  // Западный слой: только до коридора (терраса + запад дома).
  const westZ = (x, y) => (x <= xCorr + 0.02 && inMain(x, y) ? zMain(x, y) : null);
  // Восточный стык: один слой max(main,east) — ендова без трещины.
  const eastJoinZ = (x, y) => (x >= xCorr - 0.02 ? houseZ(x, y) : null);
  // Нахлест крыла над террасой (под ним — westZ).
  const eastLapZ = (x, y) => (
    x >= x1W - 0.02 && x <= xCorr + 0.02 && inEast(x, y) ? zEast(x, y) : null
  );

  withFinish("wall", () => {
    for (const wall of WALLS) {
      const [x0, y0, x1, y1] = wall;
      const vertical = (x1 - x0) < (y1 - y0);
      const zTop = WALL_TOP;
      const holes = OPENINGS.filter((op) => hit(wall, op)).map((op) => {
        const sill = op[4] === "p" ? PAN_SILL : op[4] === "d" || op[4] === "i" ? PLINTH : YELL_SILL;
        if (vertical) return { a: Math.max(y0, op[1]), b: Math.min(y1, op[3]), z0: sill, z1: HEAD, kind: op[4] };
        return { a: Math.max(x0, op[0]), b: Math.min(x1, op[2]), z0: sill, z1: HEAD, kind: op[4] };
      }).filter((h) => h.b - h.a > 0.15).sort((p, q) => p.a - q.a);
      const span = (a, b, z0, z1) => {
        if (b <= a + 0.02 || z1 <= z0 + 0.02) return;
        const quad = vertical
          ? [[x1, a], [x0, a], [x0, b], [x1, b]]
          : [[b, y0], [a, y0], [a, y1], [b, y1]];
        planBox(quad, z0, z1, WALL_C);
      };
      let cursor = vertical ? y0 : x0;
      const limit = vertical ? y1 : x1;
      for (const h of holes) {
        span(cursor, h.a, PLINTH, zTop);
        span(h.a, h.b, PLINTH, h.z0);
        span(h.a, h.b, h.z1, zTop);
        const color = h.kind === "p" ? FRAME_W : h.kind === "d" || h.kind === "i" ? 0x6b3e24 : FRAME_Y;
        const t = vertical ? (x0 + x1) / 2 : (y0 + y1) / 2;
        const half = 0.045;
        const fw = 0.06;
        const t0 = t - half;
        const t1 = t + half;
        if (vertical) {
          frameBar(t0, h.a, t1, h.a + fw, h.z0, h.z1, color);
          frameBar(t0, h.b - fw, t1, h.b, h.z0, h.z1, color);
          frameBar(t0, h.a, t1, h.b, h.z1 - fw, h.z1, color);
          if (h.kind !== "d" && h.kind !== "i") {
            frameBar(t0, h.a, t1, h.b, h.z0, h.z0 + fw, color);
            glass(t - 0.015, h.a + fw, t + 0.015, h.b - fw, h.z0 + fw, h.z1 - fw);
          }
        } else {
          frameBar(h.a, t0, h.a + fw, t1, h.z0, h.z1, color);
          frameBar(h.b - fw, t0, h.b, t1, h.z0, h.z1, color);
          frameBar(h.a, t0, h.b, t1, h.z1 - fw, h.z1, color);
          if (h.kind !== "d" && h.kind !== "i") {
            frameBar(h.a, t0, h.b, t1, h.z0, h.z0 + fw, color);
            glass(h.a + fw, t - 0.015, h.b - fw, t + 0.015, h.z0 + fw, h.z1 - fw);
          }
        }
        if (h.kind === "d") {
          const leaf = vertical
            ? planBox([[t - 0.04, h.a + 0.06], [t + 0.04, h.a + 0.06], [t + 0.04, h.b - 0.04], [t - 0.04, h.b - 0.04]], h.z0 + 0.02, h.z1 - 0.06, 0xd7ebf3, false)
            : planBox([[h.a + 0.06, t - 0.04], [h.b - 0.04, t - 0.04], [h.b - 0.04, t + 0.04], [h.a + 0.06, t + 0.04]], h.z0 + 0.02, h.z1 - 0.06, 0xd7ebf3, false);
          delete leaf.userData.finish;
          leaf.material.transparent = true;
          leaf.material.opacity = 0.35;
          leaf.material.depthWrite = false;
          leaf.castShadow = false;
          leaf.userData.roof = true;
          leaf.userData.finish = "door";
        }
        cursor = Math.max(cursor, h.b);
      }
      span(cursor, limit, PLINTH, zTop);
    }
  });

  withFinish("plinth", () => {
    const base = (quad, z0, z1) => {
      const mesh = planBox(quad, z0, z1, 0xd8d3cb);
      delete mesh.userData.finish;
      return mesh;
    };
    // Отапливаемый контур.
    base([[-5.41, 7.25], [8.70, 7.25], [8.70, 18.31], [-5.41, 18.31]], 0.02, PLINTH);
    base([[8.22, 0.80], [14.85, 0.80], [14.85, 18.31], [8.22, 18.31]], 0.02, PLINTH);
    // Основание террасы до цоколя; настил выше — в цвете пола и встык с ним (как 3.1).
    base([
      [TERRACE[0], TERRACE[1]], [TERRACE[2], TERRACE[1]],
      [TERRACE[2], TERRACE[3]], [TERRACE[0], TERRACE[3]],
    ], 0.02, PLINTH);
    // Две нижние ступени крыльца. Верхняя площадка — настил в уровне пола.
    const porchSteps = [
      [-0.072, 18.297, 8.189, 20.834],
      [0.272, 18.297, 7.795, 20.409],
    ];
    porchSteps.forEach((b, i) => {
      const z1 = FLOOR * (i + 1) / 3;
      base([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], 0.02, z1);
    });
  });

  // Нахлёст плит в проёме коридор-1 ↔ коридор-2 — без канавы на стыке.
  planBox([
    [V31_FLOOR_WEST[0], V31_FLOOR_WEST[1]], [V31_FLOOR_WEST[2], V31_FLOOR_WEST[1]],
    [V31_FLOOR_WEST[2], V31_FLOOR_WEST[3]], [V31_FLOOR_WEST[0], V31_FLOOR_WEST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false);
  planBox([
    [V31_FLOOR_EAST[0], V31_FLOOR_EAST[1]], [V31_FLOOR_EAST[2], V31_FLOOR_EAST[1]],
    [V31_FLOOR_EAST[2], V31_FLOOR_EAST[3]], [V31_FLOOR_EAST[0], V31_FLOOR_EAST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false);
  // Настил террасы заходит под край пола: одна плоскость, без щели по стыку.
  const terraceDeck = planBox([
    [TERRACE[0], TERRACE[1]], [TERRACE[2], TERRACE[1]],
    [TERRACE[2], 7.66], [TERRACE[0], 7.66],
  ], PLINTH, FLOOR, FLOOR_C, false);
  terraceDeck.material.polygonOffset = true;
  terraceDeck.material.polygonOffsetFactor = -1;
  terraceDeck.material.polygonOffsetUnits = -1;
  // Верхняя площадка крыльца (rect586) в уровне пола, заходит под край у двери.
  const porchDeck = planBox([
    [0.651, 17.88], [7.386, 17.88], [7.386, 20.032], [0.651, 20.032],
  ], FLOOR * 2 / 3, FLOOR, FLOOR_C, false);
  porchDeck.material.polygonOffset = true;
  porchDeck.material.polygonOffsetFactor = -1;
  porchDeck.material.polygonOffsetUnits = -1;

  const prevSection = api.sectionHeight();
  api.sectionHeight(null);
  const ceilingSlab = (inner) => {
    const mesh = planBox(inner, CEIL_BOT, CEIL_TOP, 0xffffff, false);
    delete mesh.userData.finish;
    delete mesh.userData.section;
    mesh.material.color.setHex(0xffffff);
    mesh.userData.roof = true;
    mesh.userData.ceiling = true;
    return mesh;
  };
  ceilingSlab([
    [V31_FLOOR_WEST[0], V31_FLOOR_WEST[1]], [V31_FLOOR_WEST[2], V31_FLOOR_WEST[1]],
    [V31_FLOOR_WEST[2], V31_FLOOR_WEST[3]], [V31_FLOOR_WEST[0], V31_FLOOR_WEST[3]],
  ]);
  ceilingSlab([
    [V31_FLOOR_EAST[0], V31_FLOOR_EAST[1]], [V31_FLOOR_EAST[2], V31_FLOOR_EAST[1]],
    [V31_FLOOR_EAST[2], V31_FLOOR_EAST[3]], [V31_FLOOR_EAST[0], V31_FLOOR_EAST[3]],
  ]);
  api.sectionHeight(prevSection);

  addVar31FurnitureFloor(api, FLOOR);

  const world = (x, y, z) => {
    const [e, n] = planToWorld(x, y);
    return [e, z, n];
  };

  // Два слоя: 1) главный/терраса до стены коридора; 2) крыло сверху внахлёст у угла.
  const pushW = (arr, a, b, c) => arr.push([world(...a), world(...b), world(...c)]);
  const quadW = (arr, a, b, c, d) => { pushW(arr, a, b, c); pushW(arr, a, c, d); };
  const axis = (lo, hi, step, extras) => {
    const s = new Set();
    for (const v of extras) if (v != null && Number.isFinite(v)) s.add(+v.toFixed(4));
    for (let v = lo; v <= hi + 1e-9; v += step) s.add(+v.toFixed(4));
    return [...s].sort((a, b) => a - b);
  };
  const emitLayer = (zAt, xs, ys, edgeFns) => {
    const tops = [];
    const bottoms = [];
    const sides = [];
    const sample = (x, y) => {
      const z = zAt(x, y);
      return z == null ? null : [x, y, z];
    };
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const a = sample(xs[i], ys[j]);
        const b = sample(xs[i + 1], ys[j]);
        const c = sample(xs[i + 1], ys[j + 1]);
        const d = sample(xs[i], ys[j + 1]);
        const pts = [a, b, c, d];
        const n = pts.filter(Boolean).length;
        if (n < 3) continue;
        if (n === 4) {
          pushW(tops, a, b, c);
          pushW(tops, a, c, d);
          const drop = (p) => [p[0], p[1], p[2] - ROOF_THICK];
          pushW(bottoms, drop(a), drop(c), drop(b));
          pushW(bottoms, drop(a), drop(d), drop(c));
        } else {
          const tri = pts.filter(Boolean);
          pushW(tops, tri[0], tri[1], tri[2]);
          const bot = tri.map((p) => [p[0], p[1], p[2] - ROOF_THICK]);
          pushW(bottoms, bot[0], bot[2], bot[1]);
        }
      }
    }
    const edgeRun = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b) continue;
        quadW(sides, a, b, [b[0], b[1], b[2] - ROOF_THICK], [a[0], a[1], a[2] - ROOF_THICK]);
      }
    };
    const along = (n, fn) => {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const p = sample(...fn(i / n));
        if (p) out.push(p);
      }
      return out;
    };
    for (const [n, fn] of edgeFns) edgeRun(along(n, fn));
    if (!tops.length) return;
    withFinish("roof", () => {
      const mesh = asRoof(addMesh(geometryFromTriangles(tops.concat(bottoms, sides)), ROOF_C));
      mesh.material.flatShading = true;
      mesh.material.emissive?.setHex(0x151210);
      mesh.material.needsUpdate = true;
      return mesh;
    });
  };
  const valleyXs = [];
  for (let x = xCorr; x <= x0E + 1e-9; x += 0.25) valleyXs.push(x);
  const valleyYs = valleyXs.map((x) => yClip(x));
  // 1) Запад + терраса до стены коридора (под нахлестом крыла). Без выноса над крыльцом.
  emitLayer(
    westZ,
    axis(x0W, xCorr, 0.20, [x0W, xRW, x1W, xCorr, xPlateW]),
    axis(y0S, y0N, 0.20, [y0S, yR0, y0N, yPlateS]),
    [
      [28, (t) => [x0W, y0S + t * (y0N - y0S)]],
      [24, (t) => [x0W + t * (xCorr - x0W), y0N]],
      [24, (t) => [x0W + t * (xCorr - x0W), y0S]],
      [16, (t) => [xCorr, y0S + t * (y0N - y0S)]],
    ]
  );
  // 2) Восток дома + крыло одним слоем — ендова без трещины по скату.
  emitLayer(
    eastJoinZ,
    axis(xCorr, Math.max(x0E, x1E), 0.18, [xCorr, xR1, xRE, x1E, x0E, ...valleyXs]),
    axis(y1S, y0N, 0.18, [
      y1S, yRS, y0S, yPlateS, yR0, y0N, ...valleyYs,
      yValley(xR1), yValley(x0E), yValley(xCorr),
    ]),
    [
      [24, (t) => [xCorr + t * (x1E - xCorr), y1S]],
      [28, (t) => [x1E, y1S + t * (y0N - y1S)]],
      [24, (t) => [xCorr + t * (x0E - xCorr), y0N]],
      [16, (t) => [xCorr, yClip(xCorr) + t * (y0N - yClip(xCorr))]],
      // Карниз ендовы не рвём боковиной — только наружные края.
    ]
  );
  // 3) Нахлест крыла над террасой: от угла x1W до стены xCorr.
  emitLayer(
    eastLapZ,
    axis(x1W, xCorr, 0.16, [x1W, xCorr]),
    axis(y1S, yClip(x1W) + 0.05, 0.16, [y1S, yRS, y0S, yPlateS, yClip(x1W), yClip(xCorr)]),
    [
      [16, (t) => [x1W + t * (xCorr - x1W), y1S]],
      [20, (t) => [x1W, y1S + t * (yClip(x1W) - y1S)]],
      [16, (t) => [x1W + t * (xCorr - x1W), y0S]],
      [16, (t) => {
        const x = x1W + t * (xCorr - x1W);
        return [x, yClip(x)];
      }],
    ]
  );

  // Колонны южной террасы — до низа кровли.
  for (const [x0, y0, x1, y1] of COLUMNS) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const zBot = PLINTH;
    const zTop = Math.max(zBot + 0.5, (houseZ(cx, cy) != null ? houseZ(cx, cy) : Ze) - ROOF_THICK);
    planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], zBot, zTop, WOOD);
  }

  // Отмостка 1 м по периметру отапливаемого контура (как Д4/Д6).
  {
    const hole = [
      [-5.41, 18.31], [14.85, 18.31], [14.85, 0.80],
      [8.22, 0.80], [8.22, 7.25], [-5.41, 7.25],
    ];
    const outer = [
      [-6.41, 19.31], [15.85, 19.31], [15.85, -0.20],
      [7.22, -0.20], [7.22, 6.25], [-6.41, 6.25],
    ];
    const blind = api.addSlabHole(outer, hole, 0.02, 0.03, 0xd4cfc4);
    if (blind) {
      blind.material.polygonOffset = true;
      blind.material.polygonOffsetFactor = -2;
      blind.material.polygonOffsetUnits = -2;
    }
  }

  // Забор: ворота и калитка на севере; запад сплошной. Ворота откатываются на запад.
  {
    const fenceH = 1.5;
    const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
    const nw = plot[0];
    const sw = plot[3];
    const g = V31B_GATE;
    const post = (p) => api.planBox(
      [[p[0] - 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] + 0.08], [p[0] - 0.08, p[1] + 0.08]],
      0, 1.68, 0x4a4036
    );
    // Север: пролёты вокруг ворот (4 м) и калитки справа.
    api.addWallRun(plot[0], [g.x0, g.y], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun([g.x1, g.y], [g.ped0, g.y], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun([g.ped1, g.y], plot[1], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[1], plot[2], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[2], plot[3], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(nw, sw, 0.06, 0, fenceH, 0x7d6a52);
    // Калитка (полотно).
    api.addWallRun([g.ped0 + 0.04, g.y], [g.ped1 - 0.04, g.y], 0.025, 0.08, 1.46, 0x8a7358);
    // Откатные ворота открыты в карман на запад (вдоль севера).
    const leaf0 = g.x0 - 3.90;
    const leaf1 = g.x0 - 0.10;
    api.addWallRun([leaf0, g.y - 0.01], [g.x1 + 0.05, g.y - 0.01], 0.015, 0, 0.025, 0x2c3038);
    api.addWallRun([leaf0, g.y - 0.16], [leaf1, g.y - 0.16], 0.04, 0.11, 1.48, 0x8a7358);
    api.addWallRun([leaf0, g.y - 0.34], [leaf1, g.y - 0.34], 0.04, 0.11, 1.48, 0x8a7358);
    for (const x of [leaf0 + 0.35, leaf1 - 0.35]) {
      api.addWallRun([x, g.y - 0.13], [x, g.y - 0.37], 0.045, 0.025, 0.105, 0x1a1c20);
    }
    api.addWallRun([g.x0 - 0.20, g.y - 0.42], [g.x0 + 0.20, g.y - 0.68], 0.16, 0, 0.045, 0xc8c4bc);
    const pin = [g.x0, g.y - 0.38];
    api.planBox(
      [[pin[0] - 0.04, pin[1] - 0.04], [pin[0] + 0.04, pin[1] - 0.04], [pin[0] + 0.04, pin[1] + 0.04], [pin[0] - 0.04, pin[1] + 0.04]],
      0.10, 0.22, 0xc5c8cc
    );
    for (const x of [plot[0][0], leaf0, g.x0, g.x1, g.ped0, g.ped1, plot[1][0]]) {
      post([x, g.y]);
    }
    post(plot[2]); post(plot[3]); post(sw);

    const mark = (mesh) => {
      if (mesh) {
        mesh.material.polygonOffset = true;
        mesh.material.polygonOffsetFactor = -1;
        mesh.material.polygonOffsetUnits = -1;
      }
      return mesh;
    };
    const TILE_Y0 = 0.03;
    const TILE_H = 0.035;
    const xTileW = leaf0 - 0.2;
    const xTileE = g.ped1; // до края калитки
    const yTileS = 8.70;
    // Двор/парковка у дома до севера и до калитки.
    mark(api.addSlab([
      [xTileW, g.y], [xTileE, g.y], [xTileE, yTileS], [xTileW, yTileS],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    // Полоса вдоль дома к востоку до западной стены (стык с отмосткой).
    mark(api.addSlab([
      [xTileE, 18.20], [-5.13, 18.20], [-5.13, g.y], [xTileE, g.y],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    // Заезд с северной дороги (13 м от забора) на проём ворот и калитку.
    const roadNear = g.y + 13;
    mark(api.addSlab([
      [g.x0, roadNear], [g.ped1, roadNear], [g.ped1, g.y], [g.x0, g.y],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
  }

  // Фасады для отделки (наружные плоскости).
  const opening = (u0, u1, kind) => ({
    u0, u1,
    z0: kind === "pan" ? PAN_SILL : kind === "door" ? PLINTH : YELL_SILL,
    z1: HEAD,
    kind,
  });
  const fromPlan = (along, outer, span0, span1) => OPENINGS.flatMap((op) => {
    if (op[4] === "i") return [];
    const [x0, y0, x1, y1, k] = op;
    const mid = along === "x" ? (y0 + y1) / 2 : (x0 + x1) / 2;
    const a = along === "x" ? Math.min(x0, x1) : Math.min(y0, y1);
    const b = along === "x" ? Math.max(x0, x1) : Math.max(y0, y1);
    const u0 = Math.max(span0, a);
    const u1 = Math.min(span1, b);
    if (Math.abs(mid - outer) > 0.45 || u1 - u0 < 0.25) return [];
    const faceKind = k === "p" ? "pan" : k === "d" ? "door" : "win";
    return [opening(u0, u1, faceKind)];
  });
  if (typeof api.mountOverlays === "function") {
    api.mountOverlays((overlayApi) => {
      const face = (spec) => api.wallFace(overlayApi, spec);
      return [
        face({ name: "v31bN", along: "x", outer: 18.26, sign: 1, span0: -5.36, span1: 14.80, eave: WALL_TOP, openings: fromPlan("x", 18.06, -5.36, 14.80) }),
        face({ name: "v31bE", along: "y", outer: 14.80, sign: 1, span0: 0.84, span1: 18.26, eave: WALL_TOP, openings: fromPlan("y", 14.60, 0.84, 18.26) }),
        face({ name: "v31bS", along: "x", outer: 7.32, sign: -1, span0: -5.36, span1: 3.16, eave: WALL_TOP, openings: fromPlan("x", 7.52, -5.36, 3.16) }),
        face({ name: "v31bSE", along: "x", outer: 0.85, sign: -1, span0: 8.27, span1: 14.80, eave: WALL_TOP, openings: fromPlan("x", 1.05, 8.27, 14.80) }),
        face({ name: "v31bW", along: "y", outer: -5.36, sign: -1, span0: 7.30, span1: 18.26, eave: WALL_TOP, openings: fromPlan("y", -5.13, 7.30, 18.26) }),
      ];
    });
  }

  api.sectionHeight(saved);
}

export const V31B_WINDOWS = [
  { x: 12.068, y: 18.081, dx: 0, dy: -1, h: 1.78, wide: 1.378 },
  { x: -2.641, y: 18.081, dx: 0, dy: -1, h: 1.78, wide: 1.379 },
  { x: 14.595, y: 5.338, dx: -1, dy: 0, h: 1.78, wide: 1.379 },
  { x: 14.595, y: 10.099, dx: -1, dy: 0, h: 1.78, wide: 1.379 },
  { x: 14.595, y: 14.177, dx: -1, dy: 0, h: 1.78, wide: 0.691 },
  { x: 9.759, y: 18.072, dx: 0, dy: -1, h: 1.78, wide: 0.691 },
  { x: 6.786, y: 18.081, dx: 0, dy: -1, h: 1.78, wide: 1.072 },
  { x: 1.996, y: 18.081, dx: 0, dy: -1, h: 1.78, wide: 1.073 },
  { x: 8.463, y: 3.750, dx: -1, dy: 0, h: 1.78, wide: 1.073 },
  { x: 8.463, y: 6.136, dx: -1, dy: 0, h: 1.78, wide: 1.073 },
  { x: 7.053, y: 9.511, dx: 0, dy: 1, h: 1.78, wide: 0.691 },
  { x: 12.569, y: 1.043, dx: 0, dy: 1, h: 1.78, wide: 1.379 },
  { x: 0.643, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.192 },
  { x: 1.861, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.192 },
  { x: -2.837, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.193 },
  { x: -4.058, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.193 },
];
