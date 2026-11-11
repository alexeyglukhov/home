#!/usr/bin/env python3
"""Рендеры топочной Вариант 3 со всех сторон (Chrome CDP)."""
from __future__ import annotations

import asyncio
import base64
import json
import subprocess
import time
from pathlib import Path

import websockets

OUT = Path(__file__).resolve().parent / "renders"
PORT = 9247
URL = "http://127.0.0.1:8766/?variants=topo3&roof=0&_reinit=topo3r75"
VIEWS = ["iso", "north", "south", "west", "east", "top"]


async def cdp_call(ws, mid: dict, method: str, params=None, session_id=None):
    mid["n"] += 1
    msg = {"id": mid["n"], "method": method, "params": params or {}}
    if session_id:
        msg["sessionId"] = session_id
    await ws.send(json.dumps(msg))
    while True:
        raw = await ws.recv()
        data = json.loads(raw)
        if data.get("id") == mid["n"]:
            if "error" in data:
                raise RuntimeError(data["error"])
            return data.get("result", {})


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    chrome = subprocess.Popen(
        [
            "google-chrome",
            "--headless=new",
            f"--remote-debugging-port={PORT}",
            "--user-data-dir=/tmp/topochnaya-render",
            "--window-size=1600,1000",
            "--no-first-run",
            "--disable-extensions",
            URL,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        page = None
        for _ in range(40):
            await asyncio.sleep(0.4)
            try:
                import urllib.request

                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=2))
                page = next((t for t in tabs if t.get("type") == "page" and "8766" in t.get("url", "")), None)
                if page:
                    break
            except Exception:
                pass
        if not page:
            raise SystemExit("вкладка viewer не найдена — поднимите http://127.0.0.1:8766/")

        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=40_000_000) as ws:
            mid = {"n": 0}
            await cdp_call(ws, mid, "Runtime.enable")
            await cdp_call(ws, mid, "Page.enable")
            await asyncio.sleep(3.5)
            # дождаться модуля и кнопки
            await cdp_call(
                ws,
                mid,
                "Runtime.evaluate",
                {
                    "awaitPromise": True,
                    "expression": """(() => new Promise((resolve) => {
                      const tick = () => {
                        if (window.__topoRender && document.getElementById('var-topo3')) resolve(true);
                        else setTimeout(tick, 200);
                      };
                      tick();
                    }))()""",
                },
            )
            for view in VIEWS:
                await cdp_call(
                    ws,
                    mid,
                    "Runtime.evaluate",
                    {
                        "awaitPromise": True,
                        "expression": f"window.__topoRender.setView({view!r})",
                    },
                )
                await asyncio.sleep(0.7)
                shot = await cdp_call(ws, mid, "Page.captureScreenshot", {"format": "png", "fromSurface": True})
                data = base64.b64decode(shot["data"])
                path = OUT / f"topo3-{view}.png"
                path.write_bytes(data)
                print(f"wrote {path} ({len(data)} bytes)")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=3)
        except Exception:
            chrome.kill()


if __name__ == "__main__":
    asyncio.run(main())
