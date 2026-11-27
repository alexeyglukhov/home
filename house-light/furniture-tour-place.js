// Расстановка мебели: только осмотр со снятой крышей (не «Экскурсия»).
// Мультивыбор E/C/X → Enter фиксирует группу → правка/копия/удаление целиком.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const loader = new GLTFLoader();
const cache = new Map();
const HINT_IDLE_TOUR =
  "WASD — ход · мышь — взгляд · Esc — стоп · мебель — только в осмотре без крыши";
const HINT_IDLE_VIEW =
  "M — каталог · E — правка · C — копия · X — удаление · мышь — осмотр · расстановка при снятой крыше";
const HINT_PLACE_TOUR =
  "IJKL — двигать · 9/0 — поворот · G — зеркало · R/F у стены · T пол/стена · х/ъ ([ ]) вширь · -/= высота · Enter/ЛКМ — зафиксировать · Esc — отмена";
const HINT_PLACE_AIM =
  "Мышь — точка · Enter — в правку · Esc — отмена";
const HINT_PLACE_VIEW =
  "IJKL — двигать · 9/0 — поворот · G — зеркало · R/F у стены · T пол/стена · х/ъ ([ ]) вширь · -/= высота · Enter — зафиксировать · мышь — ракурс · Esc — отмена";
const HINT_PLACE_GROUP =
  "Группа: IJKL — двигать · 9/0 — поворот · х/ъ — вширь · -/= высота · Enter — зафиксировать · мышь — ракурс · Esc — отмена";
const HINT_DELETE_TOUR =
  "Удаление мебели — только в осмотре без крыши";
const HINT_EDIT_TOUR =
  "Правка мебели — только в осмотре без крыши";
const HINT_COPY_TOUR =
  "Копия мебели — только в осмотре без крыши";
const HINT_DELETE_VIEW =
  "Клики — выбор нескольких · Enter — удалить группу · X/Esc — выход";
const HINT_EDIT_VIEW =
  "Клики — выбор нескольких · Enter — править группу · E/Esc — выход";
const HINT_COPY_VIEW =
  "Клики — выбор нескольких · Enter — копия группы (та же поза) · C/Esc — выход";

const STEP = 1.35; // м/с
const LIFT_STEP = 0.9; // м/с вдоль стены
const WALL_MAX_H = 2.55;

function fileUrl(file) {
  return new URL("./furniture/" + file, import.meta.url).href;
}

function loadModel(file) {
  const hit = cache.get(file);
  if (hit) return hit.then((s) => s.clone(true));
  const job = new Promise((resolve, reject) => {
    loader.load(fileUrl(file), (gltf) => resolve(gltf.scene), undefined, reject);
  });
  cache.set(file, job);
  return job.then((s) => s.clone(true));
}

function ghostify(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData._furnMatBak == null) {
      obj.userData._furnMatBak = obj.material;
      obj.userData._furnCast = obj.castShadow;
      obj.userData._furnRecv = obj.receiveShadow;
    }
    const src = obj.userData._furnMatBak;
    const mats = (Array.isArray(src) ? src : [src]).map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.45;
      c.depthWrite = false;
      return c;
    });
    obj.material = mats.length === 1 ? mats[0] : mats;
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

function disposeMats(mat) {
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) m?.dispose?.();
}

function unghostify(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData._furnMatBak == null) return;
    disposeMats(obj.material);
    obj.material = obj.userData._furnMatBak;
    delete obj.userData._furnMatBak;
    delete obj.userData._furnCast;
    delete obj.userData._furnRecv;
  });
  enableFurnitureShadows(root);
}

/** Как у стен/колонн: мебель кидает и принимает тень. */
function enableFurnitureShadows(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

function footprintFromCm(cm) {
  if (!cm || cm.length < 3) return { w: 0.8, d: 0.8, h: 0.8 };
  return { w: cm[0] / 100, d: cm[1] / 100, h: cm[2] / 100 };
}

/**
 * @param {object} opts
 * @param {() => string} opts.getVariant
 * @param {(x:number,y:number)=>[number,number]} opts.planToWorld
 * @param {(e:number,n:number)=>[number,number]} opts.worldToPlan
 * @param {(e:number,n:number)=>number} opts.walkGround
 * @param {() => boolean} opts.canEditFurniture — осмотр без крыши (не экскурсия)
 * @param {() => boolean} [opts.isTourActive] — для подсказок
 * @param {THREE.Camera} opts.camera
 * @param {THREE.Scene} opts.scene
 * @param {THREE.Group} opts.bucket
 * @param {HTMLElement} [opts.domElement] — для клика по мебели в осмотре
 * @param {() => THREE.Object3D[]} opts.hitTargets
 * @param {(msg:string)=>void} [opts.setStatus]
 * @param {(msg:string, mode:string)=>void} [opts.setHint]
 * @param {(mode:string)=>void} [opts.onModeChange]
 */
export function createTourFurniturePlace(opts) {
  const {
    getVariant, planToWorld, worldToPlan, walkGround,
    canEditFurniture = opts.isTourActive || (() => false),
    isTourActive = () => false,
    camera, scene, bucket, domElement = null, hitTargets, setStatus = () => {},
    setHint = () => {},
    onModeChange = () => {},
  } = opts;
  const _ndc = new THREE.Vector2();
  const lastPointerNdc = { x: 0, y: 0, ok: false };

  const raycaster = new THREE.Raycaster();
  const placed = new THREE.Group();
  placed.name = "tour-furniture-placed";
  bucket.add(placed);

  const ghostRoot = new THREE.Group();
  ghostRoot.name = "tour-furniture-ghost";
  ghostRoot.visible = false;
  scene.add(ghostRoot);

  const projMat = new THREE.MeshBasicMaterial({
    color: 0x3a6ea5, transparent: true, opacity: 0.22, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const projFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), projMat);
  projFloor.rotation.order = "YXZ";
  projFloor.visible = false;
  projFloor.renderOrder = 1;
  scene.add(projFloor);

  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x3a6ea5, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const projWall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
  projWall.visible = false;
  projWall.renderOrder = 1;
  scene.add(projWall);
  const _zAxis = new THREE.Vector3(0, 0, 1);

  let catalogById = new Map();
  let mode = "none"; // none | place | delete | edit | copy
  let ghost = null; // wrap group
  let ghostModel = null;
  let ghostItem = null;
  let yaw = 0;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  let mirror = false; // отражение по локальной X
  let mirrorZ = false; // отражение по локальной Z (левое↔правое от взгляда, если ось Z ближе к экрану)
  let fitScale = 1;
  let baseSize = { w: 0.8, d: 0.8, h: 0.8 };
  let mount = "floor"; // floor | wall
  let wallNormal = new THREE.Vector3(0, 0, 1);
  let wallPlanePoint = new THREE.Vector3(); // точка на плоскости стены
  let wallAnchor = new THREE.Vector3(); // текущая поза у стены (ноги)
  let contactWall = null; // последняя стена вплотную (для R/F без T)
  let selectIndex = -1; // устар.: одиночный; основной — selectedUids
  let selectedUids = new Set();
  let selectHelpers = [];
  let editingRec = null; // одиночная правка (каталог/legacy)
  let groupMembers = null; // null | [{ rec?, wrap, model, item, data0, isCopy }]
  let placeIntent = "insert"; // insert | edit | copy
  let insertPhase = "aim"; // aim (за мышью) | tune (правка) — только для insert
  let yawFree = false; // true после 9/0/G — не сбрасывать yaw выравниванием к стене каждый кадр
  let loadSeq = 0; // защита от гонок loadVariant
  const records = [];
  /** Упор → 3 попытки → проход стен на WALL_PASS_DIST м; преодолённые плоскости не блокируют, пока снова не подойдём. */
  const WALL_BUMP_NEED = 3;
  const WALL_BUMP_HOLD = 0.4; // сек непрерывного упора = одна попытка
  const WALL_PASS_DIST = 1.0; // м пути в режиме прохода, затем снова упор
  const WALL_CLEAR_GAP = 0.18; // полностью отошли от преодолённой стены
  let wallBumpTries = 0;
  let wallBumpHold = 0;
  let wallPassActive = false;
  let wallPassTravel = 0;
  /** key → true: стена пройдена; снова блокирует только после отхода и движения к ней. */
  const clearedWalls = new Set();
  const _groupQuat = new THREE.Quaternion();
  const _groupScale = new THREE.Vector3();
  const _groupPos = new THREE.Vector3();
  const _groupEuler = new THREE.Euler();
  const _movePrev = new THREE.Vector3();
  const _moveDelta = new THREE.Vector3();
  const held = {
    KeyI: false, KeyK: false, KeyJ: false, KeyL: false,
    KeyR: false, KeyF: false,
  };
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _tmp = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _tangent = new THREE.Vector3();
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const _corner = new THREE.Vector3();
  const FOOT_EPS = 0.004;
  const WALL_EPS = 0.003;
  const _obCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const _savedPos = new THREE.Vector3();
  const _savedQuat = new THREE.Quaternion();
  const _localFurnBox = new THREE.Box3();
  let _localFurnBoxValid = false;
  const _centXZ = new THREE.Vector3();

  function furnitureUrl(variant = getVariant()) {
    return `/api/furniture/${encodeURIComponent(variant || "v2")}`;
  }

  function status(msg) {
    setStatus(msg);
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    onModeChange(mode);
  }

  function publishHint() {
    if (!canEditFurniture()) {
      setHint(isTourActive() ? HINT_IDLE_TOUR : "", isTourActive() ? "idle" : "off");
      return;
    }
    if (mode === "place") {
      if (groupMembers) setHint(HINT_PLACE_GROUP, "place");
      else if (placeIntent === "insert" && insertPhase === "aim") setHint(HINT_PLACE_AIM, "place");
      else setHint(HINT_PLACE_VIEW, "place");
    } else if (mode === "delete") setHint(HINT_DELETE_VIEW, "delete");
    else if (mode === "edit") setHint(HINT_EDIT_VIEW, "edit");
    else if (mode === "copy") setHint(HINT_COPY_VIEW, "copy");
    else setHint(HINT_IDLE_VIEW, "idle");
  }

  function isSelectMode() {
    return mode === "delete" || mode === "edit" || mode === "copy";
  }

  function disposeSelectHelpers() {
    for (const h of selectHelpers) {
      scene.remove(h);
      h.geometry?.dispose?.();
      h.material?.dispose?.();
    }
    selectHelpers = [];
  }

  function clearSelectHighlight() {
    disposeSelectHelpers();
    selectIndex = -1;
    selectedUids.clear();
  }

  function selectedRecords() {
    const list = [];
    const seen = new Set();
    for (const r of records) {
      const uid = r?.data?.uid;
      if (!uid || !selectedUids.has(uid) || seen.has(uid)) continue;
      if (!r.holder?.visible) continue;
      seen.add(uid);
      list.push(r);
    }
    return list;
  }

  function refreshSelectHighlight() {
    disposeSelectHelpers();
    if (!isSelectMode()) return;
    const list = selectedRecords();
    if (!list.length) {
      if (mode === "delete") status("Удаление: кликните по мебели, затем Enter");
      else if (mode === "edit") status("Правка: кликните по мебели, затем Enter");
      else if (mode === "copy") status("Копия: кликните по мебели, затем Enter");
      return;
    }
    const color = mode === "delete" ? 0xe23a3a : mode === "copy" ? 0x3a9e6a : 0xd4a017;
    for (const rec of list) {
      const helper = new THREE.BoxHelper(rec.holder, color);
      scene.add(helper);
      selectHelpers.push(helper);
    }
    const ids = list.map((r) => r.data.id).join(", ");
    if (mode === "delete") status(`Удаление: ${list.length} — ${ids}. Enter — удалить`);
    else if (mode === "copy") status(`Копия: ${list.length} — ${ids}. Enter — копировать`);
    else status(`Правка: ${list.length} — ${ids}. Enter — править`);
  }

  function toggleSelectByIndex(idx) {
    if (idx < 0 || idx >= records.length) return;
    const uid = records[idx]?.data?.uid;
    if (!uid) return;
    if (selectedUids.has(uid)) selectedUids.delete(uid);
    else selectedUids.add(uid);
    selectIndex = selectedUids.has(uid) ? idx : (selectedRecords()[0] ? records.indexOf(selectedRecords()[0]) : -1);
    refreshSelectHighlight();
  }

  function recordIndexFromHit(hits) {
    for (const h of hits) {
      let node = h.object;
      while (node && !node.userData?.tourFurn) node = node.parent;
      if (!node?.userData?.furnId) continue;
      const idx = records.findIndex((r) => r.data.uid === node.userData.furnId && r.holder.visible);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  /** Выбор взглядом — больше не используется для правки (только осмотр). */
  function pickSelectByGaze() {
    /* no-op: мебель правится только мышью в осмотре */
  }

  /** Выбор кликом (осмотр): луч из курсора. */
  function pickSelectByPointer(event) {
    if (!isSelectMode()) return -1;
    if (!records.length || !domElement) return -1;
    const rect = domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return -1;
    _ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(_ndc, camera);
    raycaster.far = 250;
    const hits = raycaster.intersectObjects(placed.children, true);
    return recordIndexFromHit(hits);
  }

  function clearMoveHeld() {
    for (const k of Object.keys(held)) held[k] = false;
  }

  function resetGhostFlags() {
    ghost = null;
    ghostModel = null;
    ghostItem = null;
    groupMembers = null;
    placeIntent = "insert";
    insertPhase = "aim";
    yawFree = false;
    resetWallPassState();
    invalidateLocalFurnBox();
    ghostRoot.visible = false;
    ghostRoot.scale.set(1, 1, 1);
    ghostRoot.rotation.set(0, 0, 0);
    projFloor.visible = false;
    projWall.visible = false;
    mount = "floor";
    mirror = false;
    mirrorZ = false;
    clearMoveHeld();
    if (mode === "place") setMode("none");
    else onModeChange(mode);
    publishHint();
  }

  function disposeGhostTree(root) {
    // геометрию не трогаем — clone GLTF делит буферы с кэшем
    root.traverse((o) => {
      if (o.isMesh && o.material) disposeMats(o.material);
    });
  }

  /** Вернуть объект правки на место (отмена). */
  function restoreEditingObject() {
    const rec = editingRec;
    if (!rec?.holder) {
      editingRec = null;
      return;
    }
    const wrap = ghost;
    if (wrap && wrap.parent === ghostRoot) {
      unghostify(ghostModel || wrap);
      ghostRoot.remove(wrap);
      rec.holder.add(wrap);
      const sc = scaleFromData(rec.data);
      wrap.scale.set(sc.x, sc.y, sc.z);
    }
    rec.holder.position.copy(rec._savedPos);
    rec.holder.rotation.y = rec._savedYaw;
    rec.holder.visible = true;
    placed.add(rec.holder);
    if (!records.includes(rec)) records.push(rec);
    editingRec = null;
  }

  function restoreGroupEdit() {
    if (!groupMembers) return;
    for (const m of groupMembers) {
      if (m.isCopy) {
        if (m.wrap?.parent) m.wrap.parent.remove(m.wrap);
        if (m.wrap) disposeGhostTree(m.wrap);
        continue;
      }
      const rec = m.rec;
      if (!rec?.holder) continue;
      if (m.wrap?.parent === ghostRoot) {
        unghostify(m.model || m.wrap);
        ghostRoot.remove(m.wrap);
        rec.holder.add(m.wrap);
        m.wrap.position.set(0, 0, 0);
        m.wrap.rotation.set(0, 0, 0);
        const sc = scaleFromData(rec.data);
        m.wrap.scale.set(sc.x, sc.y, sc.z);
      }
      rec.holder.position.copy(rec._savedPos);
      rec.holder.rotation.y = rec._savedYaw != null ? rec._savedYaw : (rec.data.yaw || 0);
      rec.holder.visible = true;
      placed.add(rec.holder);
      if (!records.includes(rec)) records.push(rec);
    }
    groupMembers = null;
    editingRec = null;
  }

  function clearGhost() {
    if (groupMembers) {
      restoreGroupEdit();
      while (ghostRoot.children.length) ghostRoot.remove(ghostRoot.children[0]);
      resetGhostFlags();
      return;
    }
    if (editingRec) {
      restoreEditingObject();
      while (ghostRoot.children.length) ghostRoot.remove(ghostRoot.children[0]);
      resetGhostFlags();
      return;
    }
    while (ghostRoot.children.length) {
      const c = ghostRoot.children[0];
      ghostRoot.remove(c);
      disposeGhostTree(c);
    }
    resetGhostFlags();
  }

  /**
   * Масштаб + ноги в локальный y=0 по AABB.
   * Вызывать только пока предок в начале координат (иначе world≠local).
   */
  function seatModelFeet(model, scaleX, scaleY, scaleZ) {
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
    model.scale.set(scaleX, scaleY, scaleZ);
    model.updateMatrixWorld(true);
    _box.setFromObject(model);
    _box.getCenter(_center);
    model.position.x -= _center.x;
    model.position.z -= _center.z;
    model.position.y -= _box.min.y;
    model.updateMatrixWorld(true);
  }

  function measureGhostBox() {
    ghostRoot.updateMatrixWorld(true);
    _box.setFromObject(ghostRoot);
    _box.getSize(_size);
    _box.getCenter(_center);
    return _box;
  }

  /** Верх пола: walkGround + луч вниз по мешам (дом/терраса). */
  function sampleFloorY(x, z) {
    let y = walkGround(x, z);
    raycaster.set(_tmp.set(x, 10, z), _n.set(0, -1, 0));
    raycaster.far = 14;
    const hits = raycaster.intersectObjects(meshTargets(), true);
    for (const h of hits) {
      if (!h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
      if (n.y < 0.55) continue;
      if (h.point.y > y) y = h.point.y;
    }
    return y;
  }

  function snapFeet(strictFloor) {
    const box = measureGhostBox();
    const floorY = sampleFloorY(_center.x, _center.z);
    const dy = floorY + FOOT_EPS - box.min.y;
    if (strictFloor || dy > 0) ghostRoot.position.y += dy;
  }

  function invalidateLocalFurnBox() {
    _localFurnBoxValid = false;
  }

  /**
   * Локальный AABB содержимого ghostRoot (в его СК при identity pos/rot/scale),
   * затем углы → matrixWorld = реальные углы в пространстве дома.
   * Scale тоже сбрасываем — иначе setFromObject уже с масштабом, а matrixWorld
   * применит его ещё раз и OBB раздувается (стол «упирается» за метр до стены).
   */
  function ensureLocalFurnBox() {
    if (_localFurnBoxValid || !ghost) return;
    _savedPos.copy(ghostRoot.position);
    _savedQuat.copy(ghostRoot.quaternion);
    const sx0 = ghostRoot.scale.x;
    const sy0 = ghostRoot.scale.y;
    const sz0 = ghostRoot.scale.z;
    ghostRoot.position.set(0, 0, 0);
    ghostRoot.quaternion.identity();
    ghostRoot.scale.set(1, 1, 1);
    ghostRoot.updateMatrixWorld(true);
    // только модель/wrap — без проекций сцены
    _localFurnBox.setFromObject(ghostRoot);
    ghostRoot.position.copy(_savedPos);
    ghostRoot.quaternion.copy(_savedQuat);
    ghostRoot.scale.set(sx0, sy0, sz0);
    ghostRoot.updateMatrixWorld(true);
    _localFurnBoxValid = true;
  }

  /** 8 углов мебели в мире дома (OBB). */
  function furnitureWorldCorners() {
    if (!ghost) return null;
    ensureLocalFurnBox();
    ghostRoot.updateMatrixWorld(true);
    let i = 0;
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          _obCorners[i++]
            .set(
              ix ? _localFurnBox.max.x : _localFurnBox.min.x,
              iy ? _localFurnBox.max.y : _localFurnBox.min.y,
              iz ? _localFurnBox.max.z : _localFurnBox.min.z,
            )
            .applyMatrix4(ghostRoot.matrixWorld);
        }
      }
    }
    return _obCorners;
  }

  function worldObbCorners() {
    return furnitureWorldCorners();
  }

  /** Центр XZ по реальным углам. */
  function furnitureCenterXZ(out = _centXZ) {
    const corners = furnitureWorldCorners();
    if (!corners) {
      out.set(ghostRoot.position.x, 0, ghostRoot.position.z);
      return out;
    }
    out.set(0, 0, 0);
    for (let c = 0; c < 8; c++) {
      out.x += corners[c].x;
      out.z += corners[c].z;
    }
    out.x /= 8;
    out.z /= 8;
    return out;
  }

  /** Вылет габарита от центра вдоль dir (горизонталь) — по углам в мире. */
  function extentAlongDir(dir) {
    const corners = furnitureWorldCorners();
    if (!corners) return 0.2;
    const c = furnitureCenterXZ();
    let maxT = 0;
    const dx = dir.x;
    const dz = dir.z;
    for (let i = 0; i < 8; i++) {
      const t = (corners[i].x - c.x) * dx + (corners[i].z - c.z) * dz;
      if (t > maxT) maxT = t;
    }
    return Math.max(maxT, 0.05);
  }

  /** Полуразмер «тарелки» по XZ из углов (для nearLimit). */
  function furnitureRadiusXZ() {
    const corners = furnitureWorldCorners();
    if (!corners) return 0.4;
    const c = furnitureCenterXZ();
    let r = 0;
    for (let i = 0; i < 8; i++) {
      const dx = corners[i].x - c.x;
      const dz = corners[i].z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > r) r = d;
    }
    return Math.max(r, 0.05);
  }

  function pushOutOfPlane(planePoint, planeNormal) {
    const corners = worldObbCorners();
    if (!corners) return;
    const planeD = planeNormal.dot(planePoint);
    let minSide = Infinity;
    for (let c = 0; c < 8; c++) {
      minSide = Math.min(minSide, planeNormal.dot(corners[c]) - planeD);
    }
    if (minSide < WALL_EPS) {
      ghostRoot.position.addScaledVector(planeNormal, WALL_EPS - minSide);
    }
  }

  /** Дожать к стене с стороны взгляда/движения — пока OBB не коснётся. */
  function pullFlushToWall(planePoint, planeNormal, maxPull = 1.2) {
    const corners = worldObbCorners();
    if (!corners) return;
    const planeD = planeNormal.dot(planePoint);
    let minSide = Infinity;
    for (let c = 0; c < 8; c++) {
      minSide = Math.min(minSide, planeNormal.dot(corners[c]) - planeD);
    }
    // Слишком далеко от стены — не притягиваем через комнату.
    if (minSide > maxPull) return;
    if (minSide > WALL_EPS) {
      ghostRoot.position.addScaledVector(planeNormal, WALL_EPS - minSide);
    } else if (minSide < WALL_EPS) {
      ghostRoot.position.addScaledVector(planeNormal, WALL_EPS - minSide);
    }
  }

  function resetWallPassState() {
    wallBumpTries = 0;
    wallBumpHold = 0;
    wallPassActive = false;
    wallPassTravel = 0;
    clearedWalls.clear();
  }

  /** Ключ плоскости: нормаль + смещение (двойные/тройные стены — разные ключи). */
  function wallPlaneKey(hit) {
    let nx = Math.round(hit.normal.x * 4) / 4;
    let nz = Math.round(hit.normal.z * 4) / 4;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    // одна ориентация на пару ±n, чтобы одна стена не двоилась
    let sign = 1;
    if (nx < -1e-6 || (Math.abs(nx) <= 1e-6 && nz < 0)) sign = -1;
    const nxx = nx * sign;
    const nzz = nz * sign;
    const d = Math.round((nxx * hit.point.x + nzz * hit.point.z) * 20) / 20;
    return `${nxx.toFixed(2)}:${nzz.toFixed(2)}:${d.toFixed(2)}`;
  }

  function markWallCleared(hit) {
    if (!hit) return;
    clearedWalls.add(wallPlaneKey(hit));
  }

  /**
   * Стена не блокирует: режим прохода, либо уже преодолена.
   * Преодолённая снова мешает, только когда отошли и двигаемся к ней.
   */
  function wallAllowsPass(hit, moveDir = null) {
    if (!hit) return false;
    if (wallPassActive) {
      markWallCleared(hit);
      return true;
    }
    const key = wallPlaneKey(hit);
    if (!clearedWalls.has(key)) return false;
    const gap = gapToWallPlane(hit.point, hit.normal);
    // ещё в теле / рядом после прохода
    if (gap < WALL_CLEAR_GAP) return true;
    // отошли; если снова прём в стену — вернуть упор
    if (moveDir && moveDir.dot(hit.normal) < -0.12) {
      clearedWalls.delete(key);
      return false;
    }
    return true;
  }

  /** Упор: NEED попыток (любая стена) → режим прохода на WALL_PASS_DIST м. */
  function registerWallBump(hit) {
    if (wallPassActive) {
      markWallCleared(hit);
      return true;
    }
    wallBumpTries += 1;
    if (wallBumpTries >= WALL_BUMP_NEED) {
      wallPassActive = true;
      wallPassTravel = 0;
      wallBumpTries = 0;
      wallBumpHold = 0;
      markWallCleared(hit);
      status(`Проход стен: ещё ${WALL_PASS_DIST.toFixed(1)} м`);
      return true;
    }
    status(`Стена: упор ${wallBumpTries}/${WALL_BUMP_NEED}`);
    return false;
  }

  function noteWallPassTravel(moved) {
    if (!wallPassActive || moved < 1e-8) return;
    wallPassTravel += moved;
    if (wallPassTravel >= WALL_PASS_DIST) {
      wallPassActive = false;
      wallPassTravel = 0;
      wallBumpTries = 0;
      wallBumpHold = 0;
      status("Проход стен: выкл — снова упор в препятствия");
    }
  }

  function ghostProbeOrigin() {
    const c = furnitureCenterXZ();
    const corners = furnitureWorldCorners();
    let y = ghostRoot.position.y + 0.35;
    if (corners) {
      let yMin = Infinity;
      let yMax = -Infinity;
      for (let i = 0; i < 8; i++) {
        yMin = Math.min(yMin, corners[i].y);
        yMax = Math.max(yMax, corners[i].y);
      }
      y = yMin * 0.35 + yMax * 0.65;
    }
    return _tmp.set(c.x, y, c.z);
  }

  /** Только вертикальные стены дома — не пол/плиты/рамы (рамы давали упор далеко от стены). */
  function wallMeshTargets() {
    return hitTargets().filter((m) => {
      if (!m || !m.visible || !m.isMesh) return false;
      const ud = m.userData || {};
      if (ud.floorSlab || ud.walkTop || ud.roof || ud.ceiling) return false;
      if (ud.finish === "door" || ud.finish === "frame") return false;
      if (ud.finish === "wall") return true;
      if (ud.foot && ud.finish !== "floor") return true;
      return false;
    });
  }

  function findWallHit(origin, direction, maxDist = 4.5) {
    const dir = direction.clone().normalize();
    raycaster.set(origin, dir);
    raycaster.far = maxDist;
    const targets = wallMeshTargets();
    if (!targets.length) return null;
    const hits = raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (!h.face) continue;
      _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      if (Math.abs(_n.y) > 0.25) continue; // только почти вертикаль
      // нормаль против луча (к источнику)
      if (_n.dot(dir) > 0) _n.negate();
      return { point: h.point.clone(), normal: _n.clone() };
    }
    return null;
  }

  function findNearbyWallHit(reach, extraDir = null) {
    const origin = ghostProbeOrigin().clone();
    const radius = furnitureRadiusXZ();
    const nearLimit = radius + 0.35;
    cameraFlatAxes();
    const dirs = [
      _fwd.clone(),
      _fwd.clone().negate(),
      _right.clone(),
      _right.clone().negate(),
      new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    if (extraDir && extraDir.lengthSq() > 1e-8) {
      dirs.unshift(extraDir.clone().normalize());
      dirs.unshift(extraDir.clone().normalize().negate());
    }
    let bestGap = Infinity;
    let bestHit = null;
    let bestDist = Infinity;
    for (const dir of dirs) {
      if (!dir || dir.lengthSq() < 1e-8) continue;
      const hit = findWallHit(origin, dir, Math.min(reach, nearLimit + 0.25));
      if (!hit) continue;
      const hitDist = origin.distanceTo(hit.point);
      if (hitDist > nearLimit) continue;
      _n.copy(origin).sub(hit.point);
      _n.y = 0;
      if (_n.lengthSq() > 1e-8 && hit.normal.dot(_n) < 0) hit.normal.negate();
      const gap = gapToWallPlane(hit.point, hit.normal);
      if (gap < bestGap - 1e-4 || (Math.abs(gap - bestGap) < 1e-4 && hitDist < bestDist)) {
        bestGap = gap;
        bestHit = hit;
        bestDist = hitDist;
      }
    }
    return bestHit ? { hit: bestHit, gap: bestGap, origin, dist: bestDist } : null;
  }

  /** Выровнять мебель параллельно стене (ближайший из 4 курсов). */
  function snapYawToWallHit(hit) {
    if (yawFree || !hit) return;
    const nx = hit.normal.x;
    const nz = hit.normal.z;
    const next = nearestAngle(yaw, [
      Math.atan2(nx, nz),
      Math.atan2(-nx, -nz),
      Math.atan2(-nz, nx),
      Math.atan2(nz, -nx),
    ]);
    const diff = Math.abs(Math.atan2(Math.sin(yaw - next), Math.cos(yaw - next)));
    if (diff < 1e-3) return;
    yaw = next;
    ghostRoot.rotation.set(0, yaw, 0);
  }

  /**
   * После движения: пересечение только с близкой стеной — вытолкнуть.
   */
  function alignFloorToNearbyWall(moveDir = null) {
    const reach = furnitureRadiusXZ() + 0.55;
    const found = findNearbyWallHit(reach, moveDir);
    contactWall = null;
    if (!found) return;
    const { hit, gap } = found;
    contactWall = { point: hit.point.clone(), normal: hit.normal.clone() };
    if (gap >= WALL_EPS) return;
    // ложная дальняя плоскость: зазор больше реального габарита
    if (gap < -(furnitureRadiusXZ() * 1.5 + 0.2)) return;
    if (wallAllowsPass(hit, moveDir)) {
      markWallCleared(hit);
      return;
    }
    snapYawToWallHit(hit);
    pushOutOfPlane(hit.point, hit.normal);
  }

  /** Луч из передних углов мебели (по dir) — ближайшая стена. */
  function findWallHitFromCorners(dir, maxDist) {
    const corners = furnitureWorldCorners();
    if (!corners) return null;
    const c = furnitureCenterXZ();
    let best = null;
    let bestAlong = Infinity;
    for (let i = 0; i < 8; i++) {
      const lead = (corners[i].x - c.x) * dir.x + (corners[i].z - c.z) * dir.z;
      if (lead < -0.02) continue; // задние углы не стреляем
      const ox = corners[i].x;
      const oy = Math.max(corners[i].y, ghostRoot.position.y + 0.12);
      const oz = corners[i].z;
      const hit = findWallHit(_corner.set(ox, oy, oz), dir, maxDist);
      if (!hit) continue;
      const along = (hit.point.x - ox) * dir.x + (hit.point.z - oz) * dir.z;
      if (along >= 0 && along < bestAlong) {
        bestAlong = along;
        best = hit;
        _n.copy(_corner).sub(hit.point);
        _n.y = 0;
        if (_n.lengthSq() > 1e-8 && best.normal.dot(_n) < 0) best.normal.negate();
      }
    }
    return best ? { hit: best, along: bestAlong } : null;
  }

  /**
   * IJKL: упор → выравнивание Parallel; 3 упора → проход на 1 м;
   * преодолённые стены не мешают, пока снова не подойдём к ним.
   */
  function resolveMoveAgainstWalls(move, dt) {
    _movePrev.copy(ghostRoot.position);
    _moveDelta.copy(move).multiplyScalar(STEP * dt);
    const dist = _moveDelta.length();
    if (dist < 1e-8) {
      wallBumpHold = 0;
      return false;
    }

    const dir = _moveDelta.clone().normalize();
    const extent = extentAlongDir(dir);
    const nearLimit = extent + 0.2;
    // углы на позе до шага
    ghostRoot.position.copy(_movePrev);
    ghostRoot.updateMatrixWorld(true);

    const fromCorners = findWallHitFromCorners(dir, dist + nearLimit + 0.05);
    const origin = ghostProbeOrigin().clone();
    let hit = fromCorners?.hit || null;
    let hitAlong = fromCorners?.along ?? Infinity;

    if (!hit) {
      const centerHit = findWallHit(origin, dir, dist + nearLimit);
      if (centerHit) {
        hit = centerHit;
        _n.copy(origin).sub(hit.point);
        _n.y = 0;
        if (_n.lengthSq() > 1e-8 && hit.normal.dot(_n) < 0) hit.normal.negate();
        hitAlong = hit.point.clone().sub(origin).dot(dir) - extent;
      }
    }

    if (hit) {
      const intoWall = dir.dot(hit.normal) < -0.12;
      const gapNow = gapToWallPlane(hit.point, hit.normal);
      const close = hitAlong <= dist + 0.08 && gapNow < extent + 0.12;
      if (intoWall && close) {
        if (wallAllowsPass(hit, dir)) {
          markWallCleared(hit);
        } else {
          wallBumpHold += dt;
          if (wallBumpHold >= WALL_BUMP_HOLD) {
            registerWallBump(hit);
            wallBumpHold = 0;
          }
          if (!wallAllowsPass(hit, dir)) {
            const stop = Math.max(0, Math.min(dist, Math.min(hitAlong, gapNow) - WALL_EPS));
            ghostRoot.position.set(
              _movePrev.x + dir.x * stop,
              _movePrev.y,
              _movePrev.z + dir.z * stop,
            );
            ghostRoot.updateMatrixWorld(true);
            contactWall = { point: hit.point.clone(), normal: hit.normal.clone() };
            snapYawToWallHit(hit);
            pushOutOfPlane(hit.point, hit.normal);
            pullFlushToWall(hit.point, hit.normal, Math.max(0.35, extent + 0.08));
            return true;
          }
        }
      } else {
        wallBumpHold = 0;
      }
    } else {
      wallBumpHold = 0;
    }

    ghostRoot.position.x = _movePrev.x + _moveDelta.x;
    ghostRoot.position.z = _movePrev.z + _moveDelta.z;
    ghostRoot.updateMatrixWorld(true);

    const moved = Math.hypot(
      ghostRoot.position.x - _movePrev.x,
      ghostRoot.position.z - _movePrev.z,
    );
    noteWallPassTravel(moved);

    // в режиме прохода помечать стены, через которые идём
    if (wallPassActive) {
      const mid = findNearbyWallHit(furnitureRadiusXZ() + 0.4, dir);
      if (mid && mid.gap < WALL_CLEAR_GAP) markWallCleared(mid.hit);
    }

    const found = findNearbyWallHit(nearLimit + 0.2, dir);
    if (found && found.gap < WALL_EPS && !wallAllowsPass(found.hit, dir)) {
      if (found.gap < -(furnitureRadiusXZ() * 1.5 + 0.2)) {
        /* ложная дальняя плоскость */
      } else if (dir.dot(found.hit.normal) < -0.12) {
        wallBumpHold += dt;
        if (wallBumpHold >= WALL_BUMP_HOLD) {
          registerWallBump(found.hit);
          wallBumpHold = 0;
        }
        if (!wallAllowsPass(found.hit, dir)) {
          snapYawToWallHit(found.hit);
          pushOutOfPlane(found.hit.point, found.hit.normal);
          pullFlushToWall(found.hit.point, found.hit.normal, 0.35);
          contactWall = { point: found.hit.point.clone(), normal: found.hit.normal.clone() };
          return true;
        }
      }
    } else if (found && wallAllowsPass(found.hit, dir)) {
      markWallCleared(found.hit);
    }
    return false;
  }

  function pushOutOfNearbyWalls() {
    const reach = furnitureRadiusXZ() + 0.55;
    const found = findNearbyWallHit(reach);
    contactWall = null;
    if (!found || found.gap >= WALL_EPS) return;
    if (found.gap < -(furnitureRadiusXZ() * 1.5 + 0.2)) return;
    if (wallAllowsPass(found.hit)) {
      markWallCleared(found.hit);
      return;
    }
    snapYawToWallHit(found.hit);
    pushOutOfPlane(found.hit.point, found.hit.normal);
    contactWall = { point: found.hit.point.clone(), normal: found.hit.normal.clone() };
  }

  /** Зазор ближайшей точки OBB до плоскости стены (в комнату > 0). */
  function gapToWallPlane(planePoint, planeNormal) {
    const corners = worldObbCorners();
    if (!corners) return Infinity;
    const planeD = planeNormal.dot(planePoint);
    let minSide = Infinity;
    for (let c = 0; c < 8; c++) {
      minSide = Math.min(minSide, planeNormal.dot(corners[c]) - planeD);
    }
    return minSide;
  }

  /**
   * Прижим к стене для R/F: без телепорта на hit.point (из‑за него ТВ «исчезал»).
   * Берём текущую позу и проецируем на плоскость стены.
   */
  function ensureWallMountForLift() {
    if (mount === "wall") return true;
    applySurface(); // обновить contactWall
    let hit = contactWall;
    if (!hit) {
      // короткий поиск только рядом
      measureGhostBox();
      const origin = _tmp.set(_center.x, Math.max(_center.y, _box.min.y + 0.25), _center.z);
      cameraFlatAxes();
      let best = null;
      let bestGap = Infinity;
      for (const dir of [_fwd, _fwd.clone().negate(), _right, _right.clone().negate()]) {
        const h = findWallHit(origin, dir, 0.85);
        if (!h) continue;
        const g = Math.abs(gapToWallPlane(h.point, h.normal));
        if (g < bestGap) {
          bestGap = g;
          best = h;
        }
      }
      hit = best;
    }
    if (!hit) {
      status("R/F: нет стены рядом — придвиньте IJKL или T");
      return false;
    }
    const gap = gapToWallPlane(hit.point, hit.normal);
    // слишком далеко — не приклеивать (иначе прыжок сквозь дом)
    if (gap > 0.45 && gap < 1e6) {
      status("R/F: сначала вплотную к стене");
      return false;
    }
    mount = "wall";
    wallNormal.copy(hit.normal);
    wallPlanePoint.copy(hit.point);
    // якорь = текущая позиция, спроецированная на плоскость (Y сохраняем)
    wallAnchor.copy(ghostRoot.position);
    const dist = wallNormal.dot(wallAnchor) - wallNormal.dot(wallPlanePoint);
    wallAnchor.addScaledVector(wallNormal, -dist);
    applySurface();
    return true;
  }

  function updateProjections() {
    const box = measureGhostBox();
    if (groupMembers?.length) {
      projFloor.visible = true;
      projWall.visible = false;
      const gw = Math.max(0.2, _size.x);
      const gd = Math.max(0.2, _size.z);
      projFloor.geometry.dispose();
      projFloor.geometry = new THREE.PlaneGeometry(gw, gd);
      projFloor.position.set(_center.x, box.min.y + 0.015, _center.z);
      projFloor.rotation.set(-Math.PI / 2, ghostRoot.rotation.y, 0);
      return;
    }
    // Локальное пятно по курсу мебели (не world-AABB — иначе ромб при повороте).
    const localW = Math.max(0.05, baseSize.w * sx);
    const localD = Math.max(0.05, baseSize.d * sz);
    const localH = Math.max(0.05, baseSize.h * sy);
    if (mount === "wall") {
      projWall.visible = true;
      projFloor.visible = false;
      projWall.geometry.dispose();
      projWall.geometry = new THREE.PlaneGeometry(localW, localH);
      projWall.position.set(
        wallPlanePoint.x + wallNormal.x * 0.015,
        _center.y,
        wallPlanePoint.z + wallNormal.z * 0.015,
      );
      projWall.quaternion.setFromUnitVectors(_zAxis, wallNormal);
      return;
    }
    projFloor.visible = true;
    projWall.visible = false;
    projFloor.geometry.dispose();
    projFloor.geometry = new THREE.PlaneGeometry(localW, localD);
    projFloor.position.set(_center.x, box.min.y + 0.015, _center.z);
    // YXZ: сначала yaw, потом «уложить» на пол — без перекоса в ромб.
    projFloor.rotation.set(-Math.PI / 2, yaw, 0);
  }

  function exitSelectMode() {
    clearSelectHighlight();
    if (isSelectMode()) setMode("none");
    publishHint();
  }

  function enterDeleteMode() {
    if (!canEditFurniture()) return;
    if (mode === "delete") {
      exitSelectMode();
      status("Режим удаления выключен");
      return;
    }
    clearGhost();
    exitSelectMode();
    if (!records.length) {
      status("Нет расставленной мебели для удаления");
      setMode("none");
      publishHint();
      return;
    }
    setMode("delete");
    selectedUids.clear();
    selectIndex = -1;
    refreshSelectHighlight();
    status("Удаление (X): клики — выбор, Enter — удалить");
    publishHint();
  }

  function enterEditMode() {
    if (!canEditFurniture()) return;
    if (mode === "edit") {
      exitSelectMode();
      status("Режим правки выключен");
      return;
    }
    clearGhost();
    exitSelectMode();
    if (!records.length) {
      status("Нет расставленной мебели для правки");
      setMode("none");
      publishHint();
      return;
    }
    setMode("edit");
    selectedUids.clear();
    selectIndex = -1;
    refreshSelectHighlight();
    status("Правка (E): клики — выбор, Enter — править группу");
    publishHint();
  }

  function enterCopyMode() {
    if (!canEditFurniture()) return;
    if (mode === "copy") {
      exitSelectMode();
      status("Режим копии выключен");
      return;
    }
    clearGhost();
    exitSelectMode();
    if (!records.length) {
      status("Нет мебели для копирования");
      setMode("none");
      publishHint();
      return;
    }
    setMode("copy");
    selectedUids.clear();
    selectIndex = -1;
    refreshSelectHighlight();
    status("Копия (C): клики — выбор, Enter — копировать группу");
    publishHint();
  }

  function cycleSelect(delta) {
    if (!isSelectMode() || !records.length) return;
    const idx = (selectIndex + delta + records.length) % records.length;
    toggleSelectByIndex(idx);
  }

  function lockSelectionAction() {
    const list = selectedRecords();
    if (!list.length) {
      status("Сначала кликните по мебели");
      return;
    }
    if (mode === "delete") {
      deleteSelectedGroup(list);
      return;
    }
    if (mode === "edit") {
      beginGroupEdit(list);
      return;
    }
    if (mode === "copy") {
      beginGroupCopy(list);
    }
  }

  function spotFree(worldPos, minDist) {
    const d2 = minDist * minDist;
    for (const r of records) {
      if (!r.holder?.visible) continue;
      const dx = r.holder.position.x - worldPos.x;
      const dz = r.holder.position.z - worldPos.z;
      if (dx * dx + dz * dz < d2) return false;
    }
    return true;
  }

  /** Смещение копии рядом с оригиналом (экскурсия). */
  function offsetBeside(rec) {
    cameraFlatAxes();
    const w = (rec.data.cmW || 0.8) * (rec.data.sx || 1);
    const d = (rec.data.cmD || 0.8) * (rec.data.sz || 1);
    const step = Math.max(w, d, 0.5) + 0.22;
    const candidates = [];
    if (rec.data.wall) {
      const n = new THREE.Vector3(Math.sin(rec.data.yaw || 0), 0, Math.cos(rec.data.yaw || 0));
      const t = new THREE.Vector3(-n.z, 0, n.x);
      candidates.push(t.clone().multiplyScalar(step), t.clone().multiplyScalar(-step));
    }
    candidates.push(
      _right.clone().multiplyScalar(step),
      _right.clone().multiplyScalar(-step),
      _fwd.clone().multiplyScalar(step),
      _fwd.clone().multiplyScalar(-step),
    );
    const base = rec.holder.position;
    for (const off of candidates) {
      _tmp.set(base.x + off.x, base.y, base.z + off.z);
      if (spotFree(_tmp, step * 0.4)) return _tmp.clone();
    }
    return new THREE.Vector3(base.x + candidates[0].x, base.y, base.z + candidates[0].z);
  }

  function deleteSelectedGroup(list) {
    if (mode !== "delete") return;
    const targets = list || selectedRecords();
    if (!targets.length) {
      status("Кликните по мебели, затем Enter");
      return;
    }
    const uids = new Set(targets.map((r) => r.data.uid));
    let removed = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (!uids.has(records[i].data.uid)) continue;
      placed.remove(records[i].holder);
      records.splice(i, 1);
      removed += 1;
    }
    selectedUids.clear();
    saveAll();
    status(`Удалено: ${removed}`);
    if (!records.length) {
      exitSelectMode();
      return;
    }
    refreshSelectHighlight();
  }

  function groupPivotOf(list) {
    const pivot = new THREE.Vector3();
    for (const rec of list) pivot.add(rec.holder.position);
    if (list.length) pivot.multiplyScalar(1 / list.length);
    return pivot;
  }

  function beginGroupEdit(list) {
    if (mode !== "edit" || !list?.length) {
      status("Кликните по мебели, затем Enter");
      return;
    }
    clearSelectHighlight();
    const pivot = groupPivotOf(list);
    const members = [];
    for (const rec of list) {
      const holder = rec.holder;
      const wrap = holder.children[0];
      const model = wrap?.children?.[0];
      if (!wrap || !model) continue;
      const item = catalogById.get(rec.data.id) || {
        id: rec.data.id,
        file: rec.data.file,
        cm: [(rec.data.cmW || 0.8) * 100, (rec.data.cmD || 0.8) * 100, (rec.data.cmH || 0.8) * 100],
      };
      const uid = rec.data.uid;
      for (let i = records.length - 1; i >= 0; i--) {
        if (records[i].data.uid === uid) {
          const h = records[i].holder;
          if (h && h !== holder) placed.remove(h);
          records.splice(i, 1);
        }
      }
      placed.remove(holder);
      rec._savedPos = holder.position.clone();
      rec._savedYaw = holder.rotation.y;
      holder.remove(wrap);
      ghostify(model);
      wrap.position.set(
        holder.position.x - pivot.x,
        holder.position.y - pivot.y,
        holder.position.z - pivot.z,
      );
      wrap.rotation.set(0, holder.rotation.y, 0);
      {
        const sc = scaleFromData(rec.data);
        wrap.scale.set(sc.x, sc.y, sc.z);
      }
      ghostRoot.add(wrap);
      members.push({
        rec,
        wrap,
        model,
        item,
        data0: { ...rec.data },
        isCopy: false,
      });
    }
    if (!members.length) {
      status("Некорректные объекты мебели");
      return;
    }
    editingRec = null;
    groupMembers = members;
    placeIntent = "edit";
    ghostItem = members[0].item;
    ghost = members[0].wrap;
    ghostModel = members[0].model;
    baseSize = {
      w: members[0].data0.cmW || footprintFromCm(members[0].item.cm).w,
      d: members[0].data0.cmD || footprintFromCm(members[0].item.cm).d,
      h: members[0].data0.cmH || footprintFromCm(members[0].item.cm).h,
    };
    sx = sy = sz = 1;
    mirror = false;
    mirrorZ = false;
    yaw = 0;
    mount = "floor";
    ghostRoot.position.copy(pivot);
    ghostRoot.rotation.set(0, 0, 0);
    ghostRoot.scale.set(1, 1, 1);
    ghostRoot.visible = true;
    wallAnchor.copy(ghostRoot.position);
    setMode("place");
    updateProjections();
    status(`Правка группы (${members.length}): IJKL · Enter — зафиксировать · Esc — отмена`);
    publishHint();
  }

  async function beginGroupCopy(list) {
    if (mode !== "copy" || !list?.length) {
      status("Кликните по мебели, затем Enter");
      return;
    }
    clearSelectHighlight();
    editingRec = null;
    placeIntent = "copy";
    clearGhost();
    const pivot = groupPivotOf(list);
    const members = [];
    try {
      for (const rec of list) {
        const item = catalogById.get(rec.data.id) || {
          id: rec.data.id,
          file: rec.data.file,
          cm: [(rec.data.cmW || 0.8) * 100, (rec.data.cmD || 0.8) * 100, (rec.data.cmH || 0.8) * 100],
        };
        if (!item.file) continue;
        const model = await loadModel(item.file);
        ghostify(model);
        model.position.set(0, 0, 0);
        model.scale.set(1, 1, 1);
        model.updateMatrixWorld(true);
        const cmW = rec.data.cmW || footprintFromCm(item.cm).w;
        const cmD = rec.data.cmD || footprintFromCm(item.cm).d;
        const cmH = rec.data.cmH || footprintFromCm(item.cm).h;
        _box.setFromObject(model);
        _box.getSize(_size);
        const fit = Math.min(
          cmW / Math.max(_size.x, 1e-3),
          cmD / Math.max(_size.z, 1e-3),
          cmH / Math.max(_size.y, 1e-3),
        );
        seatModelFeet(model, fit, fit, fit);
        const wrap = new THREE.Group();
        wrap.add(model);
        wrap.position.set(
          rec.holder.position.x - pivot.x,
          rec.holder.position.y - pivot.y,
          rec.holder.position.z - pivot.z,
        );
        wrap.rotation.set(0, rec.holder.rotation.y, 0);
        {
          const sc = scaleFromData(rec.data);
          wrap.scale.set(sc.x, sc.y, sc.z);
        }
        ghostRoot.add(wrap);
        members.push({
          rec,
          wrap,
          model,
          item,
          data0: { ...rec.data, cmW, cmD, cmH },
          isCopy: true,
        });
      }
      if (!members.length) {
        status("Не удалось копировать");
        return;
      }
      groupMembers = members;
      ghostItem = members[0].item;
      ghost = members[0].wrap;
      ghostModel = members[0].model;
      baseSize = {
        w: members[0].data0.cmW,
        d: members[0].data0.cmD,
        h: members[0].data0.cmH,
      };
      sx = sy = sz = 1;
      mirror = false;
      mirrorZ = false;
      yaw = 0;
      mount = "floor";
      // та же поза, что у исходников (не под мышь)
      ghostRoot.position.copy(pivot);
      ghostRoot.rotation.set(0, 0, 0);
      ghostRoot.scale.set(1, 1, 1);
      ghostRoot.visible = true;
      wallAnchor.copy(ghostRoot.position);
      setMode("place");
      updateProjections();
      status(`Копия группы (${members.length}): та же поза · IJKL · Enter — зафиксировать`);
      publishHint();
    } catch (err) {
      console.warn(err);
      status("Не удалось копировать группу");
      clearGhost();
      setMode("copy");
      for (const rec of list) if (rec.data?.uid) selectedUids.add(rec.data.uid);
      refreshSelectHighlight();
      publishHint();
    }
  }

  function meshTargets() {
    return hitTargets().filter((m) => m && m.visible && m.isMesh);
  }

  /**
   * Горизонтальные оси от наблюдателя (камера), не от yaw мебели.
   * I — вглубь взгляда, K — к себе, J — влево экрана, L — вправо экрана.
   */
  function cameraFlatAxes() {
    // Столбцы matrixWorld: X = вправо камеры, Z = назад камеры (смотрит −Z).
    const e = camera.matrixWorld.elements;
    _right.set(e[0], 0, e[2]);
    _fwd.set(-e[8], 0, -e[10]);
    if (_fwd.lengthSq() < 1e-8 && _right.lengthSq() < 1e-8) {
      // совсем вырожденно
      _fwd.set(0, 0, -1);
      _right.set(1, 0, 0);
      return;
    }
    if (_fwd.lengthSq() < 1e-8) {
      // взгляд почти вертикально вниз/вверх — вперёд из «вправо»
      _right.normalize();
      _fwd.set(-_right.z, 0, _right.x);
    } else if (_right.lengthSq() < 1e-8) {
      _fwd.normalize();
      _right.set(-_fwd.z, 0, _fwd.x);
    } else {
      _fwd.normalize();
      // ортогонализуем right к forward в XZ: right = forward × worldUp
      _right.set(-_fwd.z, 0, _fwd.x).normalize();
    }
  }

  function wrapScaleX() {
    return (mirror ? -1 : 1) * sx;
  }
  function wrapScaleZ() {
    return (mirrorZ ? -1 : 1) * sz;
  }

  function scaleFromData(d) {
    return {
      x: (d.mirror ? -1 : 1) * (d.sx || 1),
      y: d.sy || 1,
      z: (d.mirrorZ ? -1 : 1) * (d.sz || 1),
    };
  }

  function applyGhostScale() {
    // fitScale в model; на wrap — масштаб + зеркало (ось лево/право от взгляда).
    if (ghost) ghost.scale.set(wrapScaleX(), sy, wrapScaleZ());
    invalidateLocalFurnBox();
  }

  /** Какая локальная ось мебели сейчас «влево-вправо» на экране. */
  function viewLeftRightAxis() {
    cameraFlatAxes();
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    const alignX = Math.abs(lx * _right.x + lz * _right.z);
    const zx = Math.sin(yaw);
    const zz = Math.cos(yaw);
    const alignZ = Math.abs(zx * _right.x + zz * _right.z);
    return alignX >= alignZ ? "x" : "z";
  }

  /** Зеркало левое↔правое относительно взгляда наблюдателя. */
  function toggleViewMirror() {
    if (groupMembers) {
      cameraFlatAxes();
      if (Math.abs(_right.x) >= Math.abs(_right.z)) ghostRoot.scale.x *= -1;
      else ghostRoot.scale.z *= -1;
      status("Зеркало: лево↔право от взгляда");
      updateProjections();
      return;
    }
    if (viewLeftRightAxis() === "x") mirror = !mirror;
    else mirrorZ = !mirrorZ;
    applyGhostScale();
    applySurface({ throughWalls: true });
    const on = mirror || mirrorZ;
    status(on ? "Зеркало: вкл (лево↔право от взгляда)" : "Зеркало: выкл");
  }

  /**
   * @param {{ throughWalls?: boolean }} [opts]
   *   throughWalls — стены пропускают (поворот 9/0); при движении — выталкивание при пересечении
   */
  function applySurface(opts = {}) {
    const throughWalls = !!opts.throughWalls;
    if (groupMembers?.length) {
      // группа: жёсткий каркас ghostRoot (позиция / yaw / scale), без прилипания к стенам
      updateProjections();
      return;
    }
    if (!ghost || !ghostModel) return;
    applyGhostScale();

    if (mount === "wall") {
      // лицом в комнату (forward = normal)
      yaw = Math.atan2(wallNormal.x, wallNormal.z);
      ghostRoot.rotation.set(0, yaw, 0);
      const wantY = wallAnchor.y;
      ghostRoot.position.set(wallAnchor.x, wantY, wallAnchor.z);
      // на плоскость стены
      const planeD = wallNormal.dot(wallPlanePoint);
      const dist = wallNormal.dot(ghostRoot.position) - planeD;
      ghostRoot.position.addScaledVector(wallNormal, -dist);
      ghostRoot.position.y = wantY;
      // не ниже пола; выше пола — можно (подъём R)
      snapFeet(false);
      if (wantY > ghostRoot.position.y) ghostRoot.position.y = wantY;
      if (!throughWalls) {
        pushOutOfPlane(wallPlanePoint, wallNormal);
        pullFlushToWall(wallPlanePoint, wallNormal, 0.2);
      }
      {
        measureGhostBox();
        const floorY = sampleFloorY(_center.x, _center.z);
        const maxTop = floorY + WALL_MAX_H;
        if (_box.max.y > maxTop) {
          ghostRoot.position.y -= _box.max.y - maxTop;
          if (!throughWalls) pushOutOfPlane(wallPlanePoint, wallNormal);
        }
        const minY = floorY + FOOT_EPS;
        if (ghostRoot.position.y < minY) ghostRoot.position.y = minY;
        wallAnchor.copy(ghostRoot.position);
      }
      updateProjections();
      return;
    }

    // пол: ноги на плиту; при пересечении — вытолкнуть (поворот — сквозь стены)
    ghostRoot.rotation.set(0, yaw, 0);
    snapFeet(true);
    if (!throughWalls) alignFloorToNearbyWall();
    snapFeet(true);
    updateProjections();
  }

  function tryAttachWall() {
    cameraFlatAxes();
    measureGhostBox();
    const origin = _tmp.set(_center.x, Math.max(_center.y, _box.min.y + 0.25), _center.z);
    const dirs = [
      _fwd.clone(),
      _fwd.clone().negate(),
      _right.clone(),
      _right.clone().negate(),
    ];
    let best = null;
    let bestGap = Infinity;
    for (const dir of dirs) {
      const hit = findWallHit(origin, dir, 1.0);
      if (!hit) continue;
      const g = Math.abs(gapToWallPlane(hit.point, hit.normal));
      if (g < bestGap) {
        bestGap = g;
        best = hit;
      }
    }
    if (!best || bestGap > 0.5) {
      status("Рядом нет стены — остаёмся на полу");
      mount = "floor";
      applySurface();
      return false;
    }
    mount = "wall";
    wallNormal.copy(best.normal);
    wallPlanePoint.copy(best.point);
    wallAnchor.copy(ghostRoot.position);
    const dist = wallNormal.dot(wallAnchor) - wallNormal.dot(wallPlanePoint);
    wallAnchor.addScaledVector(wallNormal, -dist);
    const floorY = sampleFloorY(wallAnchor.x, wallAnchor.z);
    wallAnchor.y = THREE.MathUtils.clamp(
      ghostRoot.position.y,
      floorY + FOOT_EPS,
      floorY + WALL_MAX_H * 0.85,
    );
    applySurface();
    status("На стене: IJKL вдоль · R/F выше/ниже · T — на пол");
    return true;
  }

  function detachToFloor() {
    // Сдвинуть в комнату, иначе следующий pushOut/кадр оставит у стены.
    const nudge = wallNormal.lengthSq() > 1e-8 ? wallNormal : _fwd;
    ghostRoot.position.addScaledVector(nudge, 0.18);
    mount = "floor";
    applySurface();
    status("На полу: IJKL — двигать");
  }

  function toggleMount() {
    if (mount === "wall") detachToFloor();
    else tryAttachWall();
  }

  /** Угол к ближайшему из candidates (разница на круге). */
  function nearestAngle(preferred, candidates) {
    let best = candidates[0];
    let bestDiff = Infinity;
    for (const c of candidates) {
      const d = Math.abs(Math.atan2(Math.sin(preferred - c), Math.cos(preferred - c)));
      if (d < bestDiff) {
        bestDiff = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Yaw параллельно стенам: оси ближайшей стены (нормаль/касательная)
   * или, если стены нет — к осям плана (0 / 90°).
   */
  function yawParallelToWalls(preferredYaw, origin) {
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    let bestHit = null;
    let bestGap = Infinity;
    for (const dir of dirs) {
      const hit = findWallHit(origin, dir, 8);
      if (!hit) continue;
      const gap = origin.distanceTo(hit.point);
      if (gap < bestGap) {
        bestGap = gap;
        bestHit = hit;
      }
    }
    if (bestHit) {
      const nx = bestHit.normal.x;
      const nz = bestHit.normal.z;
      // лицом к стене / от стены / вдоль стены — выбрать ближе к взгляду
      return nearestAngle(preferredYaw, [
        Math.atan2(nx, nz),
        Math.atan2(-nx, -nz),
        Math.atan2(-nz, nx),
        Math.atan2(nz, -nx),
      ]);
    }
    // стены не найдены — сетка плана
    const step = Math.PI / 2;
    return Math.round(preferredYaw / step) * step;
  }

  function spawnInFront() {
    cameraFlatAxes();
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const prefer = Math.atan2(_fwd.x, _fwd.z);
    mount = "floor";
    applyGhostScale();
    // Сначала в точке игрока — замерим AABB, затем сдвинем так, чтобы ближний край был в 1 м впереди.
    ghostRoot.position.set(eye.x, 0, eye.z);
    ghostRoot.rotation.set(0, prefer, 0);
    measureGhostBox();
    let nearest = Infinity;
    for (let ix = 0; ix < 2; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const cx = ix ? _box.max.x : _box.min.x;
        const cz = iz ? _box.max.z : _box.min.z;
        nearest = Math.min(nearest, (cx - eye.x) * _fwd.x + (cz - eye.z) * _fwd.z);
      }
    }
    if (!Number.isFinite(nearest)) nearest = 0;
    const shift = 1.0 - nearest;
    ghostRoot.position.x = eye.x + _fwd.x * shift;
    ghostRoot.position.z = eye.z + _fwd.z * shift;
    const probe = _tmp.set(
      ghostRoot.position.x,
      Math.max(eye.y, 1.2),
      ghostRoot.position.z,
    );
    yaw = yawParallelToWalls(prefer, probe);
    ghostRoot.rotation.set(0, yaw, 0);
    applySurface();
  }

  function updatePointerNdc(event) {
    if (!domElement) return false;
    const rect = domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    lastPointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    lastPointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    lastPointerNdc.ok = true;
    return true;
  }

  /**
   * Осмотр: поставить ghost в точку под курсором (пол или стена).
   * @returns {boolean}
   */
  function placeGhostAtPointer() {
    if (!ghost || !ghostModel) return false;
    if (!lastPointerNdc.ok) return false;
    cameraFlatAxes();
    const prefer = Math.atan2(_fwd.x, _fwd.z);
    raycaster.setFromCamera(_ndc.set(lastPointerNdc.x, lastPointerNdc.y), camera);
    raycaster.far = 250;
    const hits = raycaster.intersectObjects(meshTargets(), true);
    let floorHit = null;
    let wallHit = null;
    for (const h of hits) {
      if (!h.face) continue;
      _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      if (_n.y > 0.55) {
        if (!floorHit) floorHit = { point: h.point.clone(), normal: _n.clone() };
        continue;
      }
      if (Math.abs(_n.y) > 0.35) continue;
      // нормаль в сторону камеры / в комнату
      const toCam = camera.getWorldPosition(_tmp).sub(h.point);
      if (_n.dot(toCam) < 0) _n.negate();
      if (!wallHit) wallHit = { point: h.point.clone(), normal: _n.clone() };
    }
    // Ближайший hit: если луч сначала стену — стена, иначе пол
    let preferWall = false;
    if (hits.length && hits[0].face) {
      _n.copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld).normalize();
      preferWall = Math.abs(_n.y) <= 0.35;
    }
    if (preferWall && wallHit) {
      mount = "wall";
      wallNormal.copy(wallHit.normal);
      wallPlanePoint.copy(wallHit.point);
      wallAnchor.set(wallHit.point.x, wallHit.point.y, wallHit.point.z);
      wallAnchor.addScaledVector(wallNormal, 0.02);
      applySurface();
      return true;
    }
    if (floorHit) {
      mount = "floor";
      ghostRoot.position.set(floorHit.point.x, floorHit.point.y, floorHit.point.z);
      if (!yawFree) {
        const probe = _tmp.set(floorHit.point.x, Math.max(floorHit.point.y, 1.2) + 0.5, floorHit.point.z);
        yaw = yawParallelToWalls(prefer, probe);
      }
      applySurface(); // выровнять по линии ближайшей стены
      return true;
    }
    if (wallHit) {
      mount = "wall";
      wallNormal.copy(wallHit.normal);
      wallPlanePoint.copy(wallHit.point);
      wallAnchor.set(wallHit.point.x, wallHit.point.y, wallHit.point.z);
      wallAnchor.addScaledVector(wallNormal, 0.02);
      applySurface();
      return true;
    }
    return false;
  }

  function spawnAtAim() {
    if (isTourActive()) {
      spawnInFront();
      return;
    }
    if (!placeGhostAtPointer()) {
      // нет курсора над сценой — центр экрана
      lastPointerNdc.x = 0;
      lastPointerNdc.y = 0;
      lastPointerNdc.ok = true;
      if (!placeGhostAtPointer()) spawnInFront();
    }
  }

  async function beginPlace(item) {
    if (!canEditFurniture()) {
      status("Расстановка: снимите крышу в осмотре (не в «Экскурсии»), затем каталог (M).");
      return;
    }
    exitSelectMode();
    editingRec = null;
    groupMembers = null;
    placeIntent = "insert";
    insertPhase = "aim";
    clearGhost();
    ghostItem = item;
    baseSize = footprintFromCm(item.cm);
    sx = sy = sz = 1;
    mirror = false;
    mirrorZ = false;
    try {
      const model = await loadModel(item.file);
      ghostify(model);
      model.position.set(0, 0, 0);
      model.scale.set(1, 1, 1);
      model.updateMatrixWorld(true);
      _box.setFromObject(model);
      _box.getSize(_size);
      fitScale = Math.min(
        baseSize.w / Math.max(_size.x, 1e-3),
        baseSize.d / Math.max(_size.z, 1e-3),
        baseSize.h / Math.max(_size.y, 1e-3),
      );
      seatModelFeet(model, fitScale, fitScale, fitScale);
      const wrap = new THREE.Group();
      wrap.add(model);
      ghostModel = model;
      ghost = wrap;
      ghostRoot.add(wrap);
      ghostRoot.visible = true;
      setMode("place");
      insertPhase = "aim";
      // Сначала за мышью; Enter — правка; ещё Enter — фиксация.
      yawFree = false;
      spawnAtAim();
      status(`Вставка ${item.id}: мышь — точка · Enter — в правку`);
      publishHint();
    } catch (err) {
      console.warn(err);
      status(`Не удалось загрузить ${item.id}`);
      clearGhost();
    }
  }

  function lockInsertToTune() {
    if (placeIntent !== "insert" || insertPhase !== "aim" || !ghost) return false;
    insertPhase = "tune";
    yawFree = false;
    applySurface(); // зафиксировать позу и выровнять по стене
    status(`Правка ${ghostItem?.id || ""}: IJKL · 9/0 · G · Enter — зафиксировать`);
    publishHint();
    return true;
  }

  function dedupedItems() {
    const seen = new Set();
    const items = [];
    for (const r of records) {
      const uid = r?.data?.uid;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      items.push(r.data);
    }
    return items;
  }

  async function saveAll() {
    const variant = getVariant();
    const payload = {
      v: 1,
      items: dedupedItems(),
    };
    try {
      const res = await fetch(furnitureUrl(variant), {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // убрать старый браузерный кэш, если был
      try {
        localStorage.removeItem(`house-light-furn:${variant}`);
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.warn(err);
      status("Не удалось сохранить расстановку на сервере");
    }
  }

  function makeHolder(data, model) {
    const holder = new THREE.Group();
    holder.userData.tourFurn = true;
    holder.userData.furnId = data.uid;
    // seat при identity (ещё не в holder)
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);
    _box.setFromObject(model);
    _box.getSize(_size);
    const s0 = Math.min(
      (data.cmW || baseSize.w) / Math.max(_size.x, 1e-3),
      (data.cmD || baseSize.d) / Math.max(_size.z, 1e-3),
      (data.cmH || baseSize.h) / Math.max(_size.y, 1e-3),
    );
    seatModelFeet(model, s0, s0, s0);
    enableFurnitureShadows(model);
    const wrap = new THREE.Group();
    {
      const sc = scaleFromData(data);
      wrap.scale.set(sc.x, sc.y, sc.z);
    }
    wrap.add(model);
    holder.add(wrap);
    const [e, n] = planToWorld(data.x, data.y);
    holder.position.set(e, data.z, n);
    holder.rotation.y = data.yaw || 0;
    holder.updateMatrixWorld(true);
    _box.setFromObject(holder);
    _box.getCenter(_center);
    const floorY = sampleFloorY(_center.x, _center.z);
    if (!data.wall) {
      holder.position.y += floorY + FOOT_EPS - _box.min.y;
    } else if (_box.min.y < floorY + FOOT_EPS) {
      holder.position.y += floorY + FOOT_EPS - _box.min.y;
    }
    return holder;
  }

  async function spawnRecord(data, item) {
    const model = await loadModel(item.file);
    const holder = makeHolder(data, model);
    placed.add(holder);
    records.push({ uuid: holder.uuid, data, holder, itemId: item.id });
    return holder;
  }

  function bakeMemberWorld(m) {
    m.wrap.updateMatrixWorld(true);
    m.wrap.matrixWorld.decompose(_groupPos, _groupQuat, _groupScale);
    _groupEuler.setFromQuaternion(_groupQuat, "YXZ");
    return {
      pos: _groupPos.clone(),
      yaw: _groupEuler.y,
      sx: Math.max(0.05, Math.abs(_groupScale.x)),
      sy: Math.max(0.05, Math.abs(_groupScale.y)),
      sz: Math.max(0.05, Math.abs(_groupScale.z)),
      mirror: _groupScale.x < 0,
      mirrorZ: _groupScale.z < 0,
    };
  }

  async function commitGroup() {
    if (!groupMembers?.length || !canEditFurniture()) return;
    ghostRoot.updateMatrixWorld(true);
    const editing = placeIntent === "edit";
    try {
      for (let mi = 0; mi < groupMembers.length; mi++) {
        const m = groupMembers[mi];
        const baked = bakeMemberWorld(m);
        const [x, y] = worldToPlan(baked.pos.x, baked.pos.z);
        const data = {
          uid: editing && m.rec?.data?.uid
            ? m.rec.data.uid
            : `f_${Date.now().toString(36)}_${mi}_${Math.random().toString(36).slice(2, 7)}`,
          id: m.item.id,
          file: m.item.file,
          cmW: m.data0.cmW,
          cmD: m.data0.cmD,
          cmH: m.data0.cmH,
          x: Math.round(x * 1000) / 1000,
          y: Math.round(y * 1000) / 1000,
          z: Math.round(baked.pos.y * 1000) / 1000,
          yaw: Math.round(baked.yaw * 1000) / 1000,
          sx: Math.round(baked.sx * 1000) / 1000,
          sy: Math.round(baked.sy * 1000) / 1000,
          sz: Math.round(baked.sz * 1000) / 1000,
          mirror: !!baked.mirror,
          mirrorZ: !!baked.mirrorZ,
          wall: !!m.data0.wall,
        };
        if (editing && m.rec) {
          const wrap = m.wrap;
          const holder = m.rec.holder;
          unghostify(m.model || wrap);
          ghostRoot.remove(wrap);
          wrap.position.set(0, 0, 0);
          wrap.rotation.set(0, 0, 0);
          {
            const sc = scaleFromData(data);
            wrap.scale.set(sc.x, sc.y, sc.z);
          }
          holder.add(wrap);
          holder.position.copy(baked.pos);
          holder.rotation.set(0, baked.yaw, 0);
          holder.userData.furnId = data.uid;
          holder.visible = true;
          m.rec.data = data;
          m.rec.itemId = data.id;
          placed.add(holder);
          if (!records.includes(m.rec)) records.push(m.rec);
        } else {
          ghostRoot.remove(m.wrap);
          disposeGhostTree(m.wrap);
          await spawnRecord(data, m.item);
        }
      }
      groupMembers = null;
      editingRec = null;
      while (ghostRoot.children.length) ghostRoot.remove(ghostRoot.children[0]);
      resetGhostFlags();
      await saveAll();
      status(editing
        ? `Группа сохранена. E — ещё · C — копия · X — удаление.`
        : `Группа скопирована. E — правка · C — копия · X — удаление.`);
    } catch (err) {
      console.warn(err);
      status(editing ? "Ошибка правки группы" : "Ошибка копии группы");
      clearGhost();
    }
  }

  async function commitPlace() {
    if (!canEditFurniture()) return;
    if (groupMembers?.length) {
      await commitGroup();
      return;
    }
    if (!ghost || !ghostItem) return;
    applySurface();
    const [x, y] = worldToPlan(ghostRoot.position.x, ghostRoot.position.z);
    const rec = editingRec;
    const editing = placeIntent === "edit" && !!rec;
    const data = {
      uid: editing ? rec.data.uid : `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      id: ghostItem.id,
      file: ghostItem.file,
      cmW: baseSize.w,
      cmD: baseSize.d,
      cmH: baseSize.h,
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      z: Math.round(ghostRoot.position.y * 1000) / 1000,
      yaw: Math.round(yaw * 1000) / 1000,
      sx, sy, sz,
      mirror: !!mirror,
      mirrorZ: !!mirrorZ,
      wall: mount === "wall",
    };
    try {
      if (editing) {
        const wrap = ghost;
        const holder = rec.holder;
        unghostify(ghostModel || wrap);
        ghostRoot.remove(wrap);
        wrap.scale.set(wrapScaleX(), sy, wrapScaleZ());
        holder.add(wrap);
        holder.position.copy(ghostRoot.position);
        holder.rotation.set(0, yaw, 0);
        holder.userData.furnId = data.uid;
        holder.visible = true;
        rec.data = data;
        rec.itemId = data.id;
        placed.add(holder);
        if (!records.includes(rec)) records.push(rec);
        editingRec = null;
        resetGhostFlags();
        await saveAll();
        status(`Сохранена правка ${data.id}. E — ещё · C — копия · X — удаление.`);
      } else {
        await spawnRecord(data, ghostItem);
        clearGhost();
        await saveAll();
        status(`Поставлено ${ghostItem.id}. M — ещё · E — правка · C — копия · X — удаление.`);
      }
    } catch (err) {
      console.warn(err);
      status(editing ? "Ошибка правки" : "Ошибка установки");
      if (editing && editingRec) {
        editingRec = null;
        resetGhostFlags();
      } else {
        clearGhost();
      }
    }
  }

  async function loadVariant() {
    const seq = ++loadSeq;
    while (placed.children.length) placed.remove(placed.children[0]);
    records.length = 0;
    editingRec = null;
    placeIntent = "insert";
    clearGhost();
    exitSelectMode();
    const variant = getVariant();
    let parsed = null;
    try {
      const res = await fetch(furnitureUrl(variant), {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) parsed = await res.json();
    } catch (err) {
      console.warn("furn fetch", err);
    }
    if (seq !== loadSeq) return;
    // разовый перенос из localStorage, если на сервере ещё пусто
    if ((!parsed || !Array.isArray(parsed.items) || !parsed.items.length)) {
      try {
        const legacy = localStorage.getItem(`house-light-furn:${variant}`);
        if (legacy) {
          const fromBrowser = JSON.parse(legacy);
          if (Array.isArray(fromBrowser?.items) && fromBrowser.items.length) {
            parsed = fromBrowser;
          }
        }
      } catch {
        /* ignore */
      }
    }
    const rawItems = parsed?.items || [];
    const seen = new Set();
    const items = [];
    for (const data of rawItems) {
      if (!data?.uid || seen.has(data.uid)) continue;
      seen.add(data.uid);
      items.push(data);
    }
    for (const data of items) {
      if (seq !== loadSeq) return;
      const item = catalogById.get(data.id)
        || { id: data.id, file: data.file, cm: [data.cmW * 100, data.cmD * 100, data.cmH * 100] };
      if (!item.file) continue;
      try {
        await spawnRecord(data, item);
      } catch (err) {
        console.warn("furn load", data.id, err);
      }
    }
    if (seq !== loadSeq) return;
    // если в файле были дубли — перезаписать чистый список
    if (items.length < rawItems.length) await saveAll();
  }

  function setCatalog(items) {
    catalogById = new Map(items.map((it) => [it.id, it]));
  }

  function onKey(code, down, event) {
    if (!canEditFurniture()) return false;

    if (mode === "place" && (ghost || groupMembers)) {
      if (code in held) {
        held[code] = !!down;
        return true;
      }
      if (!down) return false;
      if (code === "Enter") {
        if (!groupMembers && placeIntent === "insert" && insertPhase === "aim") {
          lockInsertToTune();
          return true;
        }
        commitPlace();
        return true;
      }
      if (groupMembers) {
        if (code === "Digit9" || code === "Numpad9") {
          ghostRoot.rotation.y += Math.PI / 12;
          updateProjections();
          return true;
        }
        if (code === "Digit0" || code === "Numpad0") {
          ghostRoot.rotation.y -= Math.PI / 12;
          updateProjections();
          return true;
        }
        if (code === "KeyG") {
          // лево↔право от взгляда: отразить вдоль экранной горизонтали в мире
          cameraFlatAxes();
          if (Math.abs(_right.x) >= Math.abs(_right.z)) ghostRoot.scale.x *= -1;
          else ghostRoot.scale.z *= -1;
          status("Зеркало группы: лево↔право от взгляда");
          updateProjections();
          return true;
        }
        if (code === "BracketLeft") {
          const s = Math.max(0.4, ghostRoot.scale.x - 0.05);
          ghostRoot.scale.set(s, s, s);
          updateProjections();
          return true;
        }
        if (code === "BracketRight") {
          const s = Math.min(2.5, ghostRoot.scale.x + 0.05);
          ghostRoot.scale.set(s, s, s);
          updateProjections();
          return true;
        }
        if (code === "Minus" || code === "NumpadSubtract") {
          ghostRoot.scale.y = Math.max(0.4, ghostRoot.scale.y - 0.05);
          updateProjections();
          return true;
        }
        if (code === "Equal" || code === "NumpadAdd") {
          ghostRoot.scale.y = Math.min(2.5, ghostRoot.scale.y + 0.05);
          updateProjections();
          return true;
        }
        if (code === "Escape") {
          const wasEdit = placeIntent === "edit";
          clearGhost();
          status(wasEdit ? "Отмена правки группы" : "Отмена копии группы");
          return true;
        }
        return false;
      }
      // В фазе aim (за мышью) — только Enter / Esc; поворот и IJKL после Enter.
      if (placeIntent === "insert" && insertPhase === "aim") {
        if (code === "Escape") {
          clearGhost();
          status("Отмена расстановки");
          return true;
        }
        return false;
      }
      // Только event.code (физическая клавиша), не символ раскладки.
      if (code === "Digit9" || code === "Numpad9") {
        yawFree = true;
        yaw += Math.PI / 12;
        applySurface({ throughWalls: true });
        return true;
      }
      if (code === "Digit0" || code === "Numpad0") {
        yawFree = true;
        yaw -= Math.PI / 12;
        applySurface({ throughWalls: true });
        return true;
      }
      if (code === "KeyG") {
        toggleViewMirror();
        return true;
      }
      if (code === "KeyT") { toggleMount(); return true; }
      if (code === "BracketLeft") { scaleViewWidth(-0.05); return true; }
      if (code === "BracketRight") { scaleViewWidth(0.05); return true; }
      if (code === "Minus" || code === "NumpadSubtract") {
        sy = Math.max(0.4, sy - 0.05);
        applySurface({ throughWalls: true });
        return true;
      }
      if (code === "Equal" || code === "NumpadAdd") {
        sy = Math.min(2.5, sy + 0.05);
        applySurface({ throughWalls: true });
        return true;
      }
      if (code === "Escape") {
        const wasEdit = !!editingRec;
        clearGhost();
        status(wasEdit ? "Отмена правки" : "Отмена расстановки");
        return true;
      }
      return false;
    }

    if (!down) return false;

    // E / C / X — всегда переключают режим (не глотаются внутри select-блоков)
    if (code === "KeyE") { enterEditMode(); return true; }
    if (code === "KeyC") { enterCopyMode(); return true; }
    if (code === "KeyX") { enterDeleteMode(); return true; }

    if (mode === "delete" || mode === "edit" || mode === "copy") {
      if (code === "Tab" && event?.shiftKey) { cycleSelect(-1); return true; }
      if (code === "Tab") { cycleSelect(1); return true; }
      if (code === "Enter" || (mode === "delete" && (code === "Delete" || code === "Backspace"))) {
        lockSelectionAction();
        return true;
      }
      if (code === "Escape") {
        const which = mode;
        exitSelectMode();
        status(which === "delete" ? "Отмена удаления" : which === "copy" ? "Отмена копии" : "Отмена правки");
        return true;
      }
      return false;
    }

    return false;
  }

  /** Масштаб «вширь» — ось предмета, ближе к горизонтали взгляда. */
  function scaleViewWidth(delta) {
    cameraFlatAxes();
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    const alignX = Math.abs(lx * _right.x + lz * _right.z);
    const zx = Math.sin(yaw);
    const zz = Math.cos(yaw);
    const alignZ = Math.abs(zx * _right.x + zz * _right.z);
    if (alignX >= alignZ) sx = Math.min(2.5, Math.max(0.4, sx + delta));
    else sz = Math.min(2.5, Math.max(0.4, sz + delta));
    applySurface();
  }

  function onWheel(_deltaY) {
    // колесо для мебели отключено (в осмотре — зум орбиты)
    return false;
  }

  function onPointerMove(event) {
    updatePointerNdc(event);
    if (!canEditFurniture() || isTourActive()) return false;
    // Фаза aim: ghost за курсором. После Enter — мышь только ракурс.
    if (mode === "place" && ghost && !groupMembers && placeIntent === "insert" && insertPhase === "aim") {
      placeGhostAtPointer();
    }
    return false;
  }

  /** ЛКМ: мультивыбор в E/C/X. В place клик не фиксирует — только Enter. */
  function onPointerDown(event) {
    if (!canEditFurniture()) return false;
    if (event.button !== 0) return false;
    updatePointerNdc(event);
    if (mode === "place") return false;
    if (!isSelectMode()) return false;

    const idx = pickSelectByPointer(event);
    if (idx < 0) return false; // промах — орбита
    toggleSelectByIndex(idx);
    return true;
  }

  /** Орбиту не блокируем: aim — следование за мышью + пан/орбита ПКМ; tune — ракурс. */
  function blocksOrbit() {
    return false;
  }

  function viewMoveIntent() {
    // Всегда от наблюдателя: I вглубь, K к себе, J влево, L вправо (экран / взгляд).
    cameraFlatAxes();
    const move = new THREE.Vector3();
    if (held.KeyI) move.add(_fwd);
    if (held.KeyK) move.sub(_fwd);
    if (held.KeyJ) move.sub(_right); // влево от наблюдателя
    if (held.KeyL) move.add(_right); // вправо от наблюдателя
    move.y = 0;
    if (move.lengthSq() > 1e-8) move.normalize();
    return move;
  }

  function moveGhost(dt) {
    if (mode !== "place") return;
    if (!ghost && !groupMembers) return;
    // Вставка aim — только мышь, без IJKL.
    if (!groupMembers && placeIntent === "insert" && insertPhase === "aim") return;
    const dy = (held.KeyR ? 1 : 0) + (held.KeyF ? -1 : 0);
    const move = viewMoveIntent();

    if (groupMembers) {
      if (move.lengthSq() > 1e-8) {
        ghostRoot.position.x += move.x * STEP * dt;
        ghostRoot.position.z += move.z * STEP * dt;
      }
      if (dy !== 0) {
        ghostRoot.position.y += Math.sign(dy) * LIFT_STEP * dt;
      }
      updateProjections();
      return;
    }

    // R/F у стены: если ещё на полу — автоприжим без телепорта.
    if (dy !== 0 && mount === "floor") {
      if (!ensureWallMountForLift()) return;
    }

    if (mount === "wall") {
      if (dy !== 0) {
        wallAnchor.y += Math.sign(dy) * LIFT_STEP * dt;
      }
      if (move.lengthSq() > 1e-8) {
        // Любая заметная составляющая «в комнату» — отрыв (T тоже снимает).
        const intoRoom = move.dot(wallNormal);
        if (intoRoom > 0.2) {
          detachToFloor();
          ghostRoot.position.x += move.x * STEP * dt;
          ghostRoot.position.z += move.z * STEP * dt;
          applySurface();
          return;
        }
        _tangent.copy(move).addScaledVector(wallNormal, -move.dot(wallNormal));
        if (_tangent.lengthSq() > 1e-8) {
          _tangent.normalize();
          wallAnchor.addScaledVector(_tangent, STEP * dt);
        }
      }
      // подтянуть плоскость стены рядом, не перенося объект на далёкий hit
      const probe = wallAnchor.clone().addScaledVector(wallNormal, 0.25);
      const hit = findWallHit(probe, wallNormal.clone().negate(), 0.8);
      if (hit) {
        wallNormal.copy(hit.normal);
        wallPlanePoint.copy(hit.point);
      }
      applySurface();
      return;
    }

    // пол: IJKL с упором в стены (после 3 упоров — проход этой стены)
    if (move.lengthSq() > 1e-8) {
      resolveMoveAgainstWalls(move, dt);
    }
    applySurface();
  }

  function tick(dt = 0.016) {
    if (!canEditFurniture()) {
      if (ghostRoot.visible) clearGhost();
      if (mode === "delete" || mode === "edit" || mode === "copy") exitSelectMode();
      setHint(isTourActive() ? HINT_IDLE_TOUR : "", isTourActive() ? "idle" : "off");
      return;
    }
    publishHint();
    if (mode === "place" && (ghost || groupMembers)) {
      moveGhost(Math.min(0.05, Math.max(0, dt)));
    }
  }

  function onTourStart() {
    clearGhost();
    exitSelectMode();
    setHint(HINT_IDLE_TOUR, "idle");
  }

  function onTourStop() {
    clearGhost();
    exitSelectMode();
    if (canEditFurniture()) publishHint();
    else setHint("", "off");
  }

  async function onVariantChange() {
    await loadVariant();
  }

  return {
    setCatalog,
    beginPlace,
    tick,
    onKey,
    onWheel,
    onPointerDown,
    onTourStart,
    onTourStop,
    onVariantChange,
    loadVariant,
    isPlacing: () => mode === "place",
    blocksOrbit,
    isDeleting: () => mode === "delete",
    isEditing: () => mode === "edit" || mode === "copy" || !!editingRec || !!groupMembers,
    isCopying: () => mode === "copy",
    mode: () => mode,
    onPointerMove,
    hints: {
      idle: HINT_IDLE_TOUR,
      idleView: HINT_IDLE_VIEW,
      place: HINT_PLACE_TOUR,
      placeAim: HINT_PLACE_AIM,
      placeView: HINT_PLACE_VIEW,
      delete: HINT_DELETE_TOUR,
      deleteView: HINT_DELETE_VIEW,
      edit: HINT_EDIT_TOUR,
      editView: HINT_EDIT_VIEW,
      copy: HINT_COPY_TOUR,
      copyView: HINT_COPY_VIEW,
    },
  };
}
