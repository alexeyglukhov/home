import * as THREE from "three";
import { OVERLAY_FIELD, DARK_CLAD, WOOD_OAK } from "./facade-overlay.js?v=86";

const cache = new Map();

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function bricksColor(palette, row, col) {
  if (typeof palette === "string") return palette;
  return pickTone(palette, row, col);
}

function hexRgb(hex) {
  if (typeof hex !== "string") return [128, 128, 128];
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16)
    : parseInt(h, 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shadeHex(hex, d) {
  const [r, g, b] = hexRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, (v + d) | 0));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function pickTone(palette, row, col) {
  const n = palette.length || 1;
  const i = ((row * 3 + col * 5) % n + n) % n;
  return palette[i] || palette[0] || "#888888";
}

function mottledFill(g, w, h, base, blot, count = 90) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    g.fillStyle = blot[i % blot.length];
    const x = (i * 47 + 13) % w;
    const y = (i * 73 + 29) % h;
    g.beginPath();
    g.ellipse(x, y, 8 + (i * 5) % 16, 5 + (i * 3) % 12, ((i * 17) % 40) * 0.05, 0, Math.PI * 2);
    g.fill();
  }
}

function mortarBrick(g, w, h, bricks, mortar, courses) {
  g.fillStyle = mortar;
  g.fillRect(0, 0, w, h);
  const ch = h / courses;
  const count = 4;
  const bw = w / count;
  const palette = typeof bricks === "string" ? [bricks] : bricks;
  for (let row = 0; row < courses; row++) {
    const shift = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < count + 1; col++) {
      const x = col * bw + shift + 1;
      const tone = pickTone(palette, row, col);
      const wobble = ((row * 7 + col * 11) % 9 + 9) % 9 - 4;
      g.fillStyle = shadeHex(tone, wobble * 3);
      g.fillRect(x, row * ch + 1, bw - 2, ch - 2);
      g.fillStyle = `rgba(0,0,0,${0.05 + ((row + col + 4) % 4) * 0.02})`;
      g.fillRect(x, row * ch + ch * 0.58, bw - 2, ch * 0.32);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(x + 1, row * ch + 2, bw * 0.35, 1.2);
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(x + bw - 3.5, row * ch + 1, 1, ch - 2);
    }
  }
}

/** Мелкий ровный кирпич Райта: тонкие швы, почти без разброса тона. */
function wrightBrick(g, w, h, bricks, mortar) {
  g.fillStyle = mortar;
  g.fillRect(0, 0, w, h);
  const courses = 12;
  const ch = h / courses;
  const count = 6;
  const bw = w / count;
  const palette = typeof bricks === "string" ? [bricks] : bricks;
  for (let row = 0; row < courses; row++) {
    const shift = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < count + 1; col++) {
      const x = col * bw + shift + 0.5;
      const wobble = ((row * 3 + col * 5) % 3) - 1;
      g.fillStyle = shadeHex(pickTone(palette, row, col), wobble);
      g.fillRect(x, row * ch + 0.45, bw - 1.0, ch - 0.9);
    }
  }
}

function stoneBlocks(g, w, h, fill, joint) {
  g.fillStyle = joint;
  g.fillRect(0, 0, w, h);
  const rows = 4;
  const ch = h / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -w * 0.15 : 0;
    let i = 0;
    while (x < w) {
      const bw = w * (0.28 + ((row * 5 + i * 3) % 4) * 0.08);
      const tone = fill[(row + i) % fill.length];
      g.fillStyle = shadeHex(tone, ((row * 5 + i * 7) % 11) - 5);
      g.fillRect(x + 1.5, row * ch + 1.5, bw - 3, ch - 3);
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(x + 2, row * ch + ch * 0.55, bw - 4, ch * 0.28);
      g.fillStyle = "rgba(255,255,255,0.07)";
      g.fillRect(x + 3, row * ch + 3, bw * 0.4, 1.5);
      x += bw;
      i++;
    }
  }
}

function boardWall(g, w, h, tones, vertical) {
  const n = vertical ? 6 : 5;
  if (vertical) {
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = tones[i % tones.length];
      g.fillRect(i * bw, 0, bw + 1, h);
      for (let k = 0; k < 22; k++) {
        const y = (k * 37 + i * 11) % h;
        g.fillStyle = `rgba(40,28,16,${0.04 + (k % 4) * 0.015})`;
        g.fillRect(i * bw + 2, y, bw - 5, 1.1);
        g.fillStyle = `rgba(255,230,190,${0.025 + (k % 3) * 0.01})`;
        g.fillRect(i * bw + 4, (y + 8) % h, bw * 0.32, 1);
      }
      if (i > 0) {
        g.fillStyle = "rgba(30,22,14,0.38)";
        g.fillRect(i * bw - 1, 0, 2, h);
        g.fillStyle = "rgba(255,240,210,0.09)";
        g.fillRect(i * bw + 1, 0, 1.2, h);
      }
    }
    return;
  }
  const ch = h / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * ch, w, ch + 1);
    for (let k = 0; k < 18; k++) {
      const x = (k * 41 + i * 13) % w;
      g.fillStyle = `rgba(40,28,16,${0.04 + (k % 4) * 0.014})`;
      g.fillRect(x, i * ch + 2, 1.1, ch - 4);
    }
    if (i > 0) {
      g.fillStyle = "rgba(30,22,14,0.35)";
      g.fillRect(0, i * ch - 1, w, 2);
      g.fillStyle = "rgba(255,240,210,0.08)";
      g.fillRect(0, i * ch + 1, w, 1);
    }
  }
}

// Подоконник жёлтых окон в мире: 1,10 м. Цоколь закрывает стену до 0,30 м.
// Кладка цокольного пояса — целые ряды между этими швами, без обрезанного камня.
const SKIRT_SPAN = 4.2;
const SILL_Y = 1.10;
const PLINTH_Y = 0.30;

function skirtCanvasY(worldY, h) {
  return Math.round(h * (1 - worldY / SKIRT_SPAN));
}

function stoneCourses(g, w, yTop, yBot, rows, fill, joint) {
  const band = yBot - yTop;
  if (band < rows + 2) return;
  g.fillStyle = joint;
  g.fillRect(0, yTop, w, band);
  for (let row = 0; row < rows; row++) {
    const y1 = row === 0 ? yBot : Math.round(yBot - (band * row) / rows);
    const y0 = row === rows - 1 ? yTop : Math.round(yBot - (band * (row + 1)) / rows);
    const ch = y1 - y0;
    let x = row % 2 ? -w * 0.18 : 0;
    let i = 0;
    while (x < w - 4) {
      const bw = w * (0.28 + ((row * 5 + i * 3) % 4) * 0.08);
      const span = Math.min(bw, w - x);
      g.fillStyle = shadeHex(fill[(row + i) % fill.length], ((row * 5 + i * 7) % 11) - 5);
      g.fillRect(x + 1.5, y0 + 1.5, span - 3, ch - 3);
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(x + 2, y0 + ch * 0.55, span - 4, ch * 0.28);
      g.fillStyle = "rgba(255,255,255,0.07)";
      g.fillRect(x + 3, y0 + 3, span * 0.4, 1.5);
      x += bw;
      i++;
    }
  }
}

function siding(g, w, h, fill, line, vertical) {
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.fillStyle = line;
  if (vertical) {
    const step = w / 6;
    for (let x = step; x < w; x += step) g.fillRect(x, 0, 2, h);
  } else {
    const step = h / 6;
    for (let y = step; y < h; y += step) g.fillRect(0, y, w, 2);
  }
}

function quoinWall(g, w, h, wall, brick, mortar) {
  g.fillStyle = wall;
  g.fillRect(0, 0, w, h);
  const qw = w * 0.16;
  const paint = (x) => {
    g.save();
    g.beginPath();
    g.rect(x, 0, qw, h);
    g.clip();
    mortarBrick(g, w, h, brick, mortar, 8);
    g.restore();
  };
  paint(0);
  paint(w - qw);
  g.strokeStyle = brick;
  g.lineWidth = 7;
  g.strokeRect(w * 0.3, h * 0.22, w * 0.4, h * 0.52);
}

function beams(g, w, h, color) {
  g.strokeStyle = color;
  g.lineWidth = Math.max(6, w * 0.045);
  g.strokeRect(4, 4, w - 8, h - 8);
  g.beginPath();
  g.moveTo(8, h - 8);
  g.lineTo(w / 2, 8);
  g.lineTo(w - 8, h - 8);
  g.moveTo(w / 2, 8);
  g.lineTo(w / 2, h - 8);
  g.stroke();
}

const PATTERN = {
  plaster: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e7e1d6", [
      "rgba(92,84,74,0.07)", "rgba(255,252,245,0.10)", "rgba(120,110,96,0.06)",
      "rgba(70,64,56,0.05)", "rgba(240,232,220,0.09)", "rgba(100,90,78,0.05)",
    ], 120);
  }),
  plasterWarm: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f1e4d0", [
      "rgba(140,100,60,0.08)", "rgba(255,245,230,0.11)", "rgba(110,80,50,0.06)",
      "rgba(180,140,90,0.05)", "rgba(90,70,50,0.05)", "rgba(250,240,220,0.08)",
    ], 110);
  }),
  // Райт · светлая стена: персиково-бежевый с фото (#f0d5b9), не белый.
  plasterWright: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f0d5b9", [
      "rgba(160,110,70,0.08)", "rgba(255,240,220,0.12)", "rgba(120,85,55,0.06)",
      "rgba(200,160,120,0.05)", "rgba(90,65,45,0.04)", "rgba(245,220,190,0.09)",
    ], 110);
  }),
  plasterWhite: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#fbfaf7", [
      "rgba(255,255,255,0.22)", "rgba(240,238,232,0.06)", "rgba(255,255,255,0.14)",
      "rgba(90,90,88,0.02)", "rgba(248,246,242,0.08)",
    ], 90);
  }),
  plasterOchre: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#c4a878", [
      "rgba(120,80,40,0.10)", "rgba(255,230,190,0.10)", "rgba(90,60,35,0.07)",
      "rgba(160,120,70,0.06)", "rgba(70,50,30,0.05)",
    ], 110);
  }),
  // Прованс · песочная штукатурка с фото (охра/тан, не почти-белый warm).
  plasterProvence: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#b8a080", [
      "rgba(110,80,45,0.11)", "rgba(230,210,180,0.10)", "rgba(90,65,40,0.07)",
      "rgba(150,120,80,0.07)", "rgba(70,50,30,0.05)", "rgba(200,180,150,0.08)",
    ], 115);
  }),
  plasterCream: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f6f1e6", [
      "rgba(110,95,70,0.06)", "rgba(255,252,245,0.10)", "rgba(140,120,90,0.05)",
      "rgba(80,70,55,0.04)",
    ], 100);
  }),
  brick: () => canvas(192, 96, (g, w, h) => mortarBrick(
    g, w, h, ["#a35a45", "#965040", "#ae6450", "#8c4a3a", "#b06a52"], "#c4aaa0", 5
  )),
  brickDark: () => canvas(192, 96, (g, w, h) => mortarBrick(
    g, w, h, ["#5a3a34", "#6a463c", "#4a302c", "#704840", "#3e2824"], "#3a3330", 5
  )),
  // Райт · штукатурка: мелкий ровный тёмно-коричневый кирпич с фото.
  brickWright: () => canvas(256, 96, (g, w, h) => wrightBrick(
    g, w, h, ["#5a463c", "#564238", "#5e4a40", "#524036", "#58443a"], "#2e2824"
  )),
  // Райт · тёплый: мелкий ровный тёплый кирпич с фото.
  brickWrightWarm: () => canvas(256, 96, (g, w, h) => wrightBrick(
    g, w, h, ["#a48664", "#a08260", "#a88a68", "#9c7e5c", "#a68466"], "#4a3c30"
  )),
  // Баварский classic: многотонный красно-терракотовый клинкер с фото.
  bavaria: () => canvas(192, 96, (g, w, h) => mortarBrick(
    g, w, h, ["#be8c6e", "#b4826e", "#a8705c", "#c89678", "#9a6450", "#8a5848", "#b07860"], "#d8c8b8", 5
  )),
  // Песочный клинкер (bavaria-sand): тёплый жёлто-бежевый с фото.
  brickSand: () => canvas(192, 96, (g, w, h) => mortarBrick(
    g, w, h, ["#f0c8a0", "#e4bc90", "#d8b080", "#f4d0b0", "#c8a078", "#e8c498", "#d0a888"], "#e8d8c4", 5
  )),
  // Графитовый клинкер (bavaria-graphite): светлый пепельно-серый с фото, не тёмный.
  brickAsh: () => canvas(192, 96, (g, w, h) => mortarBrick(
    g, w, h, ["#c8c4bc", "#bebab2", "#d2cec6", "#b4b0a8", "#c4c0b8", "#d8d4cc", "#aaa69e", "#bcb8b0"], "#e0dcd4", 5
  )),
  // Прерии: горизонтальный тёплый песочно-коричневый кирпич.
  brickPrairie: () => canvas(256, 72, (g, w, h) => {
    const palette = ["#8a6e52", "#7a6048", "#96785c", "#6e5640", "#a08468", "#82644c", "#907060"];
    g.fillStyle = "#c4b49c";
    g.fillRect(0, 0, w, h);
    const courses = 6;
    const ch = h / courses;
    const bw = w / 2.2;
    for (let row = 0; row < courses; row++) {
      const shift = row % 2 ? bw * 0.5 : 0;
      for (let col = -1; col < 5; col++) {
        g.fillStyle = shadeHex(pickTone(palette, row, col), ((row * 5 + col * 7) % 9) - 4);
        g.fillRect(col * bw + shift + 1, row * ch + 1, bw - 2, ch - 2);
        g.fillStyle = `rgba(40,28,16,${0.05 + ((row + col) % 3) * 0.02})`;
        g.fillRect(col * bw + shift + 1, row * ch + ch * 0.55, bw - 2, ch * 0.32);
      }
    }
  }),
  // Длинный светлый кирпич как на рендерах agency/roof-d.
  longBrick: () => canvas(256, 72, (g, w, h) => {
    const palette = ["#e8e2d6", "#ddd6c8", "#f0e9dc", "#d2cbc0", "#e2dbcf", "#ebe4d8"];
    g.fillStyle = "#c8c0b4";
    g.fillRect(0, 0, w, h);
    const courses = 6;
    const ch = h / courses;
    const bw = w / 2.5;
    for (let row = 0; row < courses; row++) {
      const shift = row % 2 ? bw * 0.5 : 0;
      for (let col = -1; col < 5; col++) {
        const shade = ((row * 7 + col * 11) % 13 + 13) % 13 / 40;
        g.fillStyle = pickTone(palette, row, col);
        g.fillRect(col * bw + shift + 1, row * ch + 1, bw - 2, ch - 2);
        g.fillStyle = `rgba(60,55,48,${0.04 + shade * 0.08})`;
        g.fillRect(col * bw + shift + 1, row * ch + ch * 0.55, bw - 2, ch * 0.35);
      }
    }
  }),
  stone: () => canvas(160, 120, (g, w, h) => stoneBlocks(
    g, w, h, ["#cfc6b6", "#b7b0a2", "#ddd4c6", "#c4bbaa", "#d8d0c0"], "#8d877c"
  )),
  stoneDark: () => canvas(160, 120, (g, w, h) => stoneBlocks(
    g, w, h, ["#6a655e", "#524e48", "#7c766e", "#5a564e"], "#3a3834"
  )),
  stoneSand: () => canvas(160, 120, (g, w, h) => stoneBlocks(
    g, w, h, ["#c8beaa", "#b4aa96", "#d4c8b4", "#a89c84", "#beb4a0"], "#8a8274"
  )),
  siding: () => canvas(64, 96, (g, w, h) => boardWall(
    g, w, h, ["#e4e0d8", "#ddd8ce", "#ebe6de", "#d6d1c8", "#e8e3db"], false
  )),
  vsiding: () => canvas(96, 64, (g, w, h) => boardWall(
    g, w, h, ["#d8dce0", "#cfd4d8", "#e0e4e8", "#c6ccd2", "#dce0e4"], true
  )),
  vsidingDark: () => canvas(96, 64, (g, w, h) => boardWall(
    g, w, h, ["#6e757c", "#646c74", "#787f86", "#5a626a", "#727880"], true
  )),
  // Финский красный / тёмно-зелёный планкен с фото.
  finnishRed: () => canvas(96, 64, (g, w, h) => boardWall(
    g, w, h, ["#8a4034", "#7a382c", "#9a4a3c", "#6e3028", "#945044"], true
  )),
  finnishGreen: () => canvas(96, 64, (g, w, h) => boardWall(
    g, w, h, ["#4a5848", "#3e4c3c", "#546250", "#364434", "#5a6858"], true
  )),
  woodDark: () => canvas(128, 256, (g, w, h) => boardWall(
    g, w, h, ["#3a281c", "#322218", "#423024", "#2c1e14", "#3e2c20", "#463428"], true
  )),
  woodBeam: () => canvas(96, 160, (g, w, h) => boardWall(
    g, w, h, ["#4a3428", "#3e2c22", "#544032", "#36241c", "#4e3830"], false
  )),
  shutterSage: () => canvas(64, 96, (g, w, h) => {
    mottledFill(g, w, h, "#5e7c86", [
      "rgba(30,50,55,0.18)", "rgba(180,210,220,0.10)", "rgba(40,60,65,0.12)",
    ], 60);
    g.fillStyle = "rgba(20,30,35,0.22)";
    for (let y = 8; y < h; y += 14) g.fillRect(4, y, w - 8, 2);
  }),
  shutterTerracotta: () => canvas(64, 96, (g, w, h) => {
    mottledFill(g, w, h, "#6b3a32", [
      "rgba(40,20,16,0.18)", "rgba(200,140,110,0.10)", "rgba(30,14,10,0.12)",
    ], 60);
    g.fillStyle = "rgba(20,10,8,0.22)";
    for (let y = 8; y < h; y += 14) g.fillRect(4, y, w - 8, 2);
  }),
  shutterGreen: () => canvas(64, 96, (g, w, h) => {
    mottledFill(g, w, h, "#2f4a44", [
      "rgba(16,30,28,0.18)", "rgba(140,180,160,0.09)", "rgba(20,36,32,0.12)",
    ], 60);
    g.fillStyle = "rgba(10,20,18,0.22)";
    for (let y = 8; y < h; y += 14) g.fillRect(4, y, w - 8, 2);
  }),
  slats: () => canvas(64, 128, (g, w, h) => {
    g.fillStyle = "#f6f3ec";
    g.fillRect(0, 0, w, h);
    const tones = ["#5c4a3a", "#534232", "#645040", "#4a3a2c"];
    for (let i = 0; i < 5; i++) {
      const x = 6 + i * 11;
      g.fillStyle = tones[i % tones.length];
      g.fillRect(x, 4, 4, h - 8);
      g.fillStyle = "rgba(255,230,190,0.12)";
      g.fillRect(x, 4, 1.2, h - 8);
      g.fillStyle = "rgba(20,12,8,0.25)";
      g.fillRect(x + 3, 4, 1, h - 8);
    }
  }),
  stripes: () => canvas(64, 128, (g, w, h) => {
    mortarBrick(g, w, h, ["#e8d8c4", "#f0e4d4", "#dcc8b0", "#e2d0bc"], "#c4b49a", 8);
    g.save();
    g.beginPath();
    g.rect(0, h * 0.5, w, h * 0.5);
    g.clip();
    mortarBrick(g, w, h, ["#8e3a32", "#7a322c", "#a04438", "#6e2e28"], "#6a4038", 8);
    g.restore();
  }),
  rust: () => canvas(64, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e6e0d4", [
      "rgba(100,90,78,0.07)", "rgba(255,250,240,0.08)", "rgba(80,72,64,0.05)",
    ], 80);
    g.fillStyle = "#b7ad9f";
    for (const t of [0.22, 0.48, 0.74]) {
      const y = Math.round(h * t);
      g.fillRect(0, y, w, 3);
      g.fillStyle = "rgba(80,70,60,0.18)";
      g.fillRect(0, y + 3, w, 1.5);
      g.fillStyle = "#b7ad9f";
    }
  }),
  // Забутка фахверка — только штукатурка; балки рисует overlay.
  fachwerk: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f4e7d4", [
      "rgba(140,100,60,0.08)", "rgba(255,245,230,0.10)", "rgba(100,75,50,0.05)",
    ], 100);
  }),
  fachwerkBrick: () => canvas(240, 220, (g, w, h) => {
    mortarBrick(g, w, h, ["#8E4A38", "#7A4032", "#964E3C", "#A85A40", "#6E382C"], "#CDB8A6", 12);
  }),
  louvers: () => canvas(48, 160, (g, w, h) => {
    mottledFill(g, w, h, "#3a4146", [
      "rgba(20,24,28,0.2)", "rgba(120,130,140,0.12)", "rgba(30,34,38,0.15)",
    ], 50);
    for (let i = 0; i < 10; i++) {
      const y = 8 + i * 14;
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(2, y, w - 4, 3);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(2, y, w - 4, 1);
    }
  }),
  cassettes: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e6e2da", [
      "rgba(80,76,70,0.06)", "rgba(255,252,245,0.09)", "rgba(100,96,88,0.05)",
    ], 70);
  }),
  cassetteAlt: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#b3aea4", [
      "rgba(60,56,50,0.08)", "rgba(220,216,208,0.10)", "rgba(80,76,70,0.06)",
    ], 70);
  }),
  corten: () => canvas(96, 96, (g, w, h) => {
    mottledFill(g, w, h, "#8c4e32", [
      "rgba(40,20,10,0.22)", "rgba(200,120,70,0.16)", "rgba(60,30,16,0.14)",
      "rgba(160,90,50,0.12)",
    ], 90);
  }),
  panels: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#d5d6d2", [
      "rgba(70,72,70,0.06)", "rgba(255,255,255,0.08)", "rgba(90,92,90,0.05)",
    ], 70);
    g.strokeStyle = "rgba(60,64,62,0.35)";
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
  }),
  panelEdge: () => canvas(64, 64, (g, w, h) => {
    mottledFill(g, w, h, "#4e5450", [
      "rgba(20,24,22,0.2)", "rgba(140,150,145,0.1)", "rgba(30,34,32,0.15)",
    ], 50);
  }),
  german: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e4e6e2", [
      "rgba(70,74,70,0.05)", "rgba(255,255,255,0.09)", "rgba(90,94,90,0.04)",
    ], 80);
  }),
  // Устаревшие композитные тайлы оставлены для совместимости кэша; стены больше их не используют.
  quoinBrick: () => canvas(180, 160, (g, w, h) => quoinWall(g, w, h, "#e7e1d6", "#a35a45", "#c4aaa0")),
  quoinDark: () => canvas(180, 160, (g, w, h) => quoinWall(g, w, h, "#f3efe6", "#4a342c", "#6a5348")),
  stoneSiding: () => canvas(64, 96, (g, w, h) => boardWall(
    g, w, h, ["#e4e0d8", "#ddd8ce", "#ebe6de", "#d6d1c8"], false
  )),
  darkCenter: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e6e2da", [
      "rgba(80,76,70,0.06)", "rgba(255,252,245,0.09)", "rgba(100,96,88,0.05)",
    ], 80);
  }),
  scandi: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e8ebef", [
      "rgba(70,78,86,0.05)", "rgba(255,255,255,0.10)", "rgba(100,108,116,0.04)",
    ], 90);
  }),
  brickPiers: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#e7e2d8", [
      "rgba(90,80,70,0.06)", "rgba(255,250,240,0.09)", "rgba(110,100,88,0.05)",
    ], 80);
  }),
  bavariaFrame: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f3efe6", [
      "rgba(100,90,75,0.06)", "rgba(255,252,245,0.10)", "rgba(120,110,90,0.05)",
    ], 90);
  }),
  tuscan: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#d2b48c", [
      "rgba(120,80,40,0.10)", "rgba(255,230,190,0.10)", "rgba(90,60,35,0.07)",
    ], 100);
  }),
  provence: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f4e6d4", [
      "rgba(140,100,60,0.08)", "rgba(255,245,230,0.10)", "rgba(100,75,50,0.05)",
    ], 100);
  }),
  mediterranean: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f0e2cc", [
      "rgba(130,100,60,0.08)", "rgba(255,245,225,0.10)", "rgba(100,80,50,0.05)",
    ], 100);
  }),
  belgian: () => canvas(64, 256, (g, w, h) => {
    mottledFill(g, w, h, "#f4f1ea", [
      "rgba(100,92,78,0.06)", "rgba(255,252,245,0.09)", "rgba(120,110,95,0.05)",
    ], 70);
    for (const t of [0.18, 0.28, 0.38]) {
      const y = h - Math.round(h * t);
      g.fillStyle = "#d0c8b6";
      g.fillRect(0, y, w, 5);
      g.fillStyle = "rgba(80,70,55,0.15)";
      g.fillRect(0, y + 5, w, 1.5);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(0, y, w, 1);
    }
  }),
  finnish: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f7f5f0", [
      "rgba(70,70,68,0.05)", "rgba(255,255,255,0.11)", "rgba(100,100,96,0.04)",
    ], 90);
  }),
  reikiScreen: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f6f3ec", [
      "rgba(100,90,75,0.05)", "rgba(255,252,245,0.09)", "rgba(120,110,95,0.04)",
    ], 80);
  }),
  rustPlinth: () => canvas(96, 64, (g, w, h) => {
    mottledFill(g, w, h, "#5c564c", [
      "rgba(30,28,24,0.2)", "rgba(120,112,100,0.14)", "rgba(40,36,32,0.15)",
    ], 50);
    g.fillStyle = "rgba(20,18,16,0.35)";
    for (let y = 10; y < h; y += 14) g.fillRect(0, y, w, 2.5);
  }),
  artdeco: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f6f1e6", [
      "rgba(90,82,68,0.05)", "rgba(255,252,245,0.10)", "rgba(110,100,85,0.04)",
    ], 90);
  }),
  chevron: () => canvas(120, 220, (g, w, h) => {
    mottledFill(g, w, h, "#f6f1e6", [
      "rgba(90,82,68,0.05)", "rgba(255,252,245,0.10)",
    ], 60);
    g.strokeStyle = "#1c1a17";
    g.lineWidth = 3;
    const y0 = 28;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      g.moveTo(x, y0);
      g.lineTo(x + 8, y0 + 16);
      g.lineTo(x + 16, y0);
    }
    g.stroke();
  }),
  stijl: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#f7f4ef", [
      "rgba(80,76,70,0.05)", "rgba(255,255,255,0.10)",
    ], 70);
  }),
  lopatki: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#efe8dc", [
      "rgba(90,80,68,0.06)", "rgba(255,250,240,0.09)", "rgba(110,100,85,0.05)",
    ], 80);
  }),
  beltStone: () => canvas(96, 48, (g, w, h) => {
    mottledFill(g, w, h, "#8a8175", [
      "rgba(40,36,30,0.16)", "rgba(180,170,155,0.12)", "rgba(55,50,42,0.12)",
    ], 50);
  }),
  inkMetal: () => canvas(64, 64, (g, w, h) => {
    mottledFill(g, w, h, "#1c1a17", [
      "rgba(0,0,0,0.25)", "rgba(80,76,70,0.12)", "rgba(10,8,6,0.2)",
    ], 40);
  }),
  bladeDark: () => canvas(64, 128, (g, w, h) => {
    mottledFill(g, w, h, "#3a342c", [
      "rgba(20,16,12,0.2)", "rgba(100,90,75,0.12)", "rgba(30,24,18,0.15)",
    ], 45);
  }),
  jointGrey: () => canvas(64, 64, (g, w, h) => {
    mottledFill(g, w, h, "#5a5e5a", [
      "rgba(30,32,30,0.18)", "rgba(140,145,140,0.1)", "rgba(40,42,40,0.12)",
    ], 40);
  }),
  sidingAccent: () => canvas(64, 96, (g, w, h) => boardWall(
    g, w, h, ["#6a655c", "#605b52", "#747068", "#56524a"], false
  )),
  darkPanel: () => canvas(128, 128, (g, w, h) => {
    mottledFill(g, w, h, "#3a3e42", [
      "rgba(20,22,24,0.22)", "rgba(90,96,102,0.14)", "rgba(30,34,38,0.16)",
    ], 80);
  }),
  battenDark: () => canvas(64, 128, (g, w, h) => boardWall(
    g, w, h, ["#2e3430", "#282e2a", "#343a36", "#222824"], true
  )),
  surroundWarm: () => canvas(96, 96, (g, w, h) => {
    mottledFill(g, w, h, "#c4b49a", [
      "rgba(80,65,45,0.12)", "rgba(230,215,190,0.12)", "rgba(100,80,55,0.08)",
    ], 60);
  }),
  skirtStone: () => canvas(128, 256, (g, w, h) => {
    mottledFill(g, w, h, "#e7e1d6", [
      "rgba(92,84,74,0.07)", "rgba(255,252,245,0.10)", "rgba(120,110,96,0.06)",
    ], 90);
    stoneCourses(
      g, w, skirtCanvasY(SILL_Y, h), skirtCanvasY(PLINTH_Y, h), 2,
      ["#cfc6b6", "#b7b0a2", "#ddd4c6", "#c4bbaa"], "#8d877c"
    );
  }),
  skirtBrick: () => canvas(128, 256, (g, w, h) => {
    mottledFill(g, w, h, "#e6e2da", [
      "rgba(80,76,70,0.06)", "rgba(255,252,245,0.09)", "rgba(100,96,88,0.05)",
    ], 80);
    const yTop = skirtCanvasY(SILL_Y, h);
    const yBot = skirtCanvasY(PLINTH_Y, h);
    const courses = 8;
    const band = yBot - yTop;
    const bw = w / 4;
    g.fillStyle = "#c4aaa0";
    g.fillRect(0, yTop, w, band);
    const palette = ["#a35a45", "#965040", "#ae6450", "#8c4a3a"];
    for (let row = 0; row < courses; row++) {
      const y1 = row === 0 ? yBot : Math.round(yBot - (band * row) / courses);
      const y0 = row === courses - 1 ? yTop : Math.round(yBot - (band * (row + 1)) / courses);
      const shift = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 6; col++) {
        const n = palette.length;
        const tone = palette[(((row * 3 + col) % n) + n) % n];
        g.fillStyle = shadeHex(tone, ((row + col) % 5 + 5) % 5 - 2);
        g.fillRect(col * bw + shift + 1, y0 + 1, bw - 2, y1 - y0 - 2);
        g.fillStyle = "rgba(0,0,0,0.08)";
        g.fillRect(col * bw + shift + 1, y0 + (y1 - y0) * 0.55, bw - 2, (y1 - y0) * 0.3);
      }
    }
  }),
  skirtSwiss: () => canvas(128, 256, (g, w, h) => {
    mottledFill(g, w, h, "#f4f1ea", [
      "rgba(100,92,78,0.06)", "rgba(255,252,245,0.09)", "rgba(120,110,95,0.05)",
    ], 80);
    const ySill = skirtCanvasY(SILL_Y, h);
    stoneCourses(
      g, w, ySill, skirtCanvasY(PLINTH_Y, h), 2,
      ["#b7b0a2", "#cfc6b6", "#a39c90", "#d0c8ba"], "#6a655c"
    );
    const yBelt = skirtCanvasY(SILL_Y + 0.05, h);
    g.fillStyle = "#5c5348";
    g.fillRect(0, yBelt, w, ySill - yBelt);
    g.fillStyle = "rgba(255,240,210,0.08)";
    g.fillRect(0, yBelt, w, 1.5);
  }),
  belts: () => canvas(64, 256, (g, w, h) => {
    mottledFill(g, w, h, "#f3efe6", [
      "rgba(100,90,75,0.06)", "rgba(255,252,245,0.10)", "rgba(120,110,90,0.05)",
    ], 70);
    for (const t of [0.22, 0.48, 0.78]) {
      const y = h - Math.round(h * t);
      g.fillStyle = "#6e5e4c";
      g.fillRect(0, y, w, 6);
      g.fillStyle = "rgba(40,32,24,0.2)";
      g.fillRect(0, y + 6, w, 1.5);
      g.fillStyle = "rgba(220,200,170,0.12)";
      g.fillRect(0, y, w, 1.2);
    }
  }),
  tile: () => canvas(128, 80, (g, w, h) => {
    g.fillStyle = "#5a3026";
    g.fillRect(0, 0, w, h);
    const ch = h / 3;
    for (let row = 0; row < 3; row++) {
      const shift = row % 2 ? 18 : 0;
      for (let x = -24; x < w; x += 36) {
        const cx = x + shift + 18;
        const cy = row * ch + ch * 0.2;
        g.fillStyle = shadeHex("#8a4a38", ((row * 5 + x) % 9) - 4);
        g.beginPath();
        g.arc(cx, cy, 16, 0, Math.PI);
        g.fill();
        g.fillStyle = "rgba(0,0,0,0.18)";
        g.beginPath();
        g.arc(cx, cy + 2, 14, 0.15, Math.PI - 0.15);
        g.fill();
        g.fillStyle = "rgba(255,200,160,0.10)";
        g.beginPath();
        g.arc(cx - 4, cy - 2, 6, Math.PI * 1.1, Math.PI * 1.7);
        g.fill();
      }
    }
  }),
  tileDark: () => canvas(128, 80, (g, w, h) => {
    g.fillStyle = "#22262a";
    g.fillRect(0, 0, w, h);
    const ch = h / 3;
    for (let row = 0; row < 3; row++) {
      const shift = row % 2 ? 18 : 0;
      for (let x = -24; x < w; x += 36) {
        const cx = x + shift + 18;
        const cy = row * ch + ch * 0.2;
        g.fillStyle = shadeHex("#3c434a", ((row * 5 + x) % 9) - 4);
        g.beginPath();
        g.arc(cx, cy, 16, 0, Math.PI);
        g.fill();
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.beginPath();
        g.arc(cx, cy + 2, 14, 0.15, Math.PI - 0.15);
        g.fill();
        g.fillStyle = "rgba(200,210,220,0.08)";
        g.beginPath();
        g.arc(cx - 4, cy - 2, 6, Math.PI * 1.1, Math.PI * 1.7);
        g.fill();
      }
    }
  }),
  // Баварский classic: шоколадная/кофейная черепица с фото.
  tileBrown: () => canvas(128, 80, (g, w, h) => {
    g.fillStyle = "#2a221c";
    g.fillRect(0, 0, w, h);
    const ch = h / 3;
    for (let row = 0; row < 3; row++) {
      const shift = row % 2 ? 18 : 0;
      for (let x = -24; x < w; x += 36) {
        const cx = x + shift + 18;
        const cy = row * ch + ch * 0.2;
        g.fillStyle = shadeHex("#4a3a30", ((row * 5 + x) % 9) - 4);
        g.beginPath();
        g.arc(cx, cy, 16, 0, Math.PI);
        g.fill();
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath();
        g.arc(cx, cy + 2, 14, 0.15, Math.PI - 0.15);
        g.fill();
        g.fillStyle = "rgba(210,170,130,0.08)";
        g.beginPath();
        g.arc(cx - 4, cy - 2, 6, Math.PI * 1.1, Math.PI * 1.7);
        g.fill();
      }
    }
  }),
  // Баварский sand: почти чёрная битумная/сланцевая кровля.
  shingleBlack: () => canvas(128, 80, (g, w, h) => {
    g.fillStyle = "#1c1c18";
    g.fillRect(0, 0, w, h);
    const ch = h / 4;
    for (let row = 0; row < 4; row++) {
      const shift = row % 2 ? 14 : 0;
      for (let x = -20; x < w; x += 28) {
        const tone = shadeHex("#2e2e28", ((row * 7 + x) % 11) - 5);
        g.fillStyle = tone;
        g.fillRect(x + shift + 1, row * ch + 1, 26, ch - 2);
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(x + shift + 1, row * ch + ch * 0.55, 26, ch * 0.35);
        g.fillStyle = "rgba(180,180,170,0.06)";
        g.fillRect(x + shift + 2, row * ch + 2, 10, 1.2);
      }
    }
  }),
  // Прерии: тёплый коричнево-серый асфальт/гонт.
  shinglePrairie: () => canvas(128, 80, (g, w, h) => {
    g.fillStyle = "#4a483c";
    g.fillRect(0, 0, w, h);
    const ch = h / 4;
    for (let row = 0; row < 4; row++) {
      const shift = row % 2 ? 14 : 0;
      for (let x = -20; x < w; x += 28) {
        g.fillStyle = shadeHex("#6a6858", ((row * 7 + x) % 11) - 5);
        g.fillRect(x + shift + 1, row * ch + 1, 26, ch - 2);
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.fillRect(x + shift + 1, row * ch + ch * 0.55, 26, ch * 0.35);
        g.fillStyle = "rgba(210,200,170,0.07)";
        g.fillRect(x + shift + 2, row * ch + 2, 10, 1.2);
      }
    }
  }),
  // Прованс: выцветшая терракотово-песочная средиземноморская черепица.
  tileProvence: () => canvas(128, 80, (g, w, h) => {
    g.fillStyle = "#6a5a42";
    g.fillRect(0, 0, w, h);
    const tones = ["#8a7a58", "#9a8060", "#7a6a48", "#a09070", "#706048", "#8e7858"];
    const ch = h / 3;
    for (let row = 0; row < 3; row++) {
      const shift = row % 2 ? 18 : 0;
      for (let x = -24; x < w; x += 36) {
        const cx = x + shift + 18;
        const cy = row * ch + ch * 0.2;
        const base = tones[((row * 5 + ((x + 48) / 36) | 0) % tones.length + tones.length) % tones.length];
        g.fillStyle = shadeHex(base, ((row * 5 + x) % 9) - 4);
        g.beginPath();
        g.arc(cx, cy, 16, 0, Math.PI);
        g.fill();
        g.fillStyle = "rgba(40,28,16,0.18)";
        g.beginPath();
        g.arc(cx, cy + 2, 14, 0.15, Math.PI - 0.15);
        g.fill();
        g.fillStyle = "rgba(240,220,180,0.10)";
        g.beginPath();
        g.arc(cx - 4, cy - 2, 6, Math.PI * 1.1, Math.PI * 1.7);
        g.fill();
      }
    }
  }),
  seam: () => canvas(96, 48, (g, w, h) => {
    g.fillStyle = "#2a2e32";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.fillRect(0, 0, w, h * 0.5);
    const cx = w / 2;
    g.fillStyle = "#1a1e22";
    g.fillRect(cx - 4, 0, 1.5, h);
    g.fillRect(cx + 3, 0, 1.5, h);
    g.fillStyle = "#4a5158";
    g.fillRect(cx - 2.5, 0, 5, h);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fillRect(cx - 1, 0, 1.5, h);
  }),
  // Серые секции у проёмов (roof-d): фиброцемент / штукатурка с облачной неоднородностью.
  darkClad: () => canvas(160, 160, (g, w, h) => {
    g.fillStyle = "#5e666f";
    g.fillRect(0, 0, w, h);
    const blot = [
      "rgba(72,78,86,0.38)",
      "rgba(108,116,124,0.30)",
      "rgba(88,94,102,0.26)",
      "rgba(98,106,114,0.22)",
      "rgba(64,70,78,0.28)",
      "rgba(118,124,132,0.18)",
    ];
    for (let i = 0; i < 110; i++) {
      g.fillStyle = blot[i % blot.length];
      const x = (i * 47 + 13) % w;
      const y = (i * 73 + 29) % h;
      const rx = 10 + (i * 5) % 18;
      const ry = 7 + (i * 3) % 14;
      g.beginPath();
      g.ellipse(x, y, rx, ry, ((i * 17) % 40) * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = `rgba(0,0,0,${0.015 + (x % 11) * 0.006})`;
      g.fillRect(x, 0, 1, h);
    }
    g.fillStyle = "rgba(255,255,255,0.04)";
    g.fillRect(0, 0, w, h * 0.35);
  }),
  // Цоколь roof-d: чуть темнее серых секций, не чёрный.
  plinthSoft: () => canvas(96, 64, (g, w, h) => {
    g.fillStyle = "#4a515a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? "rgba(58,64,72,0.28)" : "rgba(82,90,98,0.22)";
      const x = (i * 29) % w;
      const y = (i * 41) % h;
      g.fillRect(x, y, 10 + (i % 6), 4 + (i % 4));
    }
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.fillRect(0, h * 0.55, w, h * 0.45);
  }),
  // Сплошной щит из вертикальных досок: сочный янтарный дуб (сканди / roof-d).
  woodBoards: () => canvas(160, 256, (g, w, h) => {
    const n = 5;
    const bw = w / n;
    const tones = ["#e0b478", "#d4a060", "#ecc080", "#c89858", "#e8bc70", "#d8a868", "#f0c888"];
    for (let i = 0; i < n; i++) {
      g.fillStyle = tones[i % tones.length];
      g.fillRect(i * bw, 0, bw + 1, h);
      for (let k = 0; k < 28; k++) {
        const y = (k * 37 + i * 11) % h;
        g.fillStyle = `rgba(90,50,18,${0.035 + (k % 4) * 0.012})`;
        g.fillRect(i * bw + 3 + (k % 3), y, bw - 8, 1.2);
        g.fillStyle = `rgba(255,230,170,${0.06 + (k % 3) * 0.02})`;
        g.fillRect(i * bw + 5, (y + 9) % h, bw * 0.35, 1);
      }
      if (i > 0) {
        g.fillStyle = "rgba(70,40,14,0.38)";
        g.fillRect(i * bw - 1, 0, 2, h);
        g.fillStyle = "rgba(255,235,190,0.16)";
        g.fillRect(i * bw + 1, 0, 1.5, h);
      }
    }
  }),
  // Фальц roof-d: панели одного цвета + заметное ребро шва с контуром (не зебра).
  seamAnthracite: () => canvas(128, 64, (g, w, h) => {
    const pan = "#3a4048";
    g.fillStyle = pan;
    g.fillRect(0, 0, w, h);
    // Лёгкая ровная тональность панели (без чередования полос).
    g.fillStyle = "rgba(0,0,0,0.04)";
    g.fillRect(0, 0, w, h * 0.5);
    const cx = w * 0.5;
    const rib = 7;
    // Тень/контур по краям ребра.
    g.fillStyle = "#1c2026";
    g.fillRect(cx - rib * 0.5 - 1.5, 0, 1.5, h);
    g.fillRect(cx + rib * 0.5, 0, 1.5, h);
    // Само ребро — тот же антрацит, чуть светлее сверху.
    g.fillStyle = "#4a515a";
    g.fillRect(cx - rib * 0.5, 0, rib, h);
    g.fillStyle = "#2a3038";
    g.fillRect(cx - rib * 0.5, 0, 1.2, h);
    g.fillRect(cx + rib * 0.5 - 1.2, 0, 1.2, h);
    g.fillStyle = "rgba(255,255,255,0.14)";
    g.fillRect(cx - 1.2, 0, 2.4, h);
  }),
};

function pattern(id) {
  if (!cache.has(id)) cache.set(id, PATTERN[id]());
  return cache.get(id);
}

const SCALE = {
  plaster: 1.4,
  plasterWarm: 1.4,
  plasterWright: 1.4,
  plasterWhite: 1.4,
  plasterOchre: 1.4,
  plasterProvence: 1.4,
  plasterCream: 1.4,
  brick: 0.85,
  brickDark: 0.85,
  brickWright: 0.48,
  brickWrightWarm: 0.48,
  bavaria: 0.85,
  brickSand: 0.85,
  brickAsh: 0.85,
  brickPrairie: 0.75,
  longBrick: 0.75,
  stone: 1.0,
  stoneDark: 1.0,
  stoneSand: 1.0,
  siding: 0.7,
  vsiding: 0.75,
  vsidingDark: 0.75,
  finnishRed: 0.75,
  finnishGreen: 0.75,
  woodDark: 0.7,
  woodBeam: 0.65,
  shutterSage: 0.55,
  shutterTerracotta: 0.55,
  shutterGreen: 0.55,
  slats: 0.55,
  stripes: 0.9,
  rust: 1.2,
  fachwerk: 1.4,
  fachwerkBrick: 0.85,
  louvers: 0.55,
  cassettes: 1.5,
  cassetteAlt: 1.5,
  corten: 1.2,
  panels: 1.6,
  panelEdge: 0.9,
  german: 1.4,
  quoinBrick: 3.4,
  quoinDark: 3.4,
  stoneSiding: 0.7,
  darkCenter: 1.4,
  scandi: 1.4,
  brickPiers: 1.4,
  bavariaFrame: 1.4,
  tuscan: 1.4,
  provence: 1.4,
  mediterranean: 1.4,
  belgian: 1,
  finnish: 1.4,
  reikiScreen: 1.4,
  rustPlinth: 0.7,
  artdeco: 1.4,
  chevron: 1.3,
  stijl: 1.4,
  lopatki: 1.4,
  beltStone: 0.7,
  inkMetal: 0.9,
  bladeDark: 0.7,
  jointGrey: 0.9,
  sidingAccent: 0.7,
  darkPanel: 1.5,
  battenDark: 0.65,
  surroundWarm: 1.0,
  skirtStone: 1.3,
  skirtBrick: 1.2,
  skirtSwiss: 1.3,
  belts: 1.2,
  tile: 0.75,
  tileDark: 0.75,
  tileBrown: 0.75,
  shingleBlack: 0.7,
  shinglePrairie: 0.7,
  tileProvence: 0.75,
  seam: 0.6,
  seamAnthracite: 0.55,
  darkClad: 1.9,
  plinthSoft: 1.4,
  woodBoards: 0.8,
};

const CLAMP = new Set(["skirtStone", "skirtBrick", "skirtSwiss", "belts", "chevron", "louvers", "belgian", "artdeco", "cassettes"]);

function finish(wall, roof, frame, plinth, base, column, gutter) {
  return { wall, roof, frame, door: frame, plinth, base, column, gutter };
}

const pat = (id) => ({ pattern: id, scale: SCALE[id], height: CLAMP.has(id) ? 4.2 : 0 });
// align:"fall" — полосы/фальц строго по скату от конька вниз, не зебра по миру.
const roof = (id) => ({ pattern: id, scale: SCALE[id], height: 0, align: "fall" });
const flat = (color) => ({ color });

const ZINC = 0x6a7278;
const BROWN_GUTTER = 0x3e342c;
const WARM_BASE = 0xc4b8a6;
const COOL_BASE = 0xc5c1b8;
const LIGHT_COL = 0xe6dfd4;
const WOOD_COL = 0xd7c4a8;

// Базовые отделки 1–30 (стена = материал; композиция — overlay).
const NUMBERED_FINISHES = [
  { id: "1", name: "1. Камень до подоконника", ...finish(pat("plaster"), roof("tile"), 0x3a322c, pat("stone"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "2", name: "2. Кирпич на углах и вокруг окон", ...finish(pat("plaster"), roof("tileDark"), 0x4a342c, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "3", name: "3. Английский коттедж", ...finish(pat("plasterCream"), roof("tileDark"), 0x3a322c, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "4", name: "4. Камень террасы, сайдинг крыльев", ...finish(pat("siding"), roof("seam"), 0x2a2e32, 0x3a4048, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "5", name: "5. Крупные панели", ...finish(pat("panels"), roof("seam"), 0x3e444c, 0x3e444c, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "6", name: "6. Рустованная штукатурка", ...finish(pat("rust"), roof("tile"), 0x3a322c, pat("rustPlinth"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "7", name: "7. Прованс", ...finish(pat("plasterWarm"), roof("tile"), 0xf7f3ec, pat("stoneSand"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "8", name: "8. Стиль прерий", ...finish(pat("plasterCream"), roof("seam"), 0x3c342c, pat("brickWright"), WARM_BASE, pat("brickWright"), ZINC) },
  { id: "9", name: "9. Кирпич до подоконника", ...finish(pat("plaster"), roof("tileDark"), 0x3a322c, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "10", name: "10. Тёмный щипец и цоколь", ...finish(pat("plaster"), roof("seam"), 0x2a2e32, pat("darkPanel"), COOL_BASE, LIGHT_COL, ZINC) },
  { id: "11", name: "11. Лопатки и цоколь", ...finish(pat("plasterCream"), roof("tile"), 0x3a342c, 0x3a342c, COOL_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "12", name: "12. Австрийский", ...finish(pat("plasterWarm"), roof("tile"), 0x3a322c, pat("rustPlinth"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "13", name: "13. Скандинавский", ...finish(pat("plasterWhite"), roof("seam"), 0x1a1c1e, 0x1e2226, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "14", name: "14. Голландский", ...finish(pat("plaster"), roof("tile"), 0x3a322c, pat("brickDark"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "15", name: "15. Баварский", ...finish(pat("plasterCream"), roof("tileDark"), 0x3a322c, pat("bavaria"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "16", name: "16. Тосканский", ...finish(pat("plasterOchre"), roof("tile"), 0x4a342c, pat("stoneDark"), 0xb7a48c, WOOD_COL, BROWN_GUTTER) },
  { id: "17", name: "17. Бельгийский", ...finish(pat("belgian"), roof("tileDark"), 0x2a2a2a, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "18", name: "18. Немецкий панельный", ...finish(pat("german"), roof("seam"), 0x4e5450, 0x3a4048, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "19", name: "19. Швейцарский", ...finish(pat("plasterCream"), roof("tileDark"), 0x3a322c, pat("stoneDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "20", name: "20. Финский", ...finish(pat("plasterWhite"), roof("seam"), 0x2e3430, 0x2e3430, COOL_BASE, WOOD_COL, ZINC) },
  { id: "21", name: "21. Средиземноморский", ...finish(pat("plasterWarm"), roof("tile"), 0x2f4a44, pat("stoneDark"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "22", name: "22. Франконский фахверк", ...finish(pat("fachwerk"), roof("tile"), 0x3a2418, pat("stoneDark"), WARM_BASE, 0xe7d4b8, BROWN_GUTTER) },
  { id: "23", name: "23. Фахверк с кирпичной забуткой", ...finish(pat("fachwerkBrick"), roof("tileDark"), 0x2a211c, pat("brickDark"), WARM_BASE, 0xe4d0c0, ZINC) },
  { id: "24", name: "24. Ар-деко", ...finish(pat("plasterCream"), roof("tileDark"), 0x1c1a17, 0x1c1a17, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "25", name: "25. Де Стейл", ...finish(pat("plasterWhite"), roof("seam"), 0x141414, 0x141414, COOL_BASE, 0xf4f1ea, ZINC) },
  { id: "26", name: "26. Полихромная кладка", ...finish(pat("stripes"), roof("tileDark"), 0x3c2824, 0x4a241e, WARM_BASE, 0xe7d3c4, ZINC) },
  { id: "27", name: "27. Ламели", ...finish(pat("plasterWhite"), roof("tileDark"), 0x1e2428, 0x1e2428, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "28", name: "28. Рейки", ...finish(pat("plasterCream"), roof("seam"), 0x3a3028, 0x2c2926, COOL_BASE, 0xe8dcc8, ZINC) },
  { id: "29", name: "29. Кассеты", ...finish(pat("darkPanel"), roof("seam"), 0x1a1e22, 0x1a1e22, COOL_BASE, 0xe4ddd4, ZINC) },
  {
    id: "30",
    name: "30. Рендер roof-d",
    ...finish(
      pat("longBrick"),
      roof("seamAnthracite"),
      0x5e666f,
      pat("plinthSoft"),
      0xc5c1b8,
      pat("longBrick"),
      0x5e666f
    ),
  },
];

/** Каталог отделки из «Стили домов»: лайкнутые сверху, остальные ниже. */
const CATALOG_STYLES = [
  {
    id: "nordic-white", likes: 3,
    name: "Сканди-модерн · Белая штукатурка и дерево",
    thumb: "style-examples/nordic-white.jpg",
    overlay: "nordic",
    tweak: { wall: pat("plasterWhite"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, plinth: 0x8a8e92, column: pat("plasterWhite"), gutter: 0x2a2e32 },
  },
  {
    id: "nordic-beige", likes: 2,
    name: "Сканди-модерн · Бежевая штукатурка и дерево",
    thumb: "style-examples/nordic-beige.jpg",
    overlay: "nordic",
    tweak: { wall: pat("plasterWarm"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, plinth: 0x7a7e82, column: pat("plasterWarm"), gutter: 0x2a2e32 },
  },
  {
    id: "nordic-grey", likes: 2,
    name: "Сканди-модерн · Серая штукатурка и дерево",
    thumb: "style-examples/nordic-grey.jpg",
    overlay: "nordic",
    tweak: { wall: pat("plaster"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, plinth: 0x6a6e72, column: pat("plaster"), gutter: 0x2a2e32 },
  },
  {
    id: "roof-d", likes: 3,
    name: "Roof-d · Светлый кирпич и дуб",
    thumb: "style-examples/roof-d.jpg",
    overlay: "30",
    tweak: { wall: pat("longBrick"), roof: roof("seamAnthracite"), frame: 0x5e666f, plinth: pat("plinthSoft"), column: pat("longBrick"), gutter: 0x5e666f, base: 0xc5c1b8 },
  },
  {
    id: "wright-plaster", likes: 3,
    name: "Райт · Светлая штукатурка и тёмный кирпич",
    thumb: "style-examples/wright-plaster.jpg",
    overlay: "wright-plaster",
    // soffit = кровля: белая подбивка не конфликтует с тёмным низом/торцом ската.
    tweak: { wall: pat("plasterWright"), plinth: pat("brickWright"), column: pat("brickWright"), roof: roof("tileBrown"), frame: 0x3c342c, gutter: BROWN_GUTTER, base: 0xc5b8a8 },
  },
  {
    id: "wright-warm", likes: 2,
    name: "Райт · Тёплый кирпич и светлые пояса",
    thumb: "style-examples/wright-warm.jpg",
    overlay: "wright-warm",
    tweak: {
      wall: pat("brickWrightWarm"),
      plinth: pat("plasterWright"),
      column: pat("brickWrightWarm"),
      roof: roof("tileBrown"),
      frame: 0x2a211c,
      gutter: BROWN_GUTTER,
      base: 0xc5b8a8,
    },
  },
  {
    id: "wright-dark", likes: 0,
    name: "Райт · Тёмный кирпич и светлые пояса",
    thumb: "style-examples/wright-dark.jpg",
    overlay: "wright-warm",
    tweak: { wall: pat("brickWright"), plinth: pat("brickWright"), column: pat("brickWright"), roof: roof("tileBrown"), frame: 0x1c1814, gutter: BROWN_GUTTER },
  },
  {
    id: "bavaria-classic", likes: 2,
    name: "Баварский · Красная кладка, арка и терраса",
    thumb: "style-examples/bavaria-classic.jpg",
    overlay: null,
    tweak: { wall: pat("bavaria"), plinth: pat("bavaria"), column: pat("bavaria"), roof: roof("tileBrown"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "bavaria-graphite", likes: 2,
    name: "Баварский · Графитовый клинкер и фальц",
    thumb: "style-examples/bavaria-graphite.jpg",
    overlay: null,
    tweak: { wall: pat("brickAsh"), plinth: pat("brickWright"), column: pat("brickAsh"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "bavaria-sand", likes: 2,
    name: "Баварский · Песочный клинкер и навес",
    thumb: "style-examples/bavaria-sand.jpg",
    overlay: null,
    tweak: { wall: pat("brickSand"), plinth: pat("brickWright"), column: pat("brickSand"), roof: roof("shingleBlack"), frame: 0x3a3028, gutter: 0x2a2a26 },
  },
  {
    id: "euro-graphite", likes: 2,
    name: "Европейский · Графитовый клинкер",
    thumb: "style-examples/euro-graphite.jpg",
    overlay: "euro",
    tweak: { wall: pat("plasterWhite"), plinth: pat("brickAsh"), column: pat("brickAsh"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "euro-sand", likes: 2,
    name: "Европейский · Песочный клинкер",
    thumb: "style-examples/euro-sand.jpg",
    overlay: "euro-sand",
    tweak: { wall: pat("plasterCream"), plinth: pat("brickSand"), column: pat("brickSand"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "euro-white", likes: 0,
    name: "Европейский · Белая штукатурка и тёмный цоколь",
    thumb: "style-examples/euro-white.jpg",
    overlay: "euro",
    tweak: { wall: pat("plasterWhite"), plinth: pat("brickWright"), column: pat("plasterWhite"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "prairie-brick", likes: 2,
    name: "Прерии · Горизонтальный кирпич",
    thumb: "style-examples/prairie-brick.jpg",
    overlay: null,
    tweak: { wall: pat("brickPrairie"), plinth: pat("brickPrairie"), column: pat("woodDark"), roof: roof("shinglePrairie"), frame: 0x3a281c, gutter: 0x3a3028 },
  },
  {
    id: "prairie-stucco", likes: 0,
    name: "Прерии · Штукатурка с поясами",
    thumb: "style-examples/prairie-stucco.jpg",
    overlay: "wright-warm",
    tweak: { wall: pat("plasterWarm"), plinth: pat("brickPrairie"), column: pat("plasterWarm"), roof: roof("shinglePrairie"), frame: 0x3a281c, gutter: BROWN_GUTTER },
  },
  {
    id: "prairie-stone", likes: 0,
    name: "Прерии · Камень и дерево",
    thumb: "style-examples/prairie-stone.jpg",
    overlay: null,
    tweak: { wall: pat("stoneSand"), plinth: pat("stoneDark"), column: pat("woodDark"), roof: roof("shinglePrairie"), frame: 0x2a211c, gutter: BROWN_GUTTER },
  },
  {
    id: "provence-stone", likes: 2,
    name: "Прованс · Песочная штукатурка и камень",
    thumb: "style-examples/provence-stone.jpg",
    overlay: "provence-stone",
    tweak: { wall: pat("plasterProvence"), plinth: pat("stoneSand"), column: pat("stoneSand"), roof: roof("tileProvence"), frame: 0x5a4838, gutter: BROWN_GUTTER },
  },
  {
    id: "provence-cream", likes: 0,
    name: "Прованс · Кремовая штукатурка",
    thumb: "style-examples/provence-cream.jpg",
    overlay: null,
    tweak: { wall: pat("plasterCream"), plinth: pat("stoneSand"), column: pat("plasterCream"), roof: roof("tileProvence"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "provence-white", likes: 0,
    name: "Прованс · Белая штукатурка",
    thumb: "style-examples/provence-white.jpg",
    overlay: "provence-stone",
    tweak: { wall: pat("plasterWhite"), plinth: pat("stoneSand"), column: pat("stoneSand"), roof: roof("tileProvence"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "scandi-white", likes: 0,
    name: "Скандинавский · Белая вертикальная доска",
    thumb: "style-examples/scandi-white.jpg",
    overlay: null,
    tweak: { wall: pat("vsiding"), plinth: 0x8a8e92, column: pat("vsiding"), roof: roof("seamAnthracite"), frame: 0xf7f3ec, gutter: 0x2a2e32 },
  },
  {
    id: "scandi-natural", likes: 0,
    name: "Скандинавский · Светлая горизонтальная доска",
    thumb: "style-examples/scandi-natural.jpg",
    overlay: null,
    tweak: { wall: pat("siding"), plinth: 0x7a7060, column: pat("siding"), roof: roof("seamAnthracite"), frame: 0xf7f3ec, gutter: 0x2a2e32 },
  },
  {
    id: "scandi-dark", likes: 0,
    name: "Скандинавский · Тёмная вертикальная доска",
    thumb: "style-examples/scandi-dark.jpg",
    overlay: null,
    tweak: { wall: pat("vsidingDark"), plinth: 0x2a2e32, column: pat("vsidingDark"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "barn-black", likes: 0,
    name: "Барнхаус · Чёрная вертикальная доска",
    thumb: "style-examples/barn-black.jpg",
    overlay: null,
    tweak: { wall: pat("vsidingDark"), plinth: 0x1a1c1e, column: pat("vsidingDark"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e, base: 0x2a2e32 },
  },
  {
    id: "barn-wood", likes: 0,
    name: "Барнхаус · Светлое дерево",
    thumb: "style-examples/barn-wood.jpg",
    overlay: null,
    tweak: { wall: pat("woodBoards"), plinth: 0x5a4a38, column: pat("woodBoards"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "barn-brick", likes: 0,
    name: "Барнхаус · Белый планкен и серый кирпич",
    thumb: "style-examples/barn-brick.jpg",
    overlay: "euro",
    tweak: { wall: pat("vsiding"), plinth: pat("brickAsh"), column: pat("brickAsh"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "modern-white", likes: 0,
    name: "Современный · Белая штукатурка",
    thumb: "style-examples/modern-white.jpg",
    overlay: null,
    tweak: { wall: pat("plasterWhite"), plinth: 0x6a6e72, column: pat("plasterWhite"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "modern-wood", likes: 0,
    name: "Современный · Серая штукатурка и деревянные рейки",
    thumb: "style-examples/modern-wood.jpg",
    overlay: "28",
    tweak: { wall: pat("plaster"), plinth: 0x5a5e62, column: pat("woodBoards"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "modern-dark", likes: 0,
    name: "Современный · Тёмная штукатурка",
    thumb: "style-examples/modern-dark.jpg",
    overlay: null,
    tweak: { wall: pat("darkClad"), plinth: 0x2a2e32, column: pat("darkClad"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "finnish-pale", likes: 0,
    name: "Финский · Светло-серая доска",
    thumb: "style-examples/finnish-pale.jpg",
    overlay: null,
    tweak: { wall: pat("vsiding"), plinth: 0x7a7e82, column: pat("vsiding"), roof: roof("seamAnthracite"), frame: 0xf7f3ec, gutter: 0x2a2e32 },
  },
  {
    id: "finnish-red", likes: 0,
    name: "Финский · Красная доска",
    thumb: "style-examples/finnish-red.jpg",
    overlay: null,
    tweak: { wall: pat("finnishRed"), plinth: 0x4a3028, column: pat("finnishRed"), roof: roof("seamAnthracite"), frame: 0xf7f3ec, gutter: 0x2a2e32 },
  },
  {
    id: "finnish-green", likes: 0,
    name: "Финский · Тёмно-зелёная доска",
    thumb: "style-examples/finnish-green.jpg",
    overlay: null,
    tweak: { wall: pat("finnishGreen"), plinth: 0x3a4438, column: pat("finnishGreen"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "classic-plaster", likes: 0,
    name: "Классический · Светлая штукатурка",
    thumb: "style-examples/classic-plaster.jpg",
    overlay: null,
    tweak: { wall: pat("plasterCream"), plinth: pat("stoneSand"), column: pat("plasterCream"), roof: roof("tileBrown"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "classic-brick", likes: 0,
    name: "Классический · Светлый кирпич",
    thumb: "style-examples/classic-brick.jpg",
    overlay: null,
    tweak: { wall: pat("brickSand"), plinth: pat("brickSand"), column: pat("brickSand"), roof: roof("tileBrown"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "classic-quoin", likes: 0,
    name: "Классический · Штукатурка и кирпичные углы",
    thumb: "style-examples/classic-quoin.jpg",
    overlay: "2",
    tweak: { wall: pat("plasterCream"), plinth: pat("brick"), column: pat("brick"), roof: roof("tileBrown"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "fachwerk-white", likes: 0,
    name: "Фахверк · Белая забутка",
    thumb: "style-examples/fachwerk-white.jpg",
    overlay: "22",
    tweak: { wall: pat("plasterWhite"), plinth: pat("stoneDark"), column: 0xe7d4b8, roof: roof("tileBrown"), frame: 0x3a2418, gutter: BROWN_GUTTER },
  },
  {
    id: "fachwerk-brick", likes: 0,
    name: "Фахверк · Кирпичная забутка",
    thumb: "style-examples/fachwerk-brick.jpg",
    overlay: "23",
    tweak: { wall: pat("fachwerkBrick"), plinth: pat("brickDark"), column: 0xe4d0c0, roof: roof("tileDark"), frame: 0x2a211c, gutter: ZINC },
  },
  {
    id: "fachwerk-beige", likes: 0,
    name: "Фахверк · Бежевая забутка",
    thumb: "style-examples/fachwerk-beige.jpg",
    overlay: "22",
    tweak: { wall: pat("plasterWarm"), plinth: pat("stoneDark"), column: 0xe7d4b8, roof: roof("tileBrown"), frame: 0x3a2418, gutter: BROWN_GUTTER },
  },
  {
    id: "ranch-brick", likes: 0,
    name: "Ранчо · Светлый кирпич",
    thumb: "style-examples/ranch-brick.jpg",
    overlay: null,
    tweak: { wall: pat("brickSand"), plinth: pat("brickSand"), column: pat("brickSand"), roof: roof("shinglePrairie"), frame: 0x3a3028, gutter: BROWN_GUTTER },
  },
  {
    id: "ranch-stucco", likes: 0,
    name: "Ранчо · Тёплая штукатурка",
    thumb: "style-examples/ranch-stucco.jpg",
    overlay: null,
    tweak: { wall: pat("plasterWarm"), plinth: pat("stoneSand"), column: pat("plasterWarm"), roof: roof("shinglePrairie"), frame: 0x3a3028, gutter: BROWN_GUTTER },
  },
  {
    id: "ranch-wood", likes: 0,
    name: "Ранчо · Горизонтальная доска",
    thumb: "style-examples/ranch-wood.jpg",
    overlay: null,
    tweak: { wall: pat("siding"), plinth: 0x5a4a38, column: pat("siding"), roof: roof("shinglePrairie"), frame: 0x3a281c, gutter: BROWN_GUTTER },
  },
  {
    id: "japan-dark", likes: 0,
    name: "Японский · Тёмное дерево и белая штукатурка",
    thumb: "style-examples/japan-dark.jpg",
    overlay: "nordic",
    tweak: { wall: pat("plasterWhite"), plinth: pat("woodDark"), column: pat("woodDark"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "japan-cedar", likes: 0,
    name: "Японский · Светлый кедр",
    thumb: "style-examples/japan-cedar.jpg",
    overlay: null,
    tweak: { wall: pat("woodBoards"), plinth: 0x6a5a48, column: pat("woodBoards"), roof: roof("seamAnthracite"), frame: 0x3a3028, gutter: 0x2a2e32 },
  },
  {
    id: "japan-charred", likes: 0,
    name: "Японский · Обожжённое дерево",
    thumb: "style-examples/japan-charred.jpg",
    overlay: null,
    tweak: { wall: pat("woodDark"), plinth: 0x1a1c1e, column: pat("woodDark"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "english-red", likes: 0,
    name: "Английский · Красный кирпич",
    thumb: "style-examples/english-red.jpg",
    overlay: null,
    tweak: { wall: pat("brick"), plinth: pat("brick"), column: pat("brick"), roof: roof("tileBrown"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "english-dark", likes: 0,
    name: "Английский · Тёмный кирпич",
    thumb: "style-examples/english-dark.jpg",
    overlay: null,
    tweak: { wall: pat("brickDark"), plinth: pat("brickDark"), column: pat("brickDark"), roof: roof("tileDark"), frame: 0xf7f3ec, gutter: ZINC },
  },
  {
    id: "english-white", likes: 0,
    name: "Английский · Белые наличники",
    thumb: "style-examples/english-white.jpg",
    overlay: "3",
    tweak: { wall: pat("brick"), plinth: pat("brickDark"), column: pat("brick"), roof: roof("tileDark"), frame: 0xf7f3ec, gutter: ZINC },
  },
  {
    id: "med-white", likes: 0,
    name: "Средиземноморский · Белая штукатурка",
    thumb: "style-examples/med-white.jpg",
    overlay: null,
    tweak: { wall: pat("plasterWhite"), plinth: pat("stoneSand"), column: pat("plasterWhite"), roof: roof("tileProvence"), frame: 0x5a4838, gutter: BROWN_GUTTER },
  },
  {
    id: "med-ochre", likes: 0,
    name: "Средиземноморский · Тёплая охра",
    thumb: "style-examples/med-ochre.jpg",
    overlay: null,
    tweak: { wall: pat("plasterOchre"), plinth: pat("stoneDark"), column: pat("plasterOchre"), roof: roof("tileProvence"), frame: 0x4a342c, gutter: BROWN_GUTTER },
  },
  {
    id: "med-stone", likes: 0,
    name: "Средиземноморский · Каменные арки",
    thumb: "style-examples/med-stone.jpg",
    overlay: "1",
    tweak: { wall: pat("plasterWarm"), plinth: pat("stone"), column: pat("stone"), roof: roof("tileProvence"), frame: 0x4a342c, gutter: BROWN_GUTTER },
  },
  {
    id: "contemporary-plaster", likes: 0,
    name: "Контемпорари · Белая штукатурка и кедр",
    thumb: "style-examples/contemporary-plaster.jpg",
    overlay: "nordic",
    tweak: { wall: pat("plasterWhite"), plinth: 0x6a6e72, column: pat("woodBoards"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "contemporary-stone", likes: 0,
    name: "Контемпорари · Камень и тёмное дерево",
    thumb: "style-examples/contemporary-stone.jpg",
    overlay: null,
    tweak: { wall: pat("stone"), plinth: pat("stoneDark"), column: pat("woodDark"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "contemporary-dark", likes: 0,
    name: "Контемпорари · Графитовая штукатурка и рейки",
    thumb: "style-examples/contemporary-dark.jpg",
    overlay: "28",
    tweak: { wall: pat("darkClad"), plinth: 0x2a2e32, column: pat("woodBoards"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "farm-white", likes: 0,
    name: "Фермерский · Белая доска",
    thumb: "style-examples/farm-white.jpg",
    overlay: null,
    tweak: { wall: pat("vsiding"), plinth: 0x8a8e92, column: pat("vsiding"), roof: roof("seamAnthracite"), frame: 0xf7f3ec, gutter: 0x2a2e32 },
  },
  {
    id: "farm-grey", likes: 0,
    name: "Фермерский · Светло-серая доска",
    thumb: "style-examples/farm-grey.jpg",
    overlay: null,
    tweak: { wall: pat("vsidingDark"), plinth: 0x5a5e62, column: pat("vsidingDark"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "farm-brick", likes: 0,
    name: "Фермерский · Белая доска и кирпич",
    thumb: "style-examples/farm-brick.jpg",
    overlay: "euro",
    tweak: { wall: pat("vsiding"), plinth: pat("brick"), column: pat("brick"), roof: roof("seamAnthracite"), frame: 0xf7f3ec, gutter: BROWN_GUTTER },
  },
  {
    id: "craftsman-white", likes: 0,
    name: "Крафтсман · Светлая штукатурка и балки",
    thumb: "style-examples/craftsman-white.jpg",
    overlay: "22",
    tweak: { wall: pat("plasterCream"), plinth: pat("stoneDark"), column: 0xd7c4a8, roof: roof("shinglePrairie"), frame: 0x3a281c, gutter: BROWN_GUTTER },
  },
  {
    id: "craftsman-cedar", likes: 0,
    name: "Крафтсман · Кедровая доска и камень",
    thumb: "style-examples/craftsman-cedar.jpg",
    overlay: null,
    tweak: { wall: pat("woodBoards"), plinth: pat("stone"), column: pat("woodBoards"), roof: roof("shinglePrairie"), frame: 0x2a211c, gutter: BROWN_GUTTER },
  },
  {
    id: "craftsman-sage", likes: 0,
    name: "Крафтсман · Шалфейная штукатурка",
    thumb: "style-examples/craftsman-sage.jpg",
    overlay: null,
    tweak: { wall: 0x8a9a88, plinth: pat("stoneDark"), column: 0x8a9a88, roof: roof("shinglePrairie"), frame: 0x3a3028, gutter: BROWN_GUTTER },
  },
  {
    id: "chalet-wood", likes: 0,
    name: "Шале · Тёмное дерево",
    thumb: "style-examples/chalet-wood.jpg",
    overlay: null,
    tweak: { wall: pat("woodDark"), plinth: pat("stoneDark"), column: pat("woodDark"), roof: roof("tileBrown"), frame: 0x2a211c, gutter: BROWN_GUTTER },
  },
  {
    id: "chalet-stone", likes: 0,
    name: "Шале · Камень и дерево",
    thumb: "style-examples/chalet-stone.jpg",
    overlay: null,
    tweak: { wall: pat("stone"), plinth: pat("stoneDark"), column: pat("woodDark"), roof: roof("tileBrown"), frame: 0x2a211c, gutter: BROWN_GUTTER },
  },
  {
    id: "chalet-plaster", likes: 0,
    name: "Шале · Штукатурка и дерево",
    thumb: "style-examples/chalet-plaster.jpg",
    overlay: null,
    tweak: { wall: pat("plasterWarm"), plinth: pat("stoneDark"), column: pat("woodDark"), roof: roof("tileBrown"), frame: 0x2a211c, gutter: BROWN_GUTTER },
  },
  {
    id: "log-light", likes: 0,
    name: "Бревенчатый · Светлое бревно",
    thumb: "style-examples/log-light.jpg",
    overlay: null,
    tweak: { wall: pat("woodBoards"), plinth: pat("stoneSand"), column: pat("woodBoards"), roof: roof("shinglePrairie"), frame: 0x3a281c, gutter: BROWN_GUTTER },
  },
  {
    id: "log-dark", likes: 0,
    name: "Бревенчатый · Тёмное бревно",
    thumb: "style-examples/log-dark.jpg",
    overlay: null,
    tweak: { wall: pat("woodDark"), plinth: pat("stoneDark"), column: pat("woodDark"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "log-stone", likes: 0,
    name: "Бревенчатый · Бревно и камень",
    thumb: "style-examples/log-stone.jpg",
    overlay: "1",
    tweak: { wall: pat("woodBoards"), plinth: pat("stone"), column: pat("woodBoards"), roof: roof("shinglePrairie"), frame: 0x2a211c, gutter: BROWN_GUTTER },
  },
  {
    id: "midcentury-white", likes: 0,
    name: "Мид-сенчури · Белая штукатурка",
    thumb: "style-examples/midcentury-white.jpg",
    overlay: null,
    tweak: { wall: pat("plasterWhite"), plinth: 0x6a6e72, column: pat("plasterWhite"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
  {
    id: "midcentury-dark", likes: 0,
    name: "Мид-сенчури · Тёмная штукатурка",
    thumb: "style-examples/midcentury-dark.jpg",
    overlay: null,
    tweak: { wall: pat("darkClad"), plinth: 0x2a2e32, column: pat("darkClad"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "midcentury-stone", likes: 0,
    name: "Мид-сенчури · Камень",
    thumb: "style-examples/midcentury-stone.jpg",
    overlay: null,
    tweak: { wall: pat("stone"), plinth: pat("stoneDark"), column: pat("stone"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "hitech-dark", likes: 0,
    name: "Хай-тек · Тёмный фасад",
    thumb: "style-examples/hitech-dark.jpg",
    overlay: null,
    tweak: { wall: pat("darkClad"), plinth: 0x1a1c1e, column: pat("darkClad"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x1a1c1e },
  },
  {
    id: "hitech-silver", likes: 0,
    name: "Хай-тек · Серебристые панели",
    thumb: "style-examples/hitech-silver.jpg",
    overlay: null,
    tweak: { wall: pat("panels"), plinth: 0x4a5058, column: pat("panels"), roof: roof("seamAnthracite"), frame: 0x2a2e32, gutter: 0x2a2e32 },
  },
  {
    id: "hitech-wood", likes: 0,
    name: "Хай-тек · Светлое дерево и стекло",
    thumb: "style-examples/hitech-wood.jpg",
    overlay: null,
    tweak: { wall: pat("woodBoards"), plinth: 0x5a5e62, column: pat("woodBoards"), roof: roof("seamAnthracite"), frame: 0x1a1c1e, gutter: 0x2a2e32 },
  },
];

const DEFAULT_FINISH = finish(
  pat("plaster"),
  roof("tileDark"),
  0x3a322c,
  pat("plaster"),
  WARM_BASE,
  LIGHT_COL,
  ZINC
);

function catalogChoice(entry) {
  const choice = {
    id: entry.id,
    name: entry.name,
    thumb: entry.thumb || null,
    ...DEFAULT_FINISH,
    overlay: entry.overlay ?? null,
    likes: entry.likes || 0,
  };
  if (entry.tweak) Object.assign(choice, entry.tweak);
  if (entry.tweak?.frame != null) choice.door = entry.tweak.frame;
  return choice;
}

// Только лайкнутые из «Стили домов».
export const FACADE_CHOICES = CATALOG_STYLES
  .filter((s) => s.likes > 0)
  .slice()
  .sort((a, b) => b.likes - a.likes || a.name.localeCompare(b.name, "ru"))
  .map(catalogChoice);

const byId = new Map(FACADE_CHOICES.map((s) => [s.id, s]));

// Цвета оверлеев из facade-overlay.js → материал (как у стиля 30).
const OVERLAY_TEX = new Map([
  [0xe7e1d6, "plaster"],
  [0x8d4b3c, "brick"],
  [0x4a342c, "brickDark"],
  [0x5a463c, "brickWright"],
  [0x4a4e52, "brickWright"],
  [0xf0d4b4, "plasterWright"],
  [0xf7f5f0, "plasterWright"],
  [0xb7aa96, "stone"],
  [0x5a5e5a, "jointGrey"],
  [0x5e7c86, "shutterSage"],
  [0x6b3a32, "shutterTerracotta"],
  [0x2f4a44, "shutterGreen"],
  [0x3a342c, "bladeDark"],
  [0xc8cbc6, "panels"],
  [0x4e5450, "panelEdge"],
  [0x2e3430, "battenDark"],
  [0x3a2418, "woodDark"],
  [0x2a211c, "woodDark"],
  [0x1c1a17, "inkMetal"],
  [0x3a4146, "louvers"],
  [0x5c4a3a, "slats"],
  [WOOD_OAK, "woodBoards"],
  [0x9a7850, "woodBoards"],
  [0x2a2e32, "darkPanel"],
  [DARK_CLAD, "darkClad"],
  [0x8c4e32, "corten"],
  [0xe6e2da, "cassettes"],
  [0xb3aea4, "cassetteAlt"],
  [0xc4b49a, "surroundWarm"],
  [0x8a8175, "beltStone"],
  [0xf3efe6, "plasterCream"],
  [0xf7f5f0, "plasterWhite"],
  [0xb89260, "brickSand"],
  [0x6a655c, "sidingAccent"],
  [0x3a3e42, "darkPanel"],
  [0x6e757c, "vsidingDark"],
  [0xd23a2e, null],
  [0xe0b01a, null],
  [0x1e4e9e, null],
  [0x141414, "inkMetal"],
]);

const OVERLAY_ALSO = new Set(["1", "9", "12", "19", "23", "30"]);
for (const choice of FACADE_CHOICES) {
  if (choice.overlay) continue;
  if (OVERLAY_FIELD[choice.id] != null || OVERLAY_ALSO.has(choice.id)) choice.overlay = choice.id;
}

function ensureShader(material) {
  if (material.userData.finishShader === "v2") return;
  material.userData.finishShader = "v2";
  material.userData.uPattern = { value: pattern("plaster") };
  material.userData.uScale = { value: 1 };
  material.userData.uHeight = { value: 4.2 };
  material.userData.uClamp = { value: 0 };
  material.userData.uOn = { value: 0 };
  material.userData.uAlign = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPattern = material.userData.uPattern;
    shader.uniforms.uScale = material.userData.uScale;
    shader.uniforms.uHeight = material.userData.uHeight;
    shader.uniforms.uClamp = material.userData.uClamp;
    shader.uniforms.uOn = material.userData.uOn;
    shader.uniforms.uAlign = material.userData.uAlign;
    if (!shader.vertexShader.includes("vFinishPos")) {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <uv_pars_vertex>",
          "#include <uv_pars_vertex>\nvarying vec3 vFinishPos;\nvarying vec3 vFinishNorm;"
        )
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvFinishPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFinishNorm = normalize(mat3(modelMatrix) * objectNormal);"
        );
    }
    if (!shader.fragmentShader.includes("uAlign")) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <uv_pars_fragment>",
          `#include <uv_pars_fragment>
varying vec3 vFinishPos;
varying vec3 vFinishNorm;
uniform sampler2D uPattern;
uniform float uScale;
uniform float uHeight;
uniform float uClamp;
uniform float uOn;
uniform float uAlign;
vec3 sampleFinish(vec2 uv, float upright) {
  vec2 p = (uClamp > 0.5 && upright > 0.5)
    ? vec2(uv.x / uScale, clamp(uv.y / uHeight, 0.0, 0.999))
    : uv / uScale;
  return texture2D(uPattern, p).rgb;
}`
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
if (uOn > 0.5) {
  if (uAlign > 0.5) {
    // Нормаль грани (не сварная): иначе фальц гнётся у конька/ендов.
    vec3 n = normalize(cross(dFdx(vFinishPos), dFdy(vFinishPos)));
    if (!gl_FrontFacing) n = -n;
    // Фальц/полосы: U поперёк ската, V вдоль линии падения — рёбра от конька к карнизу.
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 down = up - n * dot(n, up);
    float dl = length(down);
    if (dl > 1e-3) {
      down /= dl;
      vec3 across = normalize(cross(n, down));
      diffuseColor.rgb = sampleFinish(vec2(dot(vFinishPos, across), dot(vFinishPos, down)), 0.0);
    } else {
      diffuseColor.rgb = sampleFinish(vFinishPos.xz, 0.0);
    }
  } else {
    vec3 n = normalize(vFinishNorm);
    vec3 fn = pow(abs(n), vec3(6.0));
    fn /= fn.x + fn.y + fn.z + 1e-5;
    diffuseColor.rgb = sampleFinish(vFinishPos.zy, 1.0) * fn.x
      + sampleFinish(vFinishPos.xz, 0.0) * fn.y
      + sampleFinish(vFinishPos.xy, 1.0) * fn.z;
  }
}`
        );
    }
  };
  material.customProgramCacheKey = () => "facade-finish-v3-face";
  material.needsUpdate = true;
}

function paint(mesh, spec) {
  const mat = mesh.material;
  if (!spec) return;
  if (spec.pattern) {
    ensureShader(mat);
    mat.userData.uOn.value = 1;
    mat.userData.uPattern.value = pattern(spec.pattern);
    mat.userData.uScale.value = spec.scale || 1;
    const span = mesh.userData.finishTop;
    mat.userData.uHeight.value = span && spec.height ? span : (spec.height || 4.2);
    mat.userData.uClamp.value = spec.height ? 1 : 0;
    mat.userData.uAlign.value = spec.align === "fall" ? 1 : 0;
    mat.color.set(0xffffff);
    return;
  }
  if (mat.userData.uOn) mat.userData.uOn.value = 0;
  if (mat.userData.uAlign) mat.userData.uAlign.value = 0;
  if (spec.color != null) mat.color.setHex(spec.color);
}

export function applyFacadeStyle(root, styleId) {
  const style = styleId && styleId !== "model" ? byId.get(styleId) : null;
  root.traverse((obj) => {
    if (obj.userData.facadeOverlay) {
      obj.visible = !!(style && style.overlay === obj.userData.facadeOverlay);
    }
    if (!obj.isMesh) return;
    const mat = obj.material;
    // Оверлеи: материал по baseColor (как у стиля 30), иначе плоский цвет.
    if (obj.userData.overlay) {
      const base = obj.userData.baseColor;
      const texId = base != null ? OVERLAY_TEX.get(base) : null;
      if (texId) {
        paint(obj, pat(texId));
        return;
      }
      if (mat.userData.uOn) mat.userData.uOn.value = 0;
      if (base != null) mat.color.setHex(base);
      return;
    }
    if (!obj.userData.finish) return;
    if (!style) {
      if (mat.userData.uOn) mat.userData.uOn.value = 0;
      if (obj.userData.baseColor != null) mat.color.setHex(obj.userData.baseColor);
      return;
    }
    const role = obj.userData.finish;
    // Стена всегда из style.wall (текстура материала), даже при активном overlay.
    // Подшивка: только если стиль задал soffit (Райт). Иначе — как кровля (толстый торец в цвет крыши).
    const spec = style[role] ?? (role === "soffit" ? style.roof : null);
    if (spec && typeof spec === "object") {
      paint(obj, spec);
      if (role === "soffit" && mat.emissive) mat.emissive.setHex(0x000000);
      // Кровля/софит глухие; без PO (иначе скат распадается на куски).
      if ((role === "roof" || role === "soffit") && mat) {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.depthTest = true;
        mat.flatShading = true;
        mat.side = THREE.DoubleSide;
        mat.polygonOffset = false;
        if (mat.emissive) mat.emissive.setHex(0x000000);
        mat.needsUpdate = true;
        obj.renderOrder = Math.max(obj.renderOrder || 0, 6);
      }
      return;
    }
    if (mat.userData.uOn) mat.userData.uOn.value = 0;
    if (typeof spec === "number") mat.color.setHex(spec);
    if (role === "soffit" && mat.emissive) mat.emissive.setHex(0x000000);
    if ((role === "roof" || role === "soffit") && mat) {
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.flatShading = true;
      mat.side = THREE.DoubleSide;
      mat.polygonOffset = false;
      mat.needsUpdate = true;
      obj.renderOrder = Math.max(obj.renderOrder || 0, 6);
    }
  });
}
