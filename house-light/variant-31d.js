// Вариант 3.1d: план как 3.1; П-крыша, общий угол скатов; свес 0,80 м,
// над террасой у гостиной ~1,84 м. Коньки по своему прогону.
// Гостиная: второй свет — вырез плиты до изгиба конька у фронтона, стены выреза
// до кровли; верхний ярус окон по скату. Координаты — метры плана (x восток, y север).
import * as THREE from "three";
import { addVar31FurnitureFloor, markHouseFloor, V31_FLOOR_WEST, V31_FLOOR_EAST } from "./var31-furniture-floor.js?v=7";

export const V31D_BASE = { x: 0, y: 0 };

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
  // терраса — по agency/var3.1d.svg rect2720 / rect2718
  [-5.449, 5.713, -4.969, 6.191],
  [2.656, 5.712, 3.136, 6.190],
  // навес крыльца
  [1.070, 19.570, 1.470, 19.970],
  [7.310, 19.570, 7.710, 19.970],
];

// Навес для авто — L по agency/var3.1d.svg rect1753: западный рукав + северная полоса до крыльца.
// Колонны rect1691/1693/1695 (визуально у западного края; привязка к карнизу слоя «крыша»).
const CARPORT_POLY = [
  [-13.470, 9.073],
  [-6.165, 9.073],
  [-6.165, 19.112],
  [0.215, 19.112],
  [0.215, 19.965],
  [-13.470, 19.965],
];
const CARPORT = {
  x0: -13.470,
  x1: 0.215,
  y0: 9.073,
  y1: 19.965,
  xArm: -6.165, // вост. край западного рукава / начало северной полосы
  yArm: 19.112, // юг северной полосы
};
const CARPORT_COLUMNS = [
  // rect1691 — южная широкая
  [-12.473, 9.926, -8.865, 10.518],
  // rect1695 — средняя
  [-12.475, 13.395, -11.883, 14.052],
  // rect1693 — северная
  [-12.475, 16.857, -11.883, 17.930],
];

// Южная терраса по обводке rect2279: без выреза, до x≈8,26.
const TERRACE = [-5.35, 4.79, 8.26, 7.44];

// Второй свет: ширина по внутренним граням гостиной; глубина — до изгиба зап. конька (yValW≈11,56).
const LIV_VOID = { x0: -4.908, x1: 2.756, y0: 7.720, y1: 11.56 };
const LIV_SOUTH_Y = 7.52; // середина южной стены гостиной

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
// Обычные (не панорамные) окна: низ 0,80 м и верх 2,00 м от пола.
const YELL_SILL = FLOOR + 0.80;
const YELL_HEAD = FLOOR + 2.00;
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

export function v31dWalkBoxes() {
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

export function v31dFenceSegments(houseShift = null) {
  const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
  const nw = plot[0];
  const sw = plot[3];
  const dx = sw[0] - nw[0];
  const dy = sw[1] - nw[1];
  const len = Math.hypot(dx, dy);
  const along = (s) => [nw[0] + dx / len * s, nw[1] + dy / len * s];
  const inward = [-dy / len, dx / len];
  const shift = (p, dist) => [p[0] + inward[0] * dist, p[1] + inward[1] * dist];
  const runs = [
    [plot[0], plot[1], 0.06],
    [plot[1], plot[2], 0.06],
    [plot[2], plot[3], 0.06],
    [along(10), plot[3], 0.06],
    [plot[0], along(5), 0.06],
    [along(9.10), along(9.90), 0.025],
    [shift(along(0.70), 0.16), shift(along(4.70), 0.16), 0.04],
    [shift(along(0.70), 0.34), shift(along(4.70), 0.34), 0.04],
  ];
  const mx = houseShift ? houseShift.x : 0;
  const my = houseShift ? houseShift.y : 0;
  return runs.map(([a, b, half]) => [
    a[0] - mx, a[1] - my, b[0] - mx, b[1] - my, half,
  ]);
}

export function buildVariant31d(api) {
  const HOUSE_DX = V31D_BASE.x;
  const HOUSE_DY = V31D_BASE.y;
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

  // Крыша по agency/var3.1d.svg слой «крыша» (выровнено):
  // синий = конёк, салатовый = перегиб наружу (45°), красный = ендова/край.
  // Свес 0,80 м; над террасой у гостиной глубже (~1,84 м). Конёк mid — середина N↔SM.
  const pitch = 22 * Math.PI / 180;
  const tanP = Math.tan(pitch);
  // Верх скатов как при 10 см над стеной; +20 см толщины вниз (низ на грани стены = WALL_TOP − 0,20).
  const ROOF_OVER_WALL = 0.10;
  const ROOF_THICK = 0.30;
  const EAVE = 0.80;
  const EAVE_TERR = 1.84; // карниз WO/WI над террасой по схеме
  const EAVE_PORCH = 0.80;
  const xWallW = -5.36;
  const xWallE = 14.80;
  const xWallOffW = 8.27;
  const xWallLivE = 3.16;
  const yWallN = 18.26;
  const yWallSLiv = 7.30;
  const yWallSOff = 0.85;
  const xW0 = xWallW - EAVE;
  const xE1 = xWallE + EAVE;
  const xW1 = xWallLivE + EAVE;
  const xE0 = xWallOffW - EAVE;
  const yN = yWallN + EAVE;
  const ySLiv = yWallSLiv - EAVE_TERR; // глубокий карниз гостиной
  const ySOff = yWallSOff - EAVE;
  // Карниз mid/двора — обычный свес 0,80 м (ступенька у xW1 на схеме).
  const ySMid = yWallSLiv - EAVE;
  // Коньки строго посередине своих сегментов; бёдра 45° в плане.
  const xRW = (xW0 + xW1) * 0.5;
  const xRE = (xE0 + xE1) * 0.5;
  const runW = xRW - xW0;
  const runE = xE1 - xRE;
  const yRN = (yN + ySMid) * 0.5;
  const runN = yN - yRN;
  const xMidW = xW0 + runN;
  const xMidE = xE1 - runN;
  const yValW = ySMid + runW;
  const yValE = ySMid + runE;
  // Верх ската на наружной грани стены = WALL_TOP + ROOF_OVER_WALL;
  // низ (софит) = WALL_TOP − (ROOF_THICK − ROOF_OVER_WALL).
  const Ze = WALL_TOP + ROOF_OVER_WALL - tanP * EAVE;
  const ZrM = Ze + tanP * runN;
  const ZrW = Ze + tanP * runW;
  const ZrE = Ze + tanP * runE;
  const zN = (y) => Ze + tanP * (yN - y);
  const zSM = (y) => Ze + tanP * (y - ySMid);
  const zWO = (x) => Ze + tanP * (x - xW0);
  const zWI = (x) => Ze + tanP * (xW1 - x);
  const zEO = (x) => Ze + tanP * (xE1 - x);
  const zEI = (x) => Ze + tanP * (x - xE0);
  const zWest = (x) => (x <= xRW ? zWO(x) : zWI(x));
  const zEast = (x) => (x >= xRE ? zEO(x) : zEI(x));
  // Фронтоны по стенам плана (не по карнизу SVG).
  const xLivW = -5.36;
  const xLivE = 3.16;
  const xOffW = 8.27;
  const xOffE = 14.80;
  const yPlateS = 7.30;
  const yPlateSE = 0.85;

  const houseZ = (x, y) => {
    let best = -Infinity;
    const take = (z) => { if (z > best) best = z; };
    // N: севернее mid-конька, между СЗ/СВ бёдрами.
    if (y >= yRN - 0.02 && y <= yN + 0.02 && x >= xW0 - 0.02 && x <= xE1 + 0.02) {
      if (x + y >= xW0 + yN - 0.02 && x - y <= xE1 - yN + 0.02) take(zN(y));
    }
    // SM: южнее mid-конька до карниза двора; с З/В — до диагоналей WO∩SM / EO∩SM и ендов.
    if (y <= yRN + 0.02 && y >= ySMid - 0.02) {
      const onWdiag = y <= ySMid + (x - xW0) + 0.02;
      const onEdiag = y <= ySMid + (xE1 - x) + 0.02;
      const onWval = xW1 - x >= y - ySMid - 0.02;
      const onEval = x - xE0 >= y - ySMid - 0.02;
      if (onWdiag && onEdiag && onWval && onEval) take(zSM(y));
    }
    // WO: зап. рукав + клин к midW (сев. диагонали WO∩SM, южн. СЗ бедра).
    if (x <= xRW + 0.02 && x >= xW0 - 0.02 && y >= ySLiv - 0.02 && y <= yN + 0.02) {
      if (x + y <= xW0 + yN + 0.02) take(zWO(x));
    }
    if (x >= xRW - 0.02 && x <= xMidW + 0.02 && y >= ySMid + (x - xW0) - 0.02 && y <= yN - (x - xW0) + 0.02) {
      take(zWO(x));
    }
    // EO: вост. рукав + клин к midE.
    if (x >= xRE - 0.02 && x <= xE1 + 0.02 && y >= ySOff - 0.02 && y <= yN + 0.02) {
      if (x - y >= xE1 - yN - 0.02) take(zEO(x));
    }
    if (x <= xRE + 0.02 && x >= xMidE - 0.02 && y >= ySMid + (xE1 - x) - 0.02 && y <= yN - (xE1 - x) + 0.02) {
      take(zEO(x));
    }
    // WI: восток от конька W до ендовы WI∩SM; юг до жилого карниза.
    if (x >= xRW - 0.02 && x <= xW1 + 0.02 && y >= ySLiv - 0.02 && y <= yValW + 0.02) {
      if (y <= ySMid + 0.02 || xW1 - x >= y - ySMid - 0.02) take(zWI(x));
    }
    // EI: запад от конька E до ендовы EI∩SM; юг до карниза кабинета.
    if (x <= xRE + 0.02 && x >= xE0 - 0.02 && y >= ySOff - 0.02 && y <= yValE + 0.02) {
      if (y <= ySMid + 0.02 || x - xE0 >= y - ySMid - 0.02) take(zEI(x));
    }
    // Козырёк крыльца выше плоскости N внутри бёдер.
    if (x >= porchX0 - 0.02 && x <= porchX1 + 0.02 && y <= porchYN + 0.02 && y >= yMeet - 0.02) {
      if ((x - porchX0) >= (yN - y) - 0.02 && (porchX1 - x) >= (yN - y) - 0.02) {
        take(Ze + tanP * Math.min(x - porchX0, porchX1 - x));
      }
    }
    return best > -Infinity ? best : null;
  };
  const southGableBase = WALL_TOP;

  withFinish("wall", () => {
    for (const wall of WALLS) {
      const [x0, y0, x1, y1] = wall;
      const vertical = (x1 - x0) < (y1 - y0);
      const zTop = WALL_TOP;
      const holes = OPENINGS.filter((op) => hit(wall, op)).map((op) => {
        const sill = op[4] === "p" ? PAN_SILL : op[4] === "d" || op[4] === "i" ? PLINTH : YELL_SILL;
        const head = op[4] === "y" ? YELL_HEAD : HEAD;
        if (vertical) return { a: Math.max(y0, op[1]), b: Math.min(y1, op[3]), z0: sill, z1: head, kind: op[4] };
        return { a: Math.max(x0, op[0]), b: Math.min(x1, op[2]), z0: sill, z1: head, kind: op[4] };
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
        // Над панорамами гостиной — второй свет: полосу HEAD→WALL_TOP не зашиваем.
        const livPan = h.kind === "p" && !vertical
          && h.a >= LIV_VOID.x0 - 0.05 && h.b <= LIV_VOID.x1 + 0.05
          && Math.abs(((y0 + y1) / 2) - LIV_SOUTH_Y) < 0.4;
        if (!livPan) span(h.a, h.b, h.z1, zTop);
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
    // Цоколь отапливаемого контура и террасы — роль plinth (тёмный на стиле roof-d).
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

  // Перекрытие: белая плита как у 3.1 (CEIL_BOT…CEIL_TOP) — низ не ниже балки.
  // Вырез второго света до изгиба конька гостиной (yValW). Скрывается с крышей.
  // Над террасой между гостиной и коридором — до балки.
  const ceilTop = CEIL_TOP;
  const livVoid = { x0: LIV_VOID.x0, x1: LIV_VOID.x1, y0: LIV_VOID.y0, y1: yValW };
  const yCeilBeam = (7.318 + 7.720) * 0.5;
  {
    const ceilPoly = [
      [livVoid.x0, livVoid.y1],
      [-4.908, 17.859],
      [14.403, 17.859],
      [14.403, 1.248],
      [8.265, 1.248],
      [8.265, yCeilBeam],
      [xLivE, yCeilBeam],
      [xLivE, livVoid.y0],
      [livVoid.x1, livVoid.y0],
      [livVoid.x1, livVoid.y1],
    ];
    const prev = api.sectionHeight();
    api.sectionHeight(null);
    const mesh = api.addSlab(
      ceilPoly.map(([x, y]) => shiftP(x, y)),
      CEIL_BOT,
      SLAB,
      0xffffff,
      false
    );
    delete mesh.userData.finish;
    delete mesh.userData.section;
    mesh.material.color.setHex(0xffffff);
    // Сдвиг по глубине — без мерцания на ребре выреза со стенками второго света.
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = 2;
    mesh.material.polygonOffsetUnits = 2;
    mesh.userData.roof = true;
    mesh.userData.ceiling = true;
    api.sectionHeight(prev);
  }

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
  // Узлы по SVG «крыша»: коньки / бёдра / ендовы = пересечения плоскостей.
  const midW = P(xMidW, yRN, ZrM);       // зап. конец mid-конька (N∩SM∩WO)
  const midE = P(xMidE, yRN, ZrM);       // вост. конец mid-конька (N∩SM∩EO)
  const Wturn = P(xRW, yValW, ZrW);      // поворот зап. конька (WO∩SM∩WI)
  const Eturn = P(xRE, yValE, ZrE);      // поворот вост. конька (EO∩SM∩EI)
  const ridgeWS = P(xRW, ySLiv, ZrW);    // зап. конёк у южного фронтона
  const ridgeES = P(xRE, ySOff, ZrE);    // вост. конёк у южного фронтона
  const NW = P(xW0, yN, Ze);
  const NE = P(xE1, yN, Ze);
  const valWe = P(xW1, ySMid, Ze);       // WI∩SM у карниза mid
  const valEe = P(xE0, ySMid, Ze);       // EI∩SM у карниза mid
  const eavWS = P(xW0, ySLiv, Ze);
  const livSE = P(xW1, ySLiv, Ze);       // внутр. угол жилого карниза
  const eavES = P(xE1, ySOff, Ze);
  const offSW = P(xE0, ySOff, Ze);       // внутр. угол карниза кабинета
  const Ww = P(xW0, yValW, Ze);          // зап. карниз на широте поворота
  const Ew = P(xE1, yValE, Ze);          // вост. карниз на широте поворота
  // Двухскатный козырёк крыльца: конёк С–Ю врезается в северный скат.
  const porchX0 = 1.02 - EAVE_PORCH;
  const porchX1 = 7.79 + EAVE_PORCH;
  const porchYN = 20.03 + EAVE_PORCH;
  const pRW = (porchX0 + porchX1) * 0.5;
  const runP = pRW - porchX0;
  const yMeet = yN - runP;              // высота = плоскость N; бёдра 45°
  const ZrP = Ze + tanP * runP;         // = zN(yMeet)
  const pTip = P(pRW, yMeet, ZrP);
  const pRidgeN = P(pRW, porchYN, ZrP);
  const pNW = P(porchX0, porchYN, Ze);
  const pNE = P(porchX1, porchYN, Ze);
  const pSW = P(porchX0, yN, Ze);       // на северном карнизе main
  const pSE = P(porchX1, yN, Ze);

  // N с вырезом по бёдрам козырька: скат не закрывает фронтон на северной стене.
  const yGable = yWallN;
  const xGableL = porchX0 + (yN - yGable);
  const xGableR = porchX1 - (yN - yGable);
  const zMeet = zN(yMeet);
  const westAtMeet = P(xW0 + (yN - yMeet), yMeet, zMeet);
  const eastAtMeet = P(xE1 - (yN - yMeet), yMeet, zMeet);
  emitShell(
    [
      [midW, midE, eastAtMeet, westAtMeet],
      [NW, westAtMeet, pTip, pSW],
      [NE, pSE, pTip, eastAtMeet],
    ],
    [
      [midW, midE], [midE, eastAtMeet], [eastAtMeet, NE],
      [NE, pSE], [pSE, pTip], [pTip, pSW], [pSW, NW], [NW, westAtMeet], [westAtMeet, midW],
    ]
  );
  // SM: mid юг; З/В диагонали WO∩SM / EO∩SM; ендовы; карниз двора.
  emitShell(
    [[midW, midE, Eturn, valEe, valWe, Wturn]],
    [
      [midW, midE], [midE, Eturn], [Eturn, valEe],
      [valEe, valWe], [valWe, Wturn], [Wturn, midW],
    ]
  );
  // WO: южный прямоугольник + север с диагональю WO∩SM и СЗ бедром.
  emitShell(
    [
      [eavWS, ridgeWS, Wturn, Ww],
      [Ww, Wturn, midW, NW],
    ],
    [
      [eavWS, ridgeWS], [ridgeWS, Wturn], [Wturn, midW], [midW, NW],
      [NW, eavWS],
    ]
  );
  // WI: конёк W; ендова WI∩SM; карниз и стойка у двора.
  emitShell(
    [[ridgeWS, Wturn, valWe, livSE]],
    [[ridgeWS, Wturn], [Wturn, valWe], [valWe, livSE], [livSE, ridgeWS]]
  );
  // EO: южный прямоугольник + север с диагональю EO∩SM и СВ бедром.
  emitShell(
    [
      [eavES, ridgeES, Eturn, Ew],
      [Ew, Eturn, midE, NE],
    ],
    [
      [eavES, ridgeES], [ridgeES, Eturn], [Eturn, midE], [midE, NE],
      [NE, eavES],
    ]
  );
  // EI: конёк E; ендова EI∩SM; карниз кабинета и стойка у двора.
  emitShell(
    [[ridgeES, Eturn, valEe, offSW]],
    [[ridgeES, Eturn], [Eturn, valEe], [valEe, offSW], [offSW, ridgeES]]
  );
  // Козырёк крыльца: два ската, конёк до врезки в N, бёдра 45°, свес 0,80 м.
  emitShell(
    [
      [pSW, pTip, pRidgeN, pNW],
      [pSE, pTip, pRidgeN, pNE],
    ],
    [
      [pSW, pTip], [pTip, pRidgeN], [pRidgeN, pNW], [pNW, pSW],
      [pSE, pTip], [pRidgeN, pNE], [pNE, pSE],
    ]
  );

  // Южные фронтоны — объём с толщиной стены, на которой стоят.
  const gableTris = [];
  const gpush = (a, b, c) => gableTris.push([world(...a), world(...b), world(...c)]);
  // yOut < yIn для стены С–Ю (наружная грань южнее). outFace: +1 наружная грань на yOut.
  const gableFillEW = (yOut, yIn, x0, x1, xR, zPeak, zEdge, zBase, outFace) => {
    const zL = zEdge(x0) - ROOF_THICK;
    const zR = zEdge(x1) - ROOF_THICK;
    const zP = zPeak - ROOF_THICK;
    const bL = Math.min(zBase, zL);
    const bR = Math.min(zBase, zR);
    const face = (y, out) => {
      const tri = (a, b, c) => (out ? gpush(a, c, b) : gpush(a, b, c));
      tri([x0, y, bL], [x0, y, zL], [xR, y, zP]);
      tri([x0, y, bL], [xR, y, zP], [x1, y, bR]);
      tri([x1, y, bR], [xR, y, zP], [x1, y, zR]);
    };
    face(yOut, outFace > 0);
    if (Math.abs(yIn - yOut) > 0.02) {
      face(yIn, outFace < 0);
      const q = (a, b, c, d) => { gpush(a, b, c); gpush(a, c, d); };
      // Верх по софиту между гранями.
      q([x0, yOut, zL], [xR, yOut, zP], [xR, yIn, zP], [x0, yIn, zL]);
      q([xR, yOut, zP], [x1, yOut, zR], [x1, yIn, zR], [xR, yIn, zP]);
      // Низ и торцы.
      q([x0, yOut, bL], [x0, yIn, bL], [x1, yIn, bR], [x1, yOut, bR]);
      q([x0, yOut, bL], [x0, yOut, zL], [x0, yIn, zL], [x0, yIn, bL]);
      q([x1, yOut, bR], [x1, yIn, bR], [x1, yIn, zR], [x1, yOut, zR]);
    }
  };
  // Кабинет: стена [8.277, 0.846]–[14.787, 1.248].
  gableFillEW(0.846, 1.248, xOffW, xOffE, xRE, ZrE, (x) => zEast(x), southGableBase, 1);
  // Гостиная: фронтон толщиной южной стены [7.318…7.720]; проёмы под второй свет.
  const livUpperWins = OPENINGS
    .filter((op) => op[4] === "p" && op[1] < 8)
    .map((op) => {
      const zt0 = zWest(op[0]) - ROOF_THICK - 0.50;
      const zt1 = zWest(op[2]) - ROOF_THICK - 0.50;
      return { x0: op[0], x1: op[2], zt0, zt1 };
    })
    .filter((w) => Math.min(w.zt0, w.zt1) > HEAD + 0.2)
    .sort((a, b) => a.x0 - b.x0);
  {
    const yOut = 7.318;
    const yIn = 7.720;
    const zBase = southGableBase;
    const zRoof = (x) => zWest(x) - ROOF_THICK;
    const winTopAt = (x) => {
      for (const w of livUpperWins) {
        if (x < w.x0 - 1e-6 || x > w.x1 + 1e-6) continue;
        const t = (x - w.x0) / Math.max(1e-6, w.x1 - w.x0);
        return w.zt0 + (w.zt1 - w.zt0) * t;
      }
      return null;
    };
    const step = 0.05;
    const xs = [];
    for (let x = xLivW; x < xLivE - 1e-9; x += step) xs.push(x);
    xs.push(xLivE, xRW);
    for (const w of livUpperWins) xs.push(w.x0, w.x1);
    xs.sort((a, b) => a - b);
    const uniq = [];
    for (const x of xs) {
      if (!uniq.length || x > uniq[uniq.length - 1] + 1e-4) uniq.push(x);
    }
    const q = (a, b, c, d) => { gpush(a, b, c); gpush(a, c, d); };
    const faceOut = (a, b, c) => gpush(a, c, b);
    const faceIn = (a, b, c) => gpush(a, b, c);
    for (let i = 0; i < uniq.length - 1; i++) {
      const xa = uniq[i];
      const xb = uniq[i + 1];
      if (xb - xa < 1e-4) continue;
      const za = zRoof(xa);
      const zb = zRoof(xb);
      const wtA = winTopAt(xa + 1e-4);
      const wtB = winTopAt(xb - 1e-4);
      const botA = wtA != null ? wtA : zBase;
      const botB = wtB != null ? wtB : zBase;
      const bA = Math.min(botA, za - 0.005);
      const bB = Math.min(botB, zb - 0.005);
      if (za <= bA + 0.008 && zb <= bB + 0.008) continue;
      // Наружная и внутренняя грани.
      faceOut([xa, yOut, bA], [xa, yOut, za], [xb, yOut, zb]);
      faceOut([xa, yOut, bA], [xb, yOut, zb], [xb, yOut, bB]);
      faceIn([xa, yIn, bA], [xa, yIn, za], [xb, yIn, zb]);
      faceIn([xa, yIn, bA], [xb, yIn, zb], [xb, yIn, bB]);
      // Верх по софиту и низ между гранями.
      q([xa, yOut, za], [xb, yOut, zb], [xb, yIn, zb], [xa, yIn, za]);
      q([xa, yOut, bA], [xa, yIn, bA], [xb, yIn, bB], [xb, yOut, bB]);
    }
    // Торцы фронтона на xLivW / xLivE.
    {
      const zW = zRoof(xLivW);
      const zE = zRoof(xLivE);
      const bW = Math.min(zBase, zW);
      const bE = Math.min(zBase, zE);
      q([xLivW, yOut, bW], [xLivW, yOut, zW], [xLivW, yIn, zW], [xLivW, yIn, bW]);
      q([xLivE, yOut, bE], [xLivE, yIn, bE], [xLivE, yIn, zE], [xLivE, yOut, zE]);
    }
  }
  // Северный фронтон козырька — тонкая пластина на грани врезки (не стена дома).
  gableFillEW(
    yGable, yGable,
    xGableL, xGableR, pRW, ZrP,
    (x) => Ze + tanP * Math.min(x - porchX0, porchX1 - x),
    southGableBase, -1
  );
  if (gableTris.length) {
    withFinish("wall", () => {
      const mesh = addMesh(geometryFromTriangles(gableTris), WALL_C);
      return mesh;
    });
  }

  // Второй свет: стены по периметру выреза от плиты до софита (верх по скату/коньку).
  {
    // Панели заметно ниже низа кровли — иначе белое просвечивает сквозь скат снаружи.
    const SOF_DROP = 0.09;
    const INSET = 0.02; // стенки внутрь выреза — не совпадают с вертикальным ребром плиты
    const zSof = (x) => (x <= xRW ? zWO(x) : zWI(x)) - ROOF_THICK - SOF_DROP;
    // Ребро a→b: много сегментов, чтобы верх шёл по коньку, а не хордой по углам.
    const voidWall = (a, b, zBot, segs = 32) => {
      const tris = [];
      const q = (p0, p1, p2, p3) => { tris.push([p0, p1, p2], [p0, p2, p3]); };
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.ceil(len / Math.max(0.15, len / segs)));
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const x0 = a[0] + (b[0] - a[0]) * t0;
        const y0 = a[1] + (b[1] - a[1]) * t0;
        const x1 = a[0] + (b[0] - a[0]) * t1;
        const y1 = a[1] + (b[1] - a[1]) * t1;
        const z0 = Math.max(zBot + 0.02, zSof(x0));
        const z1 = Math.max(zBot + 0.02, zSof(x1));
        if (z0 <= zBot + 0.025 && z1 <= zBot + 0.025) continue;
        q(
          world(x0, y0, zBot), world(x1, y1, zBot),
          world(x1, y1, z1), world(x0, y0, z0)
        );
      }
      if (!tris.length) return;
      const prev = api.sectionHeight();
      api.sectionHeight(null);
      withFinish("wall", () => {
        const mesh = addMesh(geometryFromTriangles(tris), WALL_C);
        delete mesh.userData.section;
        mesh.userData.roof = true;
        mesh.material.polygonOffset = true;
        mesh.material.polygonOffsetFactor = -1;
        mesh.material.polygonOffsetUnits = -1;
        return mesh;
      });
      api.sectionHeight(prev);
    };
    const { x0, x1, y0, y1 } = livVoid;
    const ix0 = x0 + INSET;
    const ix1 = x1 - INSET;
    const iy0 = y0 + INSET;
    const iy1 = y1 - INSET;
    // Низ стенок чуть в толще плиты; в плане inset — без z-fight с вертикальным ребром выреза.
    const wallBot = ceilTop - 0.02;
    // Юг не строим: там фронтон с окнами.
    voidWall([ix0, iy1], [ix1, iy1], wallBot); // север (через конёк)
    voidWall([ix1, iy1], [ix1, iy0], wallBot); // восток
    voidWall([ix0, iy0], [ix0, iy1], wallBot); // запад

    // Две прямоугольные панели снизу кровли: WO и WI, от фронтона до северной стенки.
    {
      const yS = iy0;
      const yN = iy1;
      const tris = [];
      const quad = (xa, xb) => {
        const a = world(xa, yS, zSof(xa));
        const b = world(xb, yS, zSof(xb));
        const c = world(xb, yN, zSof(xb));
        const d = world(xa, yN, zSof(xa));
        tris.push([a, c, b], [a, d, c]);
      };
      quad(ix0, xRW);
      quad(xRW, ix1);
      const prev = api.sectionHeight();
      api.sectionHeight(null);
      const mesh = asRoof(addMesh(geometryFromTriangles(tris), 0xffffff, false));
      delete mesh.userData.finish;
      delete mesh.userData.section;
      mesh.material.color.setHex(0xffffff);
      mesh.material.emissive?.setHex(0x000000);
      // Только снизу: снаружи не рисуется сквозь кровлю.
      mesh.material.side = THREE.FrontSide;
      mesh.userData.ceiling = true;
      api.sectionHeight(prev);
    }

    // Рамы как у нижнего ряда: 9 см по центру стены (не на всю толщину — без дрожания с фронтоном).
    const fw = 0.06;
    const half = 0.045;
    const t = (7.318 + 7.720) * 0.5;
    const t0 = t - half;
    const t1 = t + half;
    const zBot = HEAD;
    for (const w of livUpperWins) {
      const { x0, x1, zt0, zt1 } = w;
      frameBar(x0, t0, x0 + fw, t1, zBot, zt0, FRAME_W);
      frameBar(x1 - fw, t0, x1, t1, zBot, zt1, FRAME_W);
      frameBar(x0, t0, x1, t1, zBot, zBot + fw, FRAME_W);
      // Косая верхняя планка той же глубины, что горизонтальная у нижнего ряда.
      withFinish("frame", () => {
        const top = [
          [x0, t0, zt0 - fw], [x1, t0, zt1 - fw], [x1, t0, zt1], [x0, t0, zt0],
          [x0, t1, zt0 - fw], [x1, t1, zt1 - fw], [x1, t1, zt1], [x0, t1, zt0],
        ];
        const tris = [];
        const q = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
        q(world(...top[0]), world(...top[1]), world(...top[2]), world(...top[3]));
        q(world(...top[4]), world(...top[7]), world(...top[6]), world(...top[5]));
        q(world(...top[0]), world(...top[3]), world(...top[7]), world(...top[4]));
        q(world(...top[1]), world(...top[5]), world(...top[6]), world(...top[2]));
        q(world(...top[3]), world(...top[2]), world(...top[6]), world(...top[7]));
        q(world(...top[0]), world(...top[4]), world(...top[5]), world(...top[1]));
        return addMesh(geometryFromTriangles(tris), FRAME_W, false);
      });
      // Стекло: та же глубина ±1,5 см, верх по скату рамы.
      {
        const gy0 = t - 0.015;
        const gy1 = t + 0.015;
        const g = [
          [x0 + fw, gy0, zBot + fw], [x1 - fw, gy0, zBot + fw],
          [x1 - fw, gy0, zt1 - fw], [x0 + fw, gy0, zt0 - fw],
          [x0 + fw, gy1, zBot + fw], [x1 - fw, gy1, zBot + fw],
          [x1 - fw, gy1, zt1 - fw], [x0 + fw, gy1, zt0 - fw],
        ];
        const glassTris = [];
        const q = (a, b, c, d) => { glassTris.push([a, b, c], [a, c, d]); };
        q(world(...g[0]), world(...g[1]), world(...g[2]), world(...g[3]));
        q(world(...g[4]), world(...g[7]), world(...g[6]), world(...g[5]));
        q(world(...g[0]), world(...g[3]), world(...g[7]), world(...g[4]));
        q(world(...g[1]), world(...g[5]), world(...g[6]), world(...g[2]));
        const glassMesh = addMesh(geometryFromTriangles(glassTris), GLASS, false);
        delete glassMesh.userData.finish;
        glassMesh.material.transparent = true;
        glassMesh.material.opacity = 0.16;
        glassMesh.material.depthWrite = false;
        glassMesh.castShadow = false;
        glassMesh.userData.roof = true;
      }
    }
  }

  // Балка в продолжение южной стены гостиной к коридору — опора стропил над террасой.
  {
    const xCorr = 8.265;
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

  // Колонны террасы/крыльца: верх по софиту ската; в стиле roof-d — кирпич (роль column).
  {
    const gap = 0.01;
    const zBot = FLOOR;
    const soffitAt = (x, y) => {
      const hz = houseZ(x, y);
      return (hz != null ? hz : Ze) - ROOF_THICK - gap;
    };
    const P8 = (x, y, z) => world(x, y, z);
    withFinish("column", () => {
      for (const [x0, y0, x1, y1] of COLUMNS) {
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const top = corners.map(([x, y]) => P8(x, y, Math.max(zBot + 0.5, soffitAt(x, y))));
        const bot = corners.map(([x, y]) => P8(x, y, zBot));
        const tris = [];
        const q = (a, b, c, d) => {
          tris.push([a, b, c], [a, c, d]);
        };
        q(top[0], top[1], top[2], top[3]);
        q(bot[0], bot[3], bot[2], bot[1]);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          q(bot[i], bot[j], top[j], top[i]);
        }
        addMesh(geometryFromTriangles(tris), WOOD);
      }
    });
  }

  // Плоский навес L (rect1753): запад + север до карниза крыльца; верх = Ze.
  withCanopy(() => {
    const zTop = Ze;
    const zBot = Ze - ROOF_THICK;
    const prev = api.sectionHeight();
    api.sectionHeight(null);
    withFinish("roof", () => {
      const mesh = asRoof(api.addSlab(
        CARPORT_POLY.map(([x, y]) => shiftP(x, y)),
        zBot, ROOF_THICK, ROOF_C, true
      ));
      mesh.material.flatShading = true;
      mesh.material.emissive?.setHex(0x151210);
      mesh.material.needsUpdate = true;
      return mesh;
    });
    api.sectionHeight(prev);
    // Колонны от плитки двора до низа плоской кровли (кирпич в стиле 30).
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

  // Забор, откатные ворота, калитка и заезд — как у Д4/Д6.
  {
    const fenceH = 1.5;
    const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
    const nw = plot[0];
    const sw = plot[3];
    const dx = sw[0] - nw[0];
    const dy = sw[1] - nw[1];
    const len = Math.hypot(dx, dy);
    const along = (s) => [nw[0] + dx / len * s, nw[1] + dy / len * s];
    const inward = [-dy / len, dx / len];
    const shift = (p, dist) => [p[0] + inward[0] * dist, p[1] + inward[1] * dist];
    const at = (alongM, inn) => shift(along(alongM), inn);
    const post = (p) => api.planBox(
      [[p[0] - 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] + 0.08], [p[0] - 0.08, p[1] + 0.08]],
      0, 1.68, 0x4a4036
    );
    api.addWallRun(plot[0], plot[1], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[1], plot[2], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[2], plot[3], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(along(10), plot[3], 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(plot[0], along(5), 0.06, 0, fenceH, 0x7d6a52);
    api.addWallRun(along(9.10), along(9.90), 0.025, 0.08, 1.46, 0x8a7358);
    api.addWallRun(at(0.20, 0.25), at(9.05, 0.25), 0.015, 0, 0.025, 0x2c3038);
    api.addWallRun(at(0.70, 0.16), at(4.70, 0.16), 0.04, 0.11, 1.48, 0x8a7358);
    api.addWallRun(at(0.70, 0.34), at(4.70, 0.34), 0.04, 0.11, 1.48, 0x8a7358);
    for (const s of [1.15, 4.25]) {
      api.addWallRun(at(s, 0.13), at(s, 0.37), 0.045, 0.025, 0.105, 0x1a1c20);
    }
    api.addWallRun(at(4.82, 0.42), at(5.18, 0.68), 0.16, 0, 0.045, 0xc8c4bc);
    const pin = at(5.00, 0.38);
    api.planBox(
      [[pin[0] - 0.04, pin[1] - 0.04], [pin[0] + 0.04, pin[1] - 0.04], [pin[0] + 0.04, pin[1] + 0.04], [pin[0] - 0.04, pin[1] + 0.04]],
      0.10, 0.22, 0xc5c8cc
    );
    for (const s of [0, 5, 9, 10, len]) post(along(s));
    post(plot[1]); post(plot[2]);

    // Плитка двора и парковки под навесом — уровень дороги/плитки, не пол дома.
    const mark = (mesh) => {
      if (mesh) {
        mesh.material.polygonOffset = true;
        mesh.material.polygonOffsetFactor = -1;
        mesh.material.polygonOffsetUnits = -1;
      }
      return mesh;
    };
    const westFenceAtY = (y) => {
      const t = (y - nw[1]) / (sw[1] - nw[1]);
      return [nw[0] + (sw[0] - nw[0]) * t, y];
    };
    const TILE_Y0 = 0.03;
    const TILE_H = 0.035;
    const { x0: cx0, x1: cx1, y0: cy0, y1: cy1, xArm, yArm } = CARPORT;
    // От северного забора и западной ограды до юго-зап. угла навеса.
    mark(api.addSlab([
      plot[0],
      [cx0, plot[0][1]],
      [cx0, cy0],
      westFenceAtY(cy0),
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    // Полоса к забору севернее навеса.
    mark(api.addSlab([
      [cx0, cy1], [cx1, cy1], [cx1, plot[0][1]], [cx0, plot[0][1]],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    // Парковка под L-навесом — уровень плитки/дороги (два прямоугольника).
    mark(api.addSlab(
      [[cx0, cy1], [xArm, cy1], [xArm, cy0], [cx0, cy0]],
      TILE_Y0, TILE_H, 0xe4ddd2, false
    ));
    mark(api.addSlab(
      [[xArm, cy1], [cx1, cy1], [cx1, yArm], [xArm, yArm]],
      TILE_Y0, TILE_H, 0xe4ddd2, false
    ));
    // Заезд с дороги на проём ворот и калитку.
    mark(api.addSlab([at(5, -5), at(10, -5), at(10, 0), at(5, 0)], TILE_Y0, TILE_H, 0xe4ddd2, false));
  }

  // Фасады для отделки (наружные плоскости).
  const opening = (u0, u1, kind, z0, inner = false) => ({
    u0, u1,
    z0: z0 != null ? z0 : kind === "pan" ? PAN_SILL : kind === "door" ? PLINTH : YELL_SILL,
    z1: kind === "win" ? YELL_HEAD : HEAD,
    kind,
    inner,
  });
  // includeInner: вырезать внутренние проходы, но не делать вокруг них фасадные секции.
  const fromPlan = (along, outer, span0, span1, includeInner = false) => OPENINGS.flatMap((op) => {
    const [x0, y0, x1, y1, k] = op;
    if (k === "i" && !includeInner) return [];
    const mid = along === "x" ? (y0 + y1) / 2 : (x0 + x1) / 2;
    const a = along === "x" ? Math.min(x0, x1) : Math.min(y0, y1);
    const b = along === "x" ? Math.max(x0, x1) : Math.max(y0, y1);
    const u0 = Math.max(span0, a);
    const u1 = Math.min(span1, b);
    if (Math.abs(mid - outer) > 0.45 || u1 - u0 < 0.25) return [];
    const faceKind = k === "p" ? "pan" : k === "d" || k === "i" ? "door" : "win";
    const z0 = (k === "d" || k === "i") && y0 > 17.7 ? FLOOR : undefined;
    return [opening(u0, u1, faceKind, z0, k === "i")];
  });
  // Юг гостиной: проём на высоту второго света; z1L/z1R — косой верх для surround.
  const southLivOpenings = fromPlan("x", 7.52, -5.36, 3.16).map((op) => {
    if (op.kind !== "pan") return op;
    const z1L = zWest(op.u0) - ROOF_THICK - 0.50;
    const z1R = zWest(op.u1) - ROOF_THICK - 0.50;
    return {
      ...op,
      z1: Math.max(op.z1, (z1L + z1R) * 0.5),
      z1L: Math.max(op.z1, z1L),
      z1R: Math.max(op.z1, z1R),
    };
  });
  if (typeof api.mountOverlays === "function") {
    api.mountOverlays((overlayApi) => {
      const face = (spec) => api.wallFace(overlayApi, spec);
      // Фронтон козырька на севере — иначе секции останавливаются на WALL_TOP.
      const porchGable = {
        u0: xGableL,
        u1: xGableR,
        peakU: pRW,
        peakZ: ZrP - ROOF_THICK,
        eave: WALL_TOP,
        over: 0,
        drop: 0,
        soffit: (u) => Ze + tanP * Math.min(Math.max(u - porchX0, 0), Math.max(porchX1 - u, 0)) - ROOF_THICK,
      };
      return [
        face({
          name: "v31dN", along: "x", outer: 18.26, sign: 1, span0: -5.36, span1: 14.80, eave: WALL_TOP,
          gable: porchGable,
          openings: fromPlan("x", 18.06, -5.36, 14.80),
        }),
        face({ name: "v31dE", along: "y", outer: 14.80, sign: 1, span0: 0.84, span1: 18.26, eave: WALL_TOP, openings: fromPlan("y", 14.60, 0.84, 18.26) }),
        face({
          name: "v31dS", along: "x", outer: 7.32, sign: -1, span0: -5.36, span1: 3.16, eave: WALL_TOP,
          gable: {
            u0: xLivW, u1: xLivE, peakU: xRW, peakZ: ZrW - ROOF_THICK, eave: WALL_TOP, over: 0, drop: 0,
            soffit: (u) => zWest(u) - ROOF_THICK,
          },
          openings: southLivOpenings,
        }),
        face({
          name: "v31dSE", along: "x", outer: 0.85, sign: -1, span0: 8.27, span1: 14.80, eave: WALL_TOP,
          gable: {
            u0: xOffW, u1: xOffE, peakU: xRE, peakZ: ZrE - ROOF_THICK, eave: WALL_TOP, over: 0, drop: 0,
            soffit: (u) => zEast(u) - ROOF_THICK,
          },
          openings: fromPlan("x", 1.05, 8.27, 14.80),
        }),
        face({
          name: "v31dW", along: "y", outer: -5.36, sign: -1, span0: 7.30, span1: 18.26, eave: WALL_TOP,
          openings: fromPlan("y", -5.13, 7.30, 18.26, true),
        }),
        // Двор только по наружному контуру (не заходить на внутренние коридоры/проходы).
        face({
          name: "v31dLivE", along: "y", outer: 3.16, sign: 1, span0: 7.30, span1: 9.70, eave: WALL_TOP,
          openings: fromPlan("y", 2.96, 7.30, 9.70, true),
        }),
        face({
          name: "v31dCourtW", along: "y", outer: 8.27, sign: -1, span0: 0.84, span1: 9.70, eave: WALL_TOP,
          openings: fromPlan("y", 8.46, 0.84, 9.70, true),
        }),
        // Южная грань северной стены двора/террасы (дверь и окно смотрят во двор).
        face({
          name: "v31dCourtN", along: "x", outer: 9.30, sign: -1, span0: 2.74, span1: 8.68, eave: WALL_TOP,
          openings: fromPlan("x", 9.50, 2.74, 8.68, true),
        }),
      ];
    });
  }

  api.sectionHeight(saved);
}

export const V31D_WINDOWS = [
  { x: 12.068, y: 18.081, dx: 0, dy: -1, h: 1.20, wide: 1.378 },
  { x: -2.641, y: 18.081, dx: 0, dy: -1, h: 1.20, wide: 1.379 },
  { x: 14.595, y: 5.338, dx: -1, dy: 0, h: 1.20, wide: 1.379 },
  { x: 14.595, y: 10.099, dx: -1, dy: 0, h: 1.20, wide: 1.379 },
  { x: 14.595, y: 14.177, dx: -1, dy: 0, h: 1.20, wide: 0.691 },
  { x: 9.759, y: 18.072, dx: 0, dy: -1, h: 1.20, wide: 0.691 },
  { x: 6.786, y: 18.081, dx: 0, dy: -1, h: 1.20, wide: 1.072 },
  { x: 1.996, y: 18.081, dx: 0, dy: -1, h: 1.20, wide: 1.073 },
  { x: 8.463, y: 3.750, dx: -1, dy: 0, h: 1.20, wide: 1.073 },
  { x: 8.463, y: 6.136, dx: -1, dy: 0, h: 1.20, wide: 1.073 },
  { x: 7.053, y: 9.511, dx: 0, dy: 1, h: 1.20, wide: 0.691 },
  { x: 12.569, y: 1.043, dx: 0, dy: 1, h: 1.20, wide: 1.379 },
  { x: 0.643, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.192 },
  { x: 1.861, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.192 },
  { x: -2.837, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.193 },
  { x: -4.058, y: 7.522, dx: 0, dy: 1, h: 2.20, wide: 1.193 },
];
