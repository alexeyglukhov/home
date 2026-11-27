// Подложка 3.1d: растр «иное» + «стены» + «помещения» (подписи и метраж).
// Дом, терраса, крыльцо и навес — чтобы м²/подписи читались и снаружи.
// PNG: var31d-furniture-plan.png (viewBox плана −380/−55/310×230 → метры ниже).
import * as THREE from "three";

export function markHouseFloor(mesh) {
  if (!mesh?.material) return mesh;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 2;
  mesh.material.polygonOffsetUnits = 2;
  mesh.userData.floorSlab = true;
  // Верх плиты → walkGround (иначе мебель садится на цоколь 0.45 при полу 0.57).
  try {
    mesh.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (Number.isFinite(box.max.y) && box.max.y > 0.05) {
      mesh.userData.walkTop = box.max.y;
    }
  } catch {
    /* ignore */
  }
  return mesh;
}

export const V31_FLOOR_WEST = [-5.212, 7.781, 8.501, 17.814];
export const V31_FLOOR_EAST = [8.361, 0.796, 14.221, 17.814];

const TEX_URL = new URL("./var31d-furniture-plan.png?v=17", import.meta.url).href;
const IMG = { x0: -13.0, y0: -2.268, x1: 17.945, y1: 20.691 };
const OPACITY = 0.55;

const HALL_S_WALL_X = 2.835;
// Пол дома без наружного кармана террасы.
const FURN_WEST_HALL = [-5.262, 7.901, HALL_S_WALL_X, 17.814];
const FURN_WEST_NORTH = [HALL_S_WALL_X, 9.40, 8.451, 17.814];
const FURN_EAST = [8.451, 0.846, 14.251, 17.814];
// Подложка на настиле (не на ступенях — иначе дрожь по южному краю).
const FURN_TERRACE = [-5.612, 4.67, 8.181, 7.381];
const FURN_TERRACE_IN = [HALL_S_WALL_X, 7.381, 8.181, 9.40];
const FURN_PORCH = [-0.078, 18.211, 8.093, 20.066];
// L-навес: западный прямоугольник + северная полоса до карниза крыльца.
const FURN_CANOPY_W = [-11.629, 9.947, -5.573, 19.778];
const FURN_CANOPY_N = [-5.573, 19.058, -0.619, 19.778];

let sharedTex = null;

function uvOf(x, y) {
  return [
    (x - IMG.x0) / (IMG.x1 - IMG.x0),
    (y - IMG.y0) / (IMG.y1 - IMG.y0),
  ];
}

function texture() {
  if (sharedTex) return sharedTex;
  const loader = new THREE.TextureLoader();
  sharedTex = loader.load(TEX_URL);
  if ("colorSpace" in sharedTex && THREE.SRGBColorSpace) {
    sharedTex.colorSpace = THREE.SRGBColorSpace;
  }
  sharedTex.anisotropy = 16;
  sharedTex.flipY = true;
  return sharedTex;
}

function boxQuad(b) {
  return [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[2], b[3]],
    [b[0], b[3]],
  ];
}

/** Деколь слоя «иное» на полу 3.1d: дом + терраса + крыльцо + навес. */
export function addVar31FurnitureFloor(api, floorZ) {
  const { planToWorld, addMesh } = api;
  // 2 мм над плитой — ниже FOOT_CLEAR (1 см), иначе деколь режет дно шкафов (G03).
  const zFloor = floorZ + 0.002;
  // Чуть выше плитки парковки (верх ≈0,01), иначе подпись «Навес» тонет в плите.
  const zYard = 0.045;
  const layers = [
    { z: zFloor, boxes: [FURN_WEST_HALL, FURN_WEST_NORTH, FURN_EAST, FURN_TERRACE, FURN_TERRACE_IN, FURN_PORCH] },
    { z: zYard, boxes: [FURN_CANOPY_W, FURN_CANOPY_N] },
  ];
  const pos = [];
  const uv = [];
  const push = (x, y, z) => {
    const [e, n] = planToWorld(x, y);
    pos.push(e, z, n);
    const [u, v] = uvOf(x, y);
    uv.push(u, v);
  };
  const tri = (a, b, c, z) => {
    push(a[0], a[1], z);
    push(b[0], b[1], z);
    push(c[0], c[1], z);
  };
  for (const layer of layers) {
    for (const box of layer.boxes) {
      const [a, b, c, d] = boxQuad(box);
      tri(a, b, c, layer.z);
      tri(a, c, d, layer.z);
    }
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
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3; // выше плитки парковки (renderOrder 2)
  mesh.userData.furniturePlan = true;
  delete mesh.userData.finish;
  return mesh;
}
