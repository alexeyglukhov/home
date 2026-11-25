// Подложка 3.1d: растр «иное» + «стены» + «помещения» (подписи и метраж).
// PNG: var31d-furniture-plan.png (viewBox плана −320/−50/250×220 → метры ниже).
import * as THREE from "three";

export function markHouseFloor(mesh) {
  if (!mesh?.material) return mesh;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 2;
  mesh.material.polygonOffsetUnits = 2;
  return mesh;
}

export const V31_FLOOR_WEST = [-5.163, 7.780, 8.502, 17.815];
export const V31_FLOOR_EAST = [8.362, 0.795, 14.222, 17.815];

const TEX_URL = new URL("./var31d-furniture-plan.png", import.meta.url).href;
const IMG = { x0: -7.01, y0: -1.769, x1: 17.945, y1: 20.192 };
const OPACITY = 0.55;

const HALL_S_WALL_X = 2.834;
const FURN_WEST_HALL = [-5.213, 7.900, HALL_S_WALL_X, 17.815];
const FURN_WEST_NORTH = [HALL_S_WALL_X, 9.40, 8.452, 17.815];
const FURN_EAST = [8.452, 1.195, 14.252, 17.815];

const TERRACE_Y_MAX = 7.701;
const TERRACE_DEEP_Y = 9.35;
const TERRACE_X0 = -5.662;
const TERRACE_X1 = 8.302;

let sharedTex = null;

function uvOf(x, y) {
  return [
    (x - IMG.x0) / (IMG.x1 - IMG.x0),
    (y - IMG.y0) / (IMG.y1 - IMG.y0),
  ];
}

function planOfUv(u, v) {
  const x = IMG.x0 + u * (IMG.x1 - IMG.x0);
  const y = IMG.y0 + v * (IMG.y1 - IMG.y0);
  return [x, y];
}

function onTerrace(x, y) {
  if (x <= TERRACE_X0 || x >= TERRACE_X1) return false;
  if (y < TERRACE_Y_MAX) return true;
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
  sharedTex.flipY = true;
  return sharedTex;
}

/** Деколь слоя «иное» на полу 3.1d (без террасы). */
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
    depthTest: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.userData.furniturePlan = true;
  delete mesh.userData.finish;
  return mesh;
}
