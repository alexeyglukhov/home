import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import geo from "./geometry.js?v=20";

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

let roofGroup;

function addMesh(geom, color, cast = true) {
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
  );
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
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
  // Участок в мире зеркален по X, географический восток — это −X.
  const dir = new THREE.Vector3(-Math.sin(azR) * Math.cos(elR), up, Math.cos(azR) * Math.cos(elR));
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
  roofGroup.add(roofMesh);

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
  roofGroup.add(fasciaMesh);
}

roofGroup = new THREE.Group();
scene.add(roofGroup);

function asRoof(mesh) {
  scene.remove(mesh);
  roofGroup.add(mesh);
  return mesh;
}

// План схемы зеркалится так же, как контур дома: +X мира — восток, +Z — север.
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
  [9.61, 11.56, 3.6, 4.1],
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

function addSite() {
  const plot = [
    [-18.0, 22.877],
    [32.835, 22.877],
    [39.044, -10.647],
    [-12.963, -4.345],
  ];
  const road = [
    [-36.955, 42.876],
    [35.233, 42.877],
    [48.149, -26.86],
    [-25.708, -17.91],
  ];
  const fenceY = 22.877;
  const gateX0 = -11.38;
  const gateX1 = -5.4;
  const kalX0 = 6.0;
  const kalX1 = 7.5;
  const fenceH = 1.5;
  const fenceT = 0.06;

  addSlab(road, -0.02, 0.02, 0xc8c8c6, false);
  addSlab(plot, 0.0, 0.02, 0xb7d48c, false);

  const court = [
    [-4.4, 9.2],
    [-1, 9.2],
    [-1, 17.414],
    [4.843, 17.414],
    [4.844, 18.877],
    [8.618, 18.877],
    [9.618, 18.877],
    [9.618, 15.588],
    [13.71, 15.588],
    [13.71, fenceY],
    [-12.38, fenceY],
    [-12.38, 17.414],
    [-5.4, 17.414],
    [-4.4, 17.414],
  ];
  const path = [
    [13.71, 0.45],
    [24.6, 0.45],
    [24.6, 2.45],
    [20.155, 2.45],
    [20.155, 4.45],
    [18.155, 4.45],
    [18.155, 2.45],
    [13.71, 2.45],
  ];
  addSlab(court, 0.03, 0.035, 0xe6d3b0, false);
  addSlab(path, 0.03, 0.035, 0xe6d3b0, false);
  addSlab(
    [[gateX0, fenceY - 0.25], [gateX1, fenceY - 0.25], [gateX1, 29.4], [gateX0, 29.4]],
    0.03, 0.035, 0xe6d3b0, false
  );
  addSlab(
    [[kalX0, fenceY - 0.25], [kalX1, fenceY - 0.25], [kalX1, 27.5], [kalX0, 27.5]],
    0.03, 0.035, 0xe6d3b0, false
  );
  const blind = 0xd4cfc4;
  addSlab([
    [13.71, -1], [13.71, 15.588], [9.618, 15.588], [9.618, 19.877],
    [3.843, 19.878], [3.842, 18.415], [-1, 18.414], [-1, -1],
  ], 0.07, 0.025, blind, false);
  addSlab([[-12.38, 9.2], [-4.4, 9.2], [-4.4, 18.414], [-12.38, 18.414]], 0.07, 0.025, blind, false);
  addSlab([[23.6, -0.55], [31.1, -0.55], [31.1, 5.35], [23.6, 5.35]], 0.07, 0.025, blind, false);

  const gx0 = -11.38;
  const gx1 = -5.4;
  const gy0 = 10.2;
  const gy1 = 17.414;
  const t = 0.18;
  const gTop = 2.55;
  const doorH = 2.15;
  const d1a = -10.87;
  const d1b = -8.47;
  const d2a = -8.31;
  const d2b = -5.91;
  planBox([[gx0 - 0.08, gy0 - 0.08], [gx1 + 0.08, gy0 - 0.08], [gx1 + 0.08, gy1 + 0.08], [gx0 - 0.08, gy1 + 0.08]], 0, PLINTH, plinthColor);
  planBox([[gx0, gy0], [gx1, gy0], [gx1, gy0 + t], [gx0, gy0 + t]], PLINTH, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy0], [gx0 + t, gy0], [gx0 + t, gy1], [gx0, gy1]], PLINTH, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx1 - t, gy0], [gx1, gy0], [gx1, gy1], [gx1 - t, gy1]], PLINTH, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy1 - t], [d1a, gy1 - t], [d1a, gy1], [gx0, gy1]], PLINTH, PLINTH + gTop, 0xf4f0e8);
  planBox([[d1b, gy1 - t], [d2a, gy1 - t], [d2a, gy1], [d1b, gy1]], PLINTH, PLINTH + gTop, 0xf4f0e8);
  planBox([[d2b, gy1 - t], [gx1, gy1 - t], [gx1, gy1], [d2b, gy1]], PLINTH, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0, gy1 - t], [gx1, gy1 - t], [gx1, gy1], [gx0, gy1]], PLINTH + doorH, PLINTH + gTop, 0xf4f0e8);
  planBox([[gx0 + t, gy0 + t], [gx1 - t, gy0 + t], [gx1 - t, gy1 - t], [gx0 + t, gy1 - t]], PLINTH, PLINTH + 0.04, 0xd5cfc4, false);
  planBox([[gx0 + t, 12.14], [-8.84, 12.14], [-8.84, 12.26], [gx0 + t, 12.26]], PLINTH, PLINTH + gTop, 0xefe6d4);
  planBox([[-7.94, 12.14], [gx1 - t, 12.14], [gx1 - t, 12.26], [-7.94, 12.26]], PLINTH, PLINTH + gTop, 0xefe6d4);
  asRoof(planBox([[gx0 - 0.12, gy0 - 0.12], [gx1 + 0.12, gy0 - 0.12], [gx1 + 0.12, gy1 + 0.08], [gx0 - 0.12, gy1 + 0.08]], PLINTH + gTop, PLINTH + gTop + 0.12, 0x6e675e));

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
  asRoof(planBox([[bx0 - 0.15, by0 - 0.15], [bx1 + 0.15, by0 - 0.15], [bx1 + 0.15, by1 + 0.15], [bx0 - 0.15, by1 + 0.15]], PLINTH + bTop, PLINTH + bTop + 0.14, 0x5c4033));

  const q0 = 17.205;
  const q1 = 21.105;
  const r0 = 4.45;
  const r1 = 8.25;
  planBox([[q0 - 0.06, r0 - 0.06], [q1 + 0.06, r0 - 0.06], [q1 + 0.06, r1 + 0.06], [q0 - 0.06, r1 + 0.06]], 0, PLINTH, plinthColor);
  planBox([[q0, r0], [q1, r0], [q1, r1], [q0, r1]], PLINTH, PLINTH + 0.04, 0xedd9c4, false);
  const posts = [
    [q0 + 0.28, r0 + 0.28],
    [q1 - 0.28, r0 + 0.28],
    [q1 - 0.28, r1 - 0.28],
    [q0 + 0.28, r1 - 0.28],
  ];
  for (const [px, py] of posts) {
    planBox([[px - 0.07, py - 0.07], [px + 0.07, py - 0.07], [px + 0.07, py + 0.07], [px - 0.07, py + 0.07]], PLINTH, PLINTH + 2.2, 0x6a3a12);
  }
  asRoof(planBox([[q0, r0], [q1, r0], [q1, r1], [q0, r1]], PLINTH + 2.2, PLINTH + 2.28, 0xc4a574));
  planBox([[18.85, 6.05], [19.55, 6.05], [19.55, 6.7], [18.85, 6.7]], PLINTH, PLINTH + 0.8, 0x4a4a4a);
  const seatCx = (q0 + q1) / 2;
  const seatCy = (r0 + r1) / 2;
  const seatR = 1.52;
  const gap0 = -Math.PI / 2 - 0.55;
  const gap1 = -Math.PI / 2 + 0.55;
  const span = gap0 + Math.PI * 2 - gap1;
  for (let i = 0; i < 5; i++) {
    const ang = gap1 + (span * (i + 0.5)) / 5;
    const ox = Math.cos(ang);
    const oy = Math.sin(ang);
    const tx = -oy;
    const ty = ox;
    const bx = seatCx + ox * seatR;
    const by = seatCy + oy * seatR;
    const halfL = 0.62;
    const halfD = 0.18;
    const corners = (inner, outer) => [
      [bx + tx * -halfL + ox * inner, by + ty * -halfL + oy * inner],
      [bx + tx * halfL + ox * inner, by + ty * halfL + oy * inner],
      [bx + tx * halfL + ox * outer, by + ty * halfL + oy * outer],
      [bx + tx * -halfL + ox * outer, by + ty * -halfL + oy * outer],
    ];
    planBox(corners(-halfD, halfD), PLINTH + 0.42, PLINTH + 0.5, 0xc4a574);
    planBox(corners(halfD - 0.05, halfD + 0.02), PLINTH + 0.5, PLINTH + 0.92, 0xb08960);
  }

  addWallRun(plot[0], [gateX0, fenceY], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun([gateX1, fenceY], [kalX0, fenceY], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun([kalX1, fenceY], plot[1], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[1], plot[2], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[2], plot[3], fenceT, 0, fenceH, 0x7d6a52);
  addWallRun(plot[3], plot[0], fenceT, 0, fenceH, 0x7d6a52);

  const mid = (gateX0 + gateX1) / 2;
  addWallRun([gateX0 + 0.1, fenceY], [mid - 0.04, fenceY], 0.035, 0.02, 1.48, 0x4e463c);
  addWallRun([mid + 0.04, fenceY], [gateX1 - 0.1, fenceY], 0.035, 0.02, 1.48, 0x4e463c);
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

  addSlab([[28.139, 18.478], [30.34, 18.478], [30.34, 19.877], [28.139, 19.877]], 0.04, 0.08, 0xefe6d4, false);
  for (const [sx, sy] of [[28.653, 19.178], [29.823, 19.178]]) {
    const [e, n] = planToWorld(sx, sy);
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.42, 20),
      new THREE.MeshLambertMaterial({ color: 0xd9cfc0 })
    );
    neck.position.set(e, 0.28, n);
    neck.castShadow = true;
    neck.receiveShadow = true;
    scene.add(neck);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x6b4f2a })
    );
    lid.position.set(e, 0.5, n);
    lid.castShadow = true;
    scene.add(lid);
  }
  {
    const [e, n] = planToWorld(-6.0, 4.2);
    const curb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.56, 0.18, 24),
      new THREE.MeshLambertMaterial({ color: 0xd6ebf7 })
    );
    curb.position.set(e, 0.12, n);
    curb.castShadow = true;
    curb.receiveShadow = true;
    scene.add(curb);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x1a6fbf })
    );
    cap.position.set(e, 0.22, n);
    cap.castShadow = true;
    scene.add(cap);
  }

  const [ne, nn] = planToWorld(-16, 26);
  scene.add(new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(ne, 1.7, nn),
    6, 0x16320f, 1.1, 0.55
  ));
}

addSite();

roofToggle.addEventListener("change", () => {
  roofGroup.visible = roofToggle.checked;
});
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
