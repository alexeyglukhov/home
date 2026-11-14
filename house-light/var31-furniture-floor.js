// Полупрозрачная подложка image1546 (мебель) на полу отапливаемого контура Вар 3.1 / 3.1b.
// Терраса и полоса у дверей на террасу — не показываем (альфа-маска + клип меша).
import * as THREE from "three";

const TEX_URL = new URL("./var31-furniture-plan.png", import.meta.url).href;
// PNG в локальных uu плана (как стены WALLS): Cx/Cy по северной стене rect408.
const IMG = { x0: -5.997, y0: 0.316, x1: 15.360, y1: 19.497 };
const OPACITY = 0.45;

// Плиты пола внутри внутренних граней стен (нахлёст в коридоре).
// Раньше заходили в толщу стен — линия пола просвечивала снаружи.
export const V31_FLOOR_WEST = [-4.91, 7.74, 8.50, 17.84];
export const V31_FLOOR_EAST = [8.36, 1.26, 14.38, 17.84];

/** Пол дома: чуть вглубь по Z, чтобы стены побеждали в z-fight. */
export function markHouseFloor(mesh) {
  if (!mesh?.material) return mesh;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 2;
  mesh.material.polygonOffsetUnits = 2;
  return mesh;
}

// Меш подложки. Южная стена зала кончается ~x=3.16; восточнее терраса уходит глубже — там подложки нет.
const HALL_S_WALL_X = 3.20;
const FURN_WEST_HALL = [-4.95, 7.90, HALL_S_WALL_X, 17.85]; // за стеной зала
const FURN_WEST_NORTH = [HALL_S_WALL_X, 9.40, 8.45, 17.85]; // севернее «глубокой» террасы
const FURN_EAST = [8.45, 1.20, 14.45, 17.85];

// Альфа-маска: терраса + кусок восточнее стены зала до y=9.35.
const TERRACE_Y_MAX = 7.72;
const TERRACE_DEEP_Y = 9.35;
const TERRACE_X0 = -5.50;
const TERRACE_X1 = 8.30;

let sharedTex = null;

function uvOf(x, y) {
  return [
    1 - (x - IMG.x0) / (IMG.x1 - IMG.x0),
    1 - (y - IMG.y0) / (IMG.y1 - IMG.y0),
  ];
}

function planOfUv(u, v) {
  // Обратно к uvOf (с учётом flipY у TextureLoader: v=1 — верх файла = юг плана).
  const x = IMG.x0 + (1 - u) * (IMG.x1 - IMG.x0);
  const y = IMG.y0 + (1 - v) * (IMG.y1 - IMG.y0);
  return [x, y];
}

function onTerrace(x, y) {
  if (x <= TERRACE_X0 || x >= TERRACE_X1) return false;
  if (y < TERRACE_Y_MAX) return true;
  // Восточнее стены зала терраса глубже на север — без подложки.
  return x > HALL_S_WALL_X && y < TERRACE_DEEP_Y;
}

function texture() {
  if (sharedTex) return sharedTex;
  const loader = new THREE.TextureLoader();
  sharedTex = loader.load(TEX_URL, (tex) => {
    const img = tex.image;
    if (!img || !img.width) return;
    const w = img.width;
    const h = img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        // flipY: строка j=0 файла = v=1 в GL.
        const u = (i + 0.5) / w;
        const v = 1 - (j + 0.5) / h;
        const [x, y] = planOfUv(u, v);
        if (onTerrace(x, y)) {
          px[(j * w + i) * 4 + 3] = 0;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
  });
  if ("colorSpace" in sharedTex && THREE.SRGBColorSpace) {
    sharedTex.colorSpace = THREE.SRGBColorSpace;
  }
  sharedTex.anisotropy = 8;
  return sharedTex;
}

/** Тонкий деколь мебели на полу (только внутри дома, не на террасе). */
export function addVar31FurnitureFloor(api, floorZ) {
  const { planToWorld, addMesh } = api;
  const z = floorZ + 0.005;
  const quads = [
    [
      [FURN_WEST_HALL[0], FURN_WEST_HALL[1]],
      [FURN_WEST_HALL[2], FURN_WEST_HALL[1]],
      [FURN_WEST_HALL[2], FURN_WEST_HALL[3]],
      [FURN_WEST_HALL[0], FURN_WEST_HALL[3]],
    ],
    [
      [FURN_WEST_NORTH[0], FURN_WEST_NORTH[1]],
      [FURN_WEST_NORTH[2], FURN_WEST_NORTH[1]],
      [FURN_WEST_NORTH[2], FURN_WEST_NORTH[3]],
      [FURN_WEST_NORTH[0], FURN_WEST_NORTH[3]],
    ],
    [
      [FURN_EAST[0], FURN_EAST[1]],
      [FURN_EAST[2], FURN_EAST[1]],
      [FURN_EAST[2], FURN_EAST[3]],
      [FURN_EAST[0], FURN_EAST[3]],
    ],
  ];
  const pos = [];
  const uv = [];
  const push = (x, y) => {
    const [e, n] = planToWorld(x, y);
    pos.push(e, z, n);
    const [u, v] = uvOf(x, y);
    uv.push(u, v);
  };
  const tri = (a, b, c) => {
    push(a[0], a[1]);
    push(b[0], b[1]);
    push(c[0], c[1]);
  };
  for (const [a, b, c, d] of quads) {
    tri(a, b, c);
    tri(a, c, d);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geom.computeVertexNormals();

  const mesh = addMesh(geom, 0xffffff, false);
  mesh.material.dispose();
  mesh.material = new THREE.MeshBasicMaterial({
    map: texture(),
    transparent: true,
    opacity: OPACITY,
    alphaTest: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.furniturePlan = true;
  delete mesh.userData.finish;
  return mesh;
}
