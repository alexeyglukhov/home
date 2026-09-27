import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import geo from "./geometry.js?v=21";

const panel = document.getElementById("panel");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");
const clock = document.getElementById("clock");
const sunInfo = document.getElementById("sun");
const roofToggle = document.getElementById("roof");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xd5e2ef);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(24, 36, -52);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-2, 0.4, -6);
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.38));
scene.add(new THREE.HemisphereLight(0xd5e2ef, 0x8aa86a, 0.28));

const sun = new THREE.DirectionalLight(0xfff2d8, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.04;
const shadow = sun.shadow.camera;
shadow.left = shadow.bottom = -55;
shadow.right = shadow.top = 55;
shadow.near = 1;
shadow.far = 180;
scene.add(sun);
scene.add(sun.target);

const sharedGroup = new THREE.Group();
const northGroup = new THREE.Group();
const westGroup = new THREE.Group();
const houseRig = new THREE.Group();
scene.add(sharedGroup, northGroup, westGroup);
westGroup.visible = false;
let bucket = sharedGroup;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.MeshLambertMaterial({ color: 0xc5d0b8 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);

function pushTri(pos, a, b, c) {
  pos.push(...a, ...b, ...c);
}

function geometryFromTriangles(tris) {
  const pos = [];
  for (const [a, b, c] of tris) pushTri(pos, a, b, c);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

function solidFromTris(tris, y0, y1) {
  const pos = [];
  for (const tri of tris) {
    const top = tri.map(([x, , z]) => [x, y1, z]);
    const bot = tri.map(([x, , z]) => [x, y0, z]);
    pushTri(pos, top[0], top[1], top[2]);
    pushTri(pos, bot[0], bot[2], bot[1]);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      pushTri(pos, bot[i], bot[j], top[j]);
      pushTri(pos, bot[i], top[j], top[i]);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

function prismGeometry(parts) {
  const pos = [];
  for (const part of parts) {
    const ring = part.ring.map(([x, , z]) => [x, z]);
    const y0 = part.y0;
    const y1 = part.y1;
    const v = [];
    for (const y of [y0, y1]) {
      for (const [x, z] of ring) v.push([x, y, z]);
    }
    const faces = [
      [0, 1, 2], [0, 2, 3],
      [4, 6, 5], [4, 7, 6],
      [0, 4, 5], [0, 5, 1],
      [1, 5, 6], [1, 6, 2],
      [2, 6, 7], [2, 7, 3],
      [3, 7, 4], [3, 4, 0],
    ];
    for (const [i, j, k] of faces) pushTri(pos, v[i], v[j], v[k]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

function skirtGeometry(bottom, top) {
  const pos = [];
  const n = bottom.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pushTri(pos, bottom[i], bottom[j], top[j]);
    pushTri(pos, bottom[i], top[j], top[i]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}

function addMesh(geom, color, cast = true) {
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
  );
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  bucket.add(mesh);
  return mesh;
}

function sunPosition(year, month, day, hour, minute, lat, lon) {
  const utc = Date.UTC(year, month - 1, day, hour, minute) - 3 * 3600 * 1000;
  const n = utc / 86400000 + 2440587.5 - 2451545.0;
  const rad = Math.PI / 180;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  let lam = ((280.460 + 0.9856474 * n) % 360) * rad;
  lam += rad * (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  let gmst = (280.46061837 + 360.98564736629 * n) % 360;
  if (gmst < 0) gmst += 360;
  const ha = gmst * rad + lon * rad - ra;
  const latR = lat * rad;
  const sinEl = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(latR)) / (Math.cos(el) * Math.cos(latR) + 1e-12);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(ha) > 0) az = Math.PI * 2 - az;
  let azDeg = (az * 180) / Math.PI;
  azDeg = ((azDeg % 360) + 360) % 360;
  return { az: azDeg, el: (el * 180) / Math.PI };
}

function applySun(geo) {
  const [year, month, day] = dateInput.value.split("-").map(Number);
  const minutes = Number(timeInput.value);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  clock.textContent = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const { az, el } = sunPosition(year, month, day, hour, minute, geo.lat, geo.lon);
  const azR = (az * Math.PI) / 180;
  const elR = (el * Math.PI) / 180;
  const up = Math.sin(elR);
  const horiz = Math.cos(elR);
  // Север и восток — как стрелка «С» на листе, не оси мира.
  const dir = new THREE.Vector3()
    .addScaledVector(cadastralEast, Math.sin(azR) * horiz)
    .addScaledVector(cadastralNorth, Math.cos(azR) * horiz);
  dir.y = up;
  sun.position.copy(dir).multiplyScalar(90);
  sun.target.position.set(0, 1, 0);
  sun.target.updateMatrixWorld();
  const above = el > 0.4;
  sun.intensity = above ? 3.3 : 0;
  sun.castShadow = above;
  const side = az < 180 ? "восточная половина" : "западная половина";
  sunInfo.textContent = above
    ? `Солнце: высота ${el.toFixed(0)}°, азимут ${az.toFixed(0)}° от севера, ${side}.`
    : `Солнце под горизонтом (высота ${el.toFixed(0)}°).`;
}

const PLINTH = 0.3;
const plinthColor = 0xcfc6b8;
bucket = houseRig;
addMesh(solidFromTris(geo.floor, 0, PLINTH), plinthColor);
const houseWalls = addMesh(prismGeometry(geo.walls), 0xe7e1d6);
const houseFloor = addMesh(geometryFromTriangles(geo.floor), 0xf4f0e6, false);
houseWalls.position.y = PLINTH;
houseFloor.position.y = PLINTH;

const HIP_TRIS = [
  [[4.310, 13.100, 4.710], [-0.400, 17.810, 0.000], [-0.400, -0.400, 0.000]],
  [[-0.400, -0.400, 0.000], [6.355, 6.355, 6.755], [6.355, 8.235, 6.755]],
  [[-0.400, -0.400, 0.000], [6.355, 8.235, 6.755], [4.310, 10.280, 4.710]],
  [[-0.400, -0.400, 0.000], [4.310, 10.280, 4.710], [4.310, 13.100, 4.710]],
  [[-0.400, 17.810, 0.000], [4.310, 13.100, 4.710], [9.020, 17.810, 0.000]],
  [[9.020, 14.990, 0.000], [9.020, 17.810, 0.000], [4.310, 13.100, 4.710]],
  [[4.310, 13.100, 4.710], [4.310, 10.280, 4.710], [9.020, 14.990, 0.000]],
  [[13.110, 14.990, 0.000], [9.020, 14.990, 0.000], [4.310, 10.280, 4.710]],
  [[4.310, 10.280, 4.710], [6.355, 8.235, 6.755], [13.110, 14.990, 0.000]],
  [[13.110, -0.400, 0.000], [13.110, 14.990, 0.000], [6.355, 8.235, 6.755]],
  [[6.355, 8.235, 6.755], [6.355, 6.355, 6.755], [13.110, -0.400, 0.000]],
  [[13.110, -0.400, 0.000], [6.355, 6.355, 6.755], [-0.400, -0.400, 0.000]],
];

// Вальма основного объёма с ендовой на уступе. Крыльцо без своей крыши.
function addHouseHip() {
  const yEave = geo.wallHeight + PLINTH;
  const tan = Math.tan((22 * Math.PI) / 180);
  const lift = (p) => {
    const [x, z] = planToWorld(p[0], p[1]);
    return [x, yEave + p[2] * tan, z];
  };
  const orient = (a, b, c) => {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    return ny < 0 ? [a, c, b] : [a, b, c];
  };
  const tris = HIP_TRIS.map(([a, b, c]) => orient(lift(a), lift(b), lift(c)));
  const roofMesh = new THREE.Mesh(
    geometryFromTriangles(tris),
    new THREE.MeshLambertMaterial({ color: 0x3a4148, side: THREE.DoubleSide })
  );
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  roofMesh.userData.roof = true;
  bucket.add(roofMesh);

  const fascia = [];
  const eave = [
    [-0.4, -0.4],
    [13.11, -0.4],
    [13.11, 14.99],
    [9.02, 14.99],
    [9.02, 17.81],
    [-0.4, 17.81],
  ].map(([x, y]) => planToWorld(x, y));
  for (let i = 0; i < eave.length; i++) {
    const j = (i + 1) % eave.length;
    const a = [eave[i][0], yEave - 0.2, eave[i][1]];
    const b = [eave[j][0], yEave - 0.2, eave[j][1]];
    const c = [eave[j][0], yEave, eave[j][1]];
    const d = [eave[i][0], yEave, eave[i][1]];
    fascia.push([a, b, c], [a, c, d]);
  }
  const fasciaMesh = new THREE.Mesh(
    geometryFromTriangles(fascia),
    new THREE.MeshLambertMaterial({ color: 0x6b4f3a, side: THREE.DoubleSide })
  );
  fasciaMesh.castShadow = true;
  fasciaMesh.receiveShadow = true;
  fasciaMesh.userData.roof = true;
  bucket.add(fasciaMesh);
}

function asRoof(mesh) {
  mesh.userData.roof = true;
  return mesh;
}

// План на участке зеркален по X так же, как контур дома.
// Кадастровый север — не ось Z, а стрелка «С» вверх листа.
const PLAN_W = 12.71;
const AZ_X = Math.atan2(0.945323, 0.326137);
const AZ_Y = Math.atan2(-0.326137, 0.945323);
const CE = 1.68147143500927;
const CN = 14.03576476268919;

function planToWorld(x, y) {
  const xm = PLAN_W - x;
  const east = xm * Math.sin(AZ_X) + y * Math.sin(AZ_Y);
  const north = xm * Math.cos(AZ_X) + y * Math.cos(AZ_Y);
  return [east - CE, north - CN];
}

function planDeltaToWorld(dx, dy) {
  const x = -dx * Math.sin(AZ_X) + dy * Math.sin(AZ_Y);
  const z = -dx * Math.cos(AZ_X) + dy * Math.cos(AZ_Y);
  return new THREE.Vector3(x, 0, z).normalize();
}

const cadastralNorth = planDeltaToWorld(Math.cos(AZ_X), Math.cos(AZ_Y));
const cadastralEast = planDeltaToWorld(Math.sin(AZ_X), Math.sin(AZ_Y));

addHouseHip();

function shapeFromPlan(pts) {
  const flat = pts.map(([x, y]) => {
    const [e, n] = planToWorld(x, y);
    return [e, -n];
  });
  let area = 0;
  for (let i = 0; i < flat.length; i++) {
    const [x1, y1] = flat[i];
    const [x2, y2] = flat[(i + 1) % flat.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) flat.reverse();
  const shape = new THREE.Shape();
  flat.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  return shape;
}

function addSlab(pts, y0, height, color, cast = false) {
  const geom = new THREE.ExtrudeGeometry(shapeFromPlan(pts), { depth: height, bevelEnabled: false });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y0, 0);
  return addMesh(geom, color, cast);
}

function planBox(quad, y0, y1, color, cast = true) {
  const ring = quad.map(([x, y]) => {
    const [e, n] = planToWorld(x, y);
    return [e, 0, n];
  });
  return addMesh(prismGeometry([{ ring, y0, y1 }]), color, cast);
}

const FRAME = 0x6b3e24;

function addOpeningFrame(x0, x1, y0, y1, z0, z1, withSill) {
  const fw = 0.07;
  const bite = 0.015;
  const proud = 0.012;
  const alongX = x1 - x0 >= y1 - y0;
  if (alongX) {
    const ya = y0 - proud;
    const yb = y1 + proud;
    const left = x0 - bite;
    const right = x1 + bite;
    planBox([[left, ya], [x0 + fw, ya], [x0 + fw, yb], [left, yb]], z0, z1, FRAME);
    planBox([[x1 - fw, ya], [right, ya], [right, yb], [x1 - fw, yb]], z0, z1, FRAME);
    planBox([[left, ya], [right, ya], [right, yb], [left, yb]], z1 - fw, z1, FRAME);
    if (withSill) planBox([[left, ya], [right, ya], [right, yb], [left, yb]], z0, z0 + fw, FRAME);
  } else {
    const xa = x0 - proud;
    const xb = x1 + proud;
    const near = y0 - bite;
    const far = y1 + bite;
    planBox([[xa, near], [xb, near], [xb, y0 + fw], [xa, y0 + fw]], z0, z1, FRAME);
    planBox([[xa, y1 - fw], [xb, y1 - fw], [xb, far], [xa, far]], z0, z1, FRAME);
    planBox([[xa, near], [xb, near], [xb, far], [xa, far]], z1 - fw, z1, FRAME);
    if (withSill) planBox([[xa, near], [xb, near], [xb, far], [xa, far]], z0, z0 + fw, FRAME);
  }
}

function segmentQuad(a, b, half) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (dy / len) * half;
  const ny = (-dx / len) * half;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

function addWallRun(a, b, half, y0, y1, color) {
  planBox(segmentQuad(a, b, half), y0, y1, color);
}

const sillZ = PLINTH + geo.sill;
const headZ = PLINTH + geo.head;
const houseWindows = [
  [5.46, 6.96, 0.0, 0.5],
  [1.51, 2.96, 0.0, 0.5],
  [9.61, 10.66, 3.6, 4.1],
  [6.19, 7.66, 16.0, 16.5],
  [1.11, 2.06, 16.9, 17.4],
  [12.31, 12.71, 6.35, 7.85],
  [12.31, 12.71, 9.55, 11.05],
  [8.71, 9.16, 1.15, 3.2],
  [7.91, 8.36, 14.85, 15.9],
  [0.06, 0.51, 6.15, 7.7],
  [0.06, 0.51, 11.85, 13.4],
  [12.26, 12.71, 12.85, 14.1],
  [11.01, 12.71, 14.1, 14.6],
];
for (const [x0, x1, y0, y1] of houseWindows) {
  addOpeningFrame(x0, x1, y0, y1, sillZ, headZ, true);
}
addOpeningFrame(5.31, 6.19, 16.0, 16.5, PLINTH, headZ, false);
addOpeningFrame(10.66, 11.56, 3.6, 4.1, PLINTH, headZ, false);

// Стол 1,0×1,5 м и 6 кресел на террасе. Длинная сторона вдоль стены зала,
// проход к двери остаётся около 0,9 м.
{
  const floor = PLINTH;
  const tx0 = 10.05;
  const tx1 = 11.55;
  const ty0 = 1.19;
  const ty1 = 2.19;
  const top = floor + 0.75;
  const wood = 0x9a7049;
  const legC = 0x5c4033;
  planBox([[tx0, ty0], [tx1, ty0], [tx1, ty1], [tx0, ty1]], top - 0.045, top, wood);
  const inset = 0.1;
  const ls = 0.07;
  for (const [ex, ny] of [
    [tx0 + inset, ty0 + inset],
    [tx1 - inset - ls, ty0 + inset],
    [tx0 + inset, ty1 - inset - ls],
    [tx1 - inset - ls, ty1 - inset - ls],
  ]) {
    planBox([[ex, ny], [ex + ls, ny], [ex + ls, ny + ls], [ex, ny + ls]], floor, top - 0.045, legC);
  }
  const addChair = (cx, cy, face) => {
    const s = 0.46;
    const h = s / 2;
    const x0 = cx - h;
    const x1 = cx + h;
    const y0 = cy - h;
    const y1 = cy + h;
    const seat = floor + 0.45;
    const t = 0.045;
    planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], seat - 0.04, seat, 0xd7c4a8);
    for (const [ex, ny] of [
      [x0 + 0.04, y0 + 0.04],
      [x1 - 0.04 - t, y0 + 0.04],
      [x0 + 0.04, y1 - 0.04 - t],
      [x1 - 0.04 - t, y1 - 0.04 - t],
    ]) {
      planBox([[ex, ny], [ex + t, ny], [ex + t, ny + t], [ex, ny + t]], floor, seat - 0.04, legC);
    }
    const back = {
      n: [[x0, y0], [x1, y0], [x1, y0 + t], [x0, y0 + t]],
      s: [[x0, y1 - t], [x1, y1 - t], [x1, y1], [x0, y1]],
      e: [[x0, y0], [x0 + t, y0], [x0 + t, y1], [x0, y1]],
      w: [[x1 - t, y0], [x1, y0], [x1, y1], [x1 - t, y1]],
    };
    planBox(back[face], seat, floor + 0.92, legC);
  };
  const gap = 0.29;
  const midY = (ty0 + ty1) / 2;
  for (const cx of [tx0 + 0.375, tx0 + 1.125]) {
    addChair(cx, ty0 - gap, "n");
    addChair(cx, ty1 + gap, "s");
  }
  addChair(tx0 - gap, midY, "e");
  addChair(tx1 + gap, midY, "w");
}

// Стол и стулья зала — по контурам плана.
{
  const floor = PLINTH;
  const wood = 0x5c4033;
  planBox([[9.62, 8.68], [11.10, 8.68], [11.10, 9.42], [9.62, 9.42]], floor + 0.70, floor + 0.75, wood);
  for (const [ex, ny] of [[9.70, 8.76], [11.02, 8.76], [9.70, 9.28], [11.02, 9.28]]) {
    planBox([[ex, ny], [ex + 0.06, ny], [ex + 0.06, ny + 0.06], [ex, ny + 0.06]], floor, floor + 0.70, wood);
  }
  const addChair = (cx, cy, face) => {
    const s = 0.46;
    const h = s / 2;
    const x0 = cx - h;
    const x1 = cx + h;
    const y0 = cy - h;
    const y1 = cy + h;
    const top = floor + 0.45;
    const t = 0.045;
    planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], top - 0.04, top, 0xd7c4a8);
    const back = {
      n: [[x0, y0], [x1, y0], [x1, y0 + t], [x0, y0 + t]],
      s: [[x0, y1 - t], [x1, y1 - t], [x1, y1], [x0, y1]],
      e: [[x0, y0], [x0 + t, y0], [x0 + t, y1], [x0, y1]],
      w: [[x1 - t, y0], [x1, y0], [x1, y1], [x1 - t, y1]],
    };
    planBox(back[face], top, floor + 0.90, wood);
  };
  addChair(9.97, 8.38, "n");
  addChair(10.78, 8.38, "n");
  addChair(9.98, 9.67, "s");
  addChair(10.78, 9.67, "s");
  addChair(9.34, 9.02, "e");
  addChair(11.40, 9.02, "w");
}

// Спинка параллельно восточной стене, на 0,5 м ближе к телевизору.
// Одинаковый проход до стульев стола и до окна террасы.
{
  const floor = PLINTH;
  const fab = 0xd7c4a8;
  const wood = 0x5c4033;
  const xBack = 12.216 - 2;
  const depth = 0.9;
  const xFront = xBack - depth;
  const y0 = 4.775;
  const y1 = 7.475;
  const seat = floor + 0.45;
  const backT = 0.16;
  const arm = 0.12;
  planBox([[xFront, y0], [xBack, y0], [xBack, y1], [xFront, y1]], floor + 0.12, seat, fab);
  planBox([[xBack - backT, y0], [xBack, y0], [xBack, y1], [xBack - backT, y1]], seat, floor + 0.95, fab);
  planBox([[xFront, y0], [xBack, y0], [xBack, y0 + arm], [xFront, y0 + arm]], seat, floor + 0.62, fab);
  planBox([[xFront, y1 - arm], [xBack, y1 - arm], [xBack, y1], [xFront, y1]], seat, floor + 0.62, fab);
  for (const [lx, ly] of [
    [xFront + 0.06, y0 + 0.06],
    [xBack - 0.14, y0 + 0.06],
    [xFront + 0.06, y1 - 0.14],
    [xBack - 0.14, y1 - 0.14],
  ]) {
    planBox([[lx, ly], [lx + 0.08, ly], [lx + 0.08, ly + 0.08], [lx, ly + 0.08]], floor, floor + 0.12, wood);
  }
}

// Тумба, саундбар и телевизор 72" напротив дивана, у западной стены зала.
{
  const floor = PLINTH;
  const wallX = 6.52;
  const cy = (4.775 + 7.475) / 2;
  const standW = 1.8;
  const standD = 0.42;
  const y0 = cy - standW / 2;
  const y1 = cy + standW / 2;
  const x1 = wallX + standD;
  const top = floor + 0.5;
  planBox([[wallX, y0], [x1, y0], [x1, y1], [wallX, y1]], floor + 0.08, top - 0.03, 0x8b5a2b);
  planBox([[wallX, y0], [x1, y0], [x1, y1], [wallX, y1]], top - 0.03, top, 0x6b3e24);
  const barW = 1.1;
  const barD = 0.09;
  planBox(
    [[wallX, cy - barW / 2], [wallX + barD, cy - barW / 2], [wallX + barD, cy + barW / 2], [wallX, cy + barW / 2]],
    top, top + 0.08, 0x1c1e22
  );
  const tvW = 72 * 0.0254 * 16 / Math.hypot(16, 9);
  const tvH = 72 * 0.0254 * 9 / Math.hypot(16, 9);
  const tvBottom = top + 0.12;
  const bezel = 0.025;
  planBox(
    [[wallX, cy - tvW / 2], [wallX + 0.05, cy - tvW / 2], [wallX + 0.05, cy + tvW / 2], [wallX, cy + tvW / 2]],
    tvBottom, tvBottom + tvH, 0x2a2a2a
  );
  planBox(
    [[wallX + 0.03, cy - tvW / 2 + bezel], [wallX + 0.055, cy - tvW / 2 + bezel],
      [wallX + 0.055, cy + tvW / 2 - bezel], [wallX + 0.03, cy + tvW / 2 - bezel]],
    tvBottom + bezel, tvBottom + tvH - bezel, 0x101216
  );
  const tower = (yA) => {
    const w = 0.18;
    const yB = yA + w;
    const xf = wallX + 0.22;
    planBox([[wallX, yA], [xf, yA], [xf, yB], [wallX, yB]], floor + 0.02, floor + 0.95, 0x8b5a2b);
    const inset = 0.015;
    planBox(
      [[xf - 0.006, yA + inset], [xf + 0.01, yA + inset], [xf + 0.01, yB - inset], [xf - 0.006, yB - inset]],
      floor + 0.08, floor + 0.88, 0x141414
    );
  };
  tower(y0 - 0.06 - 0.18);
  tower(y1 + 0.06);
}

// Угловая кухня: север до двери у x=8.2. Восток и остров выходят
// на 0,2 м за линию угла кладовой в зал. По бокам острова проход по 1 м. Навесных на востоке нет.
{
  const floor = PLINTH;
  const cab = 0xefe6d4;
  const top = 0x4e5963;
  const base = (x0, x1, y0, y1) => {
    planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor + 0.10, floor + 0.88, cab);
  };
  const upper = (x0, x1, y0, y1) => {
    planBox([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor + 1.45, floor + 2.10, cab);
  };
  const cut = 11.801;
  const past = 0.2;
  const end = cut - past;
  base(8.28, 11.66, 13.50, 14.10);
  base(11.66, 12.26, end, 14.10);
  planBox([[8.28, 13.48], [12.26, 13.48], [12.26, 14.10], [8.28, 14.10]], floor + 0.88, floor + 0.92, top);
  planBox([[11.64, end], [12.26, end], [12.26, 13.48], [11.64, 13.48]], floor + 0.88, floor + 0.92, top);
  upper(8.32, 10.90, 13.72, 14.10);
  planBox([[11.20, 13.62], [11.70, 13.62], [11.70, 14.08], [11.20, 14.08]], floor + 0.92, floor + 0.95, 0x9aa3ab);
  planBox([[11.78, 12.05], [12.22, 12.05], [12.22, 12.45], [11.78, 12.45]], floor + 0.92, floor + 0.95, 0x1c1e22);
  const isleX0 = 8.164 + 1;
  const isleX1 = 11.64 - 1;
  base(isleX0, isleX1, end, end + 1);
  planBox(
    [[isleX0, end], [isleX1, end], [isleX1, end + 1], [isleX0, end + 1]],
    floor + 0.88, floor + 0.92, top
  );
}
northGroup.add(houseRig);

function addSite() {
  const plot = [
    [-18.0, 22.877],
    [32.835, 22.877],
    [39.044, -10.647],
    [-12.963, -4.345],
  ];
  const verge = [
    [-36.955, 42.876],
    [35.233, 42.877],
    [48.149, -26.86],
    [-25.708, -17.91],
  ];
  const fenceY = 22.877;
  const roadNear = fenceY + 13;
  const roadFar = roadNear + 5;
  // Проём 5,98 м, консоль 2,4 м. Полный откат на запад должен помещаться
  // до углового столба с запасом 0,5 м.
  const gateW = 5.98;
  const gateTailLen = 2.4;
  const gateX0 = -18 + 0.08 + 0.5 + gateTailLen + gateW;
  const gateX1 = gateX0 + gateW;
  const kalX0 = gateX1 + 0.45;
  const kalX1 = kalX0 + 1.5;
  const fenceH = 1.5;
  const fenceT = 0.06;

  bucket = sharedGroup;
  addSlab(verge, -0.02, 0.02, 0xd3ebc0, false);
  addSlab([[-32, roadFar], [34, roadFar], [34, roadNear], [-32, roadNear]], 0.0, 0.02, 0xe3e3e0, false);
  // Западная дорога в 5 м от границы, на кадастре её нет.
  addSlab([[-25.49, roadNear], [-17.88, -5.255], [-22.796, -6.164], [-30.575, roadNear]], 0.0, 0.02, 0xe3e3e0, false);
  addSlab(plot, 0.0, 0.02, 0xb7d48c, false);
  bucket = northGroup;

  // Напротив ворот и на 1,5 м глубже прежнего места: перед воротами гаража
  // остаётся около 7 м, туда встаёт машина. Скважина на 6 м южнее южной стены.
  const gx0 = gateX0;
  const gx1 = gateX1;
  const gy0 = 8.7;
  const gy1 = 15.914;
  const wellE = -6;
  const wellN = gy0 - 6;
  const court = [
    [gx1, gy0 - 1],
    [-1, gy0 - 1],
    [-1, gy1],
    [4.843, gy1],
    [4.843, 17.414],
    [4.844, 18.877],
    [8.618, 18.877],
    [9.618, 18.877],
    [9.618, 15.588],
    [13.71, 15.588],
    [13.71, fenceY],
    [gx0 - 1, fenceY],
    [gx0 - 1, gy1],
    [gx1, gy1],
  ];
  const path = [
    [13.71, 0.45],
    [24.6, 0.45],
    [24.6, 2.45],
    [20.155, 2.45],
    [20.155, 3.45],
    [18.155, 3.45],
    [18.155, 2.45],
    [13.71, 2.45],
  ];
  addSlab(court, 0.03, 0.035, 0xe6d3b0, false);
  addSlab(path, 0.03, 0.035, 0xe6d3b0, false);
  addSlab(
    [[gateX0, fenceY - 0.25], [kalX1, fenceY - 0.25], [kalX1, roadNear], [gateX0, roadNear]],
    0.03, 0.035, 0xe6d3b0, false
  );
  // Площадка у люка скважины и дорожка 1 м до отмостки гаража.
  addSlab([
    [wellE - 1, wellN - 1], [wellE + 1, wellN - 1], [wellE + 1, wellN + 1],
    [wellE + 0.5, wellN + 1], [wellE + 0.5, gy0 - 1], [wellE - 0.5, gy0 - 1],
    [wellE - 0.5, wellN + 1], [wellE - 1, wellN + 1],
  ], 0.03, 0.035, 0xe6d3b0, false);
  // Мощение вокруг крышек септика. Прохода в заборе нет.
  addSlab([
    [27.24, 17.68], [31.24, 17.68], [31.24, 20.88], [27.24, 20.88],
  ], 0.03, 0.035, 0xe6d3b0, false);
  const blind = 0xd4cfc4;
  addSlab([
    [13.71, -1], [13.71, 15.588], [9.618, 15.588], [9.618, 19.877],
    [3.843, 19.878], [3.842, 18.415], [-1, 18.414], [-1, -1],
  ], 0.07, 0.025, blind, false);
  addSlab([[gx0 - 1, gy0 - 1], [gx1, gy0 - 1], [gx1, gy0], [gx0 - 1, gy0]], 0.07, 0.025, blind, false);
  addSlab([[gx0 - 1, gy0], [gx0, gy0], [gx0, gy1], [gx0 - 1, gy1]], 0.07, 0.025, blind, false);
  addSlab([[23.6, -0.55], [31.1, -0.55], [31.1, 5.35], [23.6, 5.35]], 0.07, 0.025, blind, false);

  const t = 0.18;
  const gTop = 2.55;
  const doorH = 2.15;
  const d1a = gx0 + 0.51;
  const d1b = d1a + 2.4;
  const d2a = d1b + 0.16;
  const d2b = d2a + 2.4;
  planBox([[gx0, gy0], [gx1, gy0], [gx1, gy0 + t], [gx0, gy0 + t]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy0], [gx0 + t, gy0], [gx0 + t, gy1], [gx0, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx1 - t, gy0], [gx1, gy0], [gx1, gy1], [gx1 - t, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy1 - t], [d1a, gy1 - t], [d1a, gy1], [gx0, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[d1b, gy1 - t], [d2a, gy1 - t], [d2a, gy1], [d1b, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[d2b, gy1 - t], [gx1, gy1 - t], [gx1, gy1], [d2b, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy1 - t], [gx1, gy1 - t], [gx1, gy1], [gx0, gy1]], PLINTH + doorH, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0 + t, gy0 + t], [gx1 - t, gy0 + t], [gx1 - t, gy1], [gx0 + t, gy1]], 0.03, 0.065, 0xe6d3b0, false);
  const shopY0 = gy0 + 1.94;
  const shopY1 = gy0 + 2.06;
  planBox([[gx0 + t, shopY0], [gx0 + 2.54, shopY0], [gx0 + 2.54, shopY1], [gx0 + t, shopY1]], 0.065, PLINTH + gTop, 0xefe6d4);
  planBox([[gx0 + 3.44, shopY0], [gx1 - t, shopY0], [gx1 - t, shopY1], [gx0 + 3.44, shopY1]], 0.065, PLINTH + gTop, 0xefe6d4);
  // Двускатная крыша: конёк вдоль гаража, скаты на восток и запад, фронтон над воротами.
  {
    const ov = 0.22;
    const eW = gx0 - ov;
    const eE = gx1 + ov;
    const nS = gy0 - ov;
    const nN = gy1 + ov;
    const eR = (gx0 + gx1) / 2;
    const eave = PLINTH + gTop;
    const rise = Math.tan(22 * Math.PI / 180) * (eR - eW);
    const ridge = eave + rise;
    const dz = 0.1;
    const V = (e, n, z) => {
      const [x, zz] = planToWorld(e, n);
      return [x, z, zz];
    };
    const WSo = V(eW, nS, eave);
    const WNo = V(eW, nN, eave);
    const ESo = V(eE, nS, eave);
    const ENo = V(eE, nN, eave);
    const RSo = V(eR, nS, ridge);
    const RNo = V(eR, nN, ridge);
    const WSi = V(eW, nS, eave - dz);
    const WNi = V(eW, nN, eave - dz);
    const ESi = V(eE, nS, eave - dz);
    const ENi = V(eE, nN, eave - dz);
    const RSi = V(eR, nS, ridge - dz);
    const RNi = V(eR, nN, ridge - dz);
    const tris = [];
    const quad = (a, b, c, d) => {
      tris.push([a, b, c], [a, c, d]);
    };
    quad(WSo, WNo, RNo, RSo);
    quad(ESo, RSo, RNo, ENo);
    quad(WSi, RSi, RNi, WNi);
    quad(ESi, ENi, RNi, RSi);
    quad(WSo, WSi, WNi, WNo);
    quad(ESo, ENo, ENi, ESi);
    quad(WSo, RSo, RSi, WSi);
    quad(ESo, ESi, RSi, RSo);
    quad(WNo, WNi, RNi, RNo);
    quad(ENo, RNo, RNi, ENi);
    quad(RSo, RNo, RNi, RSi);
    asRoof(addMesh(geometryFromTriangles(tris), 0x6e675e));
    const gable = (n) => {
      const a = V(gx0, n, eave);
      const b = V(gx1, n, eave);
      const c = V(eR, n, ridge - dz - 0.02);
      return [[a, b, c], [a, c, b]];
    };
    addMesh(geometryFromTriangles([...gable(gy0 + 0.02), ...gable(gy1 - 0.02)]), 0xf4f0e8);
  }

  const bx0 = 24.6;
  const bx1 = 30.1;
  const by0 = 0.45;
  const by1 = 4.35;
  const bTop = 2.45;
  const bDoor0 = 0.9;
  const bDoor1 = 2.1;
  const bDoorHead = 2.05;
  const bWall = 0xf4efe8;
  const dressWin0 = 25.55;
  const dressWin1 = 26.65;
  const dressSill = 0.85;
  const dressHead = 1.8;
  const steamWin0 = 2.05;
  const steamWin1 = 2.65;
  const steamSill = 1.3;
  const steamHead = 1.8;
  const partX0 = 27.54;
  const partX1 = 27.66;
  const partDoor0 = 2.02;
  const partDoor1 = 2.77;
  const partDoorHead = 2.0;
  const partY0 = by0 + t;
  const partY1 = by1 - t;
  planBox([[bx0 - 0.08, by0 - 0.08], [bx1 + 0.08, by0 - 0.08], [bx1 + 0.08, by1 + 0.08], [bx0 - 0.08, by1 + 0.08]], 0, PLINTH, plinthColor);
  planBox([[bx0, by0], [dressWin0, by0], [dressWin0, by0 + t], [bx0, by0 + t]], PLINTH, PLINTH + bTop, bWall);
  planBox([[dressWin1, by0], [bx1, by0], [bx1, by0 + t], [dressWin1, by0 + t]], PLINTH, PLINTH + bTop, bWall);
  planBox([[dressWin0, by0], [dressWin1, by0], [dressWin1, by0 + t], [dressWin0, by0 + t]], PLINTH, PLINTH + dressSill, bWall);
  planBox([[dressWin0, by0], [dressWin1, by0], [dressWin1, by0 + t], [dressWin0, by0 + t]], PLINTH + dressHead, PLINTH + bTop, bWall);
  planBox([[bx1 - t, by0], [bx1, by0], [bx1, steamWin0], [bx1 - t, steamWin0]], PLINTH, PLINTH + bTop, bWall);
  planBox([[bx1 - t, steamWin1], [bx1, steamWin1], [bx1, by1], [bx1 - t, by1]], PLINTH, PLINTH + bTop, bWall);
  planBox([[bx1 - t, steamWin0], [bx1, steamWin0], [bx1, steamWin1], [bx1 - t, steamWin1]], PLINTH, PLINTH + steamSill, bWall);
  planBox([[bx1 - t, steamWin0], [bx1, steamWin0], [bx1, steamWin1], [bx1 - t, steamWin1]], PLINTH + steamHead, PLINTH + bTop, bWall);
  planBox([[bx0, by1 - t], [bx1, by1 - t], [bx1, by1], [bx0, by1]], PLINTH, PLINTH + bTop, bWall);
  planBox([[bx0, by0], [bx0 + t, by0], [bx0 + t, bDoor0], [bx0, bDoor0]], PLINTH, PLINTH + bTop, bWall);
  planBox([[bx0, bDoor1], [bx0 + t, bDoor1], [bx0 + t, by1], [bx0, by1]], PLINTH, PLINTH + bTop, bWall);
  planBox([[bx0, bDoor0], [bx0 + t, bDoor0], [bx0 + t, bDoor1], [bx0, bDoor1]], PLINTH + bDoorHead, PLINTH + bTop, bWall);
  planBox([[partX0, partY0], [partX1, partY0], [partX1, partDoor0], [partX0, partDoor0]], PLINTH, PLINTH + bTop, 0xd7c4a8);
  planBox([[partX0, partDoor1], [partX1, partDoor1], [partX1, partY1], [partX0, partY1]], PLINTH, PLINTH + bTop, 0xd7c4a8);
  planBox([[partX0, partDoor0], [partX1, partDoor0], [partX1, partDoor1], [partX0, partDoor1]], PLINTH + partDoorHead, PLINTH + bTop, 0xd7c4a8);
  addOpeningFrame(bx0, bx0 + t, bDoor0, bDoor1, PLINTH, PLINTH + bDoorHead, false);
  addOpeningFrame(dressWin0, dressWin1, by0, by0 + t, PLINTH + dressSill, PLINTH + dressHead, true);
  addOpeningFrame(bx1 - t, bx1, steamWin0, steamWin1, PLINTH + steamSill, PLINTH + steamHead, true);
  // Двускатная крыша: длинная сторона бани восток–запад, конёк по ней, скаты на север и юг.
  {
    const ov = 0.22;
    const eW = bx0 - ov;
    const eE = bx1 + ov;
    const nS = by0 - ov;
    const nN = by1 + ov;
    const nR = (by0 + by1) / 2;
    const eave = PLINTH + bTop;
    const rise = Math.tan(22 * Math.PI / 180) * (nR - nS);
    const ridge = eave + rise;
    const dz = 0.1;
    const V = (e, n, z) => {
      const [x, zz] = planToWorld(e, n);
      return [x, z, zz];
    };
    const SWo = V(eW, nS, eave);
    const SEo = V(eE, nS, eave);
    const NWo = V(eW, nN, eave);
    const NEo = V(eE, nN, eave);
    const RWo = V(eW, nR, ridge);
    const REo = V(eE, nR, ridge);
    const SWi = V(eW, nS, eave - dz);
    const SEi = V(eE, nS, eave - dz);
    const NWi = V(eW, nN, eave - dz);
    const NEi = V(eE, nN, eave - dz);
    const RWi = V(eW, nR, ridge - dz);
    const REi = V(eE, nR, ridge - dz);
    const tris = [];
    const quad = (a, b, c, d) => {
      tris.push([a, b, c], [a, c, d]);
    };
    quad(SWo, SEo, REo, RWo);
    quad(NWo, RWo, REo, NEo);
    quad(SWi, RWi, REi, SEi);
    quad(NWi, NEi, REi, RWi);
    quad(SWo, SWi, SEi, SEo);
    quad(NWo, NEo, NEi, NWi);
    quad(SWo, RWo, RWi, SWi);
    quad(NWo, NWi, RWi, RWo);
    quad(SEo, SEi, REi, REo);
    quad(NEo, REo, REi, NEi);
    quad(RWo, REo, REi, RWi);
    asRoof(addMesh(geometryFromTriangles(tris), 0x5c4033));
    const gable = (e) => {
      const a = V(e, by0, eave);
      const b = V(e, by1, eave);
      const c = V(e, nR, ridge - dz - 0.02);
      return [[a, b, c], [a, c, b]];
    };
    addMesh(geometryFromTriangles([...gable(bx0 + 0.02), ...gable(bx1 - 0.02)]), bWall);
    const steamE = (partX1 + bx1) / 2;
    const [px, pz] = planToWorld(steamE, nR);
    const pipeH = 0.9;
    const pipeY = ridge + 0.22;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.11, pipeH, 16),
      new THREE.MeshLambertMaterial({ color: 0x3c3530 })
    );
    pipe.position.set(px, pipeY, pz);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    pipe.userData.roof = true;
    bucket.add(pipe);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.05, 16),
      new THREE.MeshLambertMaterial({ color: 0x2a2622 })
    );
    cap.position.set(px, pipeY + pipeH / 2 + 0.01, pz);
    cap.castShadow = true;
    cap.userData.roof = true;
    bucket.add(cap);
  }

  // Мангальная зона 5×3 м, повёрнута на 90° против часовой:
  // длинная сторона на север, мангал на северном крае, дорожка с юга.
  const q0 = 17.655;
  const q1 = 20.655;
  const r0 = 3.45;
  const r1 = 8.45;
  addSlab([[q0, r0], [q1, r0], [q1, r1], [q0, r1]], 0.03, 0.035, 0xe6d3b0, false);
  const kkEave = 2.35;
  const kkPost = 0.1;
  const kkInset = 0.14;
  const postAt = (px, py) => planBox([
    [px - kkPost, py - kkPost], [px + kkPost, py - kkPost],
    [px + kkPost, py + kkPost], [px - kkPost, py + kkPost],
  ], 0, kkEave, 0x6a727a);
  const nMid = (r0 + r1) / 2;
  postAt(q0 + kkInset, r0 + kkInset);
  postAt(q1 - kkInset, r0 + kkInset);
  postAt(q1 - kkInset, r1 - kkInset);
  postAt(q0 + kkInset, r1 - kkInset);
  postAt(q0 + kkInset, nMid);
  postAt(q1 - kkInset, nMid);
  const kkOv = 0.18;
  const eR = (q0 + q1) / 2;
  const kkRise = Math.tan(22 * Math.PI / 180) * (1.5 + kkOv);
  const kkRidge = kkEave + kkRise;
  const beam = (e0, n0, e1, n1, z) => {
    const t = 0.035;
    const eLo = Math.min(e0, e1) - (e0 === e1 ? t : 0);
    const eHi = Math.max(e0, e1) + (e0 === e1 ? t : 0);
    const nLo = Math.min(n0, n1) - (n0 === n1 ? t : 0);
    const nHi = Math.max(n0, n1) + (n0 === n1 ? t : 0);
    return asRoof(planBox(
      [[eLo, nLo], [eHi, nLo], [eHi, nHi], [eLo, nHi]],
      z - t, z + t, 0x6a727a
    ));
  };
  beam(q0, r0, q1, r0, kkEave - 0.04);
  beam(q0, r1, q1, r1, kkEave - 0.04);
  beam(q0, r0, q0, r1, kkEave - 0.04);
  beam(q1, r0, q1, r1, kkEave - 0.04);
  beam(eR, r0, eR, r1, kkRidge - 0.05);
  const gN1 = r1 - 0.4;
  const gN0 = gN1 - 0.45;
  const gE0 = eR - 1.25;
  const gE1 = eR + 1.25;
  const bowl0 = 0.72;
  const bowl1 = 0.9;
  const legAt = (px, py) => planBox([
    [px - 0.04, py - 0.04], [px + 0.04, py - 0.04],
    [px + 0.04, py + 0.04], [px - 0.04, py + 0.04],
  ], 0.065, bowl0, 0x3c3530);
  legAt(gE0, gN1);
  legAt(gE1, gN1);
  legAt(gE1, gN0);
  legAt(gE0, gN0);
  planBox([[gE0, gN0], [gE1, gN0], [gE1, gN1], [gE0, gN1]], bowl0, bowl1, 0x2c2824);
  planBox([
    [gE0 + 0.06, gN0 + 0.06], [gE1 - 0.06, gN0 + 0.06],
    [gE1 - 0.06, gN1 - 0.06], [gE0 + 0.06, gN1 - 0.06],
  ], bowl1 - 0.015, bowl1 + 0.01, 0x6a727a);
  const shelfN1 = gN1 - 0.06;
  const shelfN0 = shelfN1 - 0.30;
  const shelfE0 = gE0 + 0.15;
  const shelfE1 = gE1 - 0.15;
  planBox([
    [shelfE0, shelfN0], [shelfE1, shelfN0], [shelfE1, shelfN1], [shelfE0, shelfN1],
  ], 0.28, 0.33, 0x5c4033);
  const woodLog = (e, n0, n1, r, y, color) => {
    const [x0, z0] = planToWorld(e, n0);
    const [x1, z1] = planToWorld(e, n1);
    const a = new THREE.Vector3(x0, y, z0);
    const b = new THREE.Vector3(x1, y, z1);
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, dir.length(), 8),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bucket.add(mesh);
  };
  const tones = [0xf0d7b4, 0xe4c9a0, 0xd7b48a, 0xf6e2c4, 0xc9a36a];
  const shelfTop = 0.33;
  let tone = 0;
  const lay = (de, dn, len, r, y) => {
    const n = shelfN1 - 0.01 + dn;
    woodLog(shelfE0 + de, n, n - len, r, y, tones[tone % tones.length]);
    tone += 1;
    return { de, r, y };
  };
  const onShelf = (de, dn, len, r) => lay(de, dn, len, r, shelfTop + r - 0.004);
  // Центр полена в ложбине между двумя нижними, чтобы оно на них лежало.
  const inGroove = (a, b, dn, len, r) => {
    const de = (a.de + b.de) / 2;
    const lift = (s) => {
      const dh = de - s.de;
      const reach = s.r + r;
      return s.y + Math.sqrt(Math.max(0, reach * reach - dh * dh));
    };
    return lay(de, dn, len, r, Math.max(lift(a), lift(b)) - 0.004);
  };
  const base0 = onShelf(0.08, 0.00, 0.26, 0.055);
  const base1 = onShelf(0.19, 0.012, 0.23, 0.050);
  const base2 = onShelf(0.30, -0.008, 0.27, 0.052);
  const base3 = onShelf(0.41, 0.015, 0.22, 0.046);
  const base4 = onShelf(0.52, 0.00, 0.24, 0.048);
  onShelf(0.92, 0.02, 0.20, 0.044);
  onShelf(1.28, -0.01, 0.25, 0.050);
  onShelf(1.66, 0.012, 0.18, 0.042);
  onShelf(2.04, 0.00, 0.22, 0.046);
  const mid0 = inGroove(base0, base1, 0.008, 0.20, 0.048);
  const mid1 = inGroove(base1, base2, -0.01, 0.22, 0.050);
  const mid2 = inGroove(base2, base3, 0.012, 0.18, 0.044);
  const mid3 = inGroove(base3, base4, 0.00, 0.20, 0.046);
  inGroove(mid0, mid1, 0.006, 0.16, 0.042);
  inGroove(mid1, mid2, -0.006, 0.17, 0.046);
  inGroove(mid2, mid3, 0.004, 0.15, 0.040);
  const kV = (e, n, z) => {
    const [x, zz] = planToWorld(e, n);
    return [x, z, zz];
  };
  const wS = kV(q0 - kkOv, r0 - kkOv, kkEave);
  const wN = kV(q0 - kkOv, r1 + kkOv, kkEave);
  const eS = kV(q1 + kkOv, r0 - kkOv, kkEave);
  const eN = kV(q1 + kkOv, r1 + kkOv, kkEave);
  const rS = kV(eR, r0 - kkOv, kkRidge);
  const rN = kV(eR, r1 + kkOv, kkRidge);
  asRoof(addMesh(geometryFromTriangles([
    [wS, wN, rN], [wS, rN, rS],
    [eS, rS, rN], [eS, rN, eN],
  ]), 0x5c4033));

  addWallRun(plot[0], [gateX0, fenceY], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun([gateX1, fenceY], [kalX0, fenceY], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun([kalX1, fenceY], plot[1], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[1], plot[2], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[2], plot[3], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[3], plot[0], fenceT, 0, fenceH, 0x7d6a52);

  // Откат на запад, прочь от калитки. Калитка сразу за восточным столбом.
  const gateY = fenceY - 0.35;
  const gateTail = gateX0 - gateTailLen;
  addWallRun([gateTail, gateY], [gateX1, gateY], 0.04, 0.08, 1.46, 0x4e463c);
  addWallRun([gateTail, gateY], [gateX1, gateY], 0.015, 0.02, 0.07, 0x2c2824);
  planBox(
    [[gateX0 - 0.5, fenceY - 0.7], [gateX0 - 0.12, fenceY - 0.7], [gateX0 - 0.12, fenceY - 0.28], [gateX0 - 0.5, fenceY - 0.28]],
    0, 0.38, 0x2a2622
  );
  addWallRun([kalX0 + 0.08, fenceY], [kalX1 - 0.08, fenceY], 0.03, 0.02, 1.48, 0xa68455);

  for (const [px, py] of [
    [gateX0, fenceY], [gateX1, fenceY], [kalX0, fenceY], [kalX1, fenceY],
    plot[0], plot[1], plot[2], plot[3],
  ]) {
    planBox(
      [[px - 0.08, py - 0.08], [px + 0.08, py - 0.08], [px + 0.08, py + 0.08], [px - 0.08, py + 0.08]],
      0, 1.68, 0x4a4036
    );
  }

  addSlab([[28.139, 18.478], [30.34, 18.478], [30.34, 19.877], [28.139, 19.877]], 0.07, 0.05, 0xefe6d4, false);
  for (const [sx, sy] of [[28.653, 19.178], [29.823, 19.178]]) {
    const [e, n] = planToWorld(sx, sy);
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.42, 20),
      new THREE.MeshLambertMaterial({ color: 0xd9cfc0 })
    );
    neck.position.set(e, 0.28, n);
    neck.castShadow = true;
    neck.receiveShadow = true;
    bucket.add(neck);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x6b4f2a })
    );
    lid.position.set(e, 0.5, n);
    lid.castShadow = true;
    bucket.add(lid);
  }
  {
    const [e, n] = planToWorld(wellE, wellN);
    const curb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.56, 0.18, 24),
      new THREE.MeshLambertMaterial({ color: 0xd6ebf7 })
    );
    curb.position.set(e, 0.12, n);
    curb.castShadow = true;
    curb.receiveShadow = true;
    bucket.add(curb);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x1a6fbf })
    );
    cap.position.set(e, 0.22, n);
    cap.castShadow = true;
    bucket.add(cap);
  }

  // Coolray задом в западные ворота гаража, носом на дорогу.
  // Mazda перед гаражом, внутри участка, в полуметре к востоку от Кулрея.
  const coolLen = 4.33;
  const inside = 1.3;
  addParkedModel({
    url: "./models/geely-coolray.glb",
    length: coolLen,
    heading: "north",
    centerE: (d1a + d1b) / 2,
    centerN: gy1 - inside + coolLen / 2,
  });
  const mazdaLen = 4.55;
  const mazdaHalfW = 1.037;
  const coolHalfW = 1.019;
  const mazdaNorth = fenceY - 0.35 - 0.6;
  const mazdaSouth = gy1 + 0.8;
  addParkedModel({
    url: "./models/mazda-cx5.glb",
    length: mazdaLen,
    heading: "north",
    centerE: (d1a + d1b) / 2 + coolHalfW + 0.5 + mazdaHalfW,
    centerN: (mazdaNorth + mazdaSouth) / 2,
  });

  const [cx, cz] = planToWorld(-22, 31);
  const origin = new THREE.Vector3(cx, 1.6, cz);
  const southDir = cadastralNorth.clone().negate();
  const westDir = cadastralEast.clone().negate();
  const rose = new THREE.Group();
  const arm = (dir, len, color) => {
    rose.add(new THREE.ArrowHelper(dir, origin, len, color, len * 0.22, len * 0.1));
  };
  arm(cadastralNorth, 7, 0x16320f);
  arm(cadastralEast, 4.5, 0x6a727a);
  arm(southDir, 4.5, 0x6a727a);
  arm(westDir, 4.5, 0x6a727a);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshLambertMaterial({ color: 0xf4efe8 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(cx, 1.45, cz);
  rose.add(disc);
  const mark = (text, dir, len) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = text === "С" ? "#16320f" : "#3a4148";
    ctx.font = "bold 84px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 68);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      depthTest: true,
      depthWrite: false,
      alphaTest: 0.4,
    }));
    sprite.position.copy(origin).addScaledVector(dir, len + 1.3);
    sprite.position.y = 2.4;
    sprite.scale.set(2.4, 2.4, 1);
    rose.add(sprite);
  };
  mark("С", cadastralNorth, 7);
  mark("В", cadastralEast, 4.5);
  mark("Ю", southDir, 4.5);
  mark("З", westDir, 4.5);
  sharedGroup.add(rose);
}

const WEST_U = [0.181945681134421, -0.9833085828551136];
const WEST_IN = [0.9833085828551136, 0.181945681134421];

function ai(along, inset) {
  return [
    -18 + along * WEST_U[0] + inset * WEST_IN[0],
    22.877 + along * WEST_U[1] + inset * WEST_IN[1],
  ];
}

// Дом повёрнут параллельно северному забору: локальный +X смотрит на юг, вход — на запад.
const WEST_OX = 13.52913028853758;
const WEST_OY = 16.58501426667908;
function westPlan(lx, ly) {
  return [WEST_OX - ly, WEST_OY - lx];
}

function westHouseMatrix() {
  const samples = [[0, 0], [12.71, 0], [0, 17.41]];
  const src = samples.map(([x, y]) => {
    const [e, n] = planToWorld(x, y);
    return new THREE.Vector3(e, 0, n);
  });
  const dst = samples.map(([x, y]) => {
    const [px, py] = westPlan(x, y);
    const [e, n] = planToWorld(px, py);
    return new THREE.Vector3(e, 0, n);
  });
  // Вверх остаётся вверх. Отражение в плане снимает зеркало северной модели.
  const basis = (o, a, b) => {
    const x = a.clone().sub(o);
    x.y = 0;
    x.normalize();
    const zRaw = b.clone().sub(o);
    zRaw.y = 0;
    const y = new THREE.Vector3(0, 1, 0);
    const z = new THREE.Vector3().crossVectors(x, y);
    if (z.dot(zRaw) < 0) z.negate();
    z.normalize();
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const R = basis(dst[0], dst[1], dst[2]).multiply(basis(src[0], src[1], src[2]).invert());
  const t = dst[0].clone().sub(src[0].clone().applyMatrix4(R));
  R.setPosition(t);
  return R;
}

function addSlabHole(outer, holePts, y0, height, color) {
  const shape = shapeFromPlan(outer);
  const hole = shapeFromPlan(holePts);
  const pts = hole.getPoints();
  pts.reverse();
  const path = new THREE.Path();
  pts.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  shape.holes.push(path);
  const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, y0, 0);
  return addMesh(geom, color, false);
}

const gltfLoader = new GLTFLoader();

// Модель из glb: длина вдоль Z, вверх Y. Нос на запад или на север, длина заводская.
// Верх плитки 0.065. У Coolray шина доходит до низа модели, у Mazda видимое колесо выше.
const PAVER_TOP = 0.065;

function addParkedModel({ url, length, centerE, centerN, heading = "west" }) {
  const ground = PAVER_TOP - (url.includes("mazda") ? 0.16 : 0.02);
  const parent = bucket;
  const holder = new THREE.Group();
  const forward = heading === "north"
    ? new THREE.Vector3(Math.sin(AZ_Y), 0, Math.cos(AZ_Y))
    : new THREE.Vector3(Math.sin(AZ_X), 0, Math.cos(AZ_X));
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(forward, up).normalize();
  holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, side));
  const [wx, wz] = planToWorld(centerE, centerN);
  holder.position.set(wx, 0, wz);
  parent.add(holder);
  gltfLoader.load(url, (gltf) => {
    const model = gltf.scene;
    model.rotation.y = Math.PI / 2;
    const fit = new THREE.Group();
    fit.add(model);
    fit.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(fit).getSize(new THREE.Vector3());
    fit.scale.setScalar(length / size.x);
    fit.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fit);
    const center = box.getCenter(new THREE.Vector3());
    fit.position.set(-center.x, ground - box.min.y, -center.z);
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.side = THREE.DoubleSide;
        const paint = mat.name || "";
        const chrome = paint.includes("chrome") || paint.includes("Material_04");
        if (chrome) {
          mat.color.set(0xe6e8ec);
          mat.map = null;
          mat.metalness = 0.72;
          mat.roughness = 0.16;
          if (mat.specular) mat.specular.set(0xffffff);
        }
        // Кузов CX-5 был почти чёрной текстурой, капот и бампер — отдельным материалом.
        if (url.includes("mazda") && (paint.includes("Material_01") || paint.includes("Material_03"))) {
          mat.color.set(0x6a7078);
          mat.map = null;
          mat.metalness = 0.22;
          mat.roughness = 0.4;
        }
        // Решётка пришла оранжевой текстурой; значок — отдельный хром поверх неё.
        if (url.includes("mazda") && paint.includes("Material_11")) {
          mat.color.set(0x24262a);
          mat.map = null;
          mat.metalness = 0.45;
          mat.roughness = 0.38;
        }
        if (url.includes("coolray") && paint.includes("carpaint") && !paint.includes("second")) {
          mat.color.set(0x6e675e);
          mat.metalness = 0.18;
          mat.roughness = 0.46;
        }
      }
    });
    holder.add(fit);
  });
}

function addWestVariant() {
  bucket = westGroup;
  const houseWest = houseRig.clone();
  houseWest.matrixAutoUpdate = false;
  houseWest.matrix.copy(westHouseMatrix());
  houseWest.matrixWorldNeedsUpdate = true;
  westGroup.add(houseWest);

  const houseHole = [
    [0, 0], [12.71, 0], [12.71, 14.59], [8.62, 14.59],
    [8.62, 18.88], [4.84, 18.88], [4.84, 17.41], [0, 17.41],
  ].map(([x, y]) => westPlan(x, y));
  const blind = [
    [14.529, 17.585], [14.529, 2.875], [-2.061, 2.875], [-2.061, 6.965],
    [-6.351, 6.965], [-6.351, 12.745], [-4.881, 12.745], [-4.881, 17.585],
  ];
  addSlabHole(blind, houseHole, 0.06, 0.02, 0xd4cfc4);

  // Баня восточнее дома. С севера на юг: предбанник, пар, хозблок.
  // Дорожка с середины правого края террасы прямо на восток, к двери предбанника.
  const bE0 = WEST_OX + 14;
  const bE1 = bE0 + 4;
  const doorC = WEST_OY - 10.905;
  const bN1 = doorC + 1.5;
  const bN0 = bN1 - 8;
  const predS = bN1 - 3;
  const parS = predS - 2.5;
  addSlabHole(
    [[bE0 - 1, bN0 - 1], [bE1 + 1, bN0 - 1], [bE1 + 1, bN1 + 1], [bE0 - 1, bN1 + 1]],
    [[bE0, bN0], [bE1, bN0], [bE1, bN1], [bE0, bN1]],
    0.06, 0.02, 0xd4cfc4
  );

  const fenceNorth = (north) => {
    const t = (north + 4.345) / (22.877 + 4.345);
    return [-12.963 + t * (-18 + 12.963), north];
  };
  const wallN = westPlan(0, 17.41);
  const wallS = westPlan(4.84, 17.41);
  const gateN = fenceNorth(wallN[1]);
  const gateS = fenceNorth(wallS[1]);
  const fenceAlong = 27.683 / 27.222;
  const kalN = fenceNorth(wallS[1] - 0.9 / fenceAlong);
  const kalS = fenceNorth(wallS[1] - (0.9 + 1.05) / fenceAlong);
  const courtS = fenceNorth(westPlan(12.71, 14.59)[1]);
  addSlab([
    [gateN[0] - 5 * WEST_IN[0], gateN[1] - 5 * WEST_IN[1]],
    [kalS[0] - 5 * WEST_IN[0], kalS[1] - 5 * WEST_IN[1]],
    kalS, gateN,
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([
    gateN, courtS,
    westPlan(12.71, 14.59), westPlan(8.62, 14.59), westPlan(8.62, 18.88),
    westPlan(4.84, 18.88), westPlan(4.84, 17.41), westPlan(0, 17.41),
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([
    [WEST_OX, doorC - 1], [WEST_OX, doorC + 1],
    [bE0, doorC + 1], [bE0, doorC - 1],
  ], 0.03, 0.035, 0xe6d3b0, false);
  const wellE = 3.85;
  const wellN = westPlan(12.71, 0)[1] - 6;
  addSlab([[wellE - 0.5, wellN + 5], [wellE + 0.5, wellN + 5], [wellE + 0.5, wellN + 1], [wellE - 0.5, wellN + 1]], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([[wellE - 1, wellN - 1], [wellE + 1, wellN - 1], [wellE + 1, wellN + 1], [wellE - 1, wellN + 1]], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([[27.24, 17.68], [31.24, 17.68], [31.24, 20.88], [27.24, 20.88]], 0.03, 0.035, 0xe6d3b0, false);

  const t = 0.18;
  const top = PLINTH + 2.45;
  const doorHead = PLINTH + 2.05;
  const wall = 0xf4efe8;
  const part = 0xd7c4a8;
  const box = (e0, e1, n0, n1, z0, z1, color) => {
    planBox([[e0, n0], [e1, n0], [e1, n1], [e0, n1]], z0, z1, color);
  };
  box(bE0 - 0.08, bE1 + 0.08, bN0 - 0.08, bN1 + 0.08, 0, PLINTH, plinthColor);
  const predA = doorC - 0.45;
  const predB = doorC + 0.45;
  const hozC = (bN0 + parS) / 2;
  const hozA = hozC - 0.45;
  const hozB = hozC + 0.45;
  const westIn = bE0 + t;
  box(bE0, westIn, bN0 + t, hozA, PLINTH, top, wall);
  box(bE0, westIn, hozB, predA, PLINTH, top, wall);
  box(bE0, westIn, predB, bN1 - t, PLINTH, top, wall);
  box(bE0, westIn, predA, predB, doorHead, top, wall);
  box(bE0, westIn, hozA, hozB, doorHead, top, wall);
  const east = bE1 - t;
  const predWa = doorC - 0.6;
  const predWb = doorC + 0.6;
  const parC = (parS + predS) / 2;
  const parWa = parC - 0.8;
  const parWb = parC + 0.8;
  box(east, bE1, predWb, bN1 - t, PLINTH, top, wall);
  box(east, bE1, parWb, predWa, PLINTH, top, wall);
  box(east, bE1, bN0 + t, parWa, PLINTH, top, wall);
  box(east, bE1, predWa, predWb, PLINTH, PLINTH + 0.9, wall);
  box(east, bE1, predWa, predWb, PLINTH + 1.85, top, wall);
  box(east, bE1, parWa, parWb, PLINTH, PLINTH + 1.25, wall);
  box(east, bE1, parWa, parWb, PLINTH + 1.85, top, wall);
  box(bE0, bE1, bN1 - t, bN1, PLINTH, top, wall);
  box(bE0, bE1, bN0, bN0 + t, PLINTH, top, wall);
  const innerE = bE1 - t;
  const gap0 = westIn + 0.09;
  const gap1 = gap0 + 0.8;
  box(westIn, gap0, predS - 0.06, predS + 0.06, PLINTH, top, part);
  box(gap1, innerE, predS - 0.06, predS + 0.06, PLINTH, top, part);
  box(gap0, gap1, predS - 0.06, predS + 0.06, PLINTH + 2.0, top, part);
  box(westIn, innerE, parS - 0.06, parS + 0.06, PLINTH, top, part);
  const frame = (e0, e1, n0, n1, z0, z1, withSill) => {
    const fw = 0.07;
    const alongN = n1 - n0 >= e1 - e0;
    if (alongN) {
      box(e0, e1, n0, n0 + fw, z0, z1, FRAME);
      box(e0, e1, n1 - fw, n1, z0, z1, FRAME);
      box(e0, e1, n0, n1, z1 - fw, z1, FRAME);
      if (withSill) box(e0, e1, n0, n1, z0, z0 + fw, FRAME);
    } else {
      box(e0, e0 + fw, n0, n1, z0, z1, FRAME);
      box(e1 - fw, e1, n0, n1, z0, z1, FRAME);
      box(e0, e1, n0, n1, z1 - fw, z1, FRAME);
      if (withSill) box(e0, e1, n0, n1, z0, z0 + fw, FRAME);
    }
  };
  frame(bE0, westIn, predA, predB, PLINTH, doorHead, false);
  frame(bE0, westIn, hozA, hozB, PLINTH, doorHead, false);
  frame(gap0, gap1, predS - 0.06, predS + 0.06, PLINTH, PLINTH + 2.0, false);
  frame(east, bE1, predWa, predWb, PLINTH + 0.9, PLINTH + 1.85, true);
  frame(east, bE1, parWa, parWb, PLINTH + 1.25, PLINTH + 1.85, true);
  // Двускатная крыша: конёк вдоль бани, скаты на восток и запад. Труба из парной.
  {
    const ov = 0.22;
    const eW = bE0 - ov;
    const eE = bE1 + ov;
    const nS = bN0 - ov;
    const nN = bN1 + ov;
    const eR = (bE0 + bE1) / 2;
    const eave = top;
    const rise = Math.tan(22 * Math.PI / 180) * (eR - eW);
    const ridge = eave + rise;
    const dz = 0.1;
    const V = (e, n, z) => {
      const [x, zz] = planToWorld(e, n);
      return [x, z, zz];
    };
    const WSo = V(eW, nS, eave);
    const WNo = V(eW, nN, eave);
    const ESo = V(eE, nS, eave);
    const ENo = V(eE, nN, eave);
    const RSo = V(eR, nS, ridge);
    const RNo = V(eR, nN, ridge);
    const WSi = V(eW, nS, eave - dz);
    const WNi = V(eW, nN, eave - dz);
    const ESi = V(eE, nS, eave - dz);
    const ENi = V(eE, nN, eave - dz);
    const RSi = V(eR, nS, ridge - dz);
    const RNi = V(eR, nN, ridge - dz);
    const tris = [];
    const quad = (a, b, c, d) => {
      tris.push([a, b, c], [a, c, d]);
    };
    quad(WSo, WNo, RNo, RSo);
    quad(ESo, RSo, RNo, ENo);
    quad(WSi, RSi, RNi, WNi);
    quad(ESi, ENi, RNi, RSi);
    quad(WSo, WSi, WNi, WNo);
    quad(ESo, ENo, ENi, ESi);
    quad(WSo, RSo, RSi, WSi);
    quad(ESo, ESi, RSi, RSo);
    quad(WNo, WNi, RNi, RNo);
    quad(ENo, RNo, RNi, ENi);
    quad(RSo, RNo, RNi, RSi);
    asRoof(addMesh(geometryFromTriangles(tris), 0x5c4033));
    const gable = (n) => {
      const a = V(bE0, n, eave);
      const b = V(bE1, n, eave);
      const c = V(eR, n, ridge - dz - 0.02);
      return [[a, b, c], [a, c, b]];
    };
    addMesh(geometryFromTriangles([...gable(bN0 + 0.02), ...gable(bN1 - 0.02)]), wall);
    const parMid = (parS + predS) / 2;
    const [px, pz] = planToWorld(eR, parMid);
    const pipeH = 0.9;
    const pipeY = ridge + 0.22;
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.11, pipeH, 16),
      new THREE.MeshLambertMaterial({ color: 0x3c3530 })
    );
    pipe.position.set(px, pipeY, pz);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    pipe.userData.roof = true;
    bucket.add(pipe);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.05, 16),
      new THREE.MeshLambertMaterial({ color: 0x2a2622 })
    );
    cap.position.set(px, pipeY + pipeH / 2 + 0.01, pz);
    cap.castShadow = true;
    cap.userData.roof = true;
    bucket.add(cap);
  }

  // Навес на две машины, в метре от стены, расширен на север — влево от въезда.
  // Конёк поперёк стены: скаты на север и юг, снег не идёт на дом.
  const nS = wallN[1] - 3.8;
  const nN = nS + 6.5;
  const eNear = wallN[0] - 1;
  const eFar = eNear - 6;
  const paveN = nN + 1;
  const fenceLo = fenceNorth(wallN[1]);
  const fenceHi = fenceNorth(paveN);
  addSlab([
    fenceLo,
    fenceHi,
    [wallN[0], paveN],
    [wallN[0], wallN[1]],
  ], 0.03, 0.035, 0xe6d3b0, false);
  const ov = 0.4;
  const eave = 2.5;
  const nR = (nS + nN) / 2;
  const nSouth = nS - ov;
  const nNorth = nN + ov;
  const eW = eFar - ov;
  const eE = eNear + ov;
  const rise = Math.tan(22 * Math.PI / 180) * (nR - nSouth);
  const ridge = eave + rise;
  const dz = 0.08;
  const steel = 0x6a727a;
  const post = 0.12;
  const eMid = (eFar + eNear) / 2;
  for (const [pe, pn] of [[eFar, nS], [eFar, nN], [eNear, nS], [eNear, nN], [eMid, nS], [eMid, nN]]) {
    planBox(
      [[pe - post / 2, pn - post / 2], [pe + post / 2, pn - post / 2], [pe + post / 2, pn + post / 2], [pe - post / 2, pn + post / 2]],
      0, eave, steel
    );
  }
  const tube = 0.07;
  const steelTube = (e0, n0, z0, e1, n1, z1) => {
    const [x0, zz0] = planToWorld(e0, n0);
    const [x1, zz1] = planToWorld(e1, n1);
    const a = new THREE.Vector3(x0, z0, zz0);
    const b = new THREE.Vector3(x1, z1, zz1);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(tube, tube, len),
      new THREE.MeshLambertMaterial({ color: steel })
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bucket.add(mesh);
    return mesh;
  };
  const under = 0.05;
  asRoof(steelTube(eFar, nS, eave - tube, eNear, nS, eave - tube));
  asRoof(steelTube(eFar, nN, eave - tube, eNear, nN, eave - tube));
  asRoof(steelTube(eFar, nR, ridge - under, eNear, nR, ridge - under));
  const V = (e, n, z) => {
    const [x, zz] = planToWorld(e, n);
    return [x, z, zz];
  };
  const SWo = V(eW, nSouth, eave);
  const SEo = V(eE, nSouth, eave);
  const NWo = V(eW, nNorth, eave);
  const NEo = V(eE, nNorth, eave);
  const RWo = V(eW, nR, ridge);
  const REo = V(eE, nR, ridge);
  const SWi = V(eW, nSouth, eave - dz);
  const SEi = V(eE, nSouth, eave - dz);
  const NWi = V(eW, nNorth, eave - dz);
  const NEi = V(eE, nNorth, eave - dz);
  const RWi = V(eW, nR, ridge - dz);
  const REi = V(eE, nR, ridge - dz);
  const tris = [];
  const quad = (a, b, c, d) => {
    tris.push([a, b, c], [a, c, d]);
  };
  quad(SWo, SEo, REo, RWo);
  quad(NWo, RWo, REo, NEo);
  quad(SWi, RWi, REi, SEi);
  quad(NWi, NEi, REi, RWi);
  quad(SWo, SWi, SEi, SEo);
  quad(NWo, NEo, NEi, NWi);
  quad(SWo, RWo, RWi, SWi);
  quad(NWo, NWi, RWi, RWo);
  quad(SEo, SEi, REi, REo);
  quad(NEo, REo, REi, NEi);
  quad(RWo, REo, REi, RWi);
  asRoof(addMesh(geometryFromTriangles(tris), 0x3a4148));
  const gable = (e) => {
    const a = V(e, nS, eave);
    const b = V(e, nN, eave);
    const c = V(e, nR, ridge - dz - 0.02);
    return [[a, b, c], [a, c, b]];
  };
  asRoof(addMesh(geometryFromTriangles([...gable(eFar + 0.02), ...gable(eNear - 0.02)]), 0xf4efe8));
  const carE = (eNear + eFar) / 2;
  const stall = (nN - nS) / 2;
  addParkedModel({
    url: "./models/geely-coolray.glb",
    length: 4.33,
    centerE: carE,
    centerN: nS + stall / 2,
  });
  addParkedModel({
    url: "./models/mazda-cx5.glb",
    length: 4.55,
    centerE: carE,
    centerN: nN - stall / 2,
  });

  // Мангальная зона 5×3 м, длинная сторона параллельна южному забору,
  // южный край в 1,5 м от него. Мангал 2,5 м на западном крае.
  const terrE = WEST_OX - 1.745;
  const terrN = WEST_OY - 12.71;
  const fenceD = [-12.963, -4.345];
  const fenceC = [39.044, -10.647];
  const fdx = fenceC[0] - fenceD[0];
  const fdy = fenceC[1] - fenceD[1];
  const flen = Math.hypot(fdx, fdy);
  const along = [fdx / flen, fdy / flen];
  const inward = [-fdy / flen, fdx / flen];
  const shift = (p, dir, s) => [p[0] + dir[0] * s, p[1] + dir[1] * s];
  const fenceE = terrE - 4.5 * inward[0];
  const fenceN = fenceD[1] + ((fenceE - fenceD[0]) / fdx) * fdy;
  const southMid = shift([fenceE, fenceN], inward, 1.5);
  const kkSW = shift(southMid, along, -2.5);
  const kkSE = shift(southMid, along, 2.5);
  const kkNW = shift(kkSW, inward, 3);
  const kkNE = shift(kkSE, inward, 3);
  const edgeAtE = (a, b, e) => {
    const t = (e - a[0]) / (b[0] - a[0]);
    return [e, a[1] + t * (b[1] - a[1])];
  };
  const pathL = edgeAtE(kkNW, kkNE, terrE - 0.5);
  const pathR = edgeAtE(kkNW, kkNE, terrE + 0.5);
  addSlab([
    pathL, pathR, [terrE + 0.5, terrN], [terrE - 0.5, terrN],
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([kkSW, kkSE, kkNE, kkNW], 0.03, 0.035, 0xe6d3b0, false);
  const kkEave = 2.35;
  const kkPost = 0.1;
  const kkInset = 0.14;
  const postAt = (p) => planBox([
    shift(shift(p, along, -kkPost), inward, -kkPost),
    shift(shift(p, along, kkPost), inward, -kkPost),
    shift(shift(p, along, kkPost), inward, kkPost),
    shift(shift(p, along, -kkPost), inward, kkPost),
  ], 0, kkEave, 0x6a727a);
  postAt(shift(shift(kkSW, along, kkInset), inward, kkInset));
  postAt(shift(shift(kkSE, along, -kkInset), inward, kkInset));
  postAt(shift(shift(kkNW, along, kkInset), inward, -kkInset));
  postAt(shift(shift(kkNE, along, -kkInset), inward, -kkInset));
  postAt(shift(southMid, inward, kkInset));
  postAt(shift(shift(southMid, inward, 3), inward, -kkInset));
  const kkOv = 0.18;
  const kkRise = Math.tan(22 * Math.PI / 180) * (1.5 + kkOv);
  const kkRidge = kkEave + kkRise;
  const kkWest = [(kkSW[0] + kkNW[0]) / 2, (kkSW[1] + kkNW[1]) / 2];
  const kkEast = [(kkSE[0] + kkNE[0]) / 2, (kkSE[1] + kkNE[1]) / 2];
  asRoof(steelTube(kkSW[0], kkSW[1], kkEave - 0.04, kkSE[0], kkSE[1], kkEave - 0.04));
  asRoof(steelTube(kkNW[0], kkNW[1], kkEave - 0.04, kkNE[0], kkNE[1], kkEave - 0.04));
  asRoof(steelTube(kkSW[0], kkSW[1], kkEave - 0.04, kkNW[0], kkNW[1], kkEave - 0.04));
  asRoof(steelTube(kkSE[0], kkSE[1], kkEave - 0.04, kkNE[0], kkNE[1], kkEave - 0.04));
  asRoof(steelTube(kkWest[0], kkWest[1], kkRidge - 0.05, kkEast[0], kkEast[1], kkRidge - 0.05));
  const grill0 = shift(shift(kkWest, along, 0.4), inward, -1.25);
  const grill1 = shift(shift(kkWest, along, 0.4), inward, 1.25);
  const grill2 = shift(grill1, along, 0.45);
  const grill3 = shift(grill0, along, 0.45);
  const bowl0 = 0.72;
  const bowl1 = 0.9;
  const legAt = (p) => planBox([
    shift(shift(p, along, -0.04), inward, -0.04),
    shift(shift(p, along, 0.04), inward, -0.04),
    shift(shift(p, along, 0.04), inward, 0.04),
    shift(shift(p, along, -0.04), inward, 0.04),
  ], 0.065, bowl0, 0x3c3530);
  legAt(grill0);
  legAt(grill1);
  legAt(grill2);
  legAt(grill3);
  planBox([grill0, grill1, grill2, grill3], bowl0, bowl1, 0x2c2824);
  planBox([
    shift(shift(grill0, inward, 0.06), along, 0.06),
    shift(shift(grill1, inward, -0.06), along, 0.06),
    shift(shift(grill2, inward, -0.06), along, -0.06),
    shift(shift(grill3, inward, 0.06), along, -0.06),
  ], bowl1 - 0.015, bowl1 + 0.01, 0x6a727a);
  const shelf0 = shift(shift(grill0, inward, 0.15), along, 0.06);
  const shelf1 = shift(shift(grill1, inward, -0.15), along, 0.06);
  const shelf2 = shift(shelf1, along, 0.30);
  const shelf3 = shift(shelf0, along, 0.30);
  planBox([shelf0, shelf1, shelf2, shelf3], 0.28, 0.33, 0x5c4033);
  const woodLog = (p0, p1, r, y, color) => {
    const [x0, zz0] = planToWorld(p0[0], p0[1]);
    const [x1, zz1] = planToWorld(p1[0], p1[1]);
    const a = new THREE.Vector3(x0, y, zz0);
    const b = new THREE.Vector3(x1, y, zz1);
    const dir = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, dir.length(), 8),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bucket.add(mesh);
  };
  const tones = [0x6b4428, 0x8a5a32, 0x5a3820, 0x7a5230];
  for (let i = 0; i < 7; i++) {
    const p = shift(shelf0, inward, 0.12 + i * 0.30);
    woodLog(p, shift(p, along, 0.28), 0.05, 0.38, tones[i % tones.length]);
  }
  for (let i = 0; i < 6; i++) {
    const p = shift(shift(shelf0, inward, 0.27 + i * 0.30), along, 0.02);
    woodLog(p, shift(p, along, 0.26), 0.045, 0.47, tones[(i + 2) % tones.length]);
  }
  const kV = (p, z) => {
    const [x, zz] = planToWorld(p[0], p[1]);
    return [x, z, zz];
  };
  const sW = shift(shift(kkSW, along, -kkOv), inward, -kkOv);
  const sE = shift(shift(kkSE, along, kkOv), inward, -kkOv);
  const nW = shift(shift(kkNW, along, -kkOv), inward, kkOv);
  const nE = shift(shift(kkNE, along, kkOv), inward, kkOv);
  const rW = shift(kkWest, along, -kkOv);
  const rE = shift(kkEast, along, kkOv);
  const kSWo = kV(sW, kkEave);
  const kSEo = kV(sE, kkEave);
  const kNWo = kV(nW, kkEave);
  const kNEo = kV(nE, kkEave);
  const kRWo = kV(rW, kkRidge);
  const kREo = kV(rE, kkRidge);
  asRoof(addMesh(geometryFromTriangles([
    [kSWo, kSEo, kREo], [kSWo, kREo, kRWo],
    [kNWo, kRWo, kREo], [kNWo, kREo, kNEo],
  ]), 0x5c4033));

  const plot = [[-18, 22.877], [32.835, 22.877], [39.044, -10.647], [-12.963, -4.345]];
  const fenceH = 1.5;
  const fenceT = 0.06;
  const g0 = gateN;
  const g1 = gateS;
  const leaf0 = [gateN[0] + 0.22 * WEST_IN[0], gateN[1] + 0.22 * WEST_IN[1]];
  const leaf1 = [gateS[0] + 0.22 * WEST_IN[0], gateS[1] + 0.22 * WEST_IN[1]];
  addWallRun(plot[0], plot[1], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[1], plot[2], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[2], plot[3], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[3], kalS, fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(kalN, g1, fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(g0, plot[0], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(leaf0, leaf1, 0.04, 0.08, 1.46, 0x4e463c);
  addWallRun(leaf0, leaf1, 0.015, 0.02, 0.07, 0x2c2824);
  addWallRun(
    [kalN[0] + 0.06 * WEST_IN[0], kalN[1] + 0.06 * WEST_IN[1]],
    [kalS[0] + 0.06 * WEST_IN[0], kalS[1] + 0.06 * WEST_IN[1]],
    0.025, 0.02, 1.48, 0xa68455
  );
  planBox([
    [gateN[0] + 0.15, gateN[1] + 0.35],
    [gateN[0] + 0.55, gateN[1] + 0.35],
    [gateN[0] + 0.55, gateN[1] + 0.75],
    [gateN[0] + 0.15, gateN[1] + 0.75],
  ], 0, 0.38, 0x2a2622);
  for (const p of [plot[0], plot[1], plot[2], plot[3], g0, g1, kalN, kalS]) {
    planBox(
      [[p[0] - 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] - 0.08], [p[0] + 0.08, p[1] + 0.08], [p[0] - 0.08, p[1] + 0.08]],
      0, 1.68, 0x4a4036
    );
  }

  addSlab([[28.139, 18.478], [30.34, 18.478], [30.34, 19.877], [28.139, 19.877]], 0.07, 0.05, 0xefe6d4, false);
  for (const [sx, sy] of [[28.653, 19.178], [29.823, 19.178]]) {
    const [e, n] = planToWorld(sx, sy);
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.42, 20),
      new THREE.MeshLambertMaterial({ color: 0xd9cfc0 })
    );
    neck.position.set(e, 0.28, n);
    neck.castShadow = true;
    neck.receiveShadow = true;
    bucket.add(neck);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x6b4f2a })
    );
    lid.position.set(e, 0.5, n);
    lid.castShadow = true;
    bucket.add(lid);
  }
  {
    const [wx, wy] = [wellE, wellN];
    const [e, n] = planToWorld(wx, wy);
    const curb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.56, 0.18, 24),
      new THREE.MeshLambertMaterial({ color: 0xd6ebf7 })
    );
    curb.position.set(e, 0.12, n);
    curb.castShadow = true;
    curb.receiveShadow = true;
    bucket.add(curb);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x1a6fbf })
    );
    cap.position.set(e, 0.22, n);
    cap.castShadow = true;
    bucket.add(cap);
  }
}

// Полукруглый парник из поликарбоната, 2 м в высоту, вдоль северного забора у септика.
function addGreenhouse() {
  const fenceY = 22.877;
  const radius = 2;
  const length = 6;
  const e1 = 27.24 - 0.55;
  const e0 = e1 - length;
  const nNorth = fenceY - 1.1;
  const nSouth = nNorth - radius * 2;
  const nC = (nSouth + nNorth) / 2;
  const foundH = 0.2;
  planBox(
    [[e0 - 0.1, nSouth - 0.1], [e1 + 0.1, nSouth - 0.1], [e1 + 0.1, nNorth + 0.1], [e0 - 0.1, nNorth + 0.1]],
    0, foundH, 0xc5c0b6, false
  );
  const V = (e, n, z) => {
    const [x, zz] = planToWorld(e, n);
    return [x, z, zz];
  };
  const segs = 18;
  const arch = (e, r) => {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (Math.PI * i) / segs;
      pts.push(V(e, nC - r * Math.cos(a), foundH + r * Math.sin(a)));
    }
    return pts;
  };
  const skinTris = [];
  const west = arch(e0, radius);
  const east = arch(e1, radius);
  for (let i = 0; i < segs; i++) {
    skinTris.push([west[i], east[i], east[i + 1]], [west[i], east[i + 1], west[i + 1]]);
  }
  const cap = (pts) => {
    const base = V(pts === west ? e0 : e1, nC, foundH);
    for (let i = 0; i < segs; i++) skinTris.push([base, pts[i], pts[i + 1]], [base, pts[i + 1], pts[i]]);
  };
  cap(west);
  cap(east);
  const skin = addMesh(geometryFromTriangles(skinTris), 0xd7eee8);
  skin.material.transparent = true;
  skin.material.opacity = 0.42;
  skin.material.depthWrite = false;
  const ribTris = [];
  const rib = (e) => {
    const inner = arch(e, radius);
    const outer = arch(e, radius + 0.035);
    for (let i = 0; i < segs; i++) {
      ribTris.push([inner[i], outer[i], outer[i + 1]], [inner[i], outer[i + 1], inner[i + 1]]);
    }
  };
  for (let e = e0; e <= e1 + 0.01; e += 1) rib(Math.min(e, e1));
  addMesh(geometryFromTriangles(ribTris), 0xb7bcc4);
  const doorN0 = nC - 0.45;
  const doorN1 = nC + 0.45;
  const doorTop = foundH + 1.7;
  planBox([[e0 - 0.04, doorN0 - 0.04], [e0 + 0.02, doorN0 - 0.04], [e0 + 0.02, doorN0], [e0 - 0.04, doorN0]], foundH, doorTop, 0xb7bcc4);
  planBox([[e0 - 0.04, doorN1], [e0 + 0.02, doorN1], [e0 + 0.02, doorN1 + 0.04], [e0 - 0.04, doorN1 + 0.04]], foundH, doorTop, 0xb7bcc4);
  planBox([[e0 - 0.04, doorN0], [e0 + 0.02, doorN0], [e0 + 0.02, doorN1], [e0 - 0.04, doorN1]], doorTop, doorTop + 0.05, 0xb7bcc4);
}

addSite();
addWestVariant();
bucket = sharedGroup;
addGreenhouse();

function showRoofs(on) {
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.roof) obj.visible = on;
  });
}

const VIEW_KEY = "house-light-view";
let viewVariant = "north";
let pendingVariant = null;

function saveView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({
      px: camera.position.x,
      py: camera.position.y,
      pz: camera.position.z,
      tx: controls.target.x,
      ty: controls.target.y,
      tz: controls.target.z,
      roof: roofToggle.checked,
      variant: viewVariant,
    }));
  } catch {
    // браузер может запретить localStorage
  }
}

function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (!saved) return;
    const nums = [saved.px, saved.py, saved.pz, saved.tx, saved.ty, saved.tz];
    if (nums.every((n) => Number.isFinite(n))) {
      camera.position.set(saved.px, saved.py, saved.pz);
      controls.target.set(saved.tx, saved.ty, saved.tz);
      controls.update();
    }
    if (typeof saved.roof === "boolean") {
      roofToggle.checked = saved.roof;
      showRoofs(saved.roof);
    }
    if (saved.variant === "north" || saved.variant === "west") pendingVariant = saved.variant;
  } catch {
    // битая запись не мешает обычному виду
  }
}

loadView();

let saveTimer = 0;
controls.addEventListener("change", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveView, 200);
});

roofToggle.addEventListener("change", () => {
  showRoofs(roofToggle.checked);
  saveView();
});

const blurb = document.getElementById("blurb");
const varNorth = document.getElementById("var-north");
const varWest = document.getElementById("var-west");

function showVariant(name) {
  viewVariant = name === "west" ? "west" : "north";
  northGroup.visible = viewVariant === "north";
  westGroup.visible = viewVariant === "west";
  varNorth.classList.toggle("active", viewVariant === "north");
  varWest.classList.toggle("active", viewVariant === "west");
  blurb.textContent = viewVariant === "north"
    ? "Вход с северной дороги. Дом, гараж, баня, барбекю и забор 1,5 м. Время минское."
    : "Вход с западной дороги. Навес на две машины, баня глубже, от террасы летняя кухня. Время минское.";
  const hash = viewVariant === "west" ? "#west" : "#north";
  if (location.hash !== hash) history.replaceState(null, "", hash);
  saveView();
}

varNorth.addEventListener("click", () => showVariant("north"));
varWest.addEventListener("click", () => showVariant("west"));
showVariant(pendingVariant || (location.hash === "#west" ? "west" : "north"));
dateInput.addEventListener("input", () => applySun(geo));
timeInput.addEventListener("input", () => applySun(geo));
panel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.date) dateInput.value = button.dataset.date;
  if (button.dataset.min) timeInput.value = button.dataset.min;
  applySun(geo);
});

function setView(kind) {
  if (kind === "top") camera.position.set(-2, 96, -5.7);
  else camera.position.set(24, 36, -52);
  controls.target.set(-2, 0.4, -6);
  controls.update();
}
document.getElementById("view-side").addEventListener("click", () => setView("side"));
document.getElementById("view-top").addEventListener("click", () => setView("top"));

applySun(geo);

function frame() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
