#!/usr/bin/env python3
"""Вставляет палитру каталога в furniture-map-d2.svg (data-nosync, не в 3D).

Палитра в слое world (метры): превью фасадом к зрителю (отдельная группа) и
пятно со стрелкой сзади→вперёд (+Y). Копируйте только catalog-item (пятно)
→ слой furniture, смените class на furn — скриншот не в группе.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "furniture-map-d2.svg"
CATALOG = ROOT / "furniture" / "catalog.json"
PREVIEWS = ROOT / "furniture" / "previews"

# Восточнее дома, в метрах плана (компактно по высоте дома)
ORIGIN_X = 15.5
ORIGIN_Y = 18.2  # сверху вниз по категориям (Y уменьшается)
COL_W = 1.25
# Ячейка: сверху скриншот, снизу свободное место под пятно (+ подписи)
IMG_W = 1.10
IMG_H = 0.78
GAP = 0.10          # зазор скриншот → пятно
FOOT_SLOT = 0.62    # место под пятно и ID
PAD = 0.05
ROW_H = PAD + IMG_H + GAP + FOOT_SLOT + PAD  # ≈1.60
COLS = 9
DIR_Y = -1  # стек категорий на юг

COLORS = {
    "D": "#a8c4e0", "K": "#d4b8e0", "W": "#c9b896", "G": "#b8c9a0",
    "C": "#e0d4a8", "S": "#c4a898", "A": "#e0b8b8", "P": "#b8d0d0",
    "M": "#e0c8d8", "B": "#d0d0c0", "N": "#c8d8e8", "H": "#e8d0a8",
    "J": "#d0c0b0", "V": "#a8c8d8", "T": "#c0c0c8", "R": "#b0c8d8",
    "X": "#c8c0b0",
}


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_inner() -> tuple[str, float, float]:
    """Возвращает XML внутри world + max x/y в метрах."""
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    titles = {g["id"]: g["title"] for g in cat["groups"]}
    by_group: dict[str, list] = {g["id"]: [] for g in cat["groups"]}
    for item in cat["items"]:
        by_group.setdefault(item["group"], []).append(item)

    parts: list[str] = []
    parts.append(
        '    <g id="catalog-palette" inkscape:label="catalog-palette" '
        'inkscape:groupmode="layer" data-nosync="1">'
    )
    y = ORIGIN_Y
    parts.append(
        f'      <text transform="translate({ORIGIN_X},{y}) scale(1,-1)" '
        f'font-family="DejaVu Sans,sans-serif" font-size="0.28" font-weight="700" fill="#222">'
        f"Каталог — копируйте в furniture, class→furn</text>"
    )
    y += DIR_Y * 0.32
    parts.append(
        f'      <text transform="translate({ORIGIN_X},{y}) scale(1,-1)" '
        f'font-family="DejaVu Sans,sans-serif" font-size="0.16" fill="#555">'
        f"Снимок: фасад к зрителю. Стрелка пятна = сзади→вперёд как на снимке. Не синхр.</text>"
    )
    y += DIR_Y * 0.40

    max_x = ORIGIN_X + COLS * COL_W
    min_y = y
    max_y = y
    for gid, items in by_group.items():
        if not items:
            continue
        parts.append(
            f'      <text transform="translate({ORIGIN_X},{y}) scale(1,-1)" '
            f'font-family="DejaVu Sans,sans-serif" font-size="0.20" font-weight="700" fill="#333">'
            f"{esc(titles.get(gid, gid))} ({gid})</text>"
        )
        y += DIR_Y * 0.12
        rows = math.ceil(len(items) / COLS)
        block_h = rows * ROW_H + 0.12
        # rect: меньший y = юг при стеке вниз
        y0 = y + DIR_Y * block_h if DIR_Y < 0 else y
        y1 = y if DIR_Y < 0 else y + block_h
        parts.append(
            f'      <rect x="{ORIGIN_X - 0.1:.3f}" y="{min(y0,y1):.3f}" '
            f'width="{COLS * COL_W + 0.2:.3f}" height="{abs(block_h):.3f}" '
            f'rx="0.06" fill="#f0ebe3" stroke="#8a8074" stroke-width="0.02" '
            f'style="pointer-events:none"/>'
        )
        y += DIR_Y * 0.10
        for i, item in enumerate(items):
            col = i % COLS
            row = i // COLS
            cx = ORIGIN_X + col * COL_W + COL_W / 2
            # row 0 у заголовка; следующие ряды дальше по DIR_Y
            cy = y + DIR_Y * (row * ROW_H + ROW_H / 2)
            mid = item["id"]
            name = item.get("name", mid)
            cm = item.get("cm") or [40, 40, 40]
            w_m, d_m = cm[0] / 100.0, cm[1] / 100.0
            # пятно в нижней зоне ячейки, не больше FOOT_SLOT
            max_side = min(0.55, FOOT_SLOT - 0.28)
            s = min(1.0, max_side / max(w_m, d_m, 0.01))
            fw, fd = w_m * s, d_m * s
            fill = COLORS.get(gid, "#ccc")
            href = f"furniture/previews/{mid}.png"
            # Локально +Y = север = верх экрана: скриншот сверху, пятно снизу
            img_local_y = ROW_H / 2 - PAD - IMG_H / 2
            foot_local_y = -ROW_H / 2 + PAD + 0.22 + fd / 2
            min_y = min(min_y, cy - ROW_H / 2)
            max_y = max(max_y, cy + ROW_H / 2)
            # Превью отдельно от пятна — копируется только catalog-item, без разгруппировки
            img_x = cx
            img_y = cy + img_local_y
            foot_x = cx
            foot_y = cy + foot_local_y
            parts.append(
                f'''      <g transform="translate({img_x:.4f},{img_y:.4f}) scale(1,-1)"
         style="pointer-events:none" data-nosync="1">
        <image href="{esc(href)}" xlink:href="{esc(href)}"
               x="{(-IMG_W/2):.3f}" y="{(-IMG_H/2):.3f}" width="{IMG_W:.3f}" height="{IMG_H:.3f}"
               preserveAspectRatio="xMidYMid meet"/>
      </g>
      <g id="catalog-{esc(mid)}" class="catalog-item" data-nosync="1"
         data-model="{esc(mid)}" data-mirror="0" data-front-deg="0"
         data-name="{esc(name)}"
         transform="translate({foot_x:.4f},{foot_y:.4f})"
         inkscape:label="catalog {esc(mid)}">
        <title>{esc(mid)} — {esc(name)} · class→furn после копирования</title>
        <rect class="foot" x="{(-fw/2):.4f}" y="{(-fd/2):.4f}" width="{fw:.4f}" height="{fd:.4f}"
              fill="{fill}" stroke="#222" stroke-width="0.015" rx="0.03"/>
        <g class="orient" fill="#c0392b">
          <rect x="-0.025" y="{-fd*0.05:.4f}" width="0.05" height="{max(fd*0.35, 0.08):.4f}"/>
          <polygon points="0,{fd*0.42:.4f} 0.07,{fd*0.18:.4f} -0.07,{fd*0.18:.4f}"/>
        </g>
        <g transform="scale(1,-1)">
          <text text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="0.11"
                font-weight="700" y="0.05" fill="#111">{esc(mid)}</text>
          <text text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="0.08"
                y="0.20" fill="#444">{esc(name[:14])}</text>
        </g>
      </g>'''
            )
        y += DIR_Y * (rows * ROW_H + 0.28)
        max_x = max(max_x, ORIGIN_X + COLS * COL_W)
        min_y = min(min_y, y)
        max_y = max(max_y, ORIGIN_Y)

    parts.append("    </g>")
    return "\n".join(parts), max_x + 0.5, min_y - 0.5, max_y + 0.5


def expand_viewbox(svg: str, plan_x0: float, plan_x1: float, plan_y0: float, plan_y1: float) -> str:
    """Расширяет viewBox по matrix(sx,0,0,sy,e,f) слоя furniture."""
    wm = re.search(
        r'id="furniture"[^>]*transform="matrix\(([^)]+)\)"',
        svg,
    )
    if not wm:
        wm = re.search(
            r'transform="matrix\(([^)]+)\)"[^>]*id="furniture"',
            svg,
        )
    vb = re.search(r'viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"', svg)
    if not wm or not vb:
        print("warn: cannot expand viewBox")
        return svg
    a, b, c, d, e, f = [float(x) for x in wm.group(1).split(",")]
    # X' = a*x + e; Y' = d*y + f  (b=c=0)
    corners = []
    for x in (plan_x0, plan_x1):
        for y in (plan_y0, plan_y1):
            corners.append((a * x + e, d * y + f))
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    # План дома примерно x∈[-7,14], y∈[2,19] + каталог
    plan_corners = []
    for x in (-7.0, 14.0, plan_x0, plan_x1):
        for y in (2.0, 19.0, plan_y0, plan_y1):
            plan_corners.append((a * x + e, d * y + f))
    xs = [p[0] for p in plan_corners]
    ys = [p[1] for p in plan_corners]
    left = min(xs) - 40
    top = min(ys) - 40
    right = max(xs) + 40
    bottom = max(ys) + 40
    w2, h2 = right - left, bottom - top
    svg = re.sub(
        r'viewBox="[^"]*"',
        f'viewBox="{left:.1f} {top:.1f} {w2:.1f} {h2:.1f}"',
        svg,
        count=1,
    )
    svg = re.sub(r'\bwidth="[^"]*"', f'width="{w2:.1f}mm"', svg, count=1)
    svg = re.sub(r'\bheight="[^"]*"', f'height="{h2:.1f}mm"', svg, count=1)
    return svg


def remove_catalog(text: str) -> str:
    start = text.find('<g id="catalog-palette"')
    if start < 0:
        start = text.find("id=\"catalog-palette\"")
        if start < 0:
            return text
        start = text.rfind("<g", 0, start)
    i, depth, end = start, 0, None
    while i < len(text):
        no, nc = text.find("<g", i), text.find("</g>", i)
        if nc < 0:
            break
        if no >= 0 and no < nc:
            depth += 1
            i = no + 2
        else:
            depth -= 1
            i = nc + 4
            if depth == 0:
                end = i
                break
    if end is None:
        raise SystemExit("catalog-palette unclosed")
    return text[:start] + text[end:]


def insert_into_furniture(text: str, inner: str) -> str:
    mfurn = re.search(r"<g[^>]*id=\"furniture\"[^>]*>", text)
    if not mfurn:
        raise SystemExit("no furniture layer")
    i = mfurn.end()
    depth = 1
    while i < len(text) and depth:
        no, nc = text.find("<g", i), text.find("</g>", i)
        if nc < 0:
            raise SystemExit("furniture unclosed")
        if no >= 0 and no < nc:
            depth += 1
            i = no + 2
        else:
            depth -= 1
            if depth == 0:
                return text[:nc] + "\n" + inner + "\n  " + text[nc:]
            i = nc + 4
    raise SystemExit("furniture insert failed")


def main() -> None:
    n_prev = len(list(PREVIEWS.glob("*.png")))
    if n_prev < 50:
        raise SystemExit(
            f"мало превью в {PREVIEWS} ({n_prev}). "
            "Сначала: node furniture-map/render_previews.mjs"
        )

    inner, max_x, min_y, max_y = build_inner()
    text = SVG.read_text(encoding="utf-8")
    if "xmlns:xlink" not in text:
        text = text.replace(
            'xmlns="http://www.w3.org/2000/svg"',
            'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
            1,
        )
    text = remove_catalog(text)
    text = insert_into_furniture(text, inner)
    text = expand_viewbox(text, ORIGIN_X - 0.5, max_x, min_y, max_y)
    SVG.write_text(text, encoding="utf-8")
    print(f"catalog-palette injected ({n_prev} previews) → {SVG}")
    print(f"plan bounds x≤{max_x:.1f} y∈[{min_y:.1f},{max_y:.1f}]")


if __name__ == "__main__":
    main()
