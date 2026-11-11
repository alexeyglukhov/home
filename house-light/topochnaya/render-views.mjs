#!/usr/bin/env node
// Рендеры топочной со всех сторон через headless Chromium + CDP.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "renders");
const PORT = 9247;
const BASE = "http://127.0.0.1:8766/?variants=topo3";
const views = ["iso", "north", "south", "west", "east", "top"];

async function cdp(method, params = {}, sessionId) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  const info = await res.json();
  const wsUrl = info.webSocketDebuggerUrl;
  const { default: WebSocket } = await import("ws").catch(() => ({ default: null }));
  if (!WebSocket) throw new Error("Нужен пакет ws: npm i ws (в house-light) или системный");
  // fallback without ws: use chrome --screenshot via sequential navigations — below
  void wsUrl;
  void method;
  void params;
  void sessionId;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  // Используем Chrome headless screenshot API через remote debugging + Page.captureScreenshot
  const chrome = spawn("google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/topochnaya-render",
    "--window-size=1600,1000",
    "--no-first-run",
    "--disable-extensions",
    BASE,
  ], { stdio: "ignore" });

  await new Promise((r) => setTimeout(r, 4500));

  const tabs = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = tabs.find((t) => t.type === "page" && t.url.includes("8766")) || tabs[0];
  if (!page) throw new Error("нет вкладки chrome");

  // Динамический импорт ws из house-light/node_modules или глобально
  let WebSocket;
  try {
    ({ default: WebSocket } = await import("ws"));
  } catch {
    ({ default: WebSocket } = await import(path.join(__dirname, "../furniture-map/node_modules/ws/wrapper.mjs")).catch(() => ({})));
  }
  if (!WebSocket) {
    // без ws — отдельные скриншоты chrome --screenshot
    for (const view of views) {
      const file = path.join(outDir, `topo3-${view}.png`);
      await new Promise((resolve, reject) => {
        const p = spawn("google-chrome", [
          "--headless=new",
          "--disable-gpu",
          `--screenshot=${file}`,
          "--window-size=1600,1000",
          "--no-first-run",
          `${BASE}#view=${view}`,
        ], { stdio: "ignore" });
        p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(String(code)))));
      });
      console.log("wrote", file);
    }
    chrome.kill();
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  });
  function send(method, params = {}) {
    const mid = ++id;
    return new Promise((resolve) => {
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }

  await send("Runtime.enable");
  await send("Page.enable");
  await new Promise((r) => setTimeout(r, 2500));

  for (const view of views) {
    await send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(() => {
        const btn = document.getElementById('var-topo3');
        if (btn) btn.click();
        return new Promise((resolve) => {
          const tryCam = () => {
            const api = window.__topoRender;
            if (!api) { setTimeout(tryCam, 200); return; }
            api.setView('${view}').then(resolve);
          };
          setTimeout(tryCam, 400);
        });
      })()`,
    });
    await new Promise((r) => setTimeout(r, 600));
    const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const buf = Buffer.from(shot.result.data, "base64");
    const file = path.join(outDir, `topo3-${view}.png`);
    await writeFile(file, buf);
    console.log("wrote", file, buf.length);
  }

  ws.close();
  chrome.kill();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
