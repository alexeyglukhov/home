import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/meshopt_decoder.module.js";

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const SPIN = 0.28;
const LOAD_CONCURRENCY = 1; // одна модель за раз — без фриза главного потока
const RENDER_BUDGET = 2; // сколько превью крутить за кадр
const modelCache = new Map(); // file -> Promise<THREE.Object3D>

function idle(cb, timeout = 800) {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(cb, { timeout });
  }
  return setTimeout(cb, 48);
}

export function mountFurnitureCatalog(hooks = {}) {
  const openButton = document.getElementById("furniture-catalog-btn");
  const root = document.getElementById("furniture-catalog");
  const filters = document.getElementById("furniture-catalog-filters");
  const grid = document.getElementById("furniture-catalog-grid");
  const search = document.getElementById("furniture-catalog-search");
  const status = document.getElementById("furniture-catalog-status");
  if (!openButton || !root || !filters || !grid) {
    return { setOnPick() {}, getItems: () => [], setOnReady() {}, setOpen() {}, isOpen: () => false, toggle() {} };
  }
  let onPick = hooks.onPick || null;
  let onReady = hooks.onReady || null;
  let onOpenChange = hooks.onOpenChange || null;
  let itemsRef = [];

  let renderer = null;
  let stage = null;
  let camera = null;

  function ensureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(400, 280, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0xe7e0d2, 1);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cssText = "position:fixed;left:-2000px;top:0;width:400px;height:280px;pointer-events:none";
    document.body.appendChild(renderer.domElement);
    stage = new THREE.Scene();
    stage.add(new THREE.HemisphereLight(0xfff6ea, 0x9aa3aa, 1.15));
    const key = new THREE.DirectionalLight(0xfffaf2, 1.7);
    key.position.set(2.4, 3.6, 2.1);
    stage.add(key);
    const fill = new THREE.DirectionalLight(0xd7e6f6, 0.55);
    fill.position.set(-2.2, 1.4, -1.2);
    stage.add(fill);
    camera = new THREE.PerspectiveCamera(32, 400 / 280, 0.02, 40);
    camera.position.set(2.35, 1.42, 2.55);
    camera.lookAt(0, 0.42, 0);
    window.addEventListener("pagehide", () => {
      running = false;
      warmStop = true;
    });
  }

  const cards = [];
  let catalog = null;
  let activeGroup = "all";
  let query = "";
  let open = false;
  let running = false;
  let last = 0;
  const queue = [];
  let loading = 0;
  let warmIndex = 0;
  let warmStop = false;
  let warmScheduled = false;
  let spinCursor = 0;
  let readyCount = 0;

  function fileUrl(file) {
    return new URL("./furniture/" + file, import.meta.url).href;
  }

  function sizeLabel(cm) {
    if (!cm || cm.length < 3) return "";
    return `${cm[0]}×${cm[1]}×${cm[2]} см`;
  }

  function paintPlaceholder(entry, label = "…") {
    const { ctx, canvas } = entry;
    ctx.fillStyle = "#e7e0d2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#8a8070";
    ctx.font = "28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  }

  function loadScene(file) {
    const hit = modelCache.get(file);
    if (hit) return hit.then((scene) => scene.clone(true));
    const job = new Promise((resolve, reject) => {
      loader.load(fileUrl(file), (gltf) => resolve(gltf.scene), undefined, reject);
    });
    modelCache.set(file, job);
    return job.then((scene) => scene.clone(true));
  }

  function build(data) {
    catalog = data;
    itemsRef = data.items || [];
    if (typeof onReady === "function") onReady(itemsRef);
    filters.replaceChildren();
    const all = document.createElement("button");
    all.type = "button";
    all.textContent = "Все";
    all.dataset.group = "all";
    all.className = "active";
    filters.append(all);
    for (const group of data.groups) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.group = group.id;
      const count = data.items.filter((item) => item.group === group.id).length;
      button.textContent = `${group.title} ${group.id}`;
      button.title = `${count}`;
      filters.append(button);
    }
    grid.replaceChildren();
    for (const item of data.items) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catalog-card";
      card.dataset.group = item.group;
      card.dataset.id = item.id;
      card.dataset.name = item.name;
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 280;
      const ctx = canvas.getContext("2d");
      const caption = document.createElement("span");
      caption.className = "catalog-id";
      caption.textContent = item.id;
      const name = document.createElement("span");
      name.className = "catalog-name";
      name.textContent = item.name;
      const meta = document.createElement("span");
      meta.className = "catalog-meta";
      meta.textContent = sizeLabel(item.cm);
      card.append(canvas, caption, name, meta);
      grid.append(card);
      const entry = { item, card, canvas, ctx, pivot: null, ready: false, failed: false, queued: false };
      paintPlaceholder(entry);
      cards.push(entry);
    }
    // Фоновый прогрев после первого idle — не на старте страницы.
    idle(() => startWarm(), 2000);
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    for (const entry of cards) {
      const groupOk = activeGroup === "all" || entry.item.group === activeGroup;
      const text = `${entry.item.id} ${entry.item.name}`.toLowerCase();
      const textOk = !q || text.includes(q);
      entry.card.hidden = !(groupOk && textOk);
    }
    pump();
  }

  function visibleEntries() {
    const view = grid.getBoundingClientRect();
    return cards.filter((entry) => {
      if (entry.card.hidden) return false;
      const rect = entry.card.getBoundingClientRect();
      return rect.bottom > view.top - 80 && rect.top < view.bottom + 80;
    });
  }

  function updateStatus() {
    if (!status || !open) return;
    const total = cards.length;
    const left = total - readyCount - cards.filter((c) => c.failed).length;
    if (left > 0) {
      status.textContent = `Подгрузка превью в фоне… ${readyCount}/${total}. Можно выбирать уже готовые.`;
    } else {
      status.textContent = "Экскурсия: M — каталог · клик — вставка · Esc — закрыть.";
    }
  }

  function finishLoad(entry, ok, scene) {
    loading = Math.max(0, loading - 1);
    entry.queued = false;
    if (!ok) {
      entry.failed = true;
      entry.card.classList.add("failed");
      paintPlaceholder(entry, "!");
      schedulePump();
      return;
    }
    // fit чуть отложить — не парсить bbox в том же тике, что decode
    idle(() => {
      try {
        entry.pivot = fit(scene);
        entry.ready = true;
        readyCount += 1;
        updateStatus();
      } catch {
        entry.failed = true;
        entry.card.classList.add("failed");
        paintPlaceholder(entry, "!");
      }
      schedulePump();
    }, 120);
  }

  function startLoad(entry, priority) {
    if (entry.ready || entry.failed || entry.loading) return;
    entry.loading = true;
    entry.queued = true;
    loading += 1;
    if (!entry.failed) paintPlaceholder(entry, "…");
    loadScene(entry.item.file)
      .then((scene) => {
        entry.loading = false;
        finishLoad(entry, true, scene);
      })
      .catch(() => {
        entry.loading = false;
        finishLoad(entry, false);
      });
    if (priority && status && open) updateStatus();
  }

  let pumpTimer = 0;
  function schedulePump() {
    if (pumpTimer) return;
    pumpTimer = setTimeout(() => {
      pumpTimer = 0;
      pump();
    }, 32);
  }

  function pump() {
    // Сначала видимые (если каталог открыт), затем очередь.
    if (open) {
      for (const entry of visibleEntries()) {
        if (entry.ready || entry.failed || entry.queued || entry.loading) continue;
        queue.push(entry);
        entry.queued = true;
      }
    }
    while (loading < LOAD_CONCURRENCY && queue.length) {
      const entry = queue.shift();
      if (!entry || entry.ready || entry.failed || entry.loading) {
        if (entry) entry.queued = false;
        continue;
      }
      if (open && entry.card.hidden && visibleEntries().some((e) => !e.ready && !e.failed && !e.loading)) {
        // скрытую отложить, пока есть видимые
        entry.queued = false;
        continue;
      }
      startLoad(entry, true);
    }
  }

  function startWarm() {
    if (warmScheduled) return;
    warmScheduled = true;
    warmStop = false;
    ensureRenderer();
    const step = () => {
      if (warmStop) return;
      // пока каталог открыт и грузит видимое — подождать
      if (loading >= LOAD_CONCURRENCY || (open && queue.length > 0)) {
        idle(step, 600);
        return;
      }
      while (warmIndex < cards.length) {
        const entry = cards[warmIndex++];
        if (entry.ready || entry.failed || entry.queued || entry.loading) continue;
        startLoad(entry, false);
        idle(step, 900);
        return;
      }
      if (status && !open) {
        /* тихий прогрев закончен */
      }
    };
    idle(step, 1200);
  }

  function fit(scene) {
    const pivot = new THREE.Group();
    const model = scene;
    pivot.add(model);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
    const scale = 1.45 / maxDim;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
    });
    return pivot;
  }

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const shown = visibleEntries().filter((entry) => entry.ready && entry.pivot);
    if (shown.length) {
      const budget = Math.min(RENDER_BUDGET, shown.length);
      for (let n = 0; n < budget; n++) {
        const entry = shown[spinCursor % shown.length];
        spinCursor += 1;
        try {
          entry.pivot.rotation.y += SPIN * dt * (shown.length / budget);
          stage.add(entry.pivot);
          renderer.render(stage, camera);
          entry.ctx.globalCompositeOperation = "copy";
          entry.ctx.drawImage(renderer.domElement, 0, 0, entry.canvas.width, entry.canvas.height);
          entry.ctx.globalCompositeOperation = "source-over";
          stage.remove(entry.pivot);
        } catch {
          if (entry.pivot.parent) entry.pivot.parent.remove(entry.pivot);
          entry.ready = false;
          entry.failed = true;
        }
      }
    }
    requestAnimationFrame(frame);
  }

  function setOpen(next) {
    const want = !!next;
    if (open === want) return;
    open = want;
    root.hidden = !open;
    openButton.hidden = open;
    document.body.classList.toggle("catalog-open", open);
    if (open) {
      ensureRenderer();
      if (!running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      }
      applyFilter();
      search.focus();
      updateStatus();
      startWarm();
    } else {
      running = false;
    }
    if (typeof onOpenChange === "function") onOpenChange(open);
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    activeGroup = button.dataset.group || "all";
    for (const node of filters.querySelectorAll("button")) node.classList.toggle("active", node === button);
    applyFilter();
  });
  search.addEventListener("input", () => {
    query = search.value;
    applyFilter();
  });
  grid.addEventListener("scroll", () => schedulePump(), { passive: true });
  grid.addEventListener("click", async (event) => {
    const card = event.target.closest(".catalog-card");
    if (!card) return;
    const id = card.dataset.id;
    const item = itemsRef.find((it) => it.id === id) || null;
    for (const node of grid.querySelectorAll(".catalog-card")) node.classList.toggle("picked", node === card);
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      /* ignore */
    }
    if (typeof onPick === "function" && item) {
      status.textContent = `Выбрано ${id} — в «Экскурсии» появится полупрозрачный призрак для расстановки.`;
      onPick(item);
      setOpen(false);
      return;
    }
    status.textContent = `Скопировано ${id}. В «Экскурсии» можно расставлять из каталога.`;
  });
  openButton.addEventListener("click", () => setOpen(true));
  document.getElementById("furniture-catalog-close").addEventListener("click", () => setOpen(false));
  root.addEventListener("click", (event) => {
    if (event.target === root) setOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape" || (event.code === "KeyM" && !event.ctrlKey && !event.altKey && !event.metaKey)) {
      if (event.code === "KeyM" && event.target instanceof Element && event.target.closest("input, textarea")) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }, true);

  fetch(fileUrl("catalog.json") + "?v=14")
    .then((response) => response.json())
    .then(build)
    .catch(() => {
      status.textContent = "Каталог не загрузился.";
    });

  return {
    setOnPick(fn) { onPick = fn; },
    setOnReady(fn) { onReady = fn; },
    setOnOpenChange(fn) { onOpenChange = fn; },
    setOpen,
    isOpen: () => open,
    toggle() { setOpen(!open); },
    getItems: () => itemsRef.slice(),
  };
}
