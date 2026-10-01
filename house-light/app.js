import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import geo from "./geometry.js?v=21";
import { FURNITURE_LINES } from "./furniture-sketch.js?v=1";

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
const variant2Group = new THREE.Group();
const variantBGroup = new THREE.Group();
const variantCGroup = new THREE.Group();
const greenhouseGroup = new THREE.Group();
const houseRig = new THREE.Group();
let v2House = null;
scene.add(sharedGroup, variant2Group, variantBGroup, variantCGroup);
variant2Group.visible = true;
variantBGroup.visible = false;
variantCGroup.visible = false;
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

function addBeam(a, b, size, color, cast = true) {
  const ax = new THREE.Vector3(a[0], a[1], a[2]);
  const bx = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = bx.clone().sub(ax);
  if (dir.lengthSq() < 1e-8) return null;
  dir.normalize();
  const helper = Math.abs(dir.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const n1 = new THREE.Vector3().crossVectors(dir, helper).normalize();
  const n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
  const h = size / 2;
  const corner = (p, s1, s2) => [
    p.x + (n1.x * s1 + n2.x * s2) * h,
    p.y + (n1.y * s1 + n2.y * s2) * h,
    p.z + (n1.z * s1 + n2.z * s2) * h,
  ];
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const A = signs.map(([s1, s2]) => corner(ax, s1, s2));
  const B = signs.map(([s1, s2]) => corner(bx, s1, s2));
  const tris = [];
  const q = (p, r, s, t) => tris.push([p, r, s], [p, s, t]);
  q(A[0], A[1], A[2], A[3]);
  q(B[0], B[2], B[1], B[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    q(A[i], B[i], B[j], A[j]);
  }
  return addMesh(geometryFromTriangles(tris), color, cast);
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

function addFloorNotes(rooms) {
  const markTris = [];
  const dash = 0.16;
  const dashGap = 0.1;
  const halfW = 0.012;
  for (const [, x0, y0, x1, y1, floorY] of rooms) {
    const inset = 0.04;
    const edges = [
      [x0 + inset, y0 + inset, x1 - inset, y0 + inset],
      [x1 - inset, y0 + inset, x1 - inset, y1 - inset],
      [x1 - inset, y1 - inset, x0 + inset, y1 - inset],
      [x0 + inset, y1 - inset, x0 + inset, y0 + inset],
    ];
    const y = floorY + 0.006;
    for (const [eu0, ev0, eu1, ev1] of edges) {
      const len = Math.hypot(eu1 - eu0, ev1 - ev0);
      if (len < 0.2) continue;
      const dx = (eu1 - eu0) / len;
      const dy = (ev1 - ev0) / len;
      for (let s = 0.03; s + 0.06 < len; s += dash + dashGap) {
        const s1 = Math.min(s + dash, len - 0.03);
        if (s1 - s < 0.05) continue;
        const at = (t, side) => {
          const [e, n] = planToWorld(eu0 + dx * t - dy * side, ev0 + dy * t + dx * side);
          return [e, y, n];
        };
        const a = at(s, -halfW);
        const b = at(s1, -halfW);
        const c = at(s1, halfW);
        const d = at(s, halfW);
        markTris.push([a, b, c], [a, c, d]);
      }
    }
  }
  const marks = new THREE.Mesh(
    geometryFromTriangles(markTris),
    new THREE.MeshBasicMaterial({
      color: 0x8d8982,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
  );
  marks.castShadow = false;
  marks.receiveShadow = false;
  bucket.add(marks);

  const face = '"DejaVu Sans", "Liberation Sans", sans-serif';
  const canvasW = 1200;
  const canvasH = 720;
  let fontPx = 210;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `700 ${fontPx}px ${face}`;
  while (probe.measureText("Мастер-спальня").width > 1100 && fontPx > 80) {
    fontPx -= 4;
    probe.font = `700 ${fontPx}px ${face}`;
  }
  const labelW = 2.2;
  const labelH = labelW * (canvasH / canvasW);
  const fmtM = (n) => n.toFixed(2).replace(".", ",");
  const eastAxis = planDeltaToWorld(1, 0);
  const northAxis = planDeltaToWorld(0, 1);
  const labelBasis = new THREE.Matrix4().makeBasis(
    eastAxis.clone().negate(),
    northAxis.clone().negate(),
    new THREE.Vector3(0, 1, 0)
  );
  for (const [name, x0, y0, x1, y1, floorY] of rooms) {
    const w = x1 - x0;
    const d = y1 - y0;
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, canvasW, canvasH);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 ${fontPx}px ${face}`;
    const lines = [name, `${fmtM(w)} × ${fmtM(d)}`, `${fmtM(w * d)} м²`];
    lines.forEach((line, i) => {
      g.fillStyle = i === 0 ? "#2c2824" : "#4e4842";
      g.fillText(line, canvasW / 2, canvasH * (0.22 + i * 0.28));
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(labelW, labelH),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.4,
        toneMapped: false,
        depthWrite: false,
      })
    );
    const [e, n] = planToWorld((x0 + x1) / 2, (y0 + y1) / 2);
    label.position.set(e, floorY + 0.012, n);
    label.quaternion.setFromRotationMatrix(labelBasis);
    label.castShadow = false;
    label.receiveShadow = false;
    bucket.add(label);
  }
}

function addGroundLabel(text, east, north, y) {
  const face = '"DejaVu Sans", "Liberation Sans", sans-serif';
  const fontPx = 200;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `700 ${fontPx}px ${face}`;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(probe.measureText(text).width) + 48;
  canvas.height = Math.ceil(fontPx * 1.35);
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = `700 ${fontPx}px ${face}`;
  g.fillStyle = "#2c2824";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const labelH = 0.42;
  const labelW = labelH * (canvas.width / canvas.height);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(labelW, labelH),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.4,
      toneMapped: false,
      depthWrite: false,
    })
  );
  const [e, n] = planToWorld(east, north);
  label.position.set(e, y, n);
  const basis = new THREE.Matrix4().makeBasis(
    planDeltaToWorld(1, 0).negate(),
    planDeltaToWorld(0, 1).negate(),
    new THREE.Vector3(0, 1, 0)
  );
  label.quaternion.setFromRotationMatrix(basis);
  label.castShadow = false;
  label.receiveShadow = false;
  bucket.add(label);
}

function addSiteDim(x0, y0, x1, y1, text, side = 1, gap = 0.55) {
  const yLine = 0.14;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * side;
  const py = (dx / len) * side;
  const world = (x, y) => {
    const [e, n] = planToWorld(x, y);
    return [e, yLine, n];
  };
  const stroke = (ax, ay, bx, by) => addBeam(world(ax, ay), world(bx, by), 0.035, 0x3a342e, false);
  stroke(x0, y0, x1, y1);
  const tick = 0.32;
  stroke(x0 - px * tick, y0 - py * tick, x0 + px * tick, y0 + py * tick);
  stroke(x1 - px * tick, y1 - py * tick, x1 + px * tick, y1 + py * tick);
  addGroundLabel(text, (x0 + x1) / 2 + px * gap, (y0 + y1) / 2 + py * gap, 0.17);
}

function addGarage(spec = {}) {
  if (typeof spec === "number") spec = { gy0: spec };
  const gateW = 5.98;
  const gateTailLen = 2.4;
  const gateX0 = -18 + 0.08 + 0.5 + gateTailLen + gateW;
  const gateX1 = gateX0 + gateW;
  const t = 0.18;
  const gy1 = spec.northFace ?? 15.914;
  const sized = spec.clearW && spec.shopClear && spec.garageClear;
  let gx0 = gateX0;
  let gx1 = gateX1;
  let gy0 = spec.gy0 ?? 8.7;
  let shopY0;
  let shopY1;
  let doorShift = 0;
  if (sized) {
    const ext = spec.clearW + 2 * t;
    const centered0 = (gateX0 + gateX1) / 2 - ext / 2;
    if (spec.eastFace != null) {
      gx1 = spec.eastFace;
      gx0 = gx1 - ext;
    } else {
      gx0 = centered0;
      gx1 = centered0 + ext;
    }
    doorShift = gx0 - centered0;
    shopY1 = gy1 - t - spec.garageClear;
    shopY0 = shopY1 - 0.12;
    gy0 = shopY0 - t - spec.shopClear;
  } else {
    shopY0 = gy0 + 1.94;
    shopY1 = gy0 + 2.06;
  }
  const blindColor = sized ? 0xb4b4ae : 0xd4cfc4;
  if (sized) {
    addSlab([[gx0 - 1, gy0 - 1], [gx1 + 1, gy0 - 1], [gx1 + 1, gy0], [gx0 - 1, gy0]], 0.07, 0.025, blindColor, false);
    addSlab([[gx0 - 1, gy1], [gx1 + 1, gy1], [gx1 + 1, gy1 + 1], [gx0 - 1, gy1 + 1]], 0.07, 0.025, blindColor, false);
    addSlab([[gx0 - 1, gy0], [gx0, gy0], [gx0, gy1], [gx0 - 1, gy1]], 0.07, 0.025, blindColor, false);
    addSlab([[gx1, gy0], [gx1 + 1, gy0], [gx1 + 1, gy1], [gx1, gy1]], 0.07, 0.025, blindColor, false);
  } else {
    addSlab([[gx0 - 1, gy0 - 1], [gx1, gy0 - 1], [gx1, gy0], [gx0 - 1, gy0]], 0.07, 0.025, blindColor, false);
    addSlab([[gx0 - 1, gy0], [gx0, gy0], [gx0, gy1], [gx0 - 1, gy1]], 0.07, 0.025, blindColor, false);
  }
  const gTop = 2.55;
  const doorH = 2.15;
  const d1a = gateX0 + 0.51 + doorShift;
  const d1b = d1a + 2.4;
  const d2a = d1b + 0.16;
  const d2b = d2a + 2.4;
  planBox([[gx0, gy0], [gx1, gy0], [gx1, gy0 + t], [gx0, gy0 + t]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy0], [gx0 + t, gy0], [gx0 + t, gy1], [gx0, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  const sideDoor0 = gy0 + t + 0.45;
  const sideDoor1 = sideDoor0 + 0.9;
  planBox([[gx1 - t, gy0], [gx1, gy0], [gx1, sideDoor0], [gx1 - t, sideDoor0]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx1 - t, sideDoor1], [gx1, sideDoor1], [gx1, gy1], [gx1 - t, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx1 - t, sideDoor0], [gx1, sideDoor0], [gx1, sideDoor1], [gx1 - t, sideDoor1]], PLINTH + doorH, PLINTH + gTop, 0xf4f0e8);
  addOpeningFrame(gx1 - t, gx1, sideDoor0, sideDoor1, 0, PLINTH + doorH, false);
  planBox([[gx0, gy1 - t], [d1a, gy1 - t], [d1a, gy1], [gx0, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[d1b, gy1 - t], [d2a, gy1 - t], [d2a, gy1], [d1b, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[d2b, gy1 - t], [gx1, gy1 - t], [gx1, gy1], [d2b, gy1]], 0, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy1 - t], [gx1, gy1 - t], [gx1, gy1], [gx0, gy1]], PLINTH + doorH, PLINTH + gTop, 0xf4f0e8);
  addOpeningFrame(d1a, d1b, gy1 - t, gy1, 0, PLINTH + doorH, false);
  addOpeningFrame(d2a, d2b, gy1 - t, gy1, 0, PLINTH + doorH, false);
  planBox([[gx0 + t, gy0 + t], [gx1 - t, gy0 + t], [gx1 - t, gy1], [gx0 + t, gy1]], 0.03, 0.065, 0xe6d3b0, false);
  const shopDoorW = 0.9;
  const shopDoor0 = gx0 + t + 0.45;
  const shopDoor1 = shopDoor0 + shopDoorW;
  planBox([[gx0 + t, shopY0], [shopDoor0, shopY0], [shopDoor0, shopY1], [gx0 + t, shopY1]], 0.065, PLINTH + gTop, 0xefe6d4);
  planBox([[shopDoor1, shopY0], [gx1 - t, shopY0], [gx1 - t, shopY1], [shopDoor1, shopY1]], 0.065, PLINTH + gTop, 0xefe6d4);
  planBox([[shopDoor0, shopY0], [shopDoor1, shopY0], [shopDoor1, shopY1], [shopDoor0, shopY1]], PLINTH + doorH, PLINTH + gTop, 0xefe6d4);
  addOpeningFrame(shopDoor0, shopDoor1, shopY0, shopY1, 0.065, PLINTH + doorH, false);
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
  const gutterC = 0x2a2826;
  const pipe = 0.07;
  const eaveZ = PLINTH + gTop;
  const gutterBox = (x0, y0, x1, y1, z0, z1) => asRoof(planBox(
    [[Math.min(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.min(y0, y1)],
      [Math.max(x0, x1), Math.max(y0, y1)], [Math.min(x0, x1), Math.max(y0, y1)]],
    z0, z1, gutterC
  ));
  gutterBox(gx0 - 0.32, gy0 - 0.18, gx0 - 0.22, gy1 + 0.18, eaveZ - 0.16, eaveZ - 0.04);
  gutterBox(gx1 + 0.22, gy0 - 0.18, gx1 + 0.32, gy1 + 0.18, eaveZ - 0.16, eaveZ - 0.04);
  const planWorld = (x, y, z) => {
    const [e, n] = planToWorld(x, y);
    return [e, z, n];
  };
  const garageSpout = (gx, gy, wx, wy) => {
    const zTop = eaveZ - 0.14;
    const zBend = eaveZ - 0.26;
    const zWallBot = 0.14;
    const beam = (xa, ya, za, xb, yb, zb) => asRoof(addBeam(
      planWorld(xa, ya, za), planWorld(xb, yb, zb), pipe, gutterC
    ));
    beam(gx, gy, zBend, gx, gy, zTop);
    beam(gx, gy, zBend, wx, wy, zBend);
    beam(wx, wy, zWallBot, wx, wy, zBend);
    const ox = gx - wx;
    const oy = gy - wy;
    const len = Math.hypot(ox, oy) || 1;
    const kick = 0.18;
    const kx = wx + (ox / len) * kick;
    const ky = wy + (oy / len) * kick;
    beam(wx, wy, zWallBot, kx, ky, 0.04);
    beam(kx, ky, -0.02, kx, ky, 0.1);
  };
  const xW = gx0 - 0.27;
  const xE = gx1 + 0.27;
  const yS = gy0 - 0.18 + pipe / 2;
  const yN = gy1 + 0.18 - pipe / 2;
  garageSpout(xW, yS, gx0 - 0.05, gy0 - 0.05);
  garageSpout(xW, yN, gx0 - 0.05, gy1 + 0.05);
  garageSpout(xE, yS, gx1 + 0.05, gy0 - 0.05);
  garageSpout(xE, yN, gx1 + 0.05, gy1 + 0.05);
  const shopFloor = 0.065;
  addFloorNotes([
    ["Хозблок", gx0 + t, gy0 + t, gx1 - t, shopY0, shopFloor],
    ["Гараж", gx0 + t, shopY1, gx1 - t, gy1 - t, shopFloor],
  ]);
  return { gx0, gx1, gy0, gy1 };
}

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
  addSlab([[23.6, -0.55], [31.1, -0.55], [31.1, 5.35], [23.6, 5.35]], 0.07, 0.025, blind, false);

  addGarage();

  const t = 0.18;
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
  const d1a = gx0 + 0.51;
  const d1b = d1a + 2.4;
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
          mat.color.set(0x6e675e);
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
          mat.color.set(0x6a7078);
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
  const savedBucket = bucket;
  bucket = greenhouseGroup;
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
  bucket = savedBucket;
}

addSite();
bucket = sharedGroup;
addGreenhouse();
sharedGroup.add(greenhouseGroup);
greenhouseGroup.visible = false;

// Вариант А: дом. u — от оси А на восток к оси Г на запад, v — от оси 6 (юг) к оси 1 (север).
const V2_XE = 20.16;
const V2_YS = 2.66;
const V2_PLINTH = 0.3;
const V2_BRICK = 0xc4a484;
const V2_PART = 0xd9d3c8;
const V2_ROOF = 0x3a332c;

function v2p(u, v) {
  return [V2_XE - u, V2_YS + v];
}

function v2box(u0, v0, u1, v1, z0, z1, color) {
  return planBox([v2p(u0, v0), v2p(u1, v0), v2p(u1, v1), v2p(u0, v1)], z0 + V2_PLINTH, z1 + V2_PLINTH, color);
}

function v2wallU(u, v0, v1, thick, holes, zTop, color) {
  const a = u - thick / 2;
  const b = u + thick / 2;
  const list = holes.slice().sort((p, q) => p.v0 - q.v0);
  let v = v0;
  for (const h of list) {
    if (h.v0 > v + 0.02) v2box(a, v, b, h.v0, -0.05, zTop, color);
    if (h.z0 > 0.02) v2box(a, h.v0, b, h.v1, -0.05, h.z0, color);
    if (zTop > h.z1 + 0.02) v2box(a, h.v0, b, h.v1, h.z1, zTop, color);
    if (!h.open) v2winX(u, h.v0, h.v1, h.z0, h.z1);
    v = Math.max(v, h.v1);
  }
  if (v1 > v + 0.02) v2box(a, v, b, v1, -0.05, zTop, color);
}

function v2wallV(v, u0, u1, thick, holes, zTop, color) {
  const a = v - thick / 2;
  const b = v + thick / 2;
  const list = holes.slice().sort((p, q) => p.u0 - q.u0);
  let u = u0;
  for (const h of list) {
    if (h.u0 > u + 0.02) v2box(u, a, h.u0, b, -0.05, zTop, color);
    if (h.z0 > 0.02) v2box(h.u0, a, h.u1, b, -0.05, h.z0, color);
    if (zTop > h.z1 + 0.02) v2box(h.u0, a, h.u1, b, h.z1, zTop, color);
    if (!h.open) v2winY(v, h.u0, h.u1, h.z0, h.z1);
    u = Math.max(u, h.u1);
  }
  if (u1 > u + 0.02) v2box(u, a, u1, b, -0.05, zTop, color);
}

function v2winX(u, v0, v1, z0, z1) {
  const x = V2_XE - u;
  const y0 = V2_YS + Math.min(v0, v1);
  const y1 = V2_YS + Math.max(v0, v1);
  addOpeningFrame(x - 0.1, x + 0.1, y0, y1, z0 + V2_PLINTH, z1 + V2_PLINTH, z0 > 0.2);
  const glass = v2box(u - 0.02, v0, u + 0.02, v1, z0, z1, 0xb7d4e4);
  glass.material.transparent = true;
  glass.material.opacity = 0.28;
  glass.material.depthWrite = false;
  glass.castShadow = false;
}

function v2winY(v, u0, u1, z0, z1, withSill = z0 > 0.2) {
  const y = V2_YS + v;
  const x0 = V2_XE - Math.max(u0, u1);
  const x1 = V2_XE - Math.min(u0, u1);
  addOpeningFrame(x0, x1, y - 0.1, y + 0.1, z0 + V2_PLINTH, z1 + V2_PLINTH, withSill);
  const glass = v2box(u0, v - 0.02, u1, v + 0.02, z0, z1, 0xb7d4e4);
  glass.material.transparent = true;
  glass.material.opacity = 0.28;
  glass.material.depthWrite = false;
  glass.castShadow = false;
}

function v2roof(tris) {
  const lift = ([u, v, z]) => {
    const [e, n] = planToWorld(V2_XE - u, V2_YS + v);
    return [e, z + V2_PLINTH, n];
  };
  const out = tris.map(([a, b, c]) => {
    const A = lift(a);
    const B = lift(b);
    const C = lift(c);
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    return ny > 0 ? [A, C, B] : [A, B, C];
  });
  asRoof(addMesh(geometryFromTriangles(out), V2_ROOF));
}

function v2solid(tris, color) {
  const lift = ([u, v, z]) => {
    const [e, n] = planToWorld(V2_XE - u, V2_YS + v);
    return [e, z + V2_PLINTH, n];
  };
  const out = tris.map(([a, b, c]) => {
    const A = lift(a);
    const B = lift(b);
    const C = lift(c);
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    return ny > 0 ? [A, C, B] : [A, B, C];
  });
  const mesh = addMesh(geometryFromTriangles(out), color);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function v2glass(tris) {
  const mesh = v2solid(tris, 0xb7d4e4);
  mesh.material.transparent = true;
  mesh.material.opacity = 0.42;
  mesh.material.depthWrite = false;
  mesh.castShadow = false;
  return mesh;
}

function v2shell(tris, drop) {
  const shell = [];
  for (const [a, b, c] of tris) {
    const ad = [a[0], a[1], a[2] - drop];
    const bd = [b[0], b[1], b[2] - drop];
    const cd = [c[0], c[1], c[2] - drop];
    shell.push([a, b, c], [ad, cd, bd]);
    const edges = [[a, b, bd, ad], [b, c, cd, bd], [c, a, ad, cd]];
    for (const [p, q, r, s] of edges) shell.push([p, q, r], [p, r, s]);
  }
  v2roof(shell);
}


function addBath() {
  // D7227: газобетон, штукатурка, цоколь, вальма из металлочерепицы, конёк 5,19 м.
  // Вход на запад. Водосточный жёлоб и трубы добавлены по периметру карниза.
  const uE = -14.70;
  const uW = -7.70;
  const vS = -9.74;
  const vN = -1.74;
  const t = 0.38;
  const plaster = 0xe4e0da;
  const stone = 0x6a6f68;
  const wood = 0xa56a3a;
  const roofC = V2_ROOF;
  const frameC = 0x2a2a2a;
  const gutterC = 0x3c4046;
  const plinth = 0.45;
  const wallTop = 3.05;
  const winHead = 2.90;
  const frontSill = 0.55;
  const sideSill = 1.72;
  const ridge = 5.19;
  const ov = 0.80;
  const box = (ua, va, ub, vb, za, zb, color, cast = true) =>
    planBox([v2p(ua, va), v2p(ub, va), v2p(ub, vb), v2p(ua, vb)], za, zb, color, cast);
  const glass = (ua, va, ub, vb, za, zb) => {
    const m = box(ua, va, ub, vb, za, zb, 0x9bb4c0, false);
    m.material.transparent = true;
    m.material.opacity = 0.34;
    m.material.depthWrite = false;
    m.castShadow = false;
    return m;
  };
  const uvW = (u, v, z) => {
    const [e, n] = planToWorld(V2_XE - u, V2_YS + v);
    return [e, z, n];
  };
  const surf = (tris, color) => {
    const lift = ([u, v, z]) => uvW(u, v, z);
    const out = tris.map(([a, b, c]) => {
      const A = lift(a);
      const B = lift(b);
      const C = lift(c);
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const ny = ab[2] * ac[0] - ab[0] * ac[2];
      return ny > 0 ? [A, C, B] : [A, B, C];
    });
    return asRoof(addMesh(geometryFromTriangles(out), color));
  };

  addSlabHole(
    [v2p(uE - 1, vS - 1), v2p(uW + 1, vS - 1), v2p(uW + 1, vN + 1), v2p(uE - 1, vN + 1)],
    [v2p(uE, vS), v2p(uW, vS), v2p(uW, vN), v2p(uE, vN)],
    0.02, 0.035, 0xd4cfc4
  );
  box(uE, vS, uW, vN, 0.02, plinth, stone);
  // 2 м от стены, 3 м вдоль. Южный край вровень с южной стеной, три ступени по 30 см.
  const tread = 0.3;
  const porchOut = 2;
  const porchAlong = 3;
  const stepTop = plinth;
  const rise = (stepTop - 0.02) / 3;
  for (let i = 0; i < 3; i++) {
    const shrink = i * tread;
    const z0 = 0.02 + i * rise;
    const z1 = i === 2 ? stepTop : z0 + rise;
    box(
      uW, vS + shrink, uW + porchOut - shrink, vS + porchAlong - shrink,
      z0, z1, stone
    );
  }
  box(uE + t, vS + t, uW - t, vN - t, plinth, plinth + 0.04, 0xf3f0ea, false);

  const westU0 = uW - t;
  const door0 = vS + 0.61;
  const door1 = vS + 1.53;
  const g0 = vS + 2.59;
  const g1 = vS + 4.40;
  const h0 = vS + 5.09;
  const h1 = vS + 6.87;
  for (const [a, b] of [[vS, door0], [door1, g0], [g1, h0], [h1, vN]]) {
    box(westU0, a, uW, b, plinth, winHead, plaster);
  }
  box(westU0, g0, uW, g1, plinth, frontSill, plaster);
  box(westU0, h0, uW, h1, plinth, frontSill, plaster);
  box(westU0, vS, uW, vN, winHead, wallTop, plaster);
  const bathDoorHead = 2.50;
  box(westU0, door0, uW, door1, bathDoorHead, winHead, wood);
  for (const [a, b] of [[g0, g1], [h0, h1]]) {
    const mid = (a + b) / 2;
    glass(uW - 0.05, a + 0.04, uW + 0.02, mid - 0.03, frontSill, winHead);
    glass(uW - 0.05, mid + 0.03, uW + 0.02, b - 0.04, frontSill, winHead);
    box(uW - 0.02, mid - 0.03, uW + 0.025, mid + 0.03, frontSill, winHead, frameC);
    box(uW - 0.02, a, uW + 0.025, a + 0.05, frontSill, winHead, frameC);
    box(uW - 0.02, b - 0.05, uW + 0.025, b, frontSill, winHead, frameC);
    box(uW - 0.02, a, uW + 0.025, b, frontSill, frontSill + 0.05, frameC);
    box(uW - 0.02, a, uW + 0.025, b, winHead - 0.05, winHead, frameC);
  }

  const sideGlass = (u0, v0, u1, v1) => {
    glass(u0, v0, u1, v1, sideSill, winHead);
    box(u0, v0, u1, v1, sideSill, sideSill + 0.05, frameC);
    box(u0, v0, u1, v1, winHead - 0.05, winHead, frameC);
    box(u0, v0, u0 + 0.05, v1, sideSill, winHead, frameC);
    box(u1 - 0.05, v0, u1, v1, sideSill, winHead, frameC);
  };
  const sideW = 0.87;
  const saunaUc = uE + (t + 3.44) / 2;
  const saunaVc = vS + (t + 2.87) / 2;
  const westUc = uE + (3.56 + (uW - t - uE)) / 2;
  const eWins = [[saunaVc - sideW / 2, saunaVc + sideW / 2], [vS + 5.06, vS + 5.95]];
  let ev = vS;
  for (const [a, b] of eWins) {
    box(uE, ev, uE + t, a, plinth, wallTop, plaster);
    box(uE, a, uE + t, b, plinth, sideSill, wood);
    box(uE, a, uE + t, b, winHead, wallTop, plaster);
    sideGlass(uE - 0.02, a, uE + 0.04, b);
    ev = b;
  }
  box(uE, ev, uE + t, vN, plinth, wallTop, plaster);
  const sWins = [[saunaUc - sideW / 2, saunaUc + sideW / 2], [westUc - sideW / 2, westUc + sideW / 2]];
  let su = uE;
  for (const [a, b] of sWins) {
    box(su, vS, a, vS + t, plinth, wallTop, plaster);
    box(a, vS, b, vS + t, plinth, sideSill, wood);
    box(a, vS, b, vS + t, winHead, wallTop, plaster);
    sideGlass(a, vS - 0.02, b, vS + 0.04);
    su = b;
  }
  box(su, vS, uW, vS + t, plinth, wallTop, plaster);
  const suHalf = 0.395;
  const nWins = [[saunaUc - suHalf, saunaUc + suHalf], [westUc - sideW / 2, westUc + sideW / 2]];
  let nu = uE;
  for (const [a, b] of nWins) {
    box(nu, vN - t, a, vN, plinth, wallTop, plaster);
    box(a, vN - t, b, vN, plinth, sideSill, wood);
    box(a, vN - t, b, vN, winHead, wallTop, plaster);
    glass(a, vN - 0.05, b, vN + 0.02, sideSill, winHead);
    box(a, vN - 0.02, b, vN + 0.03, sideSill, sideSill + 0.05, frameC);
    box(a, vN - 0.02, b, vN + 0.03, winHead - 0.05, winHead, frameC);
    box(a, vN - 0.02, a + 0.05, vN + 0.03, sideSill, winHead, frameC);
    box(b - 0.05, vN - 0.02, b, vN + 0.03, sideSill, winHead, frameC);
    nu = b;
  }
  box(nu, vN - t, uW, vN, plinth, wallTop, plaster);

  const part = 0xe7e2da;
  const head = 2.55;
  const piers = (u0, u1, v0, v1, segments, alongU) => {
    let cursor = alongU ? u0 : v0;
    const limit = alongU ? u1 : v1;
    for (const [a, b] of segments) {
      if (a > cursor + 0.02) {
        if (alongU) box(cursor, v0, a, v1, plinth + 0.04, head, part);
        else box(u0, cursor, u1, a, plinth + 0.04, head, part);
      }
      cursor = Math.max(cursor, b);
    }
    if (limit > cursor + 0.02) {
      if (alongU) box(cursor, v0, limit, v1, plinth + 0.04, head, part);
      else box(u0, cursor, u1, limit, plinth + 0.04, head, part);
    }
  };
  piers(uE + 3.44, uE + 3.56, vS + 0.38, vS + 7.62, [[vS + 5.34, vS + 6.14]], false);
  piers(uE + 0.38, uE + 3.44, vS + 2.87, vS + 2.99, [[uE + 1.78, uE + 2.57]], true);
  piers(uE + 0.38, uE + 3.44, vS + 6.49, vS + 6.61, [[uE + 2.57, uE + 3.26]], true);
  piers(uE + 3.56, uE + 6.62, vS + 1.90, vS + 2.02, [[uE + 3.66, uE + 4.57]], true);

  const frameV = (u, v0, v1, z0, z1, half) => {
    addOpeningFrame(V2_XE - u - half, V2_XE - u + half, V2_YS + v0, V2_YS + v1, z0, z1, false);
  };
  const frameU = (v, u0, u1, z0, z1, half) => {
    addOpeningFrame(V2_XE - u1, V2_XE - u0, V2_YS + v - half, V2_YS + v + half, z0, z1, false);
  };
  frameV(uW - t / 2, door0, door1, plinth, bathDoorHead, t / 2);
  frameU(vS + 1.96, uE + 3.66, uE + 4.57, plinth, head, 0.06);
  frameV(uE + 3.50, vS + 5.34, vS + 6.14, plinth, head, 0.06);
  frameU(vS + 2.93, uE + 1.78, uE + 2.57, plinth, head, 0.06);
  frameU(vS + 6.55, uE + 2.57, uE + 3.26, plinth, head, 0.06);
  addFloorNotes([
    ["Сауна", uE + t, vS + t, uE + 3.44, vS + 2.87, plinth + 0.05],
    ["Помывочная", uE + t, vS + 2.99, uE + 3.44, vS + 6.49, plinth + 0.05],
    ["С/у", uE + t, vS + 6.61, uE + 3.44, vN - t, plinth + 0.05],
    ["Тамбур", uE + 3.56, vS + t, uW - t, vS + 1.90, plinth + 0.05],
    ["Комната отдыха", uE + 3.56, vS + 2.02, uW - t, vN - t, plinth + 0.05],
  ].map(([name, ua, va, ub, vb, floorY]) => [name, V2_XE - ub, V2_YS + va, V2_XE - ua, V2_YS + vb, floorY]));


  const u0 = uE - ov;
  const u1 = uW + ov;
  const v0 = vS - ov;
  const v1 = vN + ov;
  const zE = wallTop;
  // План длиннее с севера на юг, поэтому конёк идёт вдоль v.
  // Отступ конька равен половине короткой стороны — один уклон на всех четырёх скатах.
  const uR = (u0 + u1) / 2;
  const run = (u1 - u0) / 2;
  const vRS = v0 + run;
  const vRN = v1 - run;
  const se = [u0, v0, zE];
  const sw = [u1, v0, zE];
  const ne = [u0, v1, zE];
  const nw = [u1, v1, zE];
  const rs = [uR, vRS, ridge];
  const rn = [uR, vRN, ridge];
  // Печь в сауне у стены с тамбуром, у северного края — ближе к двери в сауну.
  const stoveU1 = uE + 3.44 - 0.02;
  const stoveU0 = stoveU1 - 0.46;
  const stoveV1 = vS + 2.87 - 0.08;
  const stoveV0 = stoveV1 - 0.50;
  const cu = (stoveU0 + stoveU1) / 2;
  const cv = (stoveV0 + stoveV1) / 2;
  const flue = 0.16;
  surf([
    [ne, nw, rn],
    [se, ne, rn], [se, rn, rs],
    [sw, rs, rn], [sw, rn, nw],
  ], roofC);
  const southZ = (v) => zE + (ridge - zE) * ((v - v0) / (vRS - v0));
  const uOn = (ua, va, ub, vb, v) => ua + (ub - ua) * ((v - va) / (vb - va));
  const edgeL = (v) => uOn(se[0], se[1], rs[0], rs[1], v);
  const edgeR = (v) => uOn(sw[0], sw[1], rs[0], rs[1], v);
  const roofPt = (u, v) => [u, v, southZ(v)];
  const southBand = (vA, a0, a1, vB, b0, b1) => [
    [roofPt(a0, vA), roofPt(a1, vA), roofPt(b1, vB)],
    [roofPt(a0, vA), roofPt(b1, vB), roofPt(b0, vB)],
  ];
  const hv0 = cv - flue;
  const hv1 = cv + flue;
  const hu0 = cu - flue;
  const hu1 = cu + flue;
  surf([
    ...southBand(v0, se[0], sw[0], hv0, edgeL(hv0), edgeR(hv0)),
    ...southBand(hv0, edgeL(hv0), hu0, hv1, edgeL(hv1), hu0),
    ...southBand(hv0, hu1, edgeR(hv0), hv1, hu1, edgeR(hv1)),
    [roofPt(edgeL(hv1), hv1), roofPt(edgeR(hv1), hv1), roofPt(rs[0], rs[1])],
  ], roofC);
  const fascia = 0.18;
  const band = 0.10;
  asRoof(box(u0 + band, v0, u1 - band, v0 + band, zE - fascia, zE, wood));
  asRoof(box(u0 + band, v1 - band, u1 - band, v1, zE - fascia, zE, wood));
  asRoof(box(u0, v0 + band, u0 + band, v1 - band, zE - fascia, zE, wood));
  asRoof(box(u1 - band, v0 + band, u1, v1 - band, zE - fascia, zE, wood));
  asRoof(box(uE, v0, u1, vS, zE - fascia, zE - fascia + 0.04, wood));
  asRoof(box(uE, vN, u1, v1, zE - fascia, zE - fascia + 0.04, wood));
  asRoof(box(u0, vS, uE, vN, zE - fascia, zE - fascia + 0.04, wood));
  asRoof(box(uW, vS, u1, vN, zE - fascia, zE - fascia + 0.04, wood));

  const gz = zE - fascia - 0.04;
  const gutterSize = 0.16;
  const pipe = 0.10;
  const gOut = gutterSize / 2;
  const gutter = (a, b, c, d) => asRoof(addBeam(uvW(a, b, gz), uvW(c, d, gz), gutterSize, gutterC));
  gutter(u0 - gOut, v0 - gOut, u1 + gOut, v0 - gOut);
  gutter(u0 - gOut, v1 + gOut, u1 + gOut, v1 + gOut);
  gutter(u0 - gOut, v0 - gOut, u0 - gOut, v1 + gOut);
  gutter(u1 + gOut, v0 - gOut, u1 + gOut, v1 + gOut);
  const wallGap = pipe / 2 + 0.03;
  const spout = (gu, gv, wu, wv) => {
    const zTop = gz;
    const zBend = gz - 0.18;
    const zWall = 0.12;
    const beam = (ua, va, za, ub, vb, zb) => asRoof(addBeam(
      uvW(ua, va, za), uvW(ub, vb, zb), pipe, gutterC
    ));
    beam(gu, gv, zBend, gu, gv, zTop);
    beam(gu, gv, zBend, wu, wv, zBend);
    beam(wu, wv, zWall, wu, wv, zBend);
    const ox = gu - wu;
    const oy = gv - wv;
    const len = Math.hypot(ox, oy) || 1;
    const kick = 0.22;
    const ku = wu + (ox / len) * kick;
    const kv = wv + (oy / len) * kick;
    beam(wu, wv, zWall, ku, kv, 0.02);
    beam(ku, kv, -0.1, ku, kv, 0.08);
  };
  spout(u0 - gOut, v0 - gOut, uE - wallGap, vS - wallGap);
  spout(u1 + gOut, v0 - gOut, uW + wallGap, vS - wallGap);
  spout(u0 - gOut, v1 + gOut, uE - wallGap, vN + wallGap);
  spout(u1 + gOut, v1 + gOut, uW + wallGap, vN + wallGap);

  box(stoveU0, stoveV0, stoveU1, stoveV1, plinth, plinth + 0.72, 0x2c2c2c);
  box(stoveU0 + 0.05, stoveV0 + 0.05, stoveU1 - 0.04, stoveV1 - 0.05, plinth + 0.72, plinth + 0.9, 0x6e675e);
  box(cu - flue, cv - flue, cu + flue, cv + flue, plinth + 0.9, 6.35, 0xd8d8d8);
  const cap = 0.05;
  box(cu - flue - cap, cv - flue - cap, cu + flue + cap, cv + flue + cap, 6.35, 6.5, 0xcfcfcf);
}

function addVariant2() {
  bucket = variant2Group;
  const garageBox = addGarage({
    clearW: 6,
    shopClear: 2,
    garageClear: 6,
    eastFace: V2_XE - 18.22 - 6,
    northFace: 22.877 - 7,
  });
  const plot = [
    [-18.0, 22.877],
    [32.835, 22.877],
    [39.044, -10.647],
    [-12.963, -4.345],
  ];
  const fenceY = 22.877;
  const gateW = 5.98;
  const gateTailLen = 2.4;
  const gateX0 = -18 + 0.08 + 0.5 + gateTailLen + gateW;
  const gateX1 = gateX0 + gateW;
  const kalX0 = gateX1 + 0.45;
  const kalX1 = kalX0 + 1.5;
  const fenceH = 1.5;
  const fenceT = 0.06;
  addWallRun(plot[0], [gateX0, fenceY], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun([gateX1, fenceY], [kalX0, fenceY], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun([kalX1, fenceY], plot[1], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[1], plot[2], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[2], plot[3], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[3], plot[0], fenceT, 0, fenceH, 0x7d6a52);
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
  const gy1 = garageBox.gy1;
  const gateMid = (gateX0 + gateX1) / 2;
  const d1a = gateX0 + 0.51 + (garageBox.gx0 - (gateMid - 3.18));
  const d1b = d1a + 2.4;
  const coolLen = 4.33;
  addParkedModel({
    url: "./models/geely-coolray.glb",
    length: coolLen,
    heading: "north",
    centerE: (d1a + d1b) / 2,
    centerN: gy1 - 1.3 + coolLen / 2,
  });
  const mazdaLen = 4.55;
  addParkedModel({
    url: "./models/mazda-cx5.glb",
    length: mazdaLen,
    heading: "north",
    centerE: (d1a + d1b) / 2 + 1.019 + 0.5 + 1.037,
    centerN: ((fenceY - 0.35 - 0.6) + (gy1 + 0.8)) / 2 - 0.5,
  });

  // Септик сдвинут так, чтобы центр восточного люка был в 4 м от восточного забора.
  const septicShift = [-0.3586313514065793, -0.06642232612109211];
  const septicPt = (x, y) => [x + septicShift[0], y + septicShift[1]];
  addSlab([
    septicPt(27.24, 17.68), septicPt(31.24, 17.68), septicPt(31.24, 20.88), septicPt(27.24, 20.88),
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([
    septicPt(28.139, 18.478), septicPt(30.34, 18.478), septicPt(30.34, 19.877), septicPt(28.139, 19.877),
  ], 0.07, 0.05, 0xefe6d4, false);
  for (const [sx, sy] of [septicPt(28.653, 19.178), septicPt(29.823, 19.178)]) {
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
  // Скважина в северо-западном углу у гаража: дальше 20 м от септика и не под откатом ворот.
  const wellE = -15.8;
  const wellN = fenceY - 3;
  // Газон 1,5 м вдоль забора. Заезд и отмостка скважины в эту полосу не входят.
  const grass = 1.5;
  const driveWest = gateX0 - 1;
  const driveEast = kalX1 + 1;
  const pathW = 1;
  const pathNorth = wellN + pathW / 2;
  const pathSouth = wellN - pathW / 2;
  const pad0 = wellE - 1;
  const pad1 = wellE + 1;
  const padSouth = wellN - 1;
  const padNorth = wellN + 1;
  addSlab([
    [driveWest, pathNorth],
    [pad1, pathNorth],
    [pad1, pathSouth],
    [driveWest, pathSouth],
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSlab([
    [pad0, padSouth], [pad1, padSouth], [pad1, padNorth], [pad0, padNorth],
  ], 0.03, 0.035, 0xe6d3b0, false);
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

  // Туи на газоне 1,5 м вдоль северного забора: перед домом и у скважины, шаг 1–2 м.
  {
    const rowY = fenceY - 0.78;
    const addThuja = (x, y, height, radius, kind) => {
      height *= 1.6;
      radius *= 1.12;
      const [e, n] = planToWorld(x, y);
      const trunkH = 0.1;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.06, trunkH, 6),
        new THREE.MeshLambertMaterial({ color: 0x6a4a32 })
      );
      trunk.position.set(e, trunkH / 2, n);
      trunk.castShadow = true;
      bucket.add(trunk);
      const fullness = kind === 1 ? 1.18 : kind === 2 ? 0.78 : 1;
      const R = radius * fullness;
      const peak = kind === 1 ? 0.2 : kind === 2 ? 0.34 : 0.26;
      const pts = [];
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rad = t <= peak
          ? R * (0.32 + 0.68 * Math.sin((t / peak) * Math.PI / 2))
          : R * Math.sqrt(Math.max(0, 1 - ((t - peak) / (1 - peak)) ** 2));
        pts.push(new THREE.Vector2(Math.max(rad, 0.004), t * height));
      }
      const mesh = new THREE.Mesh(
        new THREE.LatheGeometry(pts, 12),
        new THREE.MeshLambertMaterial({ color: [0x2f6a38, 0x3c7a44, 0x275c32][kind] })
      );
      mesh.position.set(e, trunkH, n);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bucket.add(mesh);
    };
    const front = [
      [1.05, 1.7, 0.32, 0], [2.5, 2.15, 0.38, 1], [4.2, 1.55, 0.28, 2], [5.4, 1.95, 0.34, 0],
      [7.0, 2.35, 0.4, 1], [8.3, 1.65, 0.3, 2], [10.1, 2.05, 0.36, 0], [11.4, 1.8, 0.33, 1],
      [13.1, 2.25, 0.39, 2], [14.6, 1.6, 0.29, 0], [15.8, 2.0, 0.35, 1], [17.5, 1.75, 0.31, 2],
      [19.0, 2.2, 0.37, 0], [20.2, 1.5, 0.27, 1],
    ];
    for (const [x, height, radius, kind] of front) addThuja(x, rowY, height, radius, kind);
    // За линией отката ворот, на газоне западнее плитки заезда.
    const behindGate = [
      [-12.55, 22.0, 1.55, 0.28, 2],
      [-13.95, 22.0, 1.9, 0.34, 1],
    ];
    for (const [x, y, height, radius, kind] of behindGate) addThuja(x, y, height, radius, kind);
    // Ряд параллельно дорожке, в метре южнее неё и в метре от площадки скважины.
    const behindWell = [
      [-13.8, 18.38, 2.1, 0.36, 0],
      [-12.25, 18.38, 1.85, 0.33, 1],
      [-10.7, 18.38, 2.2, 0.37, 2],
    ];
    for (const [x, y, height, radius, kind] of behindWell) addThuja(x, y, height, radius, kind);
    // Пара у северного забора за септиком.
    const bySeptic = [
      [27.6, 22.05, 1.7, 0.3, 2],
      [29.9, 22.05, 2.05, 0.35, 0],
    ];
    for (const [x, y, height, radius, kind] of bySeptic) addThuja(x, y, height, radius, kind);
    // За баней, посередине между стеной и забором. Высокая в углу, две ниже вдоль заборов.
    const behindBath = [
      [36.51, -8.3, 3.4, 0.42, 1],
      [36.554, -6.5, 2.05, 0.28, 0],
      [34.74, -8.597, 1.2, 0.2, 2],
    ];
    for (const [x, y, height, radius, kind] of behindBath) addThuja(x, y, height, radius, kind);
  }

  v2House = new THREE.Group();
  variant2Group.add(v2House);
  bucket = v2House;

  const ext = 0.38;
  const door = (u0, u1) => ({ u0, u1, z0: 0, z1: 2.15 });
  const doorV = (v0, v1) => ({ v0, v1, z0: 0, z1: 2.15 });
  const win = (u0, u1, z0 = 0.25, z1 = 2.15) => ({ u0, u1, z0, z1 });
  const winV = (v0, v1, z0 = 0.25, z1 = 2.15) => ({ v0, v1, z0, z1 });
  const footUV = [
    [-0.19, 3.4], [-0.19, 13.96], [4.93, 13.96], [4.93, 16.22], [9.65, 16.22], [9.65, 13.96],
    [18.22, 13.96], [18.22, 3.4], [14.23, 3.4], [14.23, 0], [7.11, 0], [7.11, 3.4],
  ];
  const foot = footUV.map((p, i) => {
    const prev = footUV[(i + footUV.length - 1) % footUV.length];
    const next = footUV[(i + 1) % footUV.length];
    const outward = (a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      return [-dy / len, dx / len];
    };
    const n1 = outward(prev, p);
    const n2 = outward(p, next);
    const ledge = 0.04;
    return v2p(p[0] + (n1[0] + n2[0]) * ledge, p[1] + (n1[1] + n2[1]) * ledge);
  });
  addSlab(foot, 0.07, V2_PLINTH - 0.07, plinthColor, true);
  const blind = [
    [-1.19, 2.4], [-1.19, 14.96], [3.93, 14.96], [3.93, 17.22], [10.65, 17.22], [10.65, 14.96],
    [19.22, 14.96], [19.22, 2.4], [15.23, 2.4], [15.23, -1], [6.11, -1], [6.11, 2.4],
  ].map(([u, v]) => v2p(u, v));
  const holeUV = footUV.map((p, i) => {
    const prev = footUV[(i + footUV.length - 1) % footUV.length];
    const next = footUV[(i + 1) % footUV.length];
    const outward = (a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      return [-dy / len, dx / len];
    };
    const n1 = outward(prev, p);
    const n2 = outward(p, next);
    const tuck = 0.01;
    return v2p(p[0] + (n1[0] + n2[0]) * tuck, p[1] + (n1[1] + n2[1]) * tuck);
  });
  addSlabHole(blind, holeUV, 0.04, 0.02, 0xd4cfc4);
  const roadNear = fenceY + 13;
  addSlab(
    [[driveWest, fenceY - 0.25], [driveEast, fenceY - 0.25], [driveEast, roadNear], [driveWest, roadNear]],
    0.03, 0.035, 0xe6d3b0, false
  );
  const { gx0, gx1, gy0 } = garageBox;
  // Плитка доходит до наружного края серой отмостки гаража (1 м по периметру).
  const yard = [
    [21.37, 17.64], [16.25, 17.64], [16.25, 19.9], [9.49, 19.9], [9.49, 17.64], [0.92, 17.64],
    [0.92, gy0 - 1 + 0.02], [gx1 + 1 - 0.02, gy0 - 1 + 0.02], [gx1 + 1 - 0.02, gy1 + 1 - 0.02], [driveWest, gy1 + 1 - 0.02],
    [driveWest, fenceY - 0.25], [driveEast, fenceY - 0.25],
    [driveEast, fenceY - grass], [21.37, fenceY - grass],
  ];
  addSlab(yard, 0.03, 0.035, 0xe6d3b0, false);
  addSlab([
    v2p(-0.13, 13.9), v2p(18.16, 13.9), v2p(18.16, 3.46), v2p(14.07, 3.46),
    v2p(14.07, 2.51), v2p(7.32, 2.51), v2p(7.32, 3.46), v2p(-0.13, 3.46),
  ], V2_PLINTH + 0.02, 0.08, 0xf3efe6, false);
  addSlab([v2p(4.93, 16.22), v2p(9.65, 16.22), v2p(9.65, 13.9), v2p(4.93, 13.9)], V2_PLINTH + 0.02, 0.16, 0xcfc6b8, false);
  addSlab([v2p(14.23, 2.52), v2p(7.11, 2.52), v2p(7.11, 0), v2p(14.23, 0)], V2_PLINTH + 0.08, 0.1, 0xd7c4a3, false);

  v2wallU(0, 3.59, 13.77, ext, [
    winV(5.15, 6.55),
    winV(8.55, 9.35, 1.35, 2.15),
    winV(11.15, 12.45),
  ], 3.14, V2_BRICK);
  v2wallU(18.03, 3.59, 13.77, ext, [winV(8.55, 9.35, 1.35, 2.15)], 3.14, V2_BRICK);
  v2wallV(3.59, -0.19, 7.26, ext, [win(1.2, 2.85), win(4.7, 6.35)], 3.14, V2_BRICK);
  v2wallV(3.59, 13.75, 18.22, ext, [win(15.05, 16.85)], 3.14, V2_BRICK);
  v2wallV(2.64, 7.26, 14.13, ext, [
    { u0: 8.15, u1: 10.05, z0: 0, z1: 3.14, open: true },
    { u0: 11.2, u1: 13.15, z0: 0, z1: 3.14, open: true },
  ], 3.14, V2_BRICK);
  // Двери до верха обычных рам, кирпичная перемычка, выше неё окно до второго света.
  const doorHead = 2.15;
  const lintelTop = 2.31;
  for (const [a, b, c, d] of [[8.15, 9.08, 9.12, 10.05], [11.2, 12.15, 12.19, 13.15]]) {
    v2winY(2.64, a, b, 0, doorHead);
    v2winY(2.64, c, d, 0, doorHead);
    v2box(b, 2.45, c, 2.83, -0.05, doorHead, V2_BRICK);
    v2box(a, 2.45, d, 2.83, doorHead, lintelTop, V2_BRICK);
  }
  v2wallV(13.77, -0.19, 18.22, ext, [
    win(1.1, 2.9),
    door(5.75, 6.85),
    door(7.985, 9.085),
    win(11.05, 12.45),
    win(14.85, 15.9),
  ], 3.14, V2_BRICK);

  // Ванная 2,30×1,91: восточная грань 0,19, западная 2,49, южная 8,02, северная 9,93.
  // Дверь только в западной стене, в холл. Юг в детскую и север в кабинет глухие.
  v2wallU(3.69, 3.76, 7.95, 0.16, [], 2.7, V2_PART);
  v2wallV(7.95, 0.17, 7.45, 0.14, [door(2.75, 3.51), door(3.872, 4.672)], 2.7, V2_PART);
  v2wallU(2.57, 7.95, 10.01, 0.16, [doorV(9.13, 9.83)], 2.7, V2_PART);
  const gap = (u0, u1) => ({ u0, u1, z0: 0, z1: 2.7, open: true });
  // Юг прихожей открыт в зал: по прямой от входной двери стены нет.
  v2wallV(10.01, 0.17, 5.42, 0.16, [door(2.70, 3.33)], 2.7, V2_PART);
  v2wallV(10.01, 7.26, 9.63, 0.16, [], 2.7, V2_PART);
  v2wallU(3.51, 10.01, 13.60, 0.16, [], 2.7, V2_PART);
  v2wallU(5.34, 10.01, 13.60, 0.16, [doorV(11.40, 12.20)], 2.7, V2_PART);
  v2wallU(7.45, 2.45, 3.59, ext, [], 3.14, V2_BRICK);
  v2wallU(7.45, 3.59, 13.60, ext, [
    { v0: 8.02, v1: 9.93, z0: 0, z1: 2.7, open: true },
    doorV(11.34, 12.14),
  ], 2.7, V2_PART);
  v2wallU(9.55, 9.93, 13.60, 0.16, [], 2.7, V2_PART);
  // Западный гардероб: у входа проёмы в спальню и санузел, окно отделено стеной.
  v2wallU(13.94, 2.45, 3.59, ext, [], 3.14, V2_BRICK);
  v2wallU(13.94, 3.59, 13.60, ext, [doorV(8.28, 9.12), doorV(12.22, 13.02)], 2.7, V2_PART);
  v2wallU(15.35, 7.73, 10.02, 0.16, [], 2.7, V2_PART);
  v2wallV(7.73, 14.13, 17.86, 0.12, [gap(14.13, 15.27), door(16.11, 17.01)], 2.7, V2_PART);
  v2wallV(10.02, 14.13, 17.86, 0.12, [door(14.23, 15.03)], 2.7, V2_PART);
  v2wallV(12.06, 14.13, 17.86, 0.12, [], 2.7, V2_PART);

  for (const u of [7.3, 14.05]) v2box(u - 0.14, 0.05, u + 0.14, 0.33, 0.18, 2.95, 0x6b5344);
  v2box(10.56, 0.05, 10.84, 0.33, 0.18, 5.05, 0x6b5344);
  for (const u of [5.25, 9.35]) v2box(u - 0.16, 15.7, u + 0.16, 16.05, 0.16, 2.85, 0x6b5344);
  const stepN = 3;
  const stepGround = 0.05;
  const stepTop = V2_PLINTH + 0.18;
  const stepRise = (stepTop - stepGround) / stepN;
  const tread = 0.3;
  for (let i = 0; i < stepN; i++) {
    const top = stepGround + (i + 1) * stepRise;
    const vNear = 16.2 + (stepN - 1 - i) * tread;
    const vFar = vNear + tread;
    v2box(5.45, vNear, 7.15, vFar, stepGround - V2_PLINTH, top - V2_PLINTH, 0xcfc6b8);
  }

  const eave = 3.14;
  const ridge = 5.703;
  const bite = 0.08;
  asRoof(v2box(-0.19 + ext - bite, 3.4 + ext - bite, 18.22 - ext + bite, 13.96 - ext + bite, 2.7, 2.88, 0xe4ddd0));
  const u0 = -0.69;
  const u1 = 18.53;
  const v0 = 3.04;
  const v1 = 14.27;
  const half = (v1 - v0) / 2;
  const ru0 = u0 + half;
  const ru1 = u1 - half;
  const rv = (v0 + v1) / 2;
  // Вальма: скаты — трапеции на весь карниз, иначе по углам остаются дыры.
  v2roof([
    [[u0, v0, eave], [u1, v0, eave], [ru1, rv, ridge]],
    [[u0, v0, eave], [ru1, rv, ridge], [ru0, rv, ridge]],
    [[u0, v1, eave], [ru0, rv, ridge], [ru1, rv, ridge]],
    [[u0, v1, eave], [ru1, rv, ridge], [u1, v1, eave]],
    [[u0, v0, eave], [ru0, rv, ridge], [u0, v1, eave]],
    [[u1, v1, eave], [ru1, rv, ridge], [u1, v0, eave]],
  ]);
  // Южный фронтон. Конёк 5,499 доведён до наружных столбов террасы, задняя кромка лежит на южном скате.
  const gp = 5.499;
  const gu = 10.7;
  const gf = -0.45;
  const gL = 7.15;
  const gR = 14.25;
  const vMeet = v0 + ((gp - eave) / (ridge - eave)) * (rv - v0);
  const gableTris = [
    [[gL, gf, eave], [gu, gf, gp], [gu, vMeet, gp]],
    [[gL, gf, eave], [gu, vMeet, gp], [gL, v0, eave]],
    [[gR, gf, eave], [gu, vMeet, gp], [gu, gf, gp]],
    [[gR, gf, eave], [gR, v0, eave], [gu, vMeet, gp]],
  ];
  const roofDrop = 0.45;
  v2shell(gableTris, roofDrop);
  const soffitAt = (u) => {
    const rise = gp - eave;
    const zTop = u <= gu
      ? eave + rise * ((u - gL) / (gu - gL))
      : eave + rise * ((gR - u) / (gR - gu));
    return zTop - roofDrop;
  };
  const bayV = 2.64;
  const bayT = ext;
  const head = 3.14;
  const slopeWall = (u0, u1) => {
    const z0 = soffitAt(u0);
    const z1 = soffitAt(u1);
    if (z0 < head + 0.04 && z1 < head + 0.04) return;
    const a = Math.max(z0, head);
    const b = Math.max(z1, head);
    const va = bayV - bayT / 2;
    const vb = bayV + bayT / 2;
    const quad = (p, q, r, s) => [[p, q, r], [p, r, s]];
    v2solid([
      ...quad([u0, va, head], [u1, va, head], [u1, va, b], [u0, va, a]),
      ...quad([u0, vb, head], [u1, vb, b], [u1, vb, head], [u0, vb, a]),
      ...quad([u0, va, head], [u0, vb, head], [u0, vb, a], [u0, va, a]),
      ...quad([u1, va, head], [u1, va, b], [u1, vb, b], [u1, vb, head]),
      ...quad([u0, va, a], [u0, vb, a], [u1, vb, b], [u1, va, b]),
    ], V2_BRICK);
  };
  const slopeFrame = (u0, u1) => {
    const fw = 0.07;
    const va = bayV - 0.112;
    const vb = bayV + 0.112;
    const zL = soffitAt(u0);
    const zR = soffitAt(u1);
    const quad = (p, q, r, s) => [[p, q, r], [p, r, s]];
    // Боковые стойки идут от перемычки до ската: прямоугольник и треугольник — одна рама.
    if (zL > lintelTop + 0.02) v2box(u0, va, u0 + fw, vb, lintelTop, zL, 0x6b3e24);
    if (zR > lintelTop + 0.02) v2box(u1 - fw, va, u1, vb, lintelTop, zR, 0x6b3e24);
    v2solid([
      ...quad([u0, va, zL], [u1, va, zR], [u1, va, zR - fw], [u0, va, zL - fw]),
      ...quad([u0, vb, zL], [u0, vb, zL - fw], [u1, vb, zR - fw], [u1, vb, zR]),
      ...quad([u0, va, zL], [u0, vb, zL], [u1, vb, zR], [u1, va, zR]),
      ...quad([u0, va, zL - fw], [u1, va, zR - fw], [u1, vb, zR - fw], [u0, vb, zL - fw]),
      ...quad([u0, va, zL], [u0, va, zL - fw], [u0, vb, zL - fw], [u0, vb, zL]),
      ...quad([u1, va, zR], [u1, vb, zR], [u1, vb, zR - fw], [u1, va, zR - fw]),
    ], 0x6b3e24);
    const g0 = u0 + fw + 0.015;
    const g1 = u1 - fw - 0.015;
    const gv = bayV - 0.03;
    const gBot = lintelTop + 0.02;
    v2glass([
      [[g0, gv, gBot], [g1, gv, gBot], [g1, gv, soffitAt(g1) - fw - 0.01]],
      [[g0, gv, gBot], [g1, gv, soffitAt(g1) - fw - 0.01], [g0, gv, soffitAt(g0) - fw - 0.01]],
    ]);
  };
  slopeWall(7.83, 8.15);
  slopeFrame(8.15, 10.05);
  slopeWall(10.05, 10.7);
  slopeWall(10.7, 11.2);
  slopeFrame(11.2, 13.15);
  slopeWall(13.15, 13.57);
  // Крыльцо: скат от карниза у улицы до пересечения с северным скатом основной крыши.
  const pp = 4.596;
  const pu = 7.3;
  const pL = 4.7;
  const pR = 9.9;
  const pFront = 16.5;
  const zMain = (v) => eave + (ridge - eave) * ((v1 - v) / (v1 - rv));
  const vMeetN = v1 - ((pp - eave) / (ridge - eave)) * (v1 - rv);
  const vJoin = vMeetN - 0.08;
  const zJoin = zMain(vJoin);
  v2shell([
    [[pL, pFront, eave], [pu, pFront, eave], [pu, vJoin, zJoin]],
    [[pL, pFront, eave], [pu, vJoin, zJoin], [pL, v1, eave]],
    [[pR, pFront, eave], [pu, vJoin, zJoin], [pu, pFront, eave]],
    [[pR, pFront, eave], [pR, v1, eave], [pu, vJoin, zJoin]],
  ], roofDrop);

  // Карниз по периметру: доска от 2,69 до 3,14, жёлоб снаружи и водостоки по углам.
  const fasciaLo = 2.69;
  const board = 0.12;
  const gutterW = 0.14;
  const gutterC = 0x2a2826;
  const eaveBand = (ua, va, ub, vb, z0, z1, color) => asRoof(v2box(ua, va, ub, vb, z0, z1, color));
  const soffitHi = fasciaLo + 0.05;
  const gutterLo = fasciaLo - 0.1;
  const gutterHi = fasciaLo + 0.04;
  eaveBand(u0, v0 - board, gL, v0, fasciaLo, eave, V2_ROOF);
  eaveBand(gR, v0 - board, u1, v0, fasciaLo, eave, V2_ROOF);
  eaveBand(u0 - board, v0, u0, v1, fasciaLo, eave, V2_ROOF);
  eaveBand(u1, v0, u1 + board, v1, fasciaLo, eave, V2_ROOF);
  eaveBand(u0, v1, pL, v1 + board, fasciaLo, eave, V2_ROOF);
  eaveBand(pR, v1, u1, v1 + board, fasciaLo, eave, V2_ROOF);
  eaveBand(u0, v0, gL, 3.4, fasciaLo, soffitHi, V2_ROOF);
  eaveBand(gR, v0, u1, 3.4, fasciaLo, soffitHi, V2_ROOF);
  eaveBand(u0, v0, -0.19, v1, fasciaLo, soffitHi, V2_ROOF);
  eaveBand(18.22, v0, u1, v1, fasciaLo, soffitHi, V2_ROOF);
  eaveBand(u0, 13.96, pL, v1, fasciaLo, soffitHi, V2_ROOF);
  eaveBand(pR, 13.96, u1, v1, fasciaLo, soffitHi, V2_ROOF);
  eaveBand(u0, v0 - board - gutterW, gL, v0 - board, gutterLo, gutterHi, gutterC);
  eaveBand(gR, v0 - board - gutterW, u1, v0 - board, gutterLo, gutterHi, gutterC);
  eaveBand(u0 - board - gutterW, v0, u0 - board, v1, gutterLo, gutterHi, gutterC);
  eaveBand(u1 + board, v0, u1 + board + gutterW, v1, gutterLo, gutterHi, gutterC);
  eaveBand(u0, v1 + board, pL, v1 + board + gutterW, gutterLo, gutterHi, gutterC);
  eaveBand(pR, v1 + board, u1, v1 + board + gutterW, gutterLo, gutterHi, gutterC);
  eaveBand(pL, pFront, pR, pFront + gutterW, gutterLo, gutterHi, gutterC);
  const gout = board + gutterW;
  eaveBand(u0 - gout, v0 - gout, u0 - board, v0 - board, gutterLo, gutterHi, gutterC);
  eaveBand(u1 + board, v0 - gout, u1 + gout, v0 - board, gutterLo, gutterHi, gutterC);
  eaveBand(u0 - gout, v1 + board, u0 - board, v1 + gout, gutterLo, gutterHi, gutterC);
  eaveBand(u1 + board, v1 + board, u1 + gout, v1 + gout, gutterLo, gutterHi, gutterC);
  const pipe = 0.07;
  const uvWorld = (u, v, z) => {
    const [e, n] = planToWorld(V2_XE - u, V2_YS + v);
    return [e, z + V2_PLINTH, n];
  };
  // С угла карниза по биссектрисе к углу стены, вниз по углу и отлив наружу по той же биссектрисе.
  const spout = (gu, gv, wu, wv, zTop = gutterLo + 0.03) => {
    const zBend = fasciaLo - 0.22;
    const zWallBot = 0.12;
    const beam = (ua, va, za, ub, vb, zb) => asRoof(addBeam(
      uvWorld(ua, va, za), uvWorld(ub, vb, zb), pipe, gutterC
    ));
    beam(gu, gv, zBend, gu, gv, zTop);
    beam(gu, gv, zBend, wu, wv, zBend);
    beam(wu, wv, zWallBot, wu, wv, zBend);
    const ox = gu - wu;
    const oy = gv - wv;
    const len = Math.hypot(ox, oy) || 1;
    const kick = 0.2;
    const ku = wu + (ox / len) * kick;
    const kv = wv + (oy / len) * kick;
    beam(wu, wv, zWallBot, ku, kv, 0.02);
    beam(ku, kv, -0.1, ku, kv, 0.08);
  };
  const gMid = board + gutterW / 2;
  spout(u0 - gMid, v0 - gMid, -0.19 - 0.05, 3.4 - 0.05);
  spout(u1 + gMid, v0 - gMid, 18.22 + 0.05, 3.4 - 0.05);
  spout(u0 - gMid, v1 + gMid, -0.19 - 0.05, 13.96 + 0.05);
  spout(u1 + gMid, v1 + gMid, 18.22 + 0.05, 13.96 + 0.05);
  const pv = pFront + gutterW / 2;
  const porchClear = 0.12;
  spout(pL + pipe / 2, pv, 4.93 - porchClear, 16.22 + porchClear);
  spout(pR - pipe / 2, pv, 9.65 + porchClear, 16.22 + porchClear);
  // Углы кровли террасы: от кромки крыши к наружным столбам, без жёлоба по их линии.
  const terraceTop = fasciaLo - pipe / 2 + 0.02;
  spout(gL - pipe / 2, gf - pipe / 2, 7.16 - 0.06, 0.05 - 0.06, terraceTop);
  spout(gR + pipe / 2, gf - pipe / 2, 14.19 + 0.06, 0.05 - 0.06, terraceTop);

  // Подписи и пунктир границ на полу. Прямоугольник — чистый размер между гранями стен.
  addFloorNotes([
    ["Детская-1", 0.19, 3.78, 3.61, 7.88, 0.4],
    ["Детская-2", 3.77, 3.78, 7.3, 7.88, 0.4],
    ["Ванная", 0.19, 8.02, 2.49, 9.93, 0.4],
    ["Холл", 2.65, 8.02, 7.3, 9.93, 0.4],
    ["Кабинет", 0.19, 10.09, 3.43, 13.58, 0.4],
    ["Гардероб", 3.59, 10.09, 5.26, 13.58, 0.4],
    ["Прихожая", 5.42, 10.09, 7.3, 13.58, 0.4],
    ["Котельная", 7.6, 10.09, 9.47, 13.58, 0.4],
    ["Кухня", 9.63, 10.09, 13.79, 13.58, 0.4],
    ["Гостиная", 7.6, 2.83, 13.79, 9.93, 0.4],
    ["Терраса", 7.11, 0, 14.23, 2.45, 0.48],
    ["Мастер-спальня", 14.09, 3.78, 17.84, 7.67, 0.4],
    ["Гардероб", 14.09, 7.79, 15.27, 9.96, 0.4],
    ["Гардероб", 15.43, 7.79, 17.84, 9.96, 0.4],
    ["С/у", 14.09, 10.08, 17.84, 12, 0.4],
    ["Кладовая", 14.09, 12.12, 17.84, 13.58, 0.4],
    ["Крыльцо", 4.93, 13.96, 9.65, 16.22, 0.48],
  ].map(([name, u0, v0, u1, v1, floorY]) => [name, V2_XE - u1, V2_YS + v0, V2_XE - u0, V2_YS + v1, floorY]));

  bucket = variant2Group;
  const houseWest = V2_XE - 18.22;
  const porchNorth = V2_YS + 16.22;
  const porchX = V2_XE - (4.93 + 9.65) / 2;
  const { gx0: gWest, gx1: gEast, gy0: gSouth, gy1: gNorth } = garageBox;
  const metres = (n) => `${n.toFixed(2).replace(".", ",")} м`;
  const footOn = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax;
    const aby = by - ay;
    const t = ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby);
    return [ax + t * abx, ay + t * aby];
  };
  const [westX, westY] = footOn(gWest, gSouth, -18, 22.877, -12.963, -4.345);
  const hatch = [29.823 - 0.3586313514065793, 19.178 - 0.06642232612109211];
  const [septicX, septicY] = footOn(hatch[0], hatch[1], 32.835, 22.877, 39.044, -10.647);
  addSiteDim(gEast, 11.5, houseWest, 11.5, "6,00 м", 1);
  addSiteDim(porchX, porchNorth, porchX, fenceY, "4,00 м", -1);
  addSiteDim(gWest - 0.35, gNorth, gWest - 0.35, fenceY, "7,00 м", 1);
  addSiteDim(driveWest, 24, driveEast, 24, "9,93 м", 1);
  addSiteDim(wellE, wellN, wellE, fenceY, "3,00 м", -1, 1.05);
  addSiteDim(wellE, wellN, gWest, gNorth, metres(Math.hypot(wellE - gWest, wellN - gNorth)), -1);
  addSiteDim(hatch[0], hatch[1], septicX, septicY, "4,00 м", -1, 0.7);
  addSiteDim(hatch[0], hatch[1], hatch[0], fenceY, metres(fenceY - hatch[1]), 1, 0.7);
  addSiteDim(gWest, gSouth, westX, westY, metres(Math.hypot(gWest - westX, gSouth - westY)), 1, 0.7);
  bucket = v2House;
  const southWall = [V2_XE - 14.23, V2_YS];
  const [southFx, southFy] = footOn(southWall[0], southWall[1], 39.044, -10.647, -12.963, -4.345);
  addSiteDim(
    southWall[0], southWall[1], southFx, southFy,
    metres(Math.hypot(southFx - southWall[0], southFy - southWall[1])),
    -1, 0.7
  );
  bucket = variant2Group;
  const bathNE = [V2_XE - -14.7, V2_YS - 1.74];
  const [bathEx, bathEy] = footOn(bathNE[0], bathNE[1], 32.835, 22.877, 39.044, -10.647);
  addSiteDim(
    bathNE[0], bathNE[1], bathEx, bathEy,
    metres(Math.hypot(bathEx - bathNE[0], bathEy - bathNE[1])),
    1, 0.55
  );
  const bathSW = [V2_XE - -7.7, V2_YS - 9.74];
  const [bathSx, bathSy] = footOn(bathSW[0], bathSW[1], 39.044, -10.647, -12.963, -4.345);
  addSiteDim(
    bathSW[0], bathSW[1], bathSx, bathSy,
    metres(Math.hypot(bathSx - bathSW[0], bathSy - bathSW[1])),
    -1, 0.55
  );
  addBath();
}

function addDreamHouse(group, site) {
  // Одноэтажный дом 13,37 × 17,15. Терраса на юго-востоке под общей вальмой.
  // Цоколь 0,45 м. Стены 3,00 м от пола. Окна жилых 0,80–2,20 м, ванных 1,50–2,20 м.
  // Конёк вдоль север–юг, уклон 22°, свес 0,60 м. Крыльцо 4 × 2 м, двускатный козырёк.
  bucket = group;
  const P = 0.45;
  const wallTop = P + 3.0;
  const partTop = P + 2.7;
  const doorTop = P + 2.1;
  const sill = P + 0.8;
  const head = P + 2.2;
  const lowSill = P + 0.4;
  const bathSill = P + 1.5;
  const masterSill = P + 0.7;
  const ext = 0.38;
  const part = 0.16;
  const uE = 5.04;
  const uW = 18.03;
  const vS = -0.74;
  const vN = 16.03;
  const vT = 3.57;
  const uT = 9.53;
  const uWallE = uE - ext / 2;
  const uWallW = uW + ext / 2;
  const vWallS = vS - ext / 2;
  const vWallN = vN + ext / 2;
  const porchW = 4;
  const porchOut = 2;
  const doorC = (12.13 + 13.13) / 2;
  const stairL = doorC - porchW / 2;
  const stairR = doorC + porchW / 2;
  const vFace = vWallN + porchOut;
  const board = 0.12;
  const gutterW = 0.14;
  const pL = stairL + board;
  const pR = stairR - board;
  const pFront = vFace - board;
  const box = (u0, v0, u1, v1, z0, z1, color, cast = true) => {
    let pts = [site(u0, v0), site(u1, v0), site(u1, v1), site(u0, v1)];
    const area = pts[0][0] * (pts[1][1] - pts[3][1])
      + pts[1][0] * (pts[2][1] - pts[0][1])
      + pts[2][0] * (pts[3][1] - pts[1][1])
      + pts[3][0] * (pts[0][1] - pts[2][1]);
    if (area > 0) pts = [pts[0], pts[3], pts[2], pts[1]];
    return planBox(pts, z0, z1, color, cast);
  };
  const glassOf = (mesh) => {
    mesh.material.transparent = true;
    mesh.material.opacity = 0.28;
    mesh.material.depthWrite = false;
    mesh.castShadow = false;
    return mesh;
  };
  const winOn = (u0, v0, u1, v1, z0, z1, withSill) => {
    const a = site(u0, v0);
    const b = site(u1, v1);
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    if (y1 - y0 >= x1 - x0) {
      const x = (a[0] + b[0]) / 2;
      addOpeningFrame(x - 0.12, x + 0.12, y0, y1, z0, z1, withSill);
    } else {
      const y = (a[1] + b[1]) / 2;
      addOpeningFrame(x0, x1, y - 0.12, y + 0.12, z0, z1, withSill);
    }
  };
  const winX = (u, v0, v1, z0, z1, withSill) => {
    winOn(u, v0, u, v1, z0, z1, withSill);
    glassOf(box(u - 0.02, Math.min(v0, v1), u + 0.02, Math.max(v0, v1), z0, z1, 0xb7d4e4, false));
  };
  const winY = (v, u0, u1, z0, z1, withSill) => {
    winOn(u0, v, u1, v, z0, z1, withSill);
    glassOf(box(Math.min(u0, u1), v - 0.02, Math.max(u0, u1), v + 0.02, z0, z1, 0xb7d4e4, false));
  };
  const wallU = (u, v0, v1, thick, holes, zTop, color) => {
    const a = u - thick / 2;
    const b = u + thick / 2;
    const list = holes.slice().sort((p, q) => p.v0 - q.v0);
    let v = Math.min(v0, v1);
    const vEnd = Math.max(v0, v1);
    for (const h of list) {
      if (h.v0 > v + 0.02) box(a, v, b, h.v0, P - 0.04, zTop, color);
      if (h.z0 > P + 0.02) box(a, h.v0, b, h.v1, P - 0.04, h.z0, color);
      if (zTop > h.z1 + 0.02) box(a, h.v0, b, h.v1, h.z1, zTop, color);
      if (!h.open) winX(u, h.v0, h.v1, h.z0, h.z1, h.z0 > P + 0.25);
      v = Math.max(v, h.v1);
    }
    if (vEnd > v + 0.02) box(a, v, b, vEnd, P - 0.04, zTop, color);
  };
  const wallV = (v, u0, u1, thick, holes, zTop, color) => {
    const a = v - thick / 2;
    const b = v + thick / 2;
    const list = holes.slice().sort((p, q) => p.u0 - q.u0);
    let u = Math.min(u0, u1);
    const uEnd = Math.max(u0, u1);
    for (const h of list) {
      if (h.u0 > u + 0.02) box(u, a, h.u0, b, P - 0.04, zTop, color);
      if (h.z0 > P + 0.02) box(h.u0, a, h.u1, b, P - 0.04, h.z0, color);
      if (zTop > h.z1 + 0.02) box(h.u0, a, h.u1, b, h.z1, zTop, color);
      if (!h.open) winY(v, h.u0, h.u1, h.z0, h.z1, h.z0 > P + 0.25);
      u = Math.max(u, h.u1);
    }
    if (uEnd > u + 0.02) box(u, a, uEnd, b, P - 0.04, zTop, color);
  };
  const holeV = (v0, v1, z0, z1, open = false) => ({ v0, v1, z0, z1, open });
  const holeU = (u0, u1, z0, z1, open = false) => ({ u0, u1, z0, z1, open });
  const doorV = (v0, v1) => holeV(v0, v1, P, doorTop);
  const doorU = (u0, u1) => holeU(u0, u1, P, doorTop);
  const winLiveV = (v0, v1, z0 = sill) => holeV(v0, v1, z0, head);
  const winLiveU = (u0, u1, z0 = sill) => holeU(u0, u1, z0, head);

  const quad = (u0, v0, u1, v1) => [site(u0, v0), site(u1, v0), site(u1, v1), site(u0, v1)];
  const blindOuter = [
    site(uWallE - 1, vWallS - 1),
    site(uWallW + 1, vWallS - 1),
    site(uWallW + 1, vWallN + 1),
    site(stairR + 1, vWallN + 1),
    site(stairR + 1, vFace + 1),
    site(stairL - 1, vFace + 1),
    site(stairL - 1, vWallN + 1),
    site(uWallE - 1, vWallN + 1),
  ];
  const blindHole = [
    site(uWallE, vWallS),
    site(uWallW, vWallS),
    site(uWallW, vWallN),
    site(stairR, vWallN),
    site(stairR, vFace),
    site(stairL, vFace),
    site(stairL, vWallN),
    site(uWallE, vWallN),
  ];
  addSlabHole(blindOuter, blindHole, 0.02, 0.045, 0xd4cfc4);
  addSlab(quad(uWallE, vWallS, uWallW, vWallN), 0.06, 0.39, 0xb7b2a8, true);
  addSlab(quad(uWallE, vWallS, uWallW, vWallN), 0.45, 0.02, 0xf7f4ee, false);
  addSlab(quad(uWallE, vWallS, uT, vT), 0.47, 0.035, 0xd7c4a3, false);

  // Несущие доведены до наружной грани пересекаемой стены: угол получается сплошным.
  const extHalf = ext / 2;
  const uBear = 11.4;
  wallU(uE, vT - extHalf, vN + extHalf, ext, [
    winLiveV(5.06, 6.56),
    winLiveV(8.21, 9.71),
    winLiveV(10.04, 11.54),
    winLiveV(12.94, 14.44),
  ], wallTop, V2_BRICK);
  wallU(uW, vS - extHalf, vN + extHalf, ext, [
    holeV(0.22, 0.81, P + 1.4, P + 2.0),
    holeV(2.18, 3.17, bathSill, head),
    winLiveV(4.48, 5.98),
    winLiveV(8.84, 9.84),
    holeV(11.52, 12.52, bathSill, head),
    holeV(13.09, 14.08, bathSill, head),
  ], wallTop, V2_BRICK);
  wallV(vN, uE - extHalf, uW + extHalf, ext, [
    winLiveU(6.38, 7.88),
    holeU(9.89, 10.49, bathSill, head),
    doorU(12.13, 13.13),
  ], wallTop, V2_BRICK);
  wallV(vS, uT - extHalf, uW + extHalf, ext, [winLiveU(10.89, 12.39, masterSill)], wallTop, V2_BRICK);
  wallU(uT, vS - extHalf, vT + extHalf, ext, [], wallTop, V2_BRICK);
  // Поперечная несущая продолжается внутрь дома до продольной стены.
  wallV(vT, uE - extHalf, uBear + extHalf, ext, [
    holeU(5.2, 6.7, lowSill, head),
    doorU(6.88, 7.87),
    holeU(8.05, 8.9, lowSill, head),
  ], wallTop, V2_BRICK);
  // Продольная несущая внутри дома, проход между залом и прихожей.
  wallU(uBear, vT - extHalf, 9.13, ext, [], wallTop, V2_BRICK);
  wallU(uBear, 10.61, vN + extHalf, ext, [], wallTop, V2_BRICK);

  wallU(9.16, 10.7, 15.9, part, [doorV(10.85, 11.65)], partTop, V2_PART);
  wallV(10.66, 9.08, 11.47, part, [], partTop, V2_PART);
  wallV(3.5, uBear + extHalf, 13.21, part, [doorU(11.74, 12.54)], partTop, V2_PART);
  wallV(3.5, 13.21, 18.03, part, [], partTop, V2_PART);
  wallU(13.21, 3.5, 9.23, part, [doorV(6.05, 6.85)], partTop, V2_PART);
  wallV(9.235, 13.13, 13.8, part, [], partTop, V2_PART);
  wallV(7.12, 13.21, 17.9, part, [], partTop, V2_PART);
  wallU(13.72, 9.23, 15.9, part, [
    doorV(9.44, 10.24),
    doorV(11.76, 12.56),
    doorV(13.89, 14.69),
  ], partTop, V2_PART);
  wallU(13.75, -0.6, 3.4, part, [doorV(0.08, 0.88), doorV(2.48, 3.28)], partTop, V2_PART);
  wallV(1.35, 13.67, 18.03, part, [], partTop, V2_PART);
  wallV(10.76, 13.8, 17.9, part, [], partTop, V2_PART);
  wallV(12.8, 13.8, 17.9, part, [], partTop, V2_PART);

  const ceil = (ua, va, ub, vb) => asRoof(addSlab(quad(ua, va, ub, vb), partTop, 0.1, 0xe4ddd0, false));
  const open0 = 9.13;
  const open1 = 10.61;
  ceil(uT, vWallS, uWallW, vT - extHalf);
  ceil(uWallE, vT + extHalf, uBear - extHalf, open0);
  ceil(uBear + extHalf, vT + extHalf, uWallW, open0);
  ceil(uWallE, open0, uWallW, open1);
  ceil(uWallE, open1, uBear - extHalf, vWallN);
  ceil(uBear + extHalf, open1, uWallW, vWallN);

  const u0 = 4.25;
  const u1 = 18.82;
  const rv0 = -1.53;
  const rv1 = 16.82;
  const eave = wallTop;
  const half = (u1 - u0) / 2;
  const uR = (u0 + u1) / 2;
  const vA = rv0 + half;
  const vB = rv1 - half;
  const zR = eave + half * Math.tan(22 * Math.PI / 180);
  const lift = ([u, v, z]) => {
    const [x, y] = site(u, v);
    const [e, n] = planToWorld(x, y);
    return [e, z, n];
  };
  const roofTris = [
    [[u0, rv0, eave], [u1, rv0, eave], [uR, vA, zR]],
    [[u0, rv1, eave], [uR, vB, zR], [u1, rv1, eave]],
    [[u0, rv0, eave], [uR, vA, zR], [uR, vB, zR]],
    [[u0, rv0, eave], [uR, vB, zR], [u0, rv1, eave]],
    [[u1, rv0, eave], [u1, rv1, eave], [uR, vB, zR]],
    [[u1, rv0, eave], [uR, vB, zR], [uR, vA, zR]],
  ].map(([a, b, c]) => {
    const A = lift(a);
    const B = lift(b);
    const C = lift(c);
    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    return ny > 0 ? [A, C, B] : [A, B, C];
  });
  const roofMesh = asRoof(addMesh(geometryFromTriangles(roofTris), V2_ROOF));
  roofMesh.material.side = THREE.DoubleSide;
  const uvW = (u, v, z) => {
    const [x, y] = site(u, v);
    const [e, n] = planToWorld(x, y);
    return [e, z, n];
  };
  const shell = (tris, drop) => {
    const raw = [];
    for (const [a, b, c] of tris) {
      const ad = [a[0], a[1], a[2] - drop];
      const bd = [b[0], b[1], b[2] - drop];
      const cd = [c[0], c[1], c[2] - drop];
      raw.push([a, b, c], [ad, cd, bd]);
      for (const [p, q, r, s] of [[a, b, bd, ad], [b, c, cd, bd], [c, a, ad, cd]]) {
        raw.push([p, q, r], [p, r, s]);
      }
    }
    const mapped = raw.map(([a, b, c]) => {
      const A = lift(a);
      const B = lift(b);
      const C = lift(c);
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const ny = ab[2] * ac[0] - ab[0] * ac[2];
      return ny > 0 ? [A, C, B] : [A, B, C];
    });
    const mesh = asRoof(addMesh(geometryFromTriangles(mapped), V2_ROOF));
    mesh.material.side = THREE.DoubleSide;
    return mesh;
  };

  const pu = (pL + pR) / 2;
  const drop = 0.45;
  const fasciaLo = eave - drop;
  const slope = Math.tan(22 * Math.PI / 180);
  const zPeak = eave + ((pR - pL) / 2) * slope;
  const vMeet = rv1 - (zPeak - eave) / slope;
  const vJoin = vMeet - 0.08;
  shell([
    [[pL, pFront, eave], [pu, pFront, zPeak], [pu, vJoin, zPeak]],
    [[pL, pFront, eave], [pu, vJoin, zPeak], [pL, rv1, eave]],
    [[pR, pFront, eave], [pu, vJoin, zPeak], [pu, pFront, zPeak]],
    [[pR, pFront, eave], [pR, rv1, eave], [pu, vJoin, zPeak]],
  ], drop);
  const addRoofTris = (tris, color = V2_ROOF) => {
    const mapped = tris.map(([a, b, c]) => {
      const A = lift(a);
      const B = lift(b);
      const C = lift(c);
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const ny = ab[2] * ac[0] - ab[0] * ac[2];
      return ny > 0 ? [A, C, B] : [A, B, C];
    });
    const mesh = asRoof(addMesh(geometryFromTriangles(mapped), color));
    mesh.material.side = THREE.DoubleSide;
  };
  const rake = (uA, zA, uB, zB) => {
    const va = pFront;
    const vb = pFront + board;
    const quad = (p, q, r, s) => [[p, q, r], [p, r, s]];
    addRoofTris([
      ...quad([uA, va, zA], [uB, va, zB], [uB, vb, zB], [uA, vb, zA]),
      ...quad([uA, va, zA - drop], [uA, vb, zA - drop], [uB, vb, zB - drop], [uB, va, zB - drop]),
      ...quad([uA, vb, zA - drop], [uA, vb, zA], [uB, vb, zB], [uB, vb, zB - drop]),
      ...quad([uA, va, zA], [uA, va, zA - drop], [uB, va, zB - drop], [uB, va, zB]),
      ...quad([uA, va, zA], [uA, vb, zA], [uA, vb, zA - drop], [uA, va, zA - drop]),
      ...quad([uB, vb, zB], [uB, va, zB], [uB, va, zB - drop], [uB, vb, zB - drop]),
    ]);
  };
  rake(pL, eave, pu, zPeak);
  rake(pu, zPeak, pR, eave);
  // Фронтон зашит по внутреннему треугольнику, под ним ровный потолок крыльца.
  const zSoffit = fasciaLo;
  const zIn = zPeak - drop;
  const g0 = pFront - 0.07;
  const g1 = pFront - 0.02;
  const gableQuad = (p, q, r, s) => [[p, q, r], [p, r, s]];
  const ceilT = 0.08;
  const L0 = [pL, g0, zSoffit];
  const K0 = [pu, g0, zIn];
  const R0 = [pR, g0, zSoffit];
  const L1 = [pL, g1, zSoffit];
  const K1 = [pu, g1, zIn];
  const R1 = [pR, g1, zSoffit];
  addRoofTris([
    [L1, K1, R1],
    [L0, R0, K0],
    ...gableQuad(L0, L1, K1, K0),
    ...gableQuad(R1, K1, K0, R0),
    ...gableQuad(L0, R0, R1, L1),
  ], V2_ROOF);
  asRoof(box(stairL + 0.5, vWallN, stairR - 0.5, g0, zSoffit, zSoffit + ceilT, 0xe4ddd0, false));

  const gutterC = 0x2a2826;
  const gutterLo = fasciaLo - 0.1;
  const gutterHi = fasciaLo + 0.04;
  const fascia = (ua, va, ub, vb) => asRoof(box(ua, va, ub, vb, fasciaLo, eave, V2_ROOF));
  const gutter = (ua, va, ub, vb) => asRoof(box(ua, va, ub, vb, gutterLo, gutterHi, gutterC));
  fascia(u0, rv0 - board, u1, rv0);
  fascia(u0, rv1, pL - board, rv1 + board);
  fascia(pR + board, rv1, u1, rv1 + board);
  fascia(u0 - board, rv0, u0, rv1);
  fascia(u1, rv0, u1 + board, rv1);
  fascia(pL - board, rv1, pL, pFront);
  fascia(pR, rv1, pR + board, pFront);
  const gout = board + gutterW;
  gutter(u0, rv0 - board - gutterW, u1, rv0 - board);
  gutter(u0 - board - gutterW, rv0, u0 - board, rv1);
  gutter(u1 + board, rv0, u1 + board + gutterW, rv1);
  gutter(u0, rv1 + board, pL - board, rv1 + board + gutterW);
  gutter(pR + board, rv1 + board, u1, rv1 + board + gutterW);
  gutter(pL - gout, rv1 + board, pL - board, pFront + board);
  gutter(pR + board, rv1 + board, pR + gout, pFront + board);
  gutter(u0 - gout, rv0 - gout, u0 - board, rv0 - board);
  gutter(u1 + board, rv0 - gout, u1 + gout, rv0 - board);
  gutter(u0 - gout, rv1 + board, u0 - board, rv1 + gout);
  gutter(u1 + board, rv1 + board, u1 + gout, rv1 + gout);
  gutter(pL - gout, pFront + board, pL - board, pFront + gout);
  gutter(pR + board, pFront + board, pR + gout, pFront + gout);

  const pipe = 0.07;
  const spout = (gu, gv, wu, wv) => {
    const zTop = gutterLo + 0.03;
    const zBend = fasciaLo - 0.22;
    const zWallBot = P + 0.12;
    const beam = (ua, va, za, ub, vb, zb) => asRoof(addBeam(
      uvW(ua, va, za), uvW(ub, vb, zb), pipe, gutterC
    ));
    beam(gu, gv, zBend, gu, gv, zTop);
    beam(gu, gv, zBend, wu, wv, zBend);
    beam(wu, wv, zWallBot, wu, wv, zBend);
    const ox = gu - wu;
    const oy = gv - wv;
    const len = Math.hypot(ox, oy) || 1;
    const kick = 0.2;
    const ku = wu + (ox / len) * kick;
    const kv = wv + (oy / len) * kick;
    beam(wu, wv, zWallBot, ku, kv, P + 0.02);
    beam(ku, kv, P - 0.1, ku, kv, P + 0.08);
  };
  const gMid = board + gutterW / 2;
  const gap = 0.05;
  spout(u0 - gMid, rv0 - gMid, uWallE - gap, vWallS - gap);
  spout(u1 + gMid, rv0 - gMid, uWallW + gap, vWallS - gap);
  spout(u0 - gMid, rv1 + gMid, uWallE - gap, vWallN + gap);
  spout(u1 + gMid, rv1 + gMid, uWallW + gap, vWallN + gap);
  spout(pL - gMid, vFace + gutterW / 2, stairL + 0.1, vFace - 0.1);
  spout(pR + gMid, vFace + gutterW / 2, stairR - 0.1, vFace - 0.1);

  for (const [u, v] of [[4.95, -0.85], [7.2, -0.85], [4.95, 1.3]]) {
    box(u - 0.2, v - 0.2, u + 0.2, v + 0.2, P, eave - 0.05, 0x6b5344);
  }

  const stepRise = (P - 0.02) / 3;
  const tread = 0.3;
  const inset = 0.1;
  const col = 0.4;
  const cL0 = stairL + inset;
  const cL1 = cL0 + col;
  const cR1 = stairR - inset;
  const cR0 = cR1 - col;
  const cV1 = vFace - inset;
  const cV0 = cV1 - col;
  const treadC = 0xcfc6b8;
  for (let i = 0; i < 3; i++) {
    const z0 = 0.02 + i * stepRise;
    const z1 = i === 2 ? P : z0 + stepRise;
    const v1 = vFace - i * tread;
    if (v1 <= cV0) {
      box(stairL, vWallN, stairR, v1, z0, z1, treadC);
    } else {
      box(stairL, vWallN, stairR, cV0, z0, z1, treadC);
      box(stairL, cV0, cL0, v1, z0, z1, treadC);
      box(cL1, cV0, cR0, v1, z0, z1, treadC);
      box(cR1, cV0, stairR, v1, z0, z1, treadC);
      if (v1 > cV1) {
        box(cL0, cV1, cL1, v1, z0, z1, treadC);
        box(cR0, cV1, cR1, v1, z0, z1, treadC);
      }
    }
  }
  box(cL0, cV0, cL1, cV1, 0, fasciaLo, 0x6b5344);
  box(cR0, cV0, cR1, cV1, 0, fasciaLo, 0x6b5344);

  const rooms = [
    ["Терраса", 4.93, -0.84, 9.46, 3.32],
    ["Мастер-спальня", 9.72, -0.64, 13.69, 3.33],
    ["Гардеробная", 13.87, -0.67, 17.84, 1.28],
    ["Ванная-1", 13.88, 1.43, 17.85, 3.38],
    ["Детская", 13.31, 3.51, 17.79, 6.98],
    ["Кабинет", 13.32, 7.16, 17.82, 10.6],
    ["Зал", 5.19, 3.53, 11.17, 10.53],
    ["Кухня", 5.15, 10.71, 9.12, 15.88],
    ["Кладовая", 9.33, 10.72, 11.28, 15.91],
    ["Прихожая", 11.69, 9.22, 13.64, 15.95],
    ["Ванная-2", 13.8, 10.83, 17.77, 12.78],
    ["Котельная", 13.81, 12.91, 17.78, 15.84],
  ].map(([name, ua, va, ub, vb]) => {
    const corners = [site(ua, va), site(ub, va), site(ub, vb), site(ua, vb)];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    return [name, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), P + 0.08];
  });
  addFloorNotes(rooms);
  addFurnitureSketch(site, P + 0.08);
}

function addFurnitureSketch(site, z) {
  const w = 0.03;
  const pos = [];
  for (let i = 0; i < FURNITURE_LINES.length; i += 4) {
    const [x0, y0] = site(FURNITURE_LINES[i], FURNITURE_LINES[i + 1]);
    const [x1, y1] = site(FURNITURE_LINES[i + 2], FURNITURE_LINES[i + 3]);
    const [e0, n0] = planToWorld(x0, y0);
    const [e1, n1] = planToWorld(x1, y1);
    let dx = e1 - e0;
    let dz = n1 - n0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    dx /= len;
    dz /= len;
    const px = -dz * w;
    const pz = dx * w;
    const ax = e0 + px;
    const az = n0 + pz;
    const bx = e1 + px;
    const bz = n1 + pz;
    const cx = e1 - px;
    const cz = n1 - pz;
    const dx2 = e0 - px;
    const dz2 = n0 - pz;
    pos.push(ax, z, az, bx, z, bz, cx, z, cz, ax, z, az, cx, z, cz, dx2, z, dz2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    color: 0x2a2622,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  bucket.add(mesh);
}

function addSouthSetback(corner) {
  const ax = 39.044;
  const ay = -10.647;
  const bx = -12.963;
  const by = -4.345;
  const abx = bx - ax;
  const aby = by - ay;
  const t = ((corner[0] - ax) * abx + (corner[1] - ay) * aby) / (abx * abx + aby * aby);
  const fx = ax + t * abx;
  const fy = ay + t * aby;
  const metres = `${Math.hypot(fx - corner[0], fy - corner[1]).toFixed(2).replace(".", ",")} м`;
  addSiteDim(corner[0], corner[1], fx, fy, metres, -1, 0.7);
}

function addVariantB() {
  const shift = (V2_YS + 16.22 + 2 + 0.14) - (22.877 - 3);
  const site = (u, v) => [V2_XE - u, V2_YS + v - shift];
  addDreamHouse(variantBGroup, site);
  bucket = variantBGroup;
  const yBlind = site(4.85, 17.22)[1];
  const yPorch = site(12.63, 19.22)[1];
  const xPorchE = site(9.63, 17.22)[0];
  const xPorchW = site(15.63, 17.22)[0];
  addSlab([
    [16.31, 21.38], [16.31, yBlind], [xPorchE, yBlind], [xPorchE, yPorch],
    [xPorchW, yPorch], [xPorchW, yBlind], [0.94, yBlind], [0.94, 6.42],
    [-3.08, 6.42], [-3.08, 16.86], [-10.04, 16.86], [-10.04, 22.63],
    [-0.11, 22.63], [-0.11, 21.38],
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSouthSetback(site(18.22, -0.93));
}

function addVariantC() {
  const x0 = 1.94;
  const x1 = 15.31;
  const y1 = 18.88;
  const cx = (x0 + x1) / 2;
  const cy = (1.73 + y1) / 2;
  const shiftX = (-4.06 + 6) - (cx - (y1 - cy));
  const site = (u, v) => {
    const sx = V2_XE - u;
    const sy = V2_YS + v;
    const mx = x0 + x1 - sx;
    return [cx - (sy - cy) + shiftX, cy + (mx - cx)];
  };
  addDreamHouse(variantCGroup, site);
  bucket = variantCGroup;
  const northY = site(19.22, 17.22)[1];
  const southY = site(3.85, 17.22)[1];
  const eastX = site(3.85, -1.93)[0];
  const westX = site(19.22, 17.22)[0];
  const porchX = site(12.63, 19.22)[0];
  const porchY0 = Math.min(site(9.63, 19.22)[1], site(15.63, 19.22)[1]);
  const porchY1 = Math.max(site(9.63, 19.22)[1], site(15.63, 19.22)[1]);
  addSlab([
    [-0.11, 22.63], [-0.11, 21.38], [eastX, 21.38], [eastX, northY],
    [westX, northY], [westX, porchY1], [porchX, porchY1], [porchX, porchY0],
    [westX, porchY0], [westX, southY], [-3.08, southY], [-3.08, 16.86],
    [-10.04, 16.86], [-10.04, 22.63],
  ], 0.03, 0.035, 0xe6d3b0, false);
  addSouthSetback(site(4.85, 16.22));
}

addVariant2();
addVariantB();
addVariantC();

function showRoofs(on) {
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.roof) obj.visible = on;
  });
}

const VIEW_KEY = "house-light-view";
let viewVariant = "v2";
let pendingVariant = "v2";
const BLURB_2 = "Вариант А. Терраса и гостиная на юг, вход на север, детские на восток. Гараж в 6 м от дома и в 7 м от ворот. Баня на юго-востоке, вход на запад.";
const BLURB_B = "Вариант Б. Терраса и мастер-спальня на юг, вход на север. Крыльцо 4 × 2 м, двускатный козырёк в 3 м от забора.";
const BLURB_C = "Вариант В. Тот же дом отзеркален, вход на запад к гаражу. Отмостка и плитка ведут от ворот к крыльцу.";

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
      date: dateInput.value,
      minutes: Number(timeInput.value),
    }));
  } catch {
    // браузер может запретить localStorage
  }
}

function loadView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (!saved) return false;
    const nums = [saved.px, saved.py, saved.pz, saved.tx, saved.ty, saved.tz];
    const known = saved.variant === "v2" || saved.variant === "vb" || saved.variant === "vc";
    const cameraOk = known && nums.every((n) => Number.isFinite(n));
    if (known) pendingVariant = saved.variant;
    if (cameraOk) {
      camera.position.set(saved.px, saved.py, saved.pz);
      controls.target.set(saved.tx, saved.ty, saved.tz);
      controls.update();
    }
    if (typeof saved.roof === "boolean") {
      roofToggle.checked = saved.roof;
      showRoofs(saved.roof);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved.date)) dateInput.value = saved.date;
    if (Number.isFinite(saved.minutes)) timeInput.value = String(saved.minutes);
    return cameraOk;
  } catch {
    // битая запись не мешает обычному виду
  }
  return false;
}

const restoredCamera = loadView();

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

function focusVariant2() {
  controls.target.set(-3.69, 1.5, -3.45);
  camera.position.set(10.86, 11, -20.94);
  controls.update();
}

greenhouseGroup.visible = false;
if (location.hash) history.replaceState(null, "", location.pathname + location.search);

function setVariant(id) {
  viewVariant = id === "vb" || id === "vc" ? id : "v2";
  if (v2House) v2House.visible = viewVariant === "v2";
  variantBGroup.visible = viewVariant === "vb";
  variantCGroup.visible = viewVariant === "vc";
  blurb.textContent = viewVariant === "vb" ? BLURB_B : viewVariant === "vc" ? BLURB_C : BLURB_2;
  document.getElementById("var-v2").classList.toggle("active", viewVariant === "v2");
  document.getElementById("var-b").classList.toggle("active", viewVariant === "vb");
  document.getElementById("var-c").classList.toggle("active", viewVariant === "vc");
  showRoofs(roofToggle.checked);
  saveView();
}

document.getElementById("var-v2").addEventListener("click", () => setVariant("v2"));
document.getElementById("var-b").addEventListener("click", () => setVariant("vb"));
document.getElementById("var-c").addEventListener("click", () => setVariant("vc"));
setVariant(pendingVariant);
if (!restoredCamera) focusVariant2();
dateInput.addEventListener("input", () => {
  applySun(geo);
  saveView();
});
timeInput.addEventListener("input", () => {
  applySun(geo);
  saveView();
});
panel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (!button.dataset.date && !button.dataset.min) return;
  if (button.dataset.date) dateInput.value = button.dataset.date;
  if (button.dataset.min) timeInput.value = button.dataset.min;
  applySun(geo);
  saveView();
});

function setView(kind) {
  if (kind === "top") camera.position.set(-3.69, 55, -3.14);
  else camera.position.set(10.86, 11, -20.94);
  controls.target.set(-3.69, 1.5, -3.45);
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
