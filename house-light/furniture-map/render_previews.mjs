#!/usr/bin/env node
/**
 * Рендерит PNG-превью: фасад к камере (= стрелка пятна сзади→вперёд).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "furniture", "previews");
const PORT = 8767;
const CDP_PORT = 9228;
const CHROME =
  process.env.CHROME ||
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p)
  );

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
}

async function serveOnce() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/furniture/render-previews.html";
    const file = path.normalize(path.join(ROOT, rel.replace(/^\//, "")));
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      res.writeHead(404);
      res.end("missing " + rel);
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(file),
      "Access-Control-Allow-Origin": "*",
    });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  return server;
}

function runChrome(userDataDir) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--remote-allow-origins=*",
    `http://127.0.0.1:${PORT}/furniture/render-previews.html`,
  ];
  return spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== id) return;
      ws.off("message", onMsg);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalExpr(ws, expression) {
  const result = await cdpCall(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

async function getPageWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) =>
        r.json()
      );
      const page =
        list.find((t) => t.type === "page" && t.url.includes("render-previews")) ||
        list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("chrome CDP page not ready");
}

async function main() {
  if (!CHROME) throw new Error("chrome not found");
  await mkdir(OUT, { recursive: true });
  const server = await serveOnce();
  const userData = path.join(ROOT, "furniture", ".chrome-previews");
  await rm(userData, { recursive: true, force: true });
  await mkdir(userData, { recursive: true });
  const chrome = runChrome(userData);
  let stderr = "";
  chrome.stderr.on("data", (d) => {
    stderr += String(d);
  });
  try {
    const pageWsUrl = await getPageWsUrl();
    const ws = await openWs(pageWsUrl);
    await cdpCall(ws, "Runtime.enable");
    // дождаться DONE
    const started = Date.now();
    let status = "";
    while (Date.now() - started < 300000) {
      status = await evalExpr(
        ws,
        `({ done: !!window.DONE, status: document.getElementById('status')?.textContent || '', n: window.PREVIEWS ? Object.keys(window.PREVIEWS).length : 0, err: window.__ERR || null })`
      );
      process.stderr.write(`\r${status?.status || ""}   `);
      if (status?.done) break;
      if (status?.err) throw new Error(status.err);
      await new Promise((r) => setTimeout(r, 800));
    }
    process.stderr.write("\n");
    if (!status?.done) {
      throw new Error("timeout; chrome stderr:\n" + stderr.slice(-2000));
    }
    // тянем по одному — весь PREVIEWS слишком большой для одного CDP roundtrip
    const ids = await evalExpr(ws, "Object.keys(window.PREVIEWS || {})");
    let n = 0;
    for (const id of ids) {
      const dataUrl = await evalExpr(ws, `window.PREVIEWS[${JSON.stringify(id)}]`);
      if (!dataUrl || !String(dataUrl).startsWith("data:image/png;base64,")) {
        console.warn("skip", id);
        continue;
      }
      const buf = Buffer.from(String(dataUrl).split(",")[1], "base64");
      await writeFile(path.join(OUT, `${id}.png`), buf);
      n += 1;
    }
    ws.close();
    console.log(`wrote ${n} previews → ${OUT}`);
  } finally {
    chrome.kill("SIGKILL");
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
