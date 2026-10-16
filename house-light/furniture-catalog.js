import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const loader = new GLTFLoader();
const SPIN = 0.28;

export function mountFurnitureCatalog() {
  const openButton = document.getElementById("furniture-catalog-btn");
  const root = document.getElementById("furniture-catalog");
  const filters = document.getElementById("furniture-catalog-filters");
  const grid = document.getElementById("furniture-catalog-grid");
  const search = document.getElementById("furniture-catalog-search");
  const status = document.getElementById("furniture-catalog-status");
  if (!openButton || !root || !filters || !grid) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(400, 280, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xe7e0d2, 1);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.cssText = "position:fixed;left:-2000px;top:0;width:400px;height:280px;pointer-events:none";
  document.body.appendChild(renderer.domElement);

  const stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight(0xfff6ea, 0x9aa3aa, 1.15));
  const key = new THREE.DirectionalLight(0xfffaf2, 1.7);
  key.position.set(2.4, 3.6, 2.1);
  stage.add(key);
  const fill = new THREE.DirectionalLight(0xd7e6f6, 0.55);
  fill.position.set(-2.2, 1.4, -1.2);
  stage.add(fill);

  const camera = new THREE.PerspectiveCamera(32, 400 / 280, 0.02, 40);
  camera.position.set(2.35, 1.42, 2.55);
  camera.lookAt(0, 0.42, 0);

  const cards = [];
  let catalog = null;
  let activeGroup = "all";
  let query = "";
  let open = false;
  let running = false;
  let last = 0;
  const queue = [];
  let loading = 0;

  function fileUrl(file) {
    return new URL("./furniture/" + file, import.meta.url).href;
  }

  function sizeLabel(cm) {
    if (!cm || cm.length < 3) return "";
    return `${cm[0]}×${cm[1]}×${cm[2]} см`;
  }

  function build(data) {
    catalog = data;
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
      cards.push({ item, card, canvas, ctx, pivot: null, ready: false, failed: false });
    }
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
      return rect.bottom > view.top && rect.top < view.bottom;
    });
  }

  function pump() {
    if (!open) return;
    for (const entry of visibleEntries()) {
      if (entry.ready || entry.failed || entry.queued) continue;
      entry.queued = true;
      queue.push(entry);
    }
    while (loading < 3 && queue.length) {
      const entry = queue.shift();
      if (entry.card.hidden) {
        entry.queued = false;
        continue;
      }
      loading += 1;
      loader.load(fileUrl(entry.item.file), (gltf) => {
        loading -= 1;
        entry.pivot = fit(gltf.scene);
        entry.ready = true;
        pump();
      }, undefined, () => {
        loading -= 1;
        entry.failed = true;
        entry.card.classList.add("failed");
        pump();
      });
    }
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
    const shown = visibleEntries();
    for (const entry of shown) {
      if (!entry.ready) continue;
      try {
        entry.pivot.rotation.y += SPIN * dt;
        stage.add(entry.pivot);
        renderer.render(stage, camera);
        entry.ctx.globalCompositeOperation = "copy";
        entry.ctx.drawImage(renderer.domElement, 0, 0, entry.canvas.width, entry.canvas.height);
        entry.ctx.globalCompositeOperation = "source-over";
        stage.remove(entry.pivot);
      } catch (err) {
        if (entry.pivot.parent) entry.pivot.parent.remove(entry.pivot);
        entry.ready = false;
        entry.failed = true;
      }
    }
    requestAnimationFrame(frame);
  }

  function setOpen(next) {
    open = next;
    root.hidden = !open;
    openButton.hidden = open;
    document.body.classList.toggle("catalog-open", open);
    if (open) {
      if (!running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      }
      applyFilter();
      search.focus();
    } else {
      running = false;
    }
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
  grid.addEventListener("scroll", () => pump(), { passive: true });
  grid.addEventListener("click", async (event) => {
    const card = event.target.closest(".catalog-card");
    if (!card) return;
    const id = card.dataset.id;
    for (const node of grid.querySelectorAll(".catalog-card")) node.classList.toggle("picked", node === card);
    try {
      await navigator.clipboard.writeText(id);
      status.textContent = `Скопировано ${id}. Например: поставь стол ${id} в кабинет.`;
    } catch {
      status.textContent = id;
    }
  });
  openButton.addEventListener("click", () => setOpen(true));
  document.getElementById("furniture-catalog-close").addEventListener("click", () => setOpen(false));
  root.addEventListener("click", (event) => {
    if (event.target === root) setOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    if (!open || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  }, true);

  fetch(fileUrl("catalog.json"))
    .then((response) => response.json())
    .then(build)
    .catch(() => {
      status.textContent = "Каталог не загрузился.";
    });
}
