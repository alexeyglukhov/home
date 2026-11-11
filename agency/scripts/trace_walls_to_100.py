#!/usr/bin/env python3
"""Convert agency wall-trace SVG (1 px = 1 cm) to М 1:100 plan with room labels.

Source: agency/Screenshot from 2026-11-05 22-01-52.svg
Output: agency/svg/agency-var1-plan-walls.svg
        agency/svg/agency-var1-recognition.json

Scale: 1 cm → 0.1 viewBox unit ⇒ 1 m = 10 mm paper (как plan-1-etazh-variant-d4).
"""
from __future__ import annotations

import json
import re
from collections import deque
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Screenshot from 2026-11-05 22-01-52.svg"
OUT = ROOT / "svg" / "agency-var1-plan-walls.svg"
JSON_OUT = ROOT / "svg" / "agency-var1-recognition.json"

S = 0.1  # cm → viewBox units (1 m = 10 units)
MARGIN = 15.0


def xform(px: float, py: float, tf: str) -> tuple[float, float]:
    if not tf:
        return px, py
    if "rotate(-90)" in tf:
        return py, -px
    if "rotate(90)" in tf:
        return -py, px
    return px, py


def aabb(x: float, y: float, w: float, h: float, tf: str):
    pts = [xform(x + dx, y + dy, tf) for dx in (0, w) for dy in (0, h)]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def fmt(v: float) -> str:
    if abs(v) < 1e-9:
        return "0"
    return f"{v:.4f}".rstrip("0").rstrip(".")


def inside_heated(cx: float, cy: float) -> bool:
    if cx < 663 or cx > 2323:
        return False
    if cy < 119 or cy > 1709:
        return False
    if cy > 1029 and cx > 1577:
        return False
    return True


def name_room(cx: float, cy: float) -> str:
    if cy < 520:
        if cx < 880:
            return "Хозблок"
        if cx < 1240:
            return "Кабинет"
        if cx < 1395:
            return "Гардероб-1"
        if cx < 1785:
            return "Спальня-1"
        if cx < 2175:
            return "Спальня-2"
        return "Гардероб-2"
    if cx > 1550 and cy < 1040:
        if cy < 710 and cx > 1930:
            return "Гардероб-М"
        if cx < 1765:
            return "Ванная-1"
        if cx < 1965:
            return "Ванная-2"
        return "Мастер-спальня"
    if cx < 1050:
        if cy < 800:
            return "Котельная"
        if cy < 1060:
            return "Гардероб-вх" if cx < 880 else "С/у"
        if cy < 1280:
            return "Тамбур"
        if cy < 1515:
            return "Постирочная"
        return "Кладовая"
    return "Гостиная"


def main() -> None:
    raw = SRC.read_text()

    im_m = re.search(r"<image\b([^/]*?)/>", raw, re.S) or re.search(
        r"<image\b([^>]*)>", raw, re.S
    )
    ia = im_m.group(1)

    def ag(name: str, s: str = ia):
        m = re.search(rf'\b{name}="([^"]*)"', s)
        return m.group(1) if m else None

    img = {
        "x": float(ag("x")),
        "y": float(ag("y")),
        "w": float(ag("width")),
        "h": float(ag("height")),
        "href": ag("xlink:href") or ag("href"),
        "preserve": ag("preserveAspectRatio") or "none",
    }

    rects = []
    for m in re.finditer(r"<rect\b([^>]*)/?>", raw):
        a = m.group(1)

        def get(n, d=None):
            mm = re.search(rf'\b{n}="([^"]*)"', a)
            return mm.group(1) if mm else d

        rid = get("id")
        if not rid or rid.startswith("image"):
            continue
        x, y, w, h = map(
            float, (get("x", "0"), get("y", "0"), get("width", "0"), get("height", "0"))
        )
        tf = get("transform") or ""
        x0, y0, x1, y1 = aabb(x, y, w, h, tf)
        bw, bh = x1 - x0, y1 - y0
        if abs(bw - 30) < 2 and abs(bh - 30) < 2:
            kind = "post"
        elif min(bw, bh) < 20:
            kind = "int"
        else:
            kind = "ext"
        rects.append(
            dict(
                id=rid,
                x0=x0,
                y0=y0,
                x1=x1,
                y1=y1,
                bw=bw,
                bh=bh,
                kind=kind,
            )
        )

    xmin, ymin, xmax, ymax = 600.0, 100.0, 2360.0, 1720.0
    cell = 2.0
    nx = int((xmax - xmin) / cell) + 1
    ny = int((ymax - ymin) / cell) + 1
    occ = bytearray(nx * ny)

    def mark(x0, y0, x1, y1):
        i0 = max(0, int((x0 - xmin) / cell))
        i1 = min(nx - 1, int((x1 - xmin) / cell))
        j0 = max(0, int((y0 - ymin) / cell))
        j1 = min(ny - 1, int((y1 - ymin) / cell))
        for j in range(j0, j1 + 1):
            base = j * nx
            for i in range(i0, i1 + 1):
                occ[base + i] = 1

    for r in rects:
        if r["kind"] != "post":
            mark(r["x0"], r["y0"], r["x1"], r["y1"])

    visited = bytearray(nx * ny)
    regions = []

    def idx(i, j):
        return j * nx + i

    for j in range(ny):
        for i in range(nx):
            k = idx(i, j)
            if occ[k] or visited[k]:
                continue
            cx = xmin + (i + 0.5) * cell
            cy = ymin + (j + 0.5) * cell
            if not inside_heated(cx, cy):
                visited[k] = 1
                continue
            q = deque([(i, j)])
            visited[k] = 1
            ncells = 0
            minx = miny = 10**9
            maxx = maxy = -10**9
            sumx = sumy = 0.0
            while q:
                ii, jj = q.popleft()
                ncells += 1
                px = xmin + (ii + 0.5) * cell
                py = ymin + (jj + 0.5) * cell
                sumx += px
                sumy += py
                minx = min(minx, px - cell / 2)
                maxx = max(maxx, px + cell / 2)
                miny = min(miny, py - cell / 2)
                maxy = max(maxy, py + cell / 2)
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ni, nj = ii + di, jj + dj
                    if not (0 <= ni < nx and 0 <= nj < ny):
                        continue
                    nk = idx(ni, nj)
                    if visited[nk] or occ[nk]:
                        continue
                    ncx = xmin + (ni + 0.5) * cell
                    ncy = ymin + (nj + 0.5) * cell
                    if not inside_heated(ncx, ncy):
                        visited[nk] = 1
                        continue
                    visited[nk] = 1
                    q.append((ni, nj))
            area = ncells * cell * cell / 10000
            if area < 1.5:
                continue
            regions.append(
                dict(
                    area=area,
                    x0=minx,
                    y0=miny,
                    x1=maxx,
                    y1=maxy,
                    cx=sumx / ncells,
                    cy=sumy / ncells,
                    w=maxx - minx,
                    h=maxy - miny,
                )
            )

    for r in regions:
        r["name"] = name_room(r["cx"], r["cy"])

    carport = dict(name="Навес", x0=-13.0, y0=80.0, x1=624.0, y1=841.0)
    carport["w"] = carport["x1"] - carport["x0"]
    carport["h"] = carport["y1"] - carport["y0"]
    carport["area"] = carport["w"] * carport["h"] / 10000
    carport["cx"] = (carport["x0"] + carport["x1"]) / 2
    carport["cy"] = (carport["y0"] + carport["y1"]) / 2

    terrace = dict(name="Терраса", x0=1577.0, y0=1068.0, x1=2362.0, y1=1709.0)
    terrace["w"] = terrace["x1"] - terrace["x0"]
    terrace["h"] = terrace["y1"] - terrace["y0"]
    terrace["area"] = terrace["w"] * terrace["h"] / 10000
    terrace["cx"] = (terrace["x0"] + terrace["x1"]) / 2
    terrace["cy"] = (terrace["y0"] + terrace["y1"]) / 2
    opens = [carport, terrace]

    heated_area = sum(r["area"] for r in regions)

    all_x0 = min(img["x"], min(r["x0"] for r in rects))
    all_y0 = min(img["y"], min(r["y0"] for r in rects))
    all_x1 = max(img["x"] + img["w"], max(r["x1"] for r in rects))
    all_y1 = max(img["y"] + img["h"], max(r["y1"] for r in rects))

    tx = -all_x0 * S + MARGIN
    ty = -all_y0 * S + MARGIN + 8

    def to_u(cm_x, cm_y):
        return cm_x * S + tx, cm_y * S + ty

    vb_w = (all_x1 - all_x0) * S + 2 * MARGIN + 40
    vb_h = (all_y1 - all_y0) * S + 2 * MARGIN + 20

    parts = [
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="{fmt(vb_w)}mm" height="{fmt(vb_h)}mm"
     viewBox="0 0 {fmt(vb_w)} {fmt(vb_h)}"
     version="1.1">
<title>Агентство · Вариант 1 · обводка стен · М 1:100</title>
<desc>Источник: Screenshot …22-01-52.svg (1 px = 1 см). Масштаб 1:100: 1 м = 10 мм = 10 ед. viewBox. Подложка сохранена до переноса окон.</desc>
<defs>
  <style type="text/css"><![CDATA[
    .geom {{ fill: #1a1a1a; stroke: none; }}
    .geom-int {{ fill: #1a1a1a; stroke: none; }}
    .post {{ fill: #222222; stroke: none; }}
    .rname {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size: 2.2px; font-weight: 700; fill: #1a1a1a; text-anchor: middle; }}
    .rmeta {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size: 1.6px; fill: #333; text-anchor: middle; }}
    .open-label .rname {{ fill: #555; font-weight: 600; }}
    .title {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size: 2.6px; fill: #222; }}
    .note {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size: 1.8px; fill: #444; }}
    .tot {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size: 2.2px; font-weight: 700; fill: #1a1a1a; }}
  ]]></style>
</defs>
<sodipodi:namedview id="nv" pagecolor="#ffffff" inkscape:deskcolor="#d1d1d1"/>
<rect id="page-bg" width="100%" height="100%" fill="#ffffff"/>
<text class="title" x="{fmt(MARGIN)}" y="{fmt(MARGIN + 2)}">Вариант 1 · стены с обводки · М 1:100 (1 м = 10 мм)</text>
<text class="note" x="{fmt(MARGIN)}" y="{fmt(MARGIN + 5)}">Подложка: Screenshot 22-01-52 · исходник 1 px = 1 см → ×0,1. Окна/двери/мебель — следующим шагом; подложку пока не удалять.</text>
'''
    ]

    ix, iy = to_u(img["x"], img["y"])
    parts.append(
        '<g id="layer-underlay" inkscape:label="подложка" inkscape:groupmode="layer" opacity="0.45">\n'
    )
    parts.append(
        f'<image id="underlay" x="{fmt(ix)}" y="{fmt(iy)}" width="{fmt(img["w"] * S)}" '
        f'height="{fmt(img["h"] * S)}" preserveAspectRatio="{img["preserve"]}" '
        f'xlink:href="{img["href"]}"/>\n'
    )
    parts.append("</g>\n")

    parts.append(
        '<g id="layer-walls" inkscape:label="стены" inkscape:groupmode="layer">\n'
    )
    for r in rects:
        ux0, uy0 = to_u(r["x0"], r["y0"])
        cls = {"post": "post", "int": "geom-int", "ext": "geom"}[r["kind"]]
        parts.append(
            f'<rect id="{r["id"]}" class="{cls}" x="{fmt(ux0)}" y="{fmt(uy0)}" '
            f'width="{fmt(r["bw"] * S)}" height="{fmt(r["bh"] * S)}"/>\n'
        )
    parts.append("</g>\n")

    parts.append(
        '<g id="layer-labels" inkscape:label="подписи помещений" inkscape:groupmode="layer">\n'
    )
    for r in sorted(regions, key=lambda z: z["name"]):
        lx, ly = to_u(r["cx"], r["cy"])
        area_s = f'{r["area"]:.2f}'.replace(".", ",")
        if r["name"] != "Гостиная":
            wm, hm = r["w"] / 100, r["h"] / 100
            meta = f"{wm:.2f}×{hm:.2f} м · {area_s} м²".replace(".", ",")
        else:
            meta = f"{area_s} м² (открытая зона)"
        safe = re.sub(r"[^\w\-]+", "-", r["name"], flags=re.U)
        parts.append(f'<g id="lab-{safe}" transform="translate({fmt(lx)},{fmt(ly)})">\n')
        parts.append(f'<text class="rname" x="0" y="-1.2">{escape(r["name"])}</text>\n')
        parts.append(f'<text class="rmeta" x="0" y="1.4">{escape(meta)}</text>\n')
        parts.append("</g>\n")

    for o in opens:
        lx, ly = to_u(o["cx"], o["cy"])
        area_s = f'{o["area"]:.2f}'.replace(".", ",")
        wm, hm = o["w"] / 100, o["h"] / 100
        meta = f"{wm:.2f}×{hm:.2f} м · {area_s} м²".replace(".", ",")
        parts.append(
            f'<g id="lab-{o["name"]}" class="open-label" transform="translate({fmt(lx)},{fmt(ly)})">\n'
        )
        parts.append(f'<text class="rname" x="0" y="-1.2">{escape(o["name"])}</text>\n')
        parts.append(f'<text class="rmeta" x="0" y="1.4">{escape(meta)}</text>\n')
        parts.append("</g>\n")
    parts.append("</g>\n")

    txx, tyy = MARGIN, vb_h - MARGIN - 8
    parts.append('<g id="layer-totals" inkscape:label="итоги" inkscape:groupmode="layer">\n')
    parts.append(
        f'<text class="tot" x="{fmt(txx)}" y="{fmt(tyy)}">Отапливаемая (по обводке стен): '
        f'{heated_area:.2f} м²</text>\n'.replace(".", ",")
    )
    parts.append(
        f'<text class="note" x="{fmt(txx)}" y="{fmt(tyy + 3.2)}">Навес ≈ {carport["area"]:.2f} м² · '
        f'Терраса (контур снаружи L) ≈ {terrace["area"]:.2f} м² · наружные стены ≈ 380 мм</text>\n'.replace(
            ".", ","
        )
    )
    parts.append("</g>\n</svg>\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(parts))

    hnx, hny = 623.7, 79.5
    rooms_json = []
    for r in sorted(regions, key=lambda z: (z["y0"], z["x0"])):
        rooms_json.append(
            {
                "name": r["name"],
                "area": round(r["area"], 2),
                "x": round((r["x0"] - hnx) / 100, 3),
                "y": round((r["y0"] - hny) / 100, 3),
                "w": round(r["w"] / 100, 3),
                "h": round(r["h"] / 100, 3),
            }
        )
    JSON_OUT.write_text(
        json.dumps(
            {
                "source": SRC.name,
                "scale": {
                    "trace": "1 px = 1 cm",
                    "plan": "1:100",
                    "viewBox": "1 unit = 0.1 m = 10 mm paper",
                },
                "heated_m": [
                    round((2362.6 - 623.7) / 100, 3),
                    round((1748.7 - 79.5) / 100, 3),
                ],
                "heated_area_m2": round(heated_area, 2),
                "wall_thick_m": 0.388,
                "rooms": rooms_json,
                "open": [
                    {"name": "Навес", "area": round(carport["area"], 2)},
                    {"name": "Терраса", "area": round(terrace["area"], 2)},
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"heated {heated_area:.2f} m², rooms {len(rooms_json)}")


if __name__ == "__main__":
    main()
