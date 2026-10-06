import * as THREE from "three";
import { OVERLAY_FIELD } from "./facade-overlay.js?v=14";

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
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function mortarBrick(g, w, h, bricks, mortar, courses) {
  g.fillStyle = mortar;
  g.fillRect(0, 0, w, h);
  const ch = h / courses;
  const bw = w / bricks;
  for (let row = 0; row < courses; row++) {
    const shift = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < bricks + 1; col++) {
      const x = col * bw + shift + 1;
      g.fillStyle = bricksColor(bricks, row, col);
      g.fillRect(x, row * ch + 1, bw - 2, ch - 2);
    }
  }
}

function bricksColor(palette, row, col) {
  if (typeof palette === "string") return palette;
  return palette[(row * 3 + col * 5) % palette.length];
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
      g.fillStyle = fill[(row + i) % fill.length];
      g.fillRect(x + 1.5, row * ch + 1.5, bw - 3, ch - 3);
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
  plaster: () => canvas(64, 64, (g, w, h) => {
    g.fillStyle = "#e7e1d6";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(90,80,70,0.08)";
    for (let i = 0; i < 18; i++) g.fillRect((i * 17) % w, (i * 13) % h, 6, 3);
  }),
  plasterWarm: () => canvas(64, 64, (g, w, h) => {
    g.fillStyle = "#f4e7d4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(120,80,40,0.07)";
    for (let i = 0; i < 16; i++) g.fillRect((i * 19) % w, (i * 11) % h, 7, 3);
  }),
  brick: () => canvas(128, 64, (g, w, h) => mortarBrick(g, w, h, "#a35a45", "#c4aaa0", 4)),
  brickDark: () => canvas(128, 64, (g, w, h) => mortarBrick(g, w, h, ["#6e3a32", "#7a4638", "#5c302c"], "#3a3330", 4)),
  bavaria: () => canvas(128, 64, (g, w, h) => mortarBrick(g, w, h, ["#8d4034", "#a36a45", "#6e5348", "#b5523e"], "#d2c3b4", 4)),
  stone: () => canvas(128, 96, (g, w, h) => stoneBlocks(g, w, h, ["#cfc6b6", "#b7b0a2", "#ddd4c6"], "#8d877c")),
  stoneDark: () => canvas(128, 96, (g, w, h) => stoneBlocks(g, w, h, ["#6a655e", "#524e48", "#7c766e"], "#3a3834")),
  siding: () => canvas(32, 48, (g, w, h) => siding(g, w, h, "#e4e0d8", "#b7b2a8", false)),
  vsiding: () => canvas(48, 32, (g, w, h) => siding(g, w, h, "#d5d8dc", "#8e949c", true)),
  slats: () => canvas(48, 64, (g, w, h) => {
    g.fillStyle = "#f6f3ec";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#5c4a3a";
    for (let x = 4; x < w; x += 12) g.fillRect(x, 0, 3, h);
  }),
  stripes: () => canvas(32, 32, (g, w, h) => {
    g.fillStyle = "#f3e6d4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#8e3a32";
    g.fillRect(0, h / 2, w, h / 2);
  }),
  rust: () => canvas(32, 40, (g, w, h) => {
    g.fillStyle = "#e6e0d4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#b7ad9f";
    g.fillRect(0, h - 4, w, 3);
  }),
  fachwerk: () => canvas(180, 180, (g, w, h) => {
    g.fillStyle = "#f4e7d4";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#3a2418";
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath();
    g.moveTo(w / 2, 6);
    g.lineTo(w / 2, h - 6);
    g.moveTo(6, h * 0.42);
    g.lineTo(w - 6, h * 0.42);
    g.moveTo(w * 0.22, h * 0.42);
    g.lineTo(w * 0.42, 8);
    g.moveTo(w * 0.78, h * 0.42);
    g.lineTo(w * 0.58, 8);
    g.moveTo(w * 0.28, h - 8);
    g.lineTo(w * 0.42, h * 0.42);
    g.moveTo(w * 0.72, h - 8);
    g.lineTo(w * 0.58, h * 0.42);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w * 0.34, h * 0.72);
    g.lineTo(w * 0.5, h * 0.48);
    g.lineTo(w * 0.66, h * 0.72);
    g.moveTo(w * 0.34, h * 0.48);
    g.lineTo(w * 0.66, h * 0.72);
    g.moveTo(w * 0.66, h * 0.48);
    g.lineTo(w * 0.34, h * 0.72);
    g.stroke();
  }),
  fachwerkBrick: () => canvas(240, 220, (g, w, h) => {
    const palette = ["#8E4A38", "#7A4032", "#964E3C", "#A85A40", "#6E382C"];
    const courses = 12;
    const count = 4;
    const gap = 2;
    g.fillStyle = "#CDB8A6";
    g.fillRect(0, 0, w, h);
    const ch = h / courses;
    const bw = w / count;
    for (let row = 0; row < courses; row++) {
      const shift = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < count + 1; col++) {
        g.fillStyle = palette[(row * 3 + col * 5) % palette.length];
        g.fillRect(col * bw + shift + gap / 2, row * ch + gap / 2, bw - gap, ch - gap);
      }
    }
  }),
  louvers: () => canvas(32, 180, (g, w, h) => {
    g.fillStyle = "#f3f0e8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1e2428";
    for (let i = 0; i < 6; i++) g.fillRect(0, 18 + i * 14, w, 4);
  }),
  cassettes: () => canvas(160, 256, (g, w, h) => {
    g.fillStyle = "#2a2f33";
    g.fillRect(0, 0, w, h);
    const cols = 2;
    const rows = 5;
    const gw = 5;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        g.fillStyle = (row + col) % 2 ? "#b3aea4" : "#e6e2da";
        g.fillRect(
          col * (w / cols) + gw,
          row * (h / rows) + gw,
          w / cols - gw * 2,
          h / rows - gw * 2
        );
      }
    }
    g.fillStyle = "#8c4e32";
    g.fillRect(gw, h * 0.18, w - gw * 2, h * 0.11);
  }),
  panels: () => canvas(160, 160, (g, w, h) => {
    g.fillStyle = "#5a5e5a";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#d5d6d2";
    const n = 2;
    const j = 4;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        g.fillRect(col * (w / n) + j, row * (h / n) + j, w / n - j * 2, h / n - j * 2);
      }
    }
  }),
  german: () => canvas(180, 150, (g, w, h) => {
    g.fillStyle = "#e4e6e2";
    g.fillRect(0, 0, w, h);
    const x = w * 0.16;
    const y = h * 0.14;
    const pw = w * 0.68;
    const ph = h * 0.72;
    g.fillStyle = "#4e5450";
    g.fillRect(x, y, pw, ph);
    g.fillStyle = "#c8cbc6";
    g.fillRect(x + 7, y + 7, pw - 14, ph - 14);
  }),
  quoinBrick: () => canvas(180, 160, (g, w, h) => quoinWall(g, w, h, "#e7e1d6", "#a35a45", "#c4aaa0")),
  quoinDark: () => canvas(180, 160, (g, w, h) => quoinWall(g, w, h, "#f3efe6", "#4a342c", "#6a5348")),
  stoneSiding: () => canvas(220, 80, (g, w, h) => {
    siding(g, w, h, "#e4e0d8", "#b7b2a8", false);
    g.save();
    g.beginPath();
    g.rect(w * 0.32, 0, w * 0.36, h);
    g.clip();
    stoneBlocks(g, w, h, ["#cfc6b6", "#b7b0a2", "#ddd4c6"], "#8d877c");
    g.restore();
  }),
  darkCenter: () => canvas(220, 80, (g, w, h) => {
    g.fillStyle = "#e6e2da";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a3e42";
    g.fillRect(w * 0.3, 0, w * 0.4, h);
  }),
  scandi: () => canvas(220, 80, (g, w, h) => {
    g.fillStyle = "#e4e7ea";
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.rect(0, 0, w * 0.28, h);
    g.rect(w * 0.72, 0, w * 0.28, h);
    g.clip();
    siding(g, w, h, "#d5d8dc", "#6e757c", true);
    g.restore();
  }),
  brickPiers: () => canvas(180, 120, (g, w, h) => {
    g.fillStyle = "#e7e2d8";
    g.fillRect(0, 0, w, h);
    for (const x of [0, w * 0.46]) {
      g.save();
      g.beginPath();
      g.rect(x, 0, w * 0.1, h);
      g.clip();
      mortarBrick(g, w, h, "#a35a45", "#c4aaa0", 6);
      g.restore();
    }
  }),
  bavariaFrame: () => canvas(180, 150, (g, w, h) => {
    g.fillStyle = "#f3efe6";
    g.fillRect(0, 0, w, h);
    const x = w * 0.22;
    const y = h * 0.18;
    const pw = w * 0.56;
    const ph = h * 0.64;
    g.save();
    g.beginPath();
    g.rect(x, y, pw, 10);
    g.rect(x, y + ph - 10, pw, 10);
    g.rect(x, y, 10, ph);
    g.rect(x + pw - 10, y, 10, ph);
    g.clip();
    mortarBrick(g, w, h, ["#8d4034", "#a36a45", "#6e5348", "#b5523e"], "#d2c3b4", 8);
    g.restore();
  }),
  tuscan: () => canvas(180, 150, (g, w, h) => {
    g.fillStyle = "#d2b48c";
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.rect(0, 0, w * 0.12, h);
    g.rect(w * 0.88, 0, w * 0.12, h);
    g.clip();
    stoneBlocks(g, w, h, ["#b7b0a2", "#cfc6b6"], "#6a655c");
    g.restore();
    g.fillStyle = "#6b3a32";
    g.fillRect(w * 0.18, h * 0.28, w * 0.06, h * 0.42);
    g.fillRect(w * 0.76, h * 0.28, w * 0.06, h * 0.42);
  }),
  provence: () => canvas(180, 150, (g, w, h) => {
    g.fillStyle = "#f4e6d4";
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.rect(0, 0, w * 0.1, h);
    g.rect(w * 0.9, 0, w * 0.1, h);
    g.clip();
    stoneBlocks(g, w, h, ["#d9d0c2", "#c4baa8"], "#8a8274");
    g.restore();
    g.fillStyle = "#5e7c86";
    g.fillRect(w * 0.2, h * 0.3, w * 0.07, h * 0.4);
    g.fillRect(w * 0.73, h * 0.3, w * 0.07, h * 0.4);
  }),
  mediterranean: () => canvas(180, 150, (g, w, h) => {
    g.fillStyle = "#f0e2cc";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#c4b49a";
    g.fillRect(0, 8, w, 6);
    g.save();
    g.beginPath();
    g.rect(0, 0, w * 0.1, h);
    g.rect(w * 0.9, 0, w * 0.1, h);
    g.clip();
    stoneBlocks(g, w, h, ["#cfc6b6", "#b7b0a2"], "#6a655c");
    g.restore();
    g.fillStyle = "#2f4a44";
    g.fillRect(w * 0.18, h * 0.32, w * 0.07, h * 0.38);
    g.fillRect(w * 0.75, h * 0.32, w * 0.07, h * 0.38);
  }),
  belgian: () => canvas(64, 256, (g, w, h) => {
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#d9d3c4";
    for (const t of [0.18, 0.28, 0.38]) {
      const y = h - Math.round(h * t);
      g.fillRect(0, y, w, 6);
    }
  }),
  finnish: () => canvas(140, 120, (g, w, h) => {
    g.fillStyle = "#2e3430";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f7f5f0";
    const gap = 8;
    for (let col = 0; col < 3; col++) {
      g.fillRect(gap + col * (w / 3), h * 0.16, w / 3 - gap * 1.4, h * 0.68);
    }
    g.fillStyle = "#2e3430";
    g.fillRect(0, h * 0.12, w, 5);
    g.fillRect(0, h * 0.8, w, 5);
  }),
  reikiScreen: () => canvas(160, 120, (g, w, h) => {
    g.fillStyle = "#f6f3ec";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#5c4a3a";
    const x0 = w * 0.08;
    for (let i = 0; i < 6; i++) g.fillRect(x0 + i * 7, h * 0.08, 3, h * 0.84);
    g.fillRect(x0 - 2, h * 0.08, 44, 3);
    g.fillRect(x0 - 2, h * 0.9, 44, 3);
  }),
  rustPlinth: () => canvas(64, 48, (g, w, h) => {
    g.fillStyle = "#5c564c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a3632";
    for (let y = 10; y < h; y += 14) g.fillRect(0, y, w, 3);
  }),
  artdeco: () => canvas(180, 256, (g, w, h) => {
    g.fillStyle = "#f6f1e6";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#1c1a17";
    g.lineWidth = 2;
    const y0 = 36;
    g.beginPath();
    for (let x = 0; x <= w; x += 18) {
      g.moveTo(x, y0 + 18);
      g.lineTo(x + 9, y0);
      g.lineTo(x + 18, y0 + 18);
    }
    g.stroke();
    g.lineWidth = 2;
    const cx = w / 2;
    const cy = 8;
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + i * 22, 70);
      g.stroke();
    }
  }),
  chevron: () => canvas(120, 220, (g, w, h) => {
    g.fillStyle = "#f6f1e6";
    g.fillRect(0, 0, w, h);
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
  stijl: () => canvas(180, 120, (g, w, h) => {
    g.fillStyle = "#f7f4ef";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#d23a2e";
    g.fillRect(0, 8, 70, 36);
    g.fillStyle = "#1e4e9e";
    g.fillRect(100, 8, 70, 78);
    g.fillStyle = "#e0b01a";
    g.fillRect(20, 70, 48, 36);
    g.fillStyle = "#141414";
    g.fillRect(0, 54, w, 5);
    g.fillRect(88, 0, 5, h);
  }),
  lopatki: () => canvas(120, 80, (g, w, h) => {
    g.fillStyle = "#efe8dc";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3a342c";
    g.fillRect(w * 0.08, 0, 8, h);
    g.fillRect(w * 0.84, 0, 8, h);
  }),
  skirtStone: () => canvas(128, 256, (g, w, h) => {
    g.fillStyle = "#e7e1d6";
    g.fillRect(0, 0, w, h);
    const top = h - Math.round(h * (1.15 / 4.2));
    g.save();
    g.beginPath();
    g.rect(0, top, w, h - top);
    g.clip();
    stoneBlocks(g, w, h, ["#cfc6b6", "#b7b0a2", "#ddd4c6"], "#8d877c");
    g.restore();
  }),
  skirtBrick: () => canvas(128, 256, (g, w, h) => {
    g.fillStyle = "#e6e2da";
    g.fillRect(0, 0, w, h);
    const top = h - Math.round(h * (1.15 / 4.2));
    g.save();
    g.beginPath();
    g.rect(0, top, w, h - top);
    g.clip();
    mortarBrick(g, w, h, "#a35a45", "#c4aaa0", 14);
    g.restore();
  }),
  skirtSwiss: () => canvas(128, 256, (g, w, h) => {
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, w, h);
    const top = h - Math.round(h * (1.35 / 4.2));
    g.save();
    g.beginPath();
    g.rect(0, top, w, h - top);
    g.clip();
    stoneBlocks(g, w, h, ["#b7b0a2", "#cfc6b6", "#a39c90"], "#6a655c");
    g.restore();
    g.fillStyle = "#5c5348";
    g.fillRect(0, top - 4, w, 5);
  }),
  belts: () => canvas(32, 256, (g, w, h) => {
    g.fillStyle = "#f3efe6";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#6e5e4c";
    for (const t of [0.22, 0.48, 0.78]) {
      const y = h - Math.round(h * t);
      g.fillRect(0, y, w, 7);
    }
  }),
  tile: () => canvas(96, 64, (g, w, h) => {
    g.fillStyle = "#6a382c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#8a4a38";
    const ch = h / 3;
    for (let row = 0; row < 3; row++) {
      const shift = row % 2 ? 16 : 0;
      for (let x = -20; x < w; x += 32) {
        g.beginPath();
        g.arc(x + shift + 16, row * ch + ch * 0.15, 14, 0, Math.PI);
        g.fill();
      }
    }
  }),
  tileDark: () => canvas(96, 64, (g, w, h) => {
    g.fillStyle = "#2c3136";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#3c434a";
    const ch = h / 3;
    for (let row = 0; row < 3; row++) {
      const shift = row % 2 ? 16 : 0;
      for (let x = -20; x < w; x += 32) {
        g.beginPath();
        g.arc(x + shift + 16, row * ch + ch * 0.15, 14, 0, Math.PI);
        g.fill();
      }
    }
  }),
  seam: () => canvas(64, 32, (g, w, h) => {
    g.fillStyle = "#2a2e32";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#4a5158";
    g.fillRect(w / 2 - 1, 0, 3, h);
  }),
};

function pattern(id) {
  if (!cache.has(id)) cache.set(id, PATTERN[id]());
  return cache.get(id);
}

const SCALE = {
  plaster: 0.6,
  plasterWarm: 0.6,
  brick: 0.9,
  brickDark: 0.9,
  bavaria: 0.9,
  stone: 1.1,
  stoneDark: 1.1,
  siding: 0.55,
  vsiding: 0.7,
  slats: 0.55,
  stripes: 0.5,
  rust: 0.48,
  fachwerk: 2.2,
  fachwerkBrick: 1,
  louvers: 0.7,
  cassettes: 1.7,
  panels: 2.6,
  german: 3.6,
  quoinBrick: 3.4,
  quoinDark: 3.4,
  stoneSiding: 8,
  darkCenter: 10,
  scandi: 9,
  brickPiers: 2.8,
  bavariaFrame: 3.2,
  tuscan: 3.2,
  provence: 3.2,
  mediterranean: 3.2,
  belgian: 1,
  finnish: 2.2,
  reikiScreen: 2.4,
  rustPlinth: 0.7,
  artdeco: 2.2,
  chevron: 1.3,
  stijl: 3.2,
  lopatki: 3.2,
  skirtStone: 1.3,
  skirtBrick: 1.2,
  skirtSwiss: 1.3,
  belts: 1,
  tile: 0.85,
  tileDark: 0.85,
  seam: 0.7,
};

const CLAMP = new Set(["skirtStone", "skirtBrick", "skirtSwiss", "belts", "chevron", "louvers", "belgian", "artdeco", "cassettes"]);

function finish(wall, roof, frame, plinth, base, column, gutter) {
  return { wall, roof, frame, door: frame, plinth, base, column, gutter };
}

const pat = (id) => ({ pattern: id, scale: SCALE[id], height: CLAMP.has(id) ? 4.2 : 0 });
const roof = (id) => ({ pattern: id, scale: SCALE[id], height: 0 });
const flat = (color) => ({ color });

const ZINC = 0x6a7278;
const BROWN_GUTTER = 0x3e342c;
const WARM_BASE = 0xc4b8a6;
const COOL_BASE = 0xc5c1b8;
const LIGHT_COL = 0xe6dfd4;
const WOOD_COL = 0xd7c4a8;

export const FACADE_CHOICES = [
  { id: "model", name: "Как в модели" },
  { id: "1", name: "1. Камень до подоконника", ...finish(pat("skirtStone"), roof("tile"), 0x3a322c, 0x5c574e, WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "2", name: "2. Кирпич на углах и вокруг окон", ...finish(pat("quoinBrick"), roof("tileDark"), 0x4a342c, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "3", name: "3. Английский коттедж", ...finish(pat("quoinDark"), roof("tileDark"), 0x3a322c, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "4", name: "4. Камень террасы, сайдинг крыльев", ...finish(pat("stoneSiding"), roof("seam"), 0x2a2e32, 0x3a4048, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "5", name: "5. Крупные панели", ...finish(pat("panels"), roof("seam"), 0x3e444c, 0x3e444c, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "6", name: "6. Рустованная штукатурка", ...finish(pat("rust"), roof("tile"), 0x3a322c, pat("rustPlinth"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "7", name: "7. Прованс", ...finish(pat("provence"), roof("tile"), 0xf7f3ec, pat("stoneDark"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "8", name: "8. Стиль прерий", ...finish(pat("belts"), roof("seam"), 0x3c342c, 0x3c342c, WARM_BASE, 0xc4b49a, ZINC) },
  { id: "9", name: "9. Кирпич до подоконника", ...finish(pat("skirtBrick"), roof("tileDark"), 0x3a322c, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "10", name: "10. Тёмный щипец и цоколь", ...finish(pat("darkCenter"), roof("seam"), 0x2a2e32, 0x3a3e42, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "11", name: "11. Лопатки и цоколь", ...finish(pat("lopatki"), roof("tile"), 0x3a342c, 0x3a342c, COOL_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "12", name: "12. Австрийский", ...finish(flat(0xe6dcc8), roof("tile"), 0x3a322c, pat("rustPlinth"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "13", name: "13. Скандинавский", ...finish(pat("scandi"), roof("seam"), 0x1a1c1e, 0x1e2226, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "14", name: "14. Голландский", ...finish(pat("brickPiers"), roof("tile"), 0x3a322c, pat("brickDark"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "15", name: "15. Баварский", ...finish(pat("bavariaFrame"), roof("tileDark"), 0x3a322c, pat("bavaria"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "16", name: "16. Тосканский", ...finish(pat("tuscan"), roof("tile"), 0x4a342c, pat("stoneDark"), 0xb7a48c, WOOD_COL, BROWN_GUTTER) },
  { id: "17", name: "17. Бельгийский", ...finish(pat("belgian"), roof("tileDark"), 0x2a2a2a, pat("brickDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "18", name: "18. Немецкий панельный", ...finish(pat("german"), roof("seam"), 0x4e5450, 0x3a4048, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "19", name: "19. Швейцарский", ...finish(pat("skirtSwiss"), roof("tileDark"), 0x3a322c, pat("stoneDark"), WARM_BASE, LIGHT_COL, ZINC) },
  { id: "20", name: "20. Финский", ...finish(pat("finnish"), roof("seam"), 0x2e3430, 0x2e3430, COOL_BASE, WOOD_COL, ZINC) },
  { id: "21", name: "21. Средиземноморский", ...finish(pat("mediterranean"), roof("tile"), 0x2f4a44, pat("stoneDark"), WARM_BASE, LIGHT_COL, BROWN_GUTTER) },
  { id: "22", name: "22. Франконский фахверк", ...finish(pat("fachwerk"), roof("tile"), 0x3a2418, pat("stoneDark"), WARM_BASE, 0xe7d4b8, BROWN_GUTTER) },
  { id: "23", name: "23. Фахверк с кирпичной забуткой", ...finish(pat("fachwerkBrick"), roof("tileDark"), 0x2a211c, pat("brickDark"), WARM_BASE, 0xe4d0c0, ZINC) },
  { id: "24", name: "24. Ар-деко", ...finish(pat("artdeco"), roof("tileDark"), 0x1c1a17, 0x1c1a17, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "25", name: "25. Де Стейл", ...finish(pat("stijl"), roof("seam"), 0x141414, 0x141414, COOL_BASE, 0xf4f1ea, ZINC) },
  { id: "26", name: "26. Полихромная кладка", ...finish(pat("stripes"), roof("tileDark"), 0x3c2824, 0x4a241e, WARM_BASE, 0xe7d3c4, ZINC) },
  { id: "27", name: "27. Ламели", ...finish(pat("louvers"), roof("tileDark"), 0x1e2428, 0x1e2428, COOL_BASE, LIGHT_COL, ZINC) },
  { id: "28", name: "28. Рейки", ...finish(pat("reikiScreen"), roof("seam"), 0x3a3028, 0x2c2926, COOL_BASE, 0xe8dcc8, ZINC) },
  { id: "29", name: "29. Кассеты", ...finish(pat("cassettes"), roof("seam"), 0x1a1e22, 0x1a1e22, COOL_BASE, 0xe4ddd4, ZINC) },
];

const byId = new Map(FACADE_CHOICES.map((s) => [s.id, s]));

const OVERLAY_ALSO = new Set(["12", "23"]);
for (const choice of FACADE_CHOICES) {
  if (OVERLAY_FIELD[choice.id] != null || OVERLAY_ALSO.has(choice.id)) choice.overlay = choice.id;
}

function ensureShader(material) {
  if (material.userData.finishShader) return;
  material.userData.finishShader = true;
  material.userData.uPattern = { value: pattern("plaster") };
  material.userData.uScale = { value: 1 };
  material.userData.uHeight = { value: 4.2 };
  material.userData.uClamp = { value: 0 };
  material.userData.uOn = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPattern = material.userData.uPattern;
    shader.uniforms.uScale = material.userData.uScale;
    shader.uniforms.uHeight = material.userData.uHeight;
    shader.uniforms.uClamp = material.userData.uClamp;
    shader.uniforms.uOn = material.userData.uOn;
    if (shader.vertexShader.includes("vFinishPos")) return;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <uv_pars_vertex>",
        "#include <uv_pars_vertex>\nvarying vec3 vFinishPos;\nvarying vec3 vFinishNorm;"
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvFinishPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFinishNorm = normalize(mat3(modelMatrix) * objectNormal);"
      );
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
  vec3 fn = pow(abs(normalize(vFinishNorm)), vec3(6.0));
  fn /= fn.x + fn.y + fn.z + 1e-5;
  diffuseColor.rgb = sampleFinish(vFinishPos.zy, 1.0) * fn.x
    + sampleFinish(vFinishPos.xz, 0.0) * fn.y
    + sampleFinish(vFinishPos.xy, 1.0) * fn.z;
}`
      );
  };
  material.customProgramCacheKey = () => "facade-finish-v1";
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
    mat.userData.uHeight.value = spec.height || 4.2;
    mat.userData.uClamp.value = spec.height ? 1 : 0;
    mat.color.set(0xffffff);
    return;
  }
  if (mat.userData.uOn) mat.userData.uOn.value = 0;
  if (spec.color != null) mat.color.setHex(spec.color);
}

export function applyFacadeStyle(root, styleId) {
  const style = styleId && styleId !== "model" ? byId.get(styleId) : null;
  root.traverse((obj) => {
    if (obj.userData.facadeOverlay) {
      obj.visible = !!(style && style.overlay === obj.userData.facadeOverlay);
    }
    if (!obj.isMesh || !obj.userData.finish) return;
    const mat = obj.material;
    if (!style) {
      if (mat.userData.uOn) mat.userData.uOn.value = 0;
      if (obj.userData.baseColor != null) mat.color.setHex(obj.userData.baseColor);
      return;
    }
    const role = obj.userData.finish;
    if (role === "wall" && style.overlay && OVERLAY_FIELD[style.overlay] != null) {
      paint(obj, { color: OVERLAY_FIELD[style.overlay] });
      return;
    }
    const spec = style[role];
    if (spec && typeof spec === "object") {
      paint(obj, spec);
      return;
    }
    if (mat.userData.uOn) mat.userData.uOn.value = 0;
    if (typeof spec === "number") mat.color.setHex(spec);
  });
}
