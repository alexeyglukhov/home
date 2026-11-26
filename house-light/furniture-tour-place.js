// Расстановка мебели: в «Экскурсии» или при осмотре со снятой крышей.
// Мебель двигается клавишами по полу/стенам (отдельно от ходьбы).
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const loader = new GLTFLoader();
const cache = new Map();
const HINT_IDLE_TOUR =
  "M — каталог · E — правка · C — копия · X — удаление · WASD — ход · мышь — взгляд · Esc — стоп";
const HINT_IDLE_VIEW =
  "M — каталог · E — правка · C — копия · X — удаление · мышь — осмотр · расстановка при снятой крыше";
const HINT_PLACE_TOUR =
  "IJKL — двигать · 9/0 — поворот · G — зеркало · R/F у стены · T пол/стена · х/ъ ([ ]) вширь · -/= высота · Enter/ЛКМ — зафиксировать · Esc — отмена";
const HINT_PLACE_VIEW =
  "Мышь — точка · IJKL — подправить · 9/0 — поворот · G — зеркало · R/F у стены · T пол/стена · х/ъ ([ ]) вширь · -/= высота · Enter/ЛКМ — зафиксировать · Esc — отмена";
const HINT_DELETE_TOUR =
  "Смотрите на мебель (рамка) · Enter/Delete/ЛКМ — удалить · Tab — вручную · X/Esc — выход";
const HINT_EDIT_TOUR =
  "Смотрите на мебель (рамка) · Enter/ЛКМ — править · Tab — вручную · E/Esc — выход";
const HINT_COPY_TOUR =
  "Смотрите на мебель (рамка) · Enter/ЛКМ — копировать рядом · Tab — вручную · C/Esc — выход";
const HINT_DELETE_VIEW =
  "Клик по мебели — удалить · X/Esc — выход";
const HINT_EDIT_VIEW =
  "Клик по мебели — править · E/Esc — выход";
const HINT_COPY_VIEW =
  "Клик по мебели — копия (место под мышью) · C/Esc — выход";

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
 * @param {() => boolean} opts.canEditFurniture — экскурсия или осмотр без крыши
 * @param {() => boolean} [opts.isTourActive] — для подсказок ходьбы
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
  let mirror = false; // отражение относительно локального центра (ось Y)
  let fitScale = 1;
  let baseSize = { w: 0.8, d: 0.8, h: 0.8 };
  let mount = "floor"; // floor | wall
  let wallNormal = new THREE.Vector3(0, 0, 1);
  let wallPlanePoint = new THREE.Vector3(); // точка на плоскости стены
  let wallAnchor = new THREE.Vector3(); // текущая поза у стены (ноги)
  let contactWall = null; // последняя стена вплотную (для R/F без T)
  let selectIndex = -1;
  let selectHelper = null;
  let editingRec = null; // запись в правке (объект снят с фиксации, без клона)
  let placeIntent = "insert"; // insert | edit | copy — чтобы правка не путалась с копией
  let loadSeq = 0; // защита от гонок loadVariant
  const records = [];
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
      setHint("", "off");
      return;
    }
    const tour = isTourActive();
    if (mode === "place") setHint(tour ? HINT_PLACE_TOUR : HINT_PLACE_VIEW, "place");
    else if (mode === "delete") setHint(tour ? HINT_DELETE_TOUR : HINT_DELETE_VIEW, "delete");
    else if (mode === "edit") setHint(tour ? HINT_EDIT_TOUR : HINT_EDIT_VIEW, "edit");
    else if (mode === "copy") setHint(tour ? HINT_COPY_TOUR : HINT_COPY_VIEW, "copy");
    else setHint(tour ? HINT_IDLE_TOUR : HINT_IDLE_VIEW, "idle");
  }

  function isSelectMode() {
    return mode === "delete" || mode === "edit" || mode === "copy";
  }

  function clearSelectHighlight() {
    if (selectHelper) {
      scene.remove(selectHelper);
      selectHelper.geometry?.dispose?.();
      selectHelper.material?.dispose?.();
      selectHelper = null;
    }
    selectIndex = -1;
  }

  function refreshSelectHighlight() {
    if (selectHelper) {
      scene.remove(selectHelper);
      selectHelper.geometry?.dispose?.();
      selectHelper.material?.dispose?.();
      selectHelper = null;
    }
    if (!isSelectMode() || selectIndex < 0 || selectIndex >= records.length) {
      if (mode === "delete") {
        status(isTourActive() ? "Удаление: наведите взгляд на мебель" : "Удаление: кликните по мебели");
      } else if (mode === "edit") {
        status(isTourActive() ? "Правка: наведите взгляд на мебель" : "Правка: кликните по мебели");
      } else if (mode === "copy") {
        status(isTourActive() ? "Копия: наведите взгляд на мебель" : "Копия: кликните по мебели");
      }
      return;
    }
    const rec = records[selectIndex];
    if (!rec?.holder?.visible) return;
    const color = mode === "delete" ? 0xe23a3a : mode === "copy" ? 0x3a9e6a : 0xd4a017;
    selectHelper = new THREE.BoxHelper(rec.holder, color);
    scene.add(selectHelper);
    if (mode === "delete") {
      status(
        isTourActive()
          ? `Удаление: ${rec.data.id}. Enter/Delete/ЛКМ — убрать.`
          : `Удаление: ${rec.data.id}`,
      );
    } else if (mode === "copy") {
      status(
        isTourActive()
          ? `Копия: ${rec.data.id}. Enter/ЛКМ — копировать рядом.`
          : `Копия: ${rec.data.id}`,
      );
    } else {
      status(
        isTourActive()
          ? `Правка: ${rec.data.id}. Enter/ЛКМ — править.`
          : `Правка: ${rec.data.id}`,
      );
    }
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

  /** Выбор взглядом (экскурсия): луч из центра камеры. */
  function pickSelectByGaze() {
    if (!isSelectMode()) return;
    if (!records.length) {
      selectIndex = -1;
      refreshSelectHighlight();
      return;
    }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    raycaster.set(camera.getWorldPosition(new THREE.Vector3()), dir);
    raycaster.far = 12;
    const hits = raycaster.intersectObjects(placed.children, true);
    const next = recordIndexFromHit(hits);
    if (next === selectIndex) {
      if (selectHelper) selectHelper.update();
      return;
    }
    selectIndex = next;
    refreshSelectHighlight();
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
    placeIntent = "insert";
    ghostRoot.visible = false;
    projFloor.visible = false;
    projWall.visible = false;
    mount = "floor";
    mirror = false;
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
      wrap.scale.set(
        (rec.data.mirror ? -1 : 1) * (rec.data.sx || 1),
        rec.data.sy || 1,
        rec.data.sz || 1,
      );
    }
    rec.holder.position.copy(rec._savedPos);
    rec.holder.rotation.y = rec._savedYaw;
    rec.holder.visible = true;
    placed.add(rec.holder);
    if (!records.includes(rec)) records.push(rec);
    editingRec = null;
  }

  function clearGhost() {
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

  /**
   * 8 углов OBB модели в мире (не world-AABB): прижим вплотную без ложного зазора
   * у повёрнутого ТВ/мебели.
   */
  function worldObbCorners() {
    if (!ghost) return null;
    _savedPos.copy(ghostRoot.position);
    _savedQuat.copy(ghostRoot.quaternion);
    ghostRoot.position.set(0, 0, 0);
    ghostRoot.quaternion.identity();
    ghostRoot.updateMatrixWorld(true);
    _box.setFromObject(ghostRoot);
    let i = 0;
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          _obCorners[i++].set(
            ix ? _box.max.x : _box.min.x,
            iy ? _box.max.y : _box.min.y,
            iz ? _box.max.z : _box.min.z,
          );
        }
      }
    }
    ghostRoot.position.copy(_savedPos);
    ghostRoot.quaternion.copy(_savedQuat);
    ghostRoot.updateMatrixWorld(true);
    for (let c = 0; c < 8; c++) _obCorners[c].applyMatrix4(ghostRoot.matrixWorld);
    return _obCorners;
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

  function pushOutOfNearbyWalls() {
    measureGhostBox();
    const origin = _tmp.set(_center.x, Math.max(_center.y, _box.min.y + 0.2), _center.z);
    // глубина каталога / OBB — чтобы тонкий ТВ всё равно «видел» стену
    const localD = Math.max(baseSize.d * sz, 0.08);
    const reach = Math.max(_size.x, _size.z, localD) * 0.65 + 0.45;
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
    contactWall = null;
    let bestGap = Infinity;
    let bestHit = null;
    for (const dir of dirs) {
      const hit = findWallHit(origin, dir, reach);
      if (!hit) continue;
      const gap = origin.distanceTo(hit.point);
      if (gap < bestGap) {
        bestGap = gap;
        bestHit = hit;
      }
    }
    if (!bestHit) return;
    // Только выталкивание из стены — без магнита (иначе стул «прыгает» и не отрывается).
    pushOutOfPlane(bestHit.point, bestHit.normal);
    contactWall = { point: bestHit.point.clone(), normal: bestHit.normal.clone() };
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
    selectIndex = -1;
    if (isTourActive()) pickSelectByGaze();
    else refreshSelectHighlight();
    status("Удаление (X): выберите предмет");
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
    selectIndex = -1;
    if (isTourActive()) pickSelectByGaze();
    else refreshSelectHighlight();
    status("Правка (E): выберите предмет");
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
    selectIndex = -1;
    if (isTourActive()) pickSelectByGaze();
    else refreshSelectHighlight();
    status("Копия (C): выберите предмет");
    publishHint();
  }

  function cycleSelect(delta) {
    if (!isSelectMode() || !records.length) return;
    selectIndex = (selectIndex + delta + records.length) % records.length;
    refreshSelectHighlight();
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

  function deleteSelected() {
    if (mode !== "delete" || selectIndex < 0 || selectIndex >= records.length) {
      status(isTourActive() ? "Наведите взгляд на мебель, затем Enter/Delete" : "Кликните по мебели");
      return;
    }
    const rec = records[selectIndex];
    placed.remove(rec.holder);
    records.splice(selectIndex, 1);
    saveAll();
    status(`Удалено ${rec.data.id}`);
    if (!records.length) {
      exitSelectMode();
      return;
    }
    selectIndex = Math.min(selectIndex, records.length - 1);
    refreshSelectHighlight();
  }

  function beginEditSelected() {
    if (mode !== "edit" || selectIndex < 0 || selectIndex >= records.length) {
      status(isTourActive() ? "Наведите взгляд на мебель, затем Enter или ЛКМ" : "Кликните по мебели");
      return;
    }
    const rec = records[selectIndex];
    const holder = rec.holder;
    const wrap = holder.children[0];
    const model = wrap?.children?.[0];
    if (!wrap || !model) {
      status("Некорректный объект мебели");
      return;
    }
    const item = catalogById.get(rec.data.id) || {
      id: rec.data.id,
      file: rec.data.file,
      cm: [(rec.data.cmW || 0.8) * 100, (rec.data.cmD || 0.8) * 100, (rec.data.cmH || 0.8) * 100],
    };
    clearSelectHighlight();
    // снять все записи с тем же uid (защита от старых дублей в JSON)
    const uid = rec.data.uid;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].data.uid === uid) {
        const h = records[i].holder;
        if (h && h !== holder) {
          placed.remove(h);
        }
        records.splice(i, 1);
      }
    }
    placed.remove(holder);

    rec._savedPos = holder.position.clone();
    rec._savedYaw = holder.rotation.y;
    editingRec = rec;
    placeIntent = "edit";

    ghostItem = item;
    baseSize = {
      w: rec.data.cmW || footprintFromCm(item.cm).w,
      d: rec.data.cmD || footprintFromCm(item.cm).d,
      h: rec.data.cmH || footprintFromCm(item.cm).h,
    };
    sx = rec.data.sx || 1;
    sy = rec.data.sy || 1;
    sz = rec.data.sz || 1;
    mirror = !!rec.data.mirror;
    yaw = rec.data.yaw || 0;
    mount = rec.data.wall ? "wall" : "floor";
    fitScale = 1;

    holder.remove(wrap);
    ghostify(model);
    ghostModel = model;
    ghost = wrap;
    ghostRoot.add(wrap);
    ghostRoot.visible = true;
    ghostRoot.position.copy(rec._savedPos);
    ghostRoot.rotation.set(0, yaw, 0);
    wallAnchor.copy(ghostRoot.position);
    if (mount === "wall") {
      wallNormal.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
      wallPlanePoint.copy(ghostRoot.position).addScaledVector(wallNormal, -0.05);
    }
    setMode("place");
    applySurface();
    status(`Правка ${rec.data.id}: IJKL · Enter/ЛКМ — зафиксировать · Esc — отмена`);
    publishHint();
  }

  async function beginCopySelected() {
    if (mode !== "copy" || selectIndex < 0 || selectIndex >= records.length) {
      status(isTourActive() ? "Наведите взгляд на мебель, затем Enter или ЛКМ" : "Кликните по мебели");
      return;
    }
    const rec = records[selectIndex];
    const item = catalogById.get(rec.data.id) || {
      id: rec.data.id,
      file: rec.data.file,
      cm: [(rec.data.cmW || 0.8) * 100, (rec.data.cmD || 0.8) * 100, (rec.data.cmH || 0.8) * 100],
    };
    if (!item.file) {
      status("Нет файла модели");
      return;
    }
    clearSelectHighlight();
    editingRec = null;
    placeIntent = "copy";
    clearGhost();
    ghostItem = item;
    baseSize = {
      w: rec.data.cmW || footprintFromCm(item.cm).w,
      d: rec.data.cmD || footprintFromCm(item.cm).d,
      h: rec.data.cmH || footprintFromCm(item.cm).h,
    };
    sx = rec.data.sx || 1;
    sy = rec.data.sy || 1;
    sz = rec.data.sz || 1;
    mirror = !!rec.data.mirror;
    yaw = rec.data.yaw || 0;
    mount = rec.data.wall ? "wall" : "floor";
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
      if (isTourActive()) {
        const p = offsetBeside(rec);
        ghostRoot.position.copy(p);
        ghostRoot.rotation.set(0, yaw, 0);
        wallAnchor.copy(ghostRoot.position);
        if (mount === "wall") {
          wallNormal.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
          wallPlanePoint.copy(ghostRoot.position).addScaledVector(wallNormal, -0.05);
        }
        applySurface();
      } else {
        // осмотр: сразу под мышь (или центр), как при вставке
        spawnAtAim();
      }
      status(`Копия ${item.id}: мышь/IJKL · Enter/ЛКМ — зафиксировать · Esc — отмена`);
      publishHint();
    } catch (err) {
      console.warn(err);
      status(`Не удалось копировать ${item.id}`);
      clearGhost();
      setMode("copy");
      selectIndex = Math.max(0, records.indexOf(rec));
      refreshSelectHighlight();
      publishHint();
    }
  }

  function meshTargets() {
    return hitTargets().filter((m) => m && m.visible && m.isMesh);
  }

  /** Только вертикальные стены (не пол и не потолок). */
  function findWallHit(origin, direction, maxDist = 4.5) {
    raycaster.set(origin, direction.clone().normalize());
    raycaster.far = maxDist;
    const hits = raycaster.intersectObjects(meshTargets(), true);
    for (const h of hits) {
      if (!h.face) continue;
      _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
      if (Math.abs(_n.y) > 0.35) continue; // пол/потолок
      // нормаль к игроку / от стены наружу
      if (_n.dot(direction) > 0) _n.negate();
      return { point: h.point.clone(), normal: _n.clone() };
    }
    return null;
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

  function applyGhostScale() {
    // fitScale в model; на wrap — пользовательский масштаб + зеркало вокруг центра.
    if (ghost) ghost.scale.set((mirror ? -1 : 1) * sx, sy, sz);
  }

  function applySurface() {
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
      pushOutOfPlane(wallPlanePoint, wallNormal);
      // только микродожим, без прыжка через комнату
      pullFlushToWall(wallPlanePoint, wallNormal, 0.2);
      {
        measureGhostBox();
        const floorY = sampleFloorY(_center.x, _center.z);
        const maxTop = floorY + WALL_MAX_H;
        if (_box.max.y > maxTop) {
          ghostRoot.position.y -= _box.max.y - maxTop;
          pushOutOfPlane(wallPlanePoint, wallNormal);
        }
        const minY = floorY + FOOT_EPS;
        if (ghostRoot.position.y < minY) ghostRoot.position.y = minY;
        wallAnchor.copy(ghostRoot.position);
      }
      updateProjections();
      return;
    }

    // пол: ноги по AABB на поверхность плиты (raycast), без висения и без протыкания стен
    ghostRoot.rotation.set(0, yaw, 0);
    snapFeet(true);
    pushOutOfNearbyWalls();
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

  function spawnInFront() {
    cameraFlatAxes();
    const eye = camera.getWorldPosition(new THREE.Vector3());
    yaw = Math.atan2(_fwd.x, _fwd.z);
    mount = "floor";
    applyGhostScale();
    // Сначала в точке игрока — замерим AABB, затем сдвинем так, чтобы ближний край был в 1 м впереди.
    ghostRoot.position.set(eye.x, 0, eye.z);
    ghostRoot.rotation.set(0, yaw, 0);
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
    yaw = Math.atan2(_fwd.x, _fwd.z);
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
      applySurface();
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
      status("Расстановка: «Экскурсия» или снимите крышу для осмотра, затем каталог (M).");
      return;
    }
    exitSelectMode();
    editingRec = null;
    placeIntent = "insert";
    clearGhost();
    ghostItem = item;
    baseSize = footprintFromCm(item.cm);
    sx = sy = sz = 1;
    mirror = false;
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
      spawnAtAim();
      status(`Расстановка ${item.id}`);
      publishHint();
    } catch (err) {
      console.warn(err);
      status(`Не удалось загрузить ${item.id}`);
      clearGhost();
    }
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
    wrap.scale.set((data.mirror ? -1 : 1) * (data.sx || 1), data.sy || 1, data.sz || 1);
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

  async function commitPlace() {
    if (!ghost || !ghostItem || !canEditFurniture()) return;
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
      wall: mount === "wall",
    };
    try {
      if (editing) {
        const wrap = ghost;
        const holder = rec.holder;
        unghostify(ghostModel || wrap);
        ghostRoot.remove(wrap);
        wrap.scale.set((mirror ? -1 : 1) * sx, sy, sz);
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
        // уже частично применён — оставить как есть и сбросить ghost
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

    if (mode === "place" && ghost) {
      if (code in held) {
        held[code] = !!down;
        return true;
      }
      if (!down) return false;
      if (code === "Enter") { commitPlace(); return true; }
      // Только event.code (физическая клавиша), не символ раскладки.
      // поворот: клавиши 9 / 0 (те же, что Shift+( ) )
      if (code === "Digit9" || code === "Numpad9") {
        yaw += Math.PI / 12;
        applySurface();
        return true;
      }
      if (code === "Digit0" || code === "Numpad0") {
        yaw -= Math.PI / 12;
        applySurface();
        return true;
      }
      if (code === "KeyG") {
        mirror = !mirror;
        applySurface();
        status(mirror ? "Зеркало: вкл" : "Зеркало: выкл");
        return true;
      }
      if (code === "KeyT") { toggleMount(); return true; }
      // вширь: физ. клавиши [ ] — в русской раскладке это х / ъ, со Shift { }
      if (code === "BracketLeft") { scaleViewWidth(-0.05); return true; }
      if (code === "BracketRight") { scaleViewWidth(0.05); return true; }
      // высота: физ. клавиши - = (со Shift _ +)
      if (code === "Minus" || code === "NumpadSubtract") {
        sy = Math.max(0.4, sy - 0.05);
        applySurface();
        return true;
      }
      if (code === "Equal" || code === "NumpadAdd") {
        sy = Math.min(2.5, sy + 0.05);
        applySurface();
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

    if (mode === "delete") {
      if (isTourActive()) {
        if (code === "Tab" && event?.shiftKey) { cycleSelect(-1); return true; }
        if (code === "Tab") { cycleSelect(1); return true; }
        if (code === "Enter" || code === "Delete" || code === "Backspace") { deleteSelected(); return true; }
      }
      if (code === "Escape") { exitSelectMode(); status("Отмена удаления"); return true; }
      return false;
    }

    if (mode === "edit") {
      if (isTourActive()) {
        if (code === "Tab" && event?.shiftKey) { cycleSelect(-1); return true; }
        if (code === "Tab") { cycleSelect(1); return true; }
        if (code === "Enter") { beginEditSelected(); return true; }
      }
      if (code === "Escape") { exitSelectMode(); status("Отмена правки"); return true; }
      return false;
    }

    if (mode === "copy") {
      if (isTourActive()) {
        if (code === "Tab" && event?.shiftKey) { cycleSelect(-1); return true; }
        if (code === "Tab") { cycleSelect(1); return true; }
        if (code === "Enter") { beginCopySelected(); return true; }
      }
      if (code === "Escape") { exitSelectMode(); status("Отмена копии"); return true; }
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
    // Вставка/копия — ghost под курсором; правка остаётся на месте до IJKL.
    if (mode === "place" && ghost && placeIntent !== "edit") {
      placeGhostAtPointer();
    }
    return false;
  }

  /** ЛКМ: в экскурсии — подтверждение взгляда; в осмотре — клик по объекту; place — фиксация. */
  function onPointerDown(event) {
    if (!canEditFurniture()) return false;
    if (event.button !== 0) return false;
    updatePointerNdc(event);
    if (mode === "place" && ghost) {
      if (!isTourActive() && placeIntent !== "edit") placeGhostAtPointer();
      commitPlace();
      return true;
    }
    if (!isSelectMode()) return false;

    if (!isTourActive()) {
      const idx = pickSelectByPointer(event);
      if (idx < 0) return false; // промах — пусть орбита крутит вид
      selectIndex = idx;
      refreshSelectHighlight();
      if (mode === "edit") beginEditSelected();
      else if (mode === "copy") beginCopySelected();
      else deleteSelected();
      return true;
    }

    if (selectIndex < 0) pickSelectByGaze();
    if (mode === "edit") beginEditSelected();
    else if (mode === "copy") beginCopySelected();
    else deleteSelected();
    return true;
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
    if (!ghost || mode !== "place") return;
    const dy = (held.KeyR ? 1 : 0) + (held.KeyF ? -1 : 0);
    const move = viewMoveIntent();

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

    // пол: движение строго от текущего взгляда
    if (move.lengthSq() > 1e-8) {
      ghostRoot.position.x += move.x * STEP * dt;
      ghostRoot.position.z += move.z * STEP * dt;
    }
    applySurface();
  }

  function tick(dt = 0.016) {
    if (!canEditFurniture()) {
      if (ghostRoot.visible) clearGhost();
      if (mode === "delete" || mode === "edit") exitSelectMode();
      setHint("", "off");
      return;
    }
    publishHint();
    if (mode === "place" && ghost) {
      // осмотр: точка от мыши (pointermove); здесь IJKL/R/F подправка
      moveGhost(Math.min(0.05, Math.max(0, dt)));
    } else if (isTourActive() && isSelectMode()) {
      pickSelectByGaze();
    }
  }

  function onTourStart() {
    publishHint();
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
    isDeleting: () => mode === "delete",
    isEditing: () => mode === "edit" || mode === "copy" || !!editingRec,
    isCopying: () => mode === "copy",
    mode: () => mode,
    onPointerMove,
    hints: {
      idle: HINT_IDLE_TOUR,
      idleView: HINT_IDLE_VIEW,
      place: HINT_PLACE_TOUR,
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
