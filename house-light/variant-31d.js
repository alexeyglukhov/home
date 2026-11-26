// Вариант 3.1d: клон 3.1d (П-крыша, свес 0,80 м, второй свет), внутренние
// помещения по agency/var3.1d.svg (хоз.блок, сдвинутые стены/двери/окна).
// Масштаб: эталон кровати 2,20 м (uu→м как в var3.1c). Координаты — метры плана.
import * as THREE from "three";
import { addVar31FurnitureFloor, markHouseFloor, V31_FLOOR_WEST, V31_FLOOR_EAST } from "./var31d-furniture-floor.js?v=20";

export const V31D_BASE = { x: 0, y: 0 };

const WALLS = [
  [-5.365, 7.381, 2.811, 7.781],
  [-5.594, 17.814, 14.579, 18.214],
  [8.194, 0.396, 14.62, 0.796],
  [2.684, 9.355, 8.591, 9.755],
  [-1.484, 13.466, 8.559, 13.866],
  [14.221, 0.422, 14.621, 18.18],
  [8.181, 13.46, 8.581, 18.141],
  [8.181, 0.4, 8.581, 12.053],
  [-5.612, 7.364, -5.212, 18.201],
  [2.435, 7.357, 2.835, 12.099],
  [5.316, 9.358, 5.436, 12.093],
  [10.075, 3.271, 10.195, 13.598],
  [10.585, 14.731, 10.705, 18.174],
  [8.783, 14.888, 8.903, 16.265],
  [5.379, 15.391, 5.499, 17.962],
  [3.149, 13.529, 3.269, 18.161],
  [4.956, 13.543, 5.076, 14.519],
  [1.436, 13.557, 1.556, 15.895],
  [-0.886, 15.285, -0.766, 18.198],
  [4.879, 15.365, 8.369, 15.485],
  [-0.836, 15.734, 3.226, 15.854],
  [1.486, 15.437, 3.229, 15.557],
  [2.757, 11.25, 5.388, 11.37],
  [5.305, 11.964, 8.588, 12.084],
  [7.212, 11.741, 8.525, 11.861],
  [7.123, 11.129, 7.243, 12.055],
  [8.274, 13.48, 11.713, 13.6],
  [8.211, 14.741, 10.722, 14.861],
  [10.084, 11.154, 14.642, 11.274],
  [13.594, 6.361, 14.536, 6.481],
  [10.084, 3.263, 14.578, 3.383],
  [8.214, 4.992, 10.178, 5.112],
  [-0.886, 13.505, -0.766, 14.53],
  [10.113, 6.357, 12.741, 6.477],
  [11.081, 8.066, 14.416, 8.186],
  [12.7, 13.46, 14.576, 13.58],
  [6.541, 9.573, 6.661, 10.488],
  [8.317, 16.143, 9.364, 16.263],
  [12.152, 6.403, 12.272, 8.16],
  [12.162, 11.15, 12.282, 12.351],
];

const OPENINGS = [
  [10.078, 9.982, 10.209, 10.962, 'i'],
  [10.07, 5.325, 10.2, 6.304, 'i'],
  [3.146, 14.397, 3.277, 15.377, 'i'],
  [3.145, 16.522, 3.276, 17.501, 'i'],
  [9.019, 13.475, 9.998, 13.605, 'i'],
  [9.112, 14.75, 10.091, 14.88, 'i'],
  [5.947, 15.366, 6.926, 15.496, 'i'],
  [8.748, 4.991, 9.728, 5.121, 'i'],
  [2.452, 8.102, 2.832, 9.082, 'd'],
  [8.19, 8.119, 8.57, 9.098, 'd'],
  [8.197, 10.392, 8.578, 11.372, 'i'],
  [-3.604, 17.933, -2.233, 18.141, 'y'],
  [14.373, 4.399, 14.58, 5.77, 'y'],
  [14.373, 9.46, 14.58, 10.831, 'y'],
  [14.373, 13.829, 14.58, 15.189, 'y'],
  [9.115, 17.942, 10.015, 18.15, 'y'],
  [6.029, 17.955, 7.389, 18.162, 'y'],
  [0.659, 17.934, 2.019, 18.142, 'y'],
  [8.276, 3.413, 8.484, 4.431, 'y'],
  [8.276, 5.785, 8.484, 6.76, 'y'],
  [6.634, 9.457, 7.321, 9.664, 'y'],
  [11.439, 0.491, 13.479, 0.699, 'y'],
  [0.01, 7.48, 1.196, 7.687, 'p'],
  [1.221, 7.48, 2.407, 7.687, 'p'],
  [-3.451, 7.48, -2.265, 7.687, 'p'],
  [-4.665, 7.48, -3.479, 7.687, 'p'],
  [3.892, 17.86, 4.871, 18.24, 'd'],
  [3.524, 13.461, 4.503, 13.841, 'i'],
  [3.718, 9.362, 4.697, 9.742, 'd'],
];

const COLUMNS = [
  // терраса — rect2718 / rect2720
  [-5.602, 5.611, -5.127, 6.086],
  [2.395, 5.592, 2.87, 6.067],
  // навес крыльца — rect2495 / rect2497
  [0.18, 19.324, 0.655, 19.8],
  [7.32, 19.324, 7.795, 19.8],
];

// Навес для авто — L: западный рукав (rect1689) + север до карниза козырька крыльца (как 3.1c).
// Колонны rect1691/1693/1695 у западного края.
const CARPORT_POLY = [
  [-11.629, 9.947],
  [-5.573, 9.947],
  [-5.573, 19.058],
  [-0.619, 19.058],
  [-0.619, 19.778],
  [-11.629, 19.778],
];
const CARPORT = {
  x0: -11.629,
  x1: -0.619,
  y0: 9.947,
  y1: 19.778,
  xArm: -5.573, // вост. край навеса (= дом)
  yArm: 19.058,
};
const CARPORT_COLUMNS = [
  // rect1691 — южная широкая
  [-11.529, 10.056, -8.772, 10.564],
  // rect1695 — средняя
  [-11.537, 13.858, -11.031, 14.385],
  // rect1693 — северная
  [-11.537, 17.707, -11.038, 18.977],
];

// Южная терраса: настил по линии подложки; ступени S+W → наружный контур 42,68 м².
const TERRACE = [-5.612, 4.67, 8.181, 7.381];
const TERRACE_STEPS = [
  [-5.926, 4.356, 8.181, 7.381], // наружная
  [-5.769, 4.513, 8.181, 7.381], // промежуточная
];

// Второй свет: ширина по внутренним граням гостиной; глубина — до изгиба зап. конька (yValW≈11,56).
// y0 = наружная грань южной стены (WALLS), не координаты 3.1d.
const LIV_VOID = { x0: -5.212, x1: 2.435, y0: 7.381, y1: 11.56 };
const LIV_SOUTH_Y = 7.581; // середина южной стены гостиной

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
// Обычные окна: низ 0,80 м от пола; верх = HEAD как у дверей (одна линия перемычек).
const YELL_SILL = FLOOR + 0.80;
const YELL_HEAD = HEAD;
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

// Северный забор: ворота 4 м, центр = середина зап. парковки под навесом; откат на запад.
const V31D_GATE = (() => {
  const mid = (CARPORT.x0 + CARPORT.xArm) * 0.5;
  const half = 2.0;
  return {
    x0: mid - half,
    x1: mid + half,
    ped0: mid + half + 0.40,
    ped1: mid + half + 0.40 + 0.90,
    y: 22.877,
  };
})();

export function v31dFenceSegments(houseShift = null) {
  const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
  const nw = plot[0];
  const sw = plot[3];
  const dx = sw[0] - nw[0];
  const dy = sw[1] - nw[1];
  const len = Math.hypot(dx, dy);
  const along = (s) => [nw[0] + dx / len * s, nw[1] + dy / len * s];
  const g = V31D_GATE;
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
  // Верх ската выше стены, чтобы стены не пробивали кровлю; у Райта низ/торец — role soffit.
  const ROOF_OVER_WALL = 0.20;
  const ROOF_SKIN = 0.10;
  const SOFFIT_THICK = 0.22;
  const ROOF_THICK = ROOF_SKIN + SOFFIT_THICK;
  const EAVE = 0.80;
  const EAVE_TERR = 1.84; // карниз WO/WI над террасой по схеме
  const EAVE_PORCH = 0.80;
  const xWallW = -5.612;
  const xWallE = 14.621;
  const xWallOffW = 8.181;
  const xWallLivE = 2.835;
  const yWallN = 18.214;
  const yWallSLiv = 7.381;
  const yWallSOff = 0.396;
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
  const xLivW = -5.612;
  const xLivE = 2.835;
  const xOffW = 8.181;
  const xOffE = 14.621;
  const yPlateS = 7.381;
  const yPlateSE = 0.396;

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
  // Нахлёст на стену — без волосяной щели на стыке wall/gable.
  const southGableBase = WALL_TOP - 0.06;

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
      let prevLivPan = false;
      for (const h of holes) {
        // Над панорамами гостиной — второй свет: полосу HEAD→WALL_TOP не зашиваем.
        const livPan = h.kind === "p" && !vertical
          && h.a >= LIV_VOID.x0 - 0.05 && h.b <= LIV_VOID.x1 + 0.05
          && Math.abs(((y0 + y1) / 2) - LIV_SOUTH_Y) < 0.4;
        const color = h.kind === "p" ? FRAME_W : h.kind === "d" || h.kind === "i" ? 0x6b3e24 : FRAME_Y;
        const t = vertical ? (x0 + x1) / 2 : (y0 + y1) / 2;
        const half = 0.045;
        const fw = 0.06;
        const t0 = t - half;
        const t1 = t + half;
        const gap = h.a - cursor;
        // Узкий простенок между панорамами — импост с нахлёстом в проёмы (без щели).
        if (prevLivPan && livPan && gap > 0.001 && gap < 0.14) {
          const ov = 0.04;
          frameBar(cursor - ov, t0, h.a + ov, t1, h.z0, h.z1, color);
        } else {
          span(cursor, h.a, PLINTH, zTop);
        }
        span(h.a, h.b, PLINTH, h.z0);
        if (!livPan) span(h.a, h.b, h.z1, zTop);
        if (vertical) {
          frameBar(t0, h.a, t1, h.a + fw, h.z0, h.z1, color);
          frameBar(t0, h.b - fw, t1, h.b, h.z0, h.z1, color);
          frameBar(t0, h.a, t1, h.b, h.z1 - fw, h.z1, color);
          if (h.kind !== "d" && h.kind !== "i") {
            frameBar(t0, h.a, t1, h.b, h.z0, h.z0 + fw, color);
            glass(t - 0.015, h.a + fw, t + 0.015, h.b - fw, h.z0 + fw, h.z1 - fw);
          }
        } else {
          // livPan: стойки чуть ниже ригеля второго света — без общей грани.
          const jambZ1 = livPan ? h.z1 - 0.003 : h.z1;
          frameBar(h.a, t0, h.a + fw, t1, h.z0, jambZ1, color);
          frameBar(h.b - fw, t0, h.b, t1, h.z0, jambZ1, color);
          // У livPan верхняя перемычка на HEAD не нужна — её даёт рама второго света.
          if (!livPan) frameBar(h.a, t0, h.b, t1, h.z1 - fw, h.z1, color);
          if (h.kind !== "d" && h.kind !== "i") {
            frameBar(h.a, t0, h.b, t1, h.z0, h.z0 + fw, color);
            // livPan: оставляем зазор под нижний ригель второго света (без дрожи на стыке).
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
        prevLivPan = livPan;
      }
      span(cursor, limit, PLINTH, zTop);
    }
  });

  withFinish("plinth", () => {
    // Цоколь отапливаемого контура — без выреза наружного кармана террасы (иначе полоса/ступень).
    const hallX = 2.835;
    const pocketN = 9.40;
    planBox([[-5.66, 7.25], [hallX, 7.25], [hallX, 18.31], [-5.66, 18.31]], 0.02, PLINTH, 0x2c3038);
    planBox([[hallX, pocketN], [8.70, pocketN], [8.70, 18.31], [hallX, 18.31]], 0.02, PLINTH, 0x2c3038);
    planBox([[8.18, 0.35], [14.85, 0.35], [14.85, 18.31], [8.18, 18.31]], 0.02, PLINTH, 0x2c3038);
    // Цоколь только под настилом террасы — не под ступенями (иначе z-fight / дрожь по югу).
    planBox([
      [TERRACE[0], TERRACE[1]], [TERRACE[2], TERRACE[1]],
      [TERRACE[2], TERRACE[3]], [TERRACE[0], TERRACE[3]],
    ], 0.02, PLINTH, 0x2c3038);
  });
  // Ступени крыльца — бетон, не цоколь отделки.
  {
    const porchSteps = [
      [-0.078, 18.211, 8.093, 20.066],
      [0.052, 18.211, 7.937, 19.922],
    ];
    porchSteps.forEach((b, i) => {
      const z1 = FLOOR * (i + 1) / 3;
      planBox([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], 0.02, z1, 0xd8d3cb);
    });
  }
  // Ступени террасы S+W: от земли до своей высоты, без общего цоколя под ними.
  {
    const terraceSteps = TERRACE_STEPS;
    terraceSteps.forEach((b, i) => {
      const z0 = i === 0 ? 0.02 : FLOOR * i / 3;
      const z1 = FLOOR * (i + 1) / 3;
      planBox([
        [b[0], b[1]], [b[2], b[1]], [b[2], TERRACE[1]], [b[0], TERRACE[1]],
      ], z0, z1, 0xd8d3cb);
      planBox([
        [b[0], TERRACE[1]], [TERRACE[0], TERRACE[1]], [TERRACE[0], TERRACE[3]], [b[0], TERRACE[3]],
      ], z0, z1, 0xd8d3cb);
    });
  }

  // Пол дома: запад без наружного кармана террасы (карман — тот же настил, что юг).
  const hallX = 2.835;
  const pocketN = 9.40;
  markHouseFloor(planBox([
    [V31_FLOOR_WEST[0], V31_FLOOR_WEST[1]], [hallX, V31_FLOOR_WEST[1]],
    [hallX, V31_FLOOR_WEST[3]], [V31_FLOOR_WEST[0], V31_FLOOR_WEST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false));
  markHouseFloor(planBox([
    [hallX, pocketN], [V31_FLOOR_WEST[2], pocketN],
    [V31_FLOOR_WEST[2], V31_FLOOR_WEST[3]], [hallX, V31_FLOOR_WEST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false));
  markHouseFloor(planBox([
    [V31_FLOOR_EAST[0], V31_FLOOR_EAST[1]], [V31_FLOOR_EAST[2], V31_FLOOR_EAST[1]],
    [V31_FLOOR_EAST[2], V31_FLOOR_EAST[3]], [V31_FLOOR_EAST[0], V31_FLOOR_EAST[3]],
  ], PLINTH, FLOOR, FLOOR_C, false));
  // Терраса L: юг + карман — один уровень с полом дома, без шва/ступеньки между ними.
  const terraceN = V31_FLOOR_WEST[1] + 0.08; // нахлёст под южную стену гостиной
  markHouseFloor(planBox([
    [TERRACE[0], TERRACE[1]], [TERRACE[2], TERRACE[1]],
    [TERRACE[2], terraceN], [TERRACE[0], terraceN],
  ], PLINTH, FLOOR, FLOOR_C, false));
  markHouseFloor(planBox([
    [hallX, TERRACE[3]], [TERRACE[2], TERRACE[3]],
    [TERRACE[2], pocketN], [hallX, pocketN],
  ], PLINTH, FLOOR, FLOOR_C, false));
  const porchDeck = planBox([
    [0.181, 17.814], [7.781, 17.814], [7.781, 19.778], [0.181, 19.778],
  ], PLINTH, FLOOR, FLOOR_C, false);
  markHouseFloor(porchDeck);

  // Перекрытие: белая плита как у 3.1 (CEIL_BOT…CEIL_TOP) — низ не ниже балки.
  // Вырез второго света до изгиба конька гостиной (yValW). Скрывается с крышей.
  // Над террасой между гостиной и коридором — до балки.
  const ceilTop = CEIL_TOP;
  const livVoid = { x0: LIV_VOID.x0, x1: LIV_VOID.x1, y0: LIV_VOID.y0, y1: yValW };
  const yCeilBeam = 7.581;
  {
    const ceilPoly = [
      [livVoid.x0, livVoid.y1],
      [-5.163, 17.815],
      [14.222, 17.815],
      [14.222, 0.795],
      [8.182, 0.795],
      [8.182, yCeilBeam],
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

  // Кровля ровными скатами: все куски в 2 mesh (верх+торцы / софит) — без швов и «дыр» между оболочками.
  const pushW = (arr, a, b, c) => arr.push([world(...a), world(...b), world(...c)]);
  const quadW = (arr, a, b, c, d) => { pushW(arr, a, b, c); pushW(arr, a, c, d); };
  const roofTops = [];
  const roofSidesAll = [];
  const soffitBots = [];
  const soffitSidesAll = [];
  const emitShell = (topPolys, openEdges) => {
    for (const poly of topPolys) {
      for (let i = 1; i < poly.length - 1; i++) pushW(roofTops, poly[0], poly[i], poly[i + 1]);
      const bot = poly.map(([x, y, z]) => [x, y, z - ROOF_THICK]);
      for (let i = 1; i < bot.length - 1; i++) pushW(soffitBots, bot[0], bot[i + 1], bot[i]);
    }
    for (const [a, b] of openEdges) {
      const [x0, y0, z0] = a;
      const [x1, y1, z1] = b;
      quadW(roofSidesAll,
        [x0, y0, z0], [x1, y1, z1],
        [x1, y1, z1 - ROOF_SKIN], [x0, y0, z0 - ROOF_SKIN]
      );
      quadW(soffitSidesAll,
        [x0, y0, z0 - ROOF_SKIN], [x1, y1, z1 - ROOF_SKIN],
        [x1, y1, z1 - ROOF_THICK], [x0, y0, z0 - ROOF_THICK]
      );
    }
  };
  const flushRoofShells = () => {
    // Один сварной mesh: верх + торцы + софит — без швов и z-fight между оболочками.
    const all = roofTops.concat(roofSidesAll, soffitBots, soffitSidesAll);
    if (all.length) {
      withFinish("roof", () => asRoof(addMesh(geometryFromTriangles(all, true), ROOF_C)));
    }
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
  const porchX0 = -0.619;
  const porchX1 = 8.581;
  const porchYN = 20.578;
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
  flushRoofShells();

  // Южные фронтоны — объём с толщиной стены, на которой стоят.
  const gableTris = [];
  const gpush = (a, b, c) => gableTris.push([world(...a), world(...b), world(...c)]);
  // yOut < yIn для стены С–Ю (наружная грань южнее). outFace: +1 наружная грань на yOut.
  // Нахлёст вовнутрь софита — без щели; минус = в кровлю (анти z-fight).
  const GABLE_BELOW = -0.02;
  const gableFillEW = (yOut, yIn, x0, x1, xR, zPeak, zEdge, zBase, outFace) => {
    const zL = zEdge(x0) - ROOF_THICK - GABLE_BELOW;
    const zR = zEdge(x1) - ROOF_THICK - GABLE_BELOW;
    const zP = zPeak - ROOF_THICK - GABLE_BELOW;
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
  // Наружная грань фронтона = наружная грань стены (одна плоскость облицовки).
  // Наружные грани = WALLS 3.1c (по WALLS 3.1d — иначе фронтон выпирает).
  const yWallSLivOut = 7.381;
  const yWallSLivIn = 7.781;
  const yWallSOffOut = 0.396;
  const yWallSOffIn = 0.796;
  gableFillEW(yWallSOffOut, yWallSOffIn, xOffW, xOffE, xRE, ZrE, (x) => zEast(x), southGableBase, 1);
  // Гостиная: фронтон толщиной южной стены; проёмы под второй свет.
  const livUpperWins = OPENINGS
    .filter((op) => op[4] === "p" && op[1] < 8)
    .map((op) => {
      const zt0 = zWest(op[0]) - ROOF_THICK - 0.50;
      const zt1 = zWest(op[2]) - ROOF_THICK - 0.50;
      return { x0: op[0], x1: op[2], zt0, zt1 };
    })
    .filter((w) => Math.min(w.zt0, w.zt1) > HEAD + 0.2)
    .sort((a, b) => a.x0 - b.x0);
  // Узкие щели между соседними панорамами — один вырез (без полоски стены).
  const gableWinSpans = [];
  for (const w of livUpperWins) {
    const last = gableWinSpans[gableWinSpans.length - 1];
    if (last && w.x0 <= last.x1 + 0.14) {
      last.x1 = w.x1;
      last.zt1 = w.zt1;
    } else gableWinSpans.push({ x0: w.x0, x1: w.x1, zt0: w.zt0, zt1: w.zt1 });
  }
  {
    const yOut = yWallSLivOut;
    const yIn = yWallSLivIn;
    const zBase = southGableBase;
    const zRoof = (x) => zWest(x) - ROOF_THICK - GABLE_BELOW;
    const winTopAt = (x) => {
      for (const w of gableWinSpans) {
        if (x < w.x0 - 1e-6 || x > w.x1 + 1e-6) continue;
        const t = (x - w.x0) / Math.max(1e-6, w.x1 - w.x0);
        return w.zt0 + (w.zt1 - w.zt0) * t;
      }
      return null;
    };
    // Торцы фронтона = наружные грани WALLS (запад / livE), не свес кровли 3.16.
    const xGableE = 2.835;
    const xGableW = -5.612;
    const xs = [xGableW, xGableE, xRW];
    for (const w of gableWinSpans) xs.push(w.x0, w.x1);
    xs.sort((a, b) => a - b);
    const uniq = [];
    for (const x of xs) {
      if (x < xGableW - 1e-4 || x > xGableE + 1e-4) continue;
      if (!uniq.length || x > uniq[uniq.length - 1] + 1e-4) uniq.push(x);
    }
    if (uniq[0] > xGableW + 1e-4) uniq.unshift(xGableW);
    if (uniq[uniq.length - 1] < xGableE - 1e-4) uniq.push(xGableE);
    const q = (a, b, c, d) => { gpush(a, b, c); gpush(a, c, d); };
    const faceOut = (a, b, c) => gpush(a, c, b);
    const faceIn = (a, b, c) => gpush(a, b, c);
    const strip = (xa, xb) => {
      if (xb - xa < 1e-4) return;
      const za = zRoof(xa);
      const zb = zRoof(xb);
      const mid = (xa + xb) * 0.5;
      const wtA = winTopAt(xa + 1e-4);
      const wtB = winTopAt(xb - 1e-4);
      const wtM = winTopAt(mid);
      const overWin = wtM != null || (wtA != null && wtB != null);
      // Над остеклением низ = верх рамы (−нахлёст); иначе — от плиты. Толщина стены постоянная.
      const FRAME_LAP = 0.025;
      const botA = overWin && wtA != null ? wtA - FRAME_LAP
        : overWin && wtB != null ? wtB - FRAME_LAP
        : zBase;
      const botB = overWin && wtB != null ? wtB - FRAME_LAP
        : overWin && wtA != null ? wtA - FRAME_LAP
        : zBase;
      const bA = Math.min(botA, za - 0.005);
      const bB = Math.min(botB, zb - 0.005);
      if (za <= bA + 0.008 && zb <= bB + 0.008) return;
      faceOut([xa, yOut, bA], [xa, yOut, za], [xb, yOut, zb]);
      faceOut([xa, yOut, bA], [xb, yOut, zb], [xb, yOut, bB]);
      faceIn([xa, yIn, bA], [xa, yIn, za], [xb, yIn, zb]);
      faceIn([xa, yIn, bA], [xb, yIn, zb], [xb, yIn, bB]);
      q([xa, yOut, za], [xb, yOut, zb], [xb, yIn, zb], [xa, yIn, za]);
      q([xa, yOut, bA], [xa, yIn, bA], [xb, yIn, bB], [xb, yOut, bB]);
    };
    for (let i = 0; i < uniq.length - 1; i++) strip(uniq[i], uniq[i + 1]);
    {
      const zW = zRoof(xGableW);
      const zE = zRoof(xGableE);
      const bW = Math.min(zBase, zW);
      const bE = Math.min(zBase, zE);
      q([xGableW, yOut, bW], [xGableW, yOut, zW], [xGableW, yIn, zW], [xGableW, yIn, bW]);
      q([xGableE, yOut, bE], [xGableE, yIn, bE], [xGableE, yIn, zE], [xGableE, yOut, zE]);
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
      mesh.material.polygonOffsetFactor = 2;
      mesh.material.polygonOffsetUnits = 2;
      return mesh;
    });
  }

  // Второй свет: стены по периметру выреза от плиты до софита (верх по скату/коньку).
  {
    // Стенки — нахлёст вверх в софит; белая зашивка — чуть ниже софита (видна из комнаты).
    const zSofWall = (x) => (x <= xRW ? zWO(x) : zWI(x)) - ROOF_THICK + 0.02;
    const zSofCeil = (x) => (x <= xRW ? zWO(x) : zWI(x)) - ROOF_THICK - 0.02;
    const INSET = 0.02; // стенки внутрь выреза — не совпадают с вертикальным ребром плиты
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
        const z0 = Math.max(zBot + 0.02, zSofWall(x0));
        const z1 = Math.max(zBot + 0.02, zSofWall(x1));
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
        // Дальше кровли по depth — не пробивают скат снаружи.
        mesh.material.polygonOffsetFactor = 2;
        mesh.material.polygonOffsetUnits = 2;
        return mesh;
      });
      api.sectionHeight(prev);
    };
    const { x0, x1, y1 } = livVoid;
    const ix0 = x0 + INSET;
    const ix1 = x1 - INSET;
    // Юг зашивки — внутренняя грань фронтона (не наружная стена), иначе виден софит кровли.
    const iy0 = yWallSLivIn - 0.01;
    const iy1 = y1 - INSET;
    // Низ стенок чуть в толще плиты; в плане inset — без z-fight с вертикальным ребром выреза.
    const wallBot = ceilTop - 0.02;
    // Юг не строим: там фронтон с окнами.
    voidWall([ix0, iy1], [ix1, iy1], wallBot); // север (через конёк)
    voidWall([ix1, iy1], [ix1, iy0], wallBot); // восток
    voidWall([ix0, iy0], [ix0, iy1], wallBot); // запад

    // Белая зашивка снизу кровли (WO/WI): от внутренней грани фронтона до северной стенки.
    {
      const yS = iy0;
      const yN = iy1;
      const tris = [];
      // Обход как у soffitBots — нормаль вниз, в комнату.
      const quad = (xa, xb) => {
        const a = world(xa, yS, zSofCeil(xa));
        const b = world(xb, yS, zSofCeil(xb));
        const c = world(xb, yN, zSofCeil(xb));
        const d = world(xa, yN, zSofCeil(xa));
        tris.push([a, b, c], [a, c, d]);
      };
      // Несколько полос по X — без хорды на длинном скате.
      const segsW = Math.max(4, Math.ceil((xRW - ix0) / 0.35));
      const segsE = Math.max(4, Math.ceil((ix1 - xRW) / 0.35));
      for (let i = 0; i < segsW; i++) {
        quad(ix0 + ((xRW - ix0) * i) / segsW, ix0 + ((xRW - ix0) * (i + 1)) / segsW);
      }
      for (let i = 0; i < segsE; i++) {
        quad(xRW + ((ix1 - xRW) * i) / segsE, xRW + ((ix1 - xRW) * (i + 1)) / segsE);
      }
      const prev = api.sectionHeight();
      api.sectionHeight(null);
      const mesh = addMesh(geometryFromTriangles(tris), 0xffffff, false);
      delete mesh.userData.finish;
      delete mesh.userData.section;
      mesh.material.color.setHex(0xffffff);
      mesh.material.emissive?.setHex(0x000000);
      mesh.material.side = THREE.DoubleSide;
      mesh.userData.ceiling = true;
      mesh.userData.roof = true;
      api.sectionHeight(prev);
    }

    // Рамы второго света: группы соседних окон — одна цельная обвязка + импосты с нахлёстом.
    const fw = 0.10;
    const half = 0.055;
    const t = (yWallSLivOut + yWallSLivIn) * 0.5;
    const t0 = t - half;
    const t1 = t + half;
    const zBot = HEAD;
    const frameTris = [];
    const glassTrisAll = [];
    const qTri = (bag, a, b, c, d) => { bag.push([a, b, c], [a, c, d]); };
    // caps: торцы только на внешних концах — стыки стоек/ригеля без «палок».
    const pushTrap = (xa, xb, ya, yb, zBotA, zBotB, zTopA, zTopB, caps = false) => {
      const pts = [
        [xa, ya, zBotA], [xb, ya, zBotB], [xb, ya, zTopB], [xa, ya, zTopA],
        [xa, yb, zBotA], [xb, yb, zBotB], [xb, yb, zTopB], [xa, yb, zTopA],
      ].map((p) => world(...p));
      qTri(frameTris, pts[0], pts[1], pts[2], pts[3]);
      qTri(frameTris, pts[4], pts[7], pts[6], pts[5]);
      qTri(frameTris, pts[3], pts[2], pts[6], pts[7]);
      qTri(frameTris, pts[0], pts[4], pts[5], pts[1]);
      if (caps === true || caps === "L") qTri(frameTris, pts[0], pts[3], pts[7], pts[4]);
      if (caps === true || caps === "R") qTri(frameTris, pts[1], pts[5], pts[6], pts[2]);
    };
    const groups = [];
    for (const w of livUpperWins) {
      const last = groups[groups.length - 1];
      if (last && w.x0 <= last.x1 + 0.14) {
        last.x1 = w.x1;
        last.zt1 = w.zt1;
        last.wins.push(w);
      } else groups.push({ x0: w.x0, x1: w.x1, zt0: w.zt0, zt1: w.zt1, wins: [w] });
    }
    for (const g of groups) {
      const zAtG = (x) => g.zt0 + (g.zt1 - g.zt0) * ((x - g.x0) / Math.max(1e-6, g.x1 - g.x0));
      // Нижний ригель; стойки/импосты — строго между ригелями, без пересечения объёмов (иначе дрожь).
      frameBar(g.x0, t0, g.x1, t1, zBot, zBot + fw, FRAME_W);
      const zRail0 = zBot + fw;
      const zL = zAtG(g.x0 + fw);
      const zR = zAtG(g.x1 - fw);
      pushTrap(g.x0, g.x0 + fw, t0, t1, zRail0, zRail0, zL - fw, zL - fw, "L");
      pushTrap(g.x1 - fw, g.x1, t0, t1, zRail0, zRail0, zR - fw, zR - fw, "R");
      {
        const spanTop = Math.max(1e-6, g.x1 - g.x0);
        const n = Math.max(8, Math.ceil(spanTop / 0.12));
        for (let i = 0; i < n; i++) {
          const xa = g.x0 + (spanTop * i) / n;
          const xb = g.x0 + (spanTop * (i + 1)) / n;
          const za = zAtG(xa);
          const zb = zAtG(xb);
          const caps = i === 0 ? "L" : i === n - 1 ? "R" : false;
          pushTrap(xa, xb, t0, t1, za - fw, zb - fw, za, zb, caps);
        }
      }
      for (let i = 0; i < g.wins.length - 1; i++) {
        const a = g.wins[i];
        const b = g.wins[i + 1];
        const mid = (a.x1 + b.x0) * 0.5;
        const halfM = Math.max(fw * 0.55, (b.x0 - a.x1) * 0.5 + fw * 0.35);
        const m0 = mid - halfM;
        const m1 = mid + halfM;
        const zTop = zAtG((m0 + m1) * 0.5);
        pushTrap(m0, m1, t0, t1, zRail0, zRail0, zTop - fw, zTop - fw, false);
      }
      // Стекло чуть тоньше рамы и с зазором к ригелям — без z-fight внутри проёма.
      const gy0 = t - 0.012;
      const gy1 = t + 0.012;
      const zGlass0 = zRail0 + 0.004;
      for (let wi = 0; wi < g.wins.length; wi++) {
        const w = g.wins[wi];
        let gx0 = w.x0 + fw + 0.004;
        let gx1 = w.x1 - fw - 0.004;
        if (wi > 0) {
          const prev = g.wins[wi - 1];
          const mid = (prev.x1 + w.x0) * 0.5;
          const halfM = Math.max(fw * 0.55, (w.x0 - prev.x1) * 0.5 + fw * 0.35);
          gx0 = Math.max(gx0, mid + halfM + 0.004);
        }
        if (wi < g.wins.length - 1) {
          const next = g.wins[wi + 1];
          const mid = (w.x1 + next.x0) * 0.5;
          const halfM = Math.max(fw * 0.55, (next.x0 - w.x1) * 0.5 + fw * 0.35);
          gx1 = Math.min(gx1, mid - halfM - 0.004);
        }
        if (gx1 <= gx0 + 0.04) continue;
        const spanG = gx1 - gx0;
        const n = Math.max(6, Math.ceil(spanG / 0.12));
        for (let i = 0; i < n; i++) {
          const xa = gx0 + (spanG * i) / n;
          const xb = gx0 + (spanG * (i + 1)) / n;
          const za = zAtG(xa) - fw - 0.004;
          const zb = zAtG(xb) - fw - 0.004;
          if (za <= zGlass0 + 0.02 || zb <= zGlass0 + 0.02) continue;
          const gl = [
            [xa, gy0, zGlass0], [xb, gy0, zGlass0], [xb, gy0, zb], [xa, gy0, za],
            [xa, gy1, zGlass0], [xb, gy1, zGlass0], [xb, gy1, zb], [xa, gy1, za],
          ].map((p) => world(...p));
          qTri(glassTrisAll, gl[0], gl[1], gl[2], gl[3]);
          qTri(glassTrisAll, gl[4], gl[7], gl[6], gl[5]);
          if (i === 0) qTri(glassTrisAll, gl[0], gl[3], gl[7], gl[4]);
          if (i === n - 1) qTri(glassTrisAll, gl[1], gl[5], gl[6], gl[2]);
        }
      }
    }
    if (frameTris.length) {
      withFinish("frame", () => {
        const mesh = addMesh(geometryFromTriangles(frameTris), FRAME_W, false);
        mesh.material.polygonOffset = true;
        mesh.material.polygonOffsetFactor = 1;
        mesh.material.polygonOffsetUnits = 1;
        return mesh;
      });
    }
    if (glassTrisAll.length) {
      const glassMesh = addMesh(geometryFromTriangles(glassTrisAll), GLASS, false);
      delete glassMesh.userData.finish;
      glassMesh.material.transparent = true;
      glassMesh.material.opacity = 0.16;
      glassMesh.material.depthWrite = false;
      glassMesh.material.polygonOffset = true;
      glassMesh.material.polygonOffsetFactor = -1;
      glassMesh.material.polygonOffsetUnits = -1;
      glassMesh.castShadow = false;
      glassMesh.renderOrder = 2;
      glassMesh.userData.roof = true;
    }
  }

  // Балка в продолжение южной стены гостиной к коридору — опора стропил над террасой.
  {
    const xCorr = 8.181;
    const yBeam = 7.581;
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

  // Плоский навес L: запад (rect1689) + север до карниза крыльца; верх = Ze.
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
      [-5.66, 18.31], [14.85, 18.31], [14.85, 0.35],
      [8.18, 0.35], [8.18, 7.25], [-5.66, 7.25],
    ];
    const outer = [
      [-6.66, 19.31], [15.85, 19.31], [15.85, -0.65],
      [7.18, -0.65], [7.18, 6.25], [-6.66, 6.25],
    ];
    // Верх отмостки ниже плитки парковки (≈0,01), иначе z-fight / моргание.
    const blind = api.addSlabHole(outer, hole, -0.02, 0.025, 0xd4cfc4);
    if (blind) {
      blind.material.polygonOffset = true;
      blind.material.polygonOffsetFactor = -1;
      blind.material.polygonOffsetUnits = -1;
      blind.renderOrder = 0;
    }
  }

  // Забор: ворота и калитка на севере как у 3.1a/b; запад сплошной. Ворота откатываются на запад.
  {
    const fenceH = 1.5;
    const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
    const nw = plot[0];
    const sw = plot[3];
    const g = V31D_GATE;
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
        // Сильнее отмостки (−1): плитка парковки не моргает на стыке.
        mesh.material.polygonOffsetFactor = -3;
        mesh.material.polygonOffsetUnits = -3;
        mesh.renderOrder = 2;
      }
      return mesh;
    };
    // Плитка у земли (верх ≈0,01): раньше 0,065 — «подиум», колёса утопали.
    const TILE_Y0 = -0.02;
    const TILE_H = 0.03;
    const { x0: cx0, x1: cx1, y0: cy0, y1: cy1, xArm, yArm } = CARPORT;
    const westFenceAtY = (y) => {
      const t = (y - nw[1]) / (sw[1] - nw[1]);
      return nw[0] + (sw[0] - nw[0]) * t;
    };
    const xTileE = g.ped1;
    const xIn = (y) => Math.max(leaf0 - 0.2, westFenceAtY(y) + 0.05);
    mark(api.addSlab([
      [xIn(g.y), g.y], [xTileE, g.y], [xTileE, cy0], [xIn(cy0), cy0],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    mark(api.addSlab([
      [xTileE, 18.20], [-5.13, 18.20], [-5.13, g.y], [xTileE, g.y],
    ], TILE_Y0, TILE_H, 0xe4ddd2, false));
    // Парковка под L-навесом — уровень плитки/дороги.
    mark(api.addSlab(
      [[cx0, cy1], [xArm, cy1], [xArm, cy0], [cx0, cy0]],
      TILE_Y0, TILE_H, 0xe4ddd2, false
    ));
    mark(api.addSlab(
      [[xArm, cy1], [cx1, cy1], [cx1, yArm], [xArm, yArm]],
      TILE_Y0, TILE_H, 0xe4ddd2, false
    ));
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
  const southLivOpenings = fromPlan("x", 7.581, -5.612, 2.834).map((op) => {
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
      // outer/span = наружные грани WALLS 3.1d; смежные грани стыкуются в один угол без щели и без вылета.
      const face = (spec) => api.wallFace(overlayApi, { thick: 0.012, ...spec });
      const ySLiv = 7.381;
      const yN = 18.214;
      const xW = -5.612;
      const xLivE = 2.834;
      const xE = 14.621;
      const ySOff = 0.396;
      const xOffW = 8.182;
      const yCourtN = 9.356;
      const xCourtW = 8.182;
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
          name: "v31dN", along: "x", outer: yN, sign: 1, span0: xW, span1: xE, eave: WALL_TOP,
          gable: porchGable,
          openings: fromPlan("x", 18.015, xW, xE),
        }),
        face({
          name: "v31dE", along: "y", outer: xE, sign: 1, span0: ySOff, span1: yN, eave: WALL_TOP,
          openings: fromPlan("y", 14.422, ySOff, yN),
        }),
        face({
          name: "v31dS", along: "x", outer: ySLiv, sign: -1, span0: xW, span1: xLivE, eave: WALL_TOP,
          gable: {
            u0: xW, u1: xLivE, peakU: xRW, peakZ: ZrW - ROOF_THICK, eave: WALL_TOP, over: 0, drop: 0,
            soffit: (u) => zWest(u) - ROOF_THICK,
          },
          openings: southLivOpenings,
        }),
        face({
          name: "v31dSE", along: "x", outer: ySOff, sign: -1, span0: xOffW, span1: xE, eave: WALL_TOP,
          gable: {
            u0: xOffW, u1: xE, peakU: xRE, peakZ: ZrE - ROOF_THICK, eave: WALL_TOP, over: 0, drop: 0,
            soffit: (u) => zEast(u) - ROOF_THICK,
          },
          openings: fromPlan("x", 0.596, xOffW, xE),
        }),
        face({
          name: "v31dW", along: "y", outer: xW, sign: -1, span0: ySLiv, span1: yN, eave: WALL_TOP,
          openings: fromPlan("y", -5.388, ySLiv, yN, true),
        }),
        face({
          name: "v31dLivE", along: "y", outer: xLivE, sign: 1, span0: ySLiv, span1: yCourtN, eave: WALL_TOP,
          openings: fromPlan("y", 2.635, ySLiv, yCourtN, true),
        }),
        face({
          name: "v31dCourtW", along: "y", outer: xCourtW, sign: -1, span0: ySOff, span1: yCourtN, eave: WALL_TOP,
          openings: fromPlan("y", 8.382, ySOff, yCourtN, true),
        }),
        face({
          name: "v31dCourtN", along: "x", outer: yCourtN, sign: -1, span0: xLivE, span1: xCourtW, eave: WALL_TOP,
          openings: fromPlan("x", 9.556, xLivE, xCourtW, true),
        }),
      ];
    });
  }

  // Машины с плана (g1245 Кулрей / g1263 Мазда): центр и курс длинной оси polygon.
  // planYawDeg: 0° = восток плана, 90° = север; нос — к северной стороне оси (к воротам).
  // groundY = верх плитки парковки (−0,02+0,03).
  if (typeof api.addParkedModel === "function") {
    const parkY = 0.01;
    api.addParkedModel({
      url: "./models/geely-coolray.glb",
      length: 4.33,
      centerE: -9.780 + HOUSE_DX,
      centerN: 16.525 + HOUSE_DY,
      planYawDeg: -96.8,
      groundY: parkY,
    });
    api.addParkedModel({
      url: "./models/mazda-cx5.glb",
      length: 4.55,
      centerE: -7.584 + HOUSE_DX,
      centerN: 13.269 + HOUSE_DY,
      planYawDeg: 84.6,
      groundY: parkY,
    });
  }

  api.sectionHeight(saved);
}

export const V31D_WINDOWS = [
  { x: -2.918, y: 18.037, dx: 0, dy: -1, h: 1.20, wide: 1.371 },
  { x: 14.476, y: 5.085, dx: -1, dy: 0, h: 1.20, wide: 1.371 },
  { x: 14.476, y: 10.146, dx: -1, dy: 0, h: 1.20, wide: 1.371 },
  { x: 14.476, y: 14.509, dx: -1, dy: 0, h: 1.20, wide: 1.296 },
  { x: 9.566, y: 18.046, dx: 0, dy: -1, h: 1.20, wide: 0.687 },
  { x: 6.708, y: 18.058, dx: 0, dy: -1, h: 1.20, wide: 1.067 },
  { x: 1.339, y: 18.038, dx: 0, dy: -1, h: 1.20, wide: 1.066 },
  { x: 8.38, y: 3.922, dx: -1, dy: 0, h: 1.20, wide: 1.018 },
  { x: 8.38, y: 6.272, dx: -1, dy: 0, h: 1.20, wide: 0.975 },
  { x: 6.978, y: 9.561, dx: 0, dy: 1, h: 1.20, wide: 0.687 },
  { x: 12.459, y: 0.595, dx: 0, dy: 1, h: 1.20, wide: 1.54 },
  { x: 0.603, y: 7.584, dx: 0, dy: 1, h: 2.20, wide: 1.186 },
  { x: 1.814, y: 7.584, dx: 0, dy: 1, h: 2.20, wide: 1.186 },
  { x: -2.858, y: 7.584, dx: 0, dy: 1, h: 2.20, wide: 1.186 },
  { x: -4.072, y: 7.584, dx: 0, dy: 1, h: 2.20, wide: 1.186 },
];
