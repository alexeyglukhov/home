#!/usr/bin/env python3
"""Пустая карта мебели Д4: подложка планировки и каталог для копирования.

Слой furniture пустой. Пятна каталога справа не синхронизируются.
В Inkscape копируйте группу catalog-ITEM (пятно со стрелкой) на план
и смените class на furn.
"""
from __future__ import annotations

import math
import re
from pathlib import Path

from build_map_d2 import (
    PAD,
    SCALE,
    parse_js_boxes,
    parse_js_segments,
    sketch_paths,
    wall_rect,
)

ROOT = Path(__file__).resolve().parents[1]
VARIANT = ROOT / "variant-d4.js"
OUT = ROOT / "furniture-map-d4.svg"


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def parse_rooms(js: str) -> list[tuple[str, list[tuple[float, float, float, float]]]]:
    m = re.search(r"const ROOMS = \[([\s\S]*?)\];", js)
    if not m:
        raise SystemExit("ROOMS not found")
    rooms = []
    for line in m.group(1).splitlines():
        mm = re.match(
            r'\s*\["([^"]+)",\s*([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+)',
            line,
        )
        if not mm:
            continue
        name = mm.group(1)
        x0, y0, x1, y1 = (float(mm.group(i)) for i in range(2, 6))
        inner = re.findall(
            r"\[([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+),\s*([-0-9.]+)\]",
            line,
        )
        boxes = [tuple(float(v) for v in t) for t in inner] or [(x0, y0, x1, y1)]
        rooms.append((name, boxes))
    return rooms


def main() -> None:
    vjs = VARIANT.read_text(encoding="utf-8")
    walls = parse_js_boxes(vjs, "WALLS")
    openings = parse_js_boxes(vjs, "OPENINGS")
    rooms = parse_rooms(vjs)
    furn_sketch = parse_js_segments(vjs, "FURNITURE")
    terrace_sketch = parse_js_segments(vjs, "TERRACE_FURNITURE")
    door_swings = parse_js_segments(vjs, "DOOR_SWINGS")

    xs: list[float] = []
    ys: list[float] = []
    for w in walls:
        xs += [w[0], w[2]]
        ys += [w[1], w[3]]
    for _name, boxes in rooms:
        for x0, y0, x1, y1 in boxes:
            xs += [x0, x1]
            ys += [y0, y1]
    xmin, xmax = min(xs) - PAD, max(xs) + PAD
    ymin, ymax = min(ys) - PAD, max(ys) + PAD
    # Каталог стоит восточнее дома и уходит на юг.
    xmax = max(xmax, 28.0)
    ymin = min(ymin, -21.5)
    w_m, h_m = xmax - xmin, ymax - ymin
    vb_w = w_m * SCALE + 40
    vb_h = h_m * SCALE + 80
    ox = 20 - xmin * SCALE
    oy = 40 + ymax * SCALE

    parts: list[str] = []
    parts.append(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{vb_w:.1f}mm" height="{vb_h:.1f}mm" viewBox="0 0 {vb_w:.1f} {vb_h:.1f}"
     data-map="d4-furniture" data-scale="{SCALE}" data-house-dx="-1">
  <title>Карта мебели Д4</title>
  <desc>Подложка — планировка Д4. Слой furniture пустой.
Каталог справа: копируйте пятно со стрелкой на план, class → furn.</desc>
  <style>
    .furn .foot {{ stroke:#222; stroke-width:0.025; fill-opacity:0.85; }}
    .furn .orient {{ fill:#c0392b; }}
    .furn .label {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size:0.16px;
      fill:#111; text-anchor:middle; pointer-events:none; }}
    .furn .sub {{ font-size:0.10px; fill:#333; }}
    .grid {{ stroke:#e6e2da; stroke-width:0.008; }}
    .axis {{ stroke:#666; stroke-width:0.03; fill:#666;
      font-family: DejaVu Sans, sans-serif; font-size:0.25px; }}
    .hint {{ font-family: DejaVu Sans, sans-serif; fill:#333; }}
    .plan-room {{ fill:#efeae2; stroke:#b0a89c; stroke-width:0.02; fill-opacity:0.95; }}
    .plan-wall {{ fill:#2a2a2a; stroke:none; }}
    .plan-open {{ fill:#f7f5f1; stroke:#888; stroke-width:0.015; }}
    .plan-door {{ fill:#d8cfc2; stroke:#666; stroke-width:0.02; }}
    .plan-sketch {{ fill:none; stroke:#1a1a1a; stroke-width:0.018; stroke-linecap:round; stroke-linejoin:round; opacity:0.85; }}
    .plan-swing {{ fill:none; stroke:#444; stroke-width:0.014; opacity:0.7; }}
    .plan-label {{ font-family: DejaVu Sans, Liberation Sans, sans-serif; fill:#5a534a;
      font-size:0.28px; text-anchor:middle; pointer-events:none; }}
  </style>
  <rect width="100%" height="100%" fill="#f7f5f1"/>
  <text class="hint" x="20" y="22" font-size="14">Д4 · подложка = планировка · каталог справа копируйте на план</text>
  <text class="hint" x="20" y="38" font-size="11">Слой plan-underlay не трогайте. Пятно со стрелкой: class → furn. 1 клетка = 1 м</text>

  <g id="world" transform="translate({ox:.3f},{oy:.3f}) scale({SCALE},{-SCALE})"
     inkscape:label="plan-meters">
    <g id="plan-underlay" inkscape:label="plan-underlay" inkscape:groupmode="layer"
       style="pointer-events:none">
      <g id="plan-rooms">'''
    )
    for name, boxes in rooms:
        largest = max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        for x0, y0, x1, y1 in boxes:
            if x1 < x0:
                x0, x1 = x1, x0
            if y1 < y0:
                y0, y1 = y1, y0
            parts.append(
                f'        <rect class="plan-room" x="{x0:.3f}" y="{y0:.3f}" '
                f'width="{x1 - x0:.3f}" height="{y1 - y0:.3f}" rx="0.04"/>'
            )
        x0, y0, x1, y1 = largest
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        parts.append(
            f'        <text class="plan-label" transform="translate({cx:.3f},{cy:.3f}) scale(1,-1)">{esc(name)}</text>'
        )
    parts.append("      </g>")
    parts.append('      <g id="plan-walls">')
    for w in walls:
        x, y, ww, hh = wall_rect(w[0], w[1], w[2], w[3])
        parts.append(
            f'        <rect class="plan-wall" x="{x:.3f}" y="{y:.3f}" width="{ww:.3f}" height="{hh:.3f}"/>'
        )
    parts.append("      </g>")
    parts.append('      <g id="plan-openings">')
    for op in openings:
        x, y, ww, hh = wall_rect(op[0], op[1], op[2], op[3])
        kind = op[4] if len(op) > 4 else "y"
        cls = "plan-door" if kind in ("d", "i", "g") else "plan-open"
        parts.append(
            f'        <rect class="{cls}" x="{x:.3f}" y="{y:.3f}" width="{max(ww, 0.04):.3f}" height="{max(hh, 0.04):.3f}"/>'
        )
    parts.append("      </g>")
    parts.append('      <g id="plan-furniture-sketch">')
    for d in sketch_paths(furn_sketch):
        parts.append(f'        <path class="plan-sketch" d="{d}"/>')
    for d in sketch_paths(terrace_sketch):
        parts.append(f'        <path class="plan-sketch" d="{d}"/>')
    for d in sketch_paths(door_swings):
        parts.append(f'        <path class="plan-swing" d="{d}"/>')
    parts.append("      </g>")
    parts.append("    </g>")

    parts.append('    <g id="grid" inkscape:label="grid" style="pointer-events:none">')
    for x in range(math.floor(xmin), math.ceil(xmax) + 1):
        parts.append(f'      <line class="grid" x1="{x}" y1="{ymin}" x2="{x}" y2="{ymax}"/>')
    for y in range(math.floor(ymin), math.ceil(ymax) + 1):
        parts.append(f'      <line class="grid" x1="{xmin}" y1="{y}" x2="{xmax}" y2="{y}"/>')
    parts.append("    </g>")

    nx, ny = xmax - 1.2, ymax - 0.5
    parts.append(
        f'''    <g id="north" class="axis" transform="translate({nx},{ny})" style="pointer-events:none">
      <polygon points="0,0.55 0.15,0.25 -0.15,0.25"/>
      <line x1="0" y1="0.25" x2="0" y2="-0.1"/>
      <text transform="scale(1,-1)" y="-0.25" text-anchor="middle" font-size="0.28">С</text>
    </g>'''
    )
    parts.append('    <g id="furniture" inkscape:label="furniture" inkscape:groupmode="layer">')
    parts.append("    </g>")
    parts.append("  </g>")
    parts.append("</svg>")
    OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
    print(f"wrote {OUT} (rooms {len(rooms)}, furniture layer empty)")


if __name__ == "__main__":
    main()
