// Полупрозрачная подложка image1546 (мебель) на полу отапливаемого контура Вар 3.1 / 3.1b.
// Терраса не покрывается. Источник: agency/var3.1.svg → var31-furniture-plan.png.
import * as THREE from "three";

const TEX_URL = new URL("./var31-furniture-plan.png", import.meta.url).href;
// PNG в локальных uu плана (как стены WALLS): Cx/Cy по северной стене rect408.
// x восток, y север; U≈9,962.
const IMG = { x0: -5.997, y0: 0.316, x1: 15.360, y1: 19.497 };
const OPACITY = 0.45;

// Два прямоугольника пола без террасы; стык коридоров с нахлёстом (без канавы).
export const V31_FLOOR_WEST = [-5.0, 7.6, 8.55, 17.95];
export const V31_FLOOR_EAST = [8.35, 1.15, 14.5, 17.95];

let sharedTex = null;

function texture() {
  if (sharedTex) return sharedTex;
  sharedTex = new THREE.TextureLoader().load(TEX_URL);
  if ("colorSpace" in sharedTex && THREE.SRGBColorSpace) {
    sharedTex.colorSpace = THREE.SRGBColorSpace;
  }
  sharedTex.anisotropy = 8;
  return sharedTex;
}

function uvOf(x, y) {
  // SVG y вниз и plan_x = −local_x/U: левый край PNG → восток, верх PNG → юг.
  // TextureLoader flipY: v=1 у верха файла.
  return [
    1 - (x - IMG.x0) / (IMG.x1 - IMG.x0),
    1 - (y - IMG.y0) / (IMG.y1 - IMG.y0),
  ];
}

/** Тонкий деколь мебели на полу (только внутри дома). */
export function addVar31FurnitureFloor(api, floorZ) {
  const { planToWorld, addMesh } = api;
  const z = floorZ + 0.005;
  const quads = [
    [
      [V31_FLOOR_WEST[0], V31_FLOOR_WEST[1]],
      [V31_FLOOR_WEST[2], V31_FLOOR_WEST[1]],
      [V31_FLOOR_WEST[2], V31_FLOOR_WEST[3]],
      [V31_FLOOR_WEST[0], V31_FLOOR_WEST[3]],
    ],
    [
      [V31_FLOOR_EAST[0], V31_FLOOR_EAST[1]],
      [V31_FLOOR_EAST[2], V31_FLOOR_EAST[1]],
      [V31_FLOOR_EAST[2], V31_FLOOR_EAST[3]],
      [V31_FLOOR_EAST[0], V31_FLOOR_EAST[3]],
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
