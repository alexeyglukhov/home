// Вариант 3.1a: клон 3.1; парковочный прямоугольный навес; ворота и заезд с севера как у 3.1c.
// База: agency/var3.1.svg / abrikosovaya-22-layout-variant-3.1a-1-100.svg.
// Координаты — метры плана участка (как у Д4): x на восток, y на север.
// Крыша по лекалам: тёмно-синий конёк, белые фронтоны; скаты. Водостоки/снегорезы — позже.
import * as THREE from "three";
import { addVar31FurnitureFloor, markHouseFloor, V31_FLOOR_WEST, V31_FLOOR_EAST } from "./var31-furniture-floor.js?v=7";

export const V31A_BASE = { x: 0, y: 0 };

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
];

const COLUMNS = [
  // южная терраса
  [-5.128, 5.681, -4.725, 6.083],
  [2.789, 5.681, 3.193, 6.083],
  [-1.192, 5.681, -0.788, 6.083],
  // северное крыльцо (column-7/8 = rect532/588)
  [1.070, 19.570, 1.470, 19.970],
  [7.310, 19.570, 7.710, 19.970],
];

// Парковочный навес: прямоугольник (L без северной полосы), колонны как 3.1d.
// Восточный край — вплотную к западной стене (−5,36).
const CARPORT = {
  x0: -13.470,
  x1: -5.36,
  y0: 9.073,
  y1: 19.50, // чуть длиннее на север, без касания северного свеса/крыльца
};
const CARPORT_COLUMNS = [
  [-12.473, 9.926, -8.865, 10.518],
  [-12.475, 13.395, -11.883, 14.052],
  [-12.475, 16.857, -11.883, 17.930],
];
const CARPORT_THICK = 0.30;

// Южная терраса по обводке rect2279: без выреза, до x≈8,26.
const TERRACE = [-5.35, 4.79, 8.26, 7.44];

const PLINTH = 0.45;
const FLOOR = PLINTH + 0.12;
const FLOOR_C = 0xf3f0ea;
// Терраса и пол дома — одна плоскость и один цвет.
const TERRACE_TOP = FLOOR;
const ROOM_H = 3.00;
const SLAB = 0.20;
const CEIL_BOT = FLOOR + ROOM_H;
const CEIL_TOP = CEIL_BOT + SLAB;
const WALL_TOP = CEIL_TOP;
const HEAD = 2.45;
const YELL_SILL = 0.80;
const PAN_SILL = FLOOR + 0.01;
const WALL_C = 0xd9d3c8;
const FRAME_Y = 0xe0b83a;
const FRAME_W = 0xf7f6f2;
const GLASS = 0xb7d4e4;
const ROOF_C = 0x3a332c;
const WOOD = 0x6b5344;

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

export function v31aWalkBoxes() {
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
  for (const col of CARPORT_COLUMNS) boxes.push(norm(col));
  return boxes;
}

// Северный забор: ворота 4 м по линии зап. стены дома (x −9,36…−5,36), калитка восточнее — как 3.1c.
const V31A_GATE = { x0: -9.36, x1: -5.36, ped0: -4.96, ped1: -4.06, y: 22.877 };

export function v31aFenceSegments(houseShift = null) {
  const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
  const nw = plot[0];
  const sw = plot[3];
  const dx = sw[0] - nw[0];
  const dy = sw[1] - nw[1];
  const len = Math.hypot(dx, dy);
  const along = (s) => [nw[0] + dx / len * s, nw[1] + dy / len * s];
  const g = V31A_GATE;
  const runs = [
    [plot[0], [g.x0, g.y], 0.06],
    [[g.x1, g.y], [g.ped0, g.y], 0.06],
    [[g.ped1, g.y], plot[1], 0.06],
    [plot[1], plot[2], 0.06],
    [plot[2], plot[3], 0.06],
    [along(0), plot[3], 0.06],
    [[g.ped0 + 0.05, g.y], [g.ped1 - 0.05, g.y], 0.025],
    [[g.x0 - 3.90, g.y - 0.20], [g.x0 - 0.10, g.y - 0.20], 0.04],
    [[g.x0 - 3.90, g.y - 0.38], [g.x0 - 0.10, g.y - 0.38], 0.04],
  ];
  const mx = houseShift ? houseShift.x : 0;
  const my = houseShift ? houseShift.y : 0;
  return runs.map(([a, b, half]) => [
    a[0] - mx, a[1] - my, b[0] - mx, b[1] - my, half,
  ]);
}

export function buildVariant31a(api) {
  const HOUSE_DX = V31A_BASE.x;
  const HOUSE_DY = V31A_BASE.y;
  const shiftX = (x) => x + HOUSE_DX;
  const shiftY = (y) => y + HOUSE_DY;
  const shiftP = (x, y) => [shiftX(x), shiftY(y)];
  const { addBeam, asRoof, withFinish, withCanopy, geometryFromTriangles, addMesh } = api;
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

  // Высоты кровли нужны уже для верха стен (фронтон без зазора).
  // Толщина как у 3.1d: верх над стеной +10 см, низ софита WALL_TOP − 20 см.
  const pitch = 22 * Math.PI / 180;
  const tanP = Math.tan(pitch);
  const ROOF_OVER_WALL = 0.10;
  const ROOF_THICK = 0.30;
  const yR0 = 12.88;
  const x0W = -6.15, x0E = 15.42;
  const y0N = 19.00, y0S = 5.50;
  // Навес крыльца дотянут до западного карниза основной крыши.
  const porch = { x0: x0W, x1: 8.20, y1: 20.44 };
  const run0 = Math.max(porch.y1 - yR0, yR0 - y0S);
  // Наружные грани стен: низ ската садится сюда, стена не пробивает кровлю.
  const xPlateW = -5.36;
  const xPlateE = 14.80;
  const xPlateSpine = 8.27;
  const yPlateS = 7.30;
  const yPlateN = 18.26;
  const yPlateSE = 0.85;
  // Восточное крыло: конёк N–S, два ровных ската до ендовы.
  const xR1 = 11.48;
  const y1S = 0.18;
  const x1W = 7.50, x1E = 15.46;
  const run1 = Math.max(xR1 - x1W, x1E - xR1);
  const Ze = WALL_TOP + ROOF_OVER_WALL - tanP * (run0 - Math.abs(yPlateS - yR0));
  const Ze1 = WALL_TOP + ROOF_OVER_WALL - tanP * (run1 - Math.abs(xPlateE - xR1));
  const Zr0 = Ze + tanP * run0;
  const Zr1 = Ze1 + tanP * run1;
  // Прямая ендова: пересечение двух плоскостей одного уклона.
  const yValley = (x) => yR0 - (run0 - run1) - Math.abs(x - xR1) - (Ze - Ze1) / tanP;
  // Стык с главным скатом: ендова, но не южнее его карниза.
  const yClip = (x) => Math.max(y0S, yValley(x));
  const zMain = (x, y) => Zr0 - tanP * Math.abs(y - yR0);
  const zEast = (x, y) => Zr1 - tanP * Math.abs(x - xR1);
  // Западная грань стены коридора: южный скат над террасой доходит до неё.
  const xCorr = 8.265;
  // Дом: главный скат не заходит южнее ендовы над восточным крылом,
  // но над террасой тянется до стены коридора, а не обрывается на карнизе крыла.
  const inMain = (x, y) => {
    if (x < x0W - 0.02 || x > x0E + 0.02) return false;
    const yMin = (x >= xCorr - 0.02 && x <= x0E + 0.02) ? yClip(x) : y0S;
    if (y < yMin - 0.02) return false;
    if (y <= y0N + 0.02) return true;
    return x >= porch.x0 - 0.02 && x <= porch.x1 + 0.02 && y <= porch.y1 + 0.02;
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
  // Все стены одного уровня (как северная) — мауэрлат; фронтоны выше.
  const westGableBase = WALL_TOP;
  const eastGableBase = WALL_TOP;
  const southGableBase = WALL_TOP;

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
    // Как 3.1d: роль plinth (в стиле 30 — plinthSoft).
    planBox([[-5.41, 7.25], [8.70, 7.25], [8.70, 18.31], [-5.41, 18.31]], 0.02, PLINTH, 0x2c3038);
    planBox([[8.22, 0.80], [14.85, 0.80], [14.85, 18.31], [8.22, 18.31]], 0.02, PLINTH, 0x2c3038);
    planBox([
      [TERRACE[0], TERRACE[1]], [TERRACE[2], TERRACE[1]],
      [TERRACE[2], TERRACE[3]], [TERRACE[0], TERRACE[3]],
    ], 0.02, PLINTH, 0x2c3038);
  });
  // Ступени крыльца — бетон, не цоколь отделки.
  {
    const porchSteps = [
      [0.14, 18.29, 8.59, 20.83],
      [0.52, 18.29, 8.19, 20.45],
    ];
    porchSteps.forEach((b, i) => {
      const z1 = FLOOR * (i + 1) / 3;
      planBox([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], 0.02, z1, 0xd8d3cb);
    });
  }

  // Нахлёст плит в проёме коридор-1 ↔ коридор-2 — без канавы на стыке.
  markHouseFloor(planBox([
    [V31_FLOOR_WEST[0], V31_FLOOR_WEST[1]], [V31_FLOOR_WEST[2], V31_FLOOR_WEST[1]],
    [V31_FLOOR_WEST[2], V31_FLOOR_WEST[3]], [V31_FLOOR_WEST[0], V31_FLOOR_WEST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false));
  markHouseFloor(planBox([
    [V31_FLOOR_EAST[0], V31_FLOOR_EAST[1]], [V31_FLOOR_EAST[2], V31_FLOOR_EAST[1]],
    [V31_FLOOR_EAST[2], V31_FLOOR_EAST[3]], [V31_FLOOR_EAST[0], V31_FLOOR_EAST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false));
  // Настил террасы заходит под край пола: одна плоскость, без щели по стыку.
  const terraceDeck = planBox([
    [TERRACE[0], TERRACE[1]], [TERRACE[2], TERRACE[1]],
    [TERRACE[2], 7.66], [TERRACE[0], 7.66],
  ], PLINTH, FLOOR, FLOOR_C, false);
  terraceDeck.material.polygonOffset = true;
  terraceDeck.material.polygonOffsetFactor = -1;
  terraceDeck.material.polygonOffsetUnits = -1;
  // Верхняя площадка крыльца (rect586) заходит под пол у входной двери.
  const porchDeck = planBox([
    [1.02, 17.88], [7.79, 17.88], [7.79, 20.03], [1.02, 20.03],
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

  // Кровля ровными скатами (без сетки — край у фронтонов прямой).
  const pushW = (arr, a, b, c) => arr.push([world(...a), world(...b), world(...c)]);
  const quadW = (arr, a, b, c, d) => { pushW(arr, a, b, c); pushW(arr, a, c, d); };
  const emitShell = (topPolys, openEdges) => {
    const tops = [];
    const bottoms = [];
    const sides = [];
    for (const poly of topPolys) {
      for (let i = 1; i < poly.length - 1; i++) pushW(tops, poly[0], poly[i], poly[i + 1]);
      const bot = poly.map(([x, y, z]) => [x, y, z - ROOF_THICK]);
      for (let i = 1; i < bot.length - 1; i++) pushW(bottoms, bot[0], bot[i + 1], bot[i]);
    }
    for (const [a, b] of openEdges) {
      const [x0, y0, z0] = a;
      const [x1, y1, z1] = b;
      quadW(sides,
        [x0, y0, z0], [x1, y1, z1],
        [x1, y1, z1 - ROOF_THICK], [x0, y0, z0 - ROOF_THICK]
      );
    }
    withFinish("roof", () => {
      const mesh = asRoof(addMesh(geometryFromTriangles(tops.concat(bottoms, sides)), ROOF_C));
      mesh.material.flatShading = true;
      mesh.material.emissive?.setHex(0x151210);
      mesh.material.needsUpdate = true;
      return mesh;
    });
  };
  const P = (x, y, z) => [x, y, z];
  const ringEdges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

  // Главный двускат: конёк восток–запад, ровные скаты. Южный обрезан прямой ендовой.
  {
    const rW = P(x0W, yR0, Zr0);
    const rE = P(x0E, yR0, Zr0);
    const rAtW = P(x1W, yR0, Zr0);
    const rAtR = P(xR1, yR0, Zr0);
    const sW = P(x0W, y0S, zMain(x0W, y0S));
    const sAt = P(x1W, y0S, zMain(x1W, y0S));
    const sCorr = P(xCorr, y0S, zMain(xCorr, y0S));
    const vW = P(x1W, yValley(x1W), zMain(x1W, yValley(x1W)));
    const vCorr = P(xCorr, yValley(xCorr), zMain(xCorr, yValley(xCorr)));
    const vR = P(xR1, yValley(xR1), zMain(xR1, yValley(xR1)));
    const vE = P(x0E, yValley(x0E), zMain(x0E, yValley(x0E)));
    const southWest = [sW, sAt, rAtW, rW];
    const terraceExt = [sAt, sCorr, vCorr, vW];
    const southValW = [vW, vR, rAtR, rAtW];
    const southValE = [vR, vE, rE, rAtR];
    const nW = P(x0W, y0N, zMain(x0W, y0N));
    const nE = P(x0E, y0N, zMain(x0E, y0N));
    const pW = P(porch.x0, porch.y1, zMain(porch.x0, porch.y1));
    const pE = P(porch.x1, porch.y1, zMain(porch.x1, porch.y1));
    const nPW = P(porch.x0, y0N, zMain(porch.x0, y0N)); // = nW: крыльцо от зап. карниза
    const nPE = P(porch.x1, y0N, zMain(porch.x1, y0N));
    const northMain = [rW, rE, nE, nW];
    const porchRoof = [nPW, nPE, pE, pW];
    emitShell(
      [southWest, terraceExt, southValW, southValE, northMain, porchRoof],
      [
        [sW, sAt], [sAt, sCorr], [sCorr, vCorr],
        [rW, sW], [nW, rW],
        [nPE, nE],
        [nPE, pE], [pE, pW], [pW, nPW],
        [vE, rE], [rE, nE],
      ]
    );
  }
  // Крыло юг–север: два плоских ската от южного карниза до ендовы.
  {
    const yPeak = yValley(xR1);
    const wS = P(x1W, y1S, zEast(x1W));
    const rS = P(xR1, y1S, Zr1);
    const eS = P(x1E, y1S, zEast(x1E));
    const wV = P(x1W, yValley(x1W), zEast(x1W));
    const rV = P(xR1, yPeak, Zr1);
    const eV = P(x1E, yValley(x1E), zEast(x1E));
    const west = [wS, rS, rV, wV];
    const east = [rS, eS, eV, rV];
    emitShell(
      [west, east],
      [
        [wS, rS], [rS, eS],
        [eS, eV], [wV, wS],
        [wV, rV], [rV, eV],
      ]
    );
  }
  // Фронтоны дома — от верха стены / карниза до низа кровли.
  const gableTris = [];
  const gpush = (a, b, c) => gableTris.push([world(...a), world(...b), world(...c)]);
  // out < 0 — нормаль в минус по оси, перпендикулярной фронтону (наружу).
  const gableFillNS = (x, yS, yN, yR, zPeak, zEdge, zBase, out) => {
    const zS = zEdge(yS) - ROOF_THICK;
    const zN = zEdge(yN) - ROOF_THICK;
    const zP = zPeak - ROOF_THICK;
    const bS = Math.min(zBase, zS);
    const bN = Math.min(zBase, zN);
    const tri = (a, b, c) => (out < 0 ? gpush(a, b, c) : gpush(a, c, b));
    tri([x, yS, bS], [x, yS, zS], [x, yR, zP]);
    tri([x, yS, bS], [x, yR, zP], [x, yN, bN]);
    tri([x, yN, bN], [x, yR, zP], [x, yN, zN]);
  };
  const gableFillEW = (y, xW, xE, xR, zPeak, zEdge, zBase, out) => {
    const zW = zEdge(xW) - ROOF_THICK;
    const zE = zEdge(xE) - ROOF_THICK;
    const zP = zPeak - ROOF_THICK;
    const bW = Math.min(zBase, zW);
    const bE = Math.min(zBase, zE);
    const tri = (a, b, c) => (out < 0 ? gpush(a, b, c) : gpush(a, c, b));
    tri([xW, y, bW], [xW, y, zW], [xR, y, zP]);
    tri([xW, y, bW], [xR, y, zP], [xE, y, bE]);
    tri([xE, y, bE], [xR, y, zP], [xE, y, zE]);
  };
  gableFillNS(xPlateW, yPlateS, yPlateN, yR0, Zr0, (y) => zMain(xPlateW, y), westGableBase, -1);
  gableFillNS(xPlateE, yValley(xPlateE), yPlateN, yR0, Zr0, (y) => zMain(xPlateE, y), eastGableBase, 1);
  gableFillEW(yPlateSE, xPlateSpine, xPlateE, xR1, Zr1, (x) => zEast(x), southGableBase, 1);
  if (gableTris.length) {
    withFinish("wall", () => {
      const mesh = addMesh(geometryFromTriangles(gableTris), WALL_C);
      return mesh;
    });
  }

  // Балка в продолжение южной стены гостиной к коридору — опора стропил над террасой.
  {
    const xLivE = 3.16;
    const yBeam = (7.318 + 7.720) * 0.5;
    const zBeam = WALL_TOP - (ROOF_THICK - ROOF_OVER_WALL) * 0.5;
    const [e0, n0] = planToWorld(xLivE, yBeam);
    const [e1, n1] = planToWorld(xCorr, yBeam);
    const mesh = addBeam([e0, zBeam, n0], [e1, zBeam, n1], 0.22, WALL_C);
    if (mesh) {
      delete mesh.userData.finish;
      mesh.userData.roof = true;
    }
  }

  // Колонны террасы и крыльца — до низа кровли (в стиле 30 — кирпич).
  withFinish("column", () => {
    for (const [x0, y0, x1, y1] of COLUMNS) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const zBot = FLOOR;
      const zTop = Math.max(zBot + 0.5, (houseZ(cx, cy) != null ? houseZ(cx, cy) : Ze) - ROOF_THICK);
      planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], zBot, zTop, WOOD);
    }
  });

  // Прямоугольный парковочный навес: вплотную к зап. стене, верх чуть ниже низа свеса.
  withCanopy(() => {
    const { x0, x1, y0, y1 } = CARPORT;
    // Чуть выше прежнего; зазор 1 см до верха свеса, без касания.
    const zTop = Ze - 0.01;
    const zBot = zTop - CARPORT_THICK;
    const prev = api.sectionHeight();
    api.sectionHeight(null);
    withFinish("roof", () => {
      const mesh = asRoof(api.addSlab(
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => shiftP(x, y)),
        zBot, CARPORT_THICK, ROOF_C, false
      ));
      mesh.material.flatShading = true;
      mesh.material.emissive?.setHex(0x151210);
      mesh.material.needsUpdate = true;
      return mesh;
    });
    api.sectionHeight(prev);
    const colZ0 = 0;
    const colZ1 = zBot - 0.01;
    withFinish("column", () => {
      for (const [cx0, cy0, cx1, cy1] of CARPORT_COLUMNS) {
        planBox([[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]], colZ0, colZ1, WOOD);
      }
    });
  });

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

  // Забор: ворота и калитка на севере как у 3.1c; запад сплошной. Ворота откатываются на запад.
  {
    const fenceH = 1.5;
    const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
    const nw = plot[0];
    const sw = plot[3];
    const g = V31A_GATE;
    const post = (p) => api.planBox(
      [[p[0] - 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] + 0.08], [p[0] - 0.08, p[1] + 0.08]],
      0, 1.68, 0x4a4036
    );
    api.addWallRun(plot[0], [g.x0, g.y], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun([g.x1, g.y], [g.ped0, g.y], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun([g.ped1, g.y], plot[1], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[1], plot[2], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[2], plot[3], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(nw, sw, 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun([g.ped0 + 0.04, g.y], [g.ped1 - 0.04, g.y], 0.025, 0.08, 1.46, 0x8a7358);
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
    const xTileE = g.ped1;
    const yTileS = 6.25;
    mark(api.addSlab([
      [xTileW, g.y], [xTileE, g.y], [xTileE, yTileS], [xTileW, yTileS],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    mark(api.addSlab([
      [xTileE, 18.20], [-5.13, 18.20], [-5.13, g.y], [xTileE, g.y],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    const roadNear = g.y + 13;
    mark(api.addSlab([
      [g.x0, roadNear], [g.ped1, roadNear], [g.ped1, g.y], [g.x0, g.y],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    // Парковка под навесом — уровень плитки/дороги.
    const { x0: cx0, x1: cx1, y0: cy0, y1: cy1 } = CARPORT;
    mark(api.addSlab(
      [[cx0, cy1], [cx1, cy1], [cx1, cy0], [cx0, cy0]],
      TILE_Y0, TILE_H, 0xe4ddd2, false
    ));
  }

  // Фасады для отделки (наружные плоскости).
  const opening = (u0, u1, kind, z0) => ({
    u0, u1,
    z0: z0 != null ? z0 : kind === "pan" ? PAN_SILL : kind === "door" ? PLINTH : YELL_SILL,
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
    const z0 = k === "d" && y0 > 17.7 ? FLOOR : undefined;
    return [opening(u0, u1, faceKind, z0)];
  });
  const gableMain = (u0, u1) => ({
    u0, u1, peakU: yR0, peakZ: Zr0 - ROOF_THICK, eave: WALL_TOP, over: 0, drop: 0,
  });
  if (typeof api.mountOverlays === "function") {
    api.mountOverlays((overlayApi) => {
      const face = (spec) => api.wallFace(overlayApi, spec);
      return [
        face({ name: "v31aN", along: "x", outer: 18.26, sign: 1, span0: -5.36, span1: 14.80, eave: WALL_TOP, openings: fromPlan("x", 18.06, -5.36, 14.80) }),
        face({
          name: "v31aE", along: "y", outer: 14.80, sign: 1, span0: 0.84, span1: 18.26, eave: WALL_TOP,
          gable: gableMain(yValley(xPlateE), yPlateN),
          openings: fromPlan("y", 14.60, 0.84, 18.26),
        }),
        face({ name: "v31aS", along: "x", outer: 7.32, sign: -1, span0: -5.36, span1: 3.16, eave: WALL_TOP, openings: fromPlan("x", 7.52, -5.36, 3.16) }),
        face({
          name: "v31aSE", along: "x", outer: 0.85, sign: -1, span0: 8.27, span1: 14.80, eave: WALL_TOP,
          gable: { u0: xPlateSpine, u1: xPlateE, peakU: xR1, peakZ: Zr1 - ROOF_THICK, eave: WALL_TOP, over: 0, drop: 0 },
          openings: fromPlan("x", 1.05, 8.27, 14.80),
        }),
        face({
          name: "v31aW", along: "y", outer: -5.36, sign: -1, span0: 7.30, span1: 18.26, eave: WALL_TOP,
          gable: gableMain(yPlateS, yPlateN),
          openings: fromPlan("y", -5.13, 7.30, 18.26),
        }),
      ];
    });
  }

  api.sectionHeight(saved);
}

export const V31A_WINDOWS = [
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
