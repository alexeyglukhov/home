#!/usr/bin/env python3
"""Собирает редактируемую SVG-карту мебели Д2 из furniture-place-d2.js + catalog.json.

Редактирование в Inkscape / любом SVG-редакторе:
  • Двигайте / масштабируйте / вращайте группу g.furn целиком.
  • Стрелка = ПЕРЕД модели (фасад / сиденье / чаша / изножье).
  • Спинка / бачок / изголовье — противоположный край от стрелки → к стене.
  • data-model не меняйте, если не хотите другую модель из каталога.
  • data-mirror="1" — зеркало по ширине (как D08).

Координаты: метры плана Д2, X на восток, Y на север (как в D2_FURNITURE).
После правок: python3 furniture-map/sync_map_to_place.py
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACE = ROOT / "furniture-place-d2.js"
VARIANT = ROOT / "variant-d2.js"
CATALOG = ROOT / "furniture" / "catalog.json"
OUT = ROOT / "furniture-map-d2.svg"

SCALE = 100.0  # 1 м = 100 SVG-ед.
PAD = 0.8  # м поля


def parse_js_boxes(js: str, const_name: str) -> list[list]:
    m = re.search(rf"const {const_name} = \[([\s\S]*?)\];", js)
    if not m:
        return []
    rows = []
    for raw in re.finditer(r"\[([^\[\]]+)\]", m.group(1)):
        parts = [p.strip().strip("'\"") for p in raw.group(1).split(",")]
        if const_name == "ROOMS":
            # ["Имя", x0,y0,x1,y1, z]
            if len(parts) < 5:
                continue
            try:
                nums = [float(parts[i]) for i in range(1, 5)]
            except ValueError:
                continue
            rows.append([parts[0], *nums])
            continue
        if len(parts) < 4:
            continue
        try:
            nums = [float(parts[i]) for i in range(4)]
        except ValueError:
            continue
        extra = parts[4] if len(parts) > 4 else None
        if extra is not None and not re.match(r"^-?\d", extra):
            rows.append([*nums, extra])
        else:
            rows.append(nums)
    return rows


def wall_rect(x0: float, y0: float, x1: float, y1: float) -> tuple[float, float, float, float]:
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    return x0, y0, x1 - x0, y1 - y0


def parse_js_segments(js: str, const_name: str) -> list[tuple[float, float, float, float]]:
    """Отрезки эскиза [x0,y0,x1,y1] из FURNITURE / TERRACE_FURNITURE / DOOR_SWINGS."""
    m = re.search(rf"const {const_name} = \[([\s\S]*?)\];", js)
    if not m:
        return []
    segs = []
    for raw in re.finditer(
        r"\[\s*([-0-9.eE+]+)\s*,\s*([-0-9.eE+]+)\s*,\s*([-0-9.eE+]+)\s*,\s*([-0-9.eE+]+)\s*\]",
        m.group(1),
    ):
        segs.append(tuple(float(raw.group(i)) for i in range(1, 5)))
    return segs


def sketch_paths(segs: list[tuple[float, float, float, float]], max_gap: float = 0.02) -> list[str]:
    """Склеивает смежные отрезки в polyline path d=..."""
    if not segs:
        return []
    paths: list[str] = []
    sx, sy, ex, ey = segs[0]
    d = f"M{sx:.3f},{sy:.3f} L{ex:.3f},{ey:.3f}"
    for x0, y0, x1, y1 in segs[1:]:
        if abs(x0 - ex) <= max_gap and abs(y0 - ey) <= max_gap:
            d += f" L{x1:.3f},{y1:.3f}"
            ex, ey = x1, y1
        else:
            paths.append(d)
            d = f"M{x0:.3f},{y0:.3f} L{x1:.3f},{y1:.3f}"
            ex, ey = x1, y1
    paths.append(d)
    return paths


def parse_furniture(js: str) -> list[dict]:
    # Берём только массив D2_FURNITURE
    m = re.search(r"export const D2_FURNITURE = \[([\s\S]*?)\];", js)
    if not m:
        raise SystemExit("D2_FURNITURE not found")
    body = m.group(1)
    items = []
    for raw in re.finditer(r"\{([^{}]+)\}", body):
        chunk = raw.group(1)
        get = lambda k, cast=float, default=None: (
            cast(mm.group(1))
            if (mm := re.search(rf"{k}:\s*([-0-9.]+)", chunk))
            else default
        )
        get_s = lambda k, default=None: (
            mm.group(1)
            if (mm := re.search(rf'{k}:\s*"([^"]+)"', chunk))
            else default
        )
        iid = get_s("id")
        if not iid:
            continue
        raise_m = re.search(r"raise:\s*([^,}\n]+)", chunk)
        floor_m = re.search(r"floorY:\s*([^,}\n]+)", chunk)
        h_m = re.search(r"h:\s*([^,}\n]+)", chunk)
        item = {
            "id": iid,
            "x0": get("x0"),
            "y0": get("y0"),
            "x1": get("x1"),
            "y1": get("y1"),
            "wall": get_s("wall"),
            "rot": get("rot"),
            "h": h_m.group(1).strip() if h_m else None,
            "raise": raise_m.group(1).strip() if raise_m else None,
            "mirror": "mirror: true" in chunk or "mirror:true" in chunk,
            "keepAspect": "keepAspect" in chunk,
            "floorY": floor_m.group(1).strip() if floor_m else None,
        }
        if item["x0"] is None:
            continue
        items.append(item)
    return items


def front_deg(item: dict) -> float:
    """Градусы плана: 0=север (перед), 90=восток, 180=юг, 270=запад."""
    wall = item.get("wall")
    if wall:
        # Спинка/бачок/изголовье к wall → перед в противоположную сторону
        return {"N": 180.0, "S": 0.0, "E": 270.0, "W": 90.0}[wall.upper()]
    rot = item.get("rot")
    if rot is None:
        return 0.0
    # Явный rot в place-файле — ориентация +Z модели; для карты стрелка ≈ +Z
    # 0:+Z=N, 90:+Z=W, 180:+Z=S, 270:+Z=E → front deg
    r = ((float(rot) % 360) + 360) % 360
    return {0: 0.0, 90: 270.0, 180: 180.0, 270: 90.0}.get(round(r), r)


def local_size(item: dict, face: float) -> tuple[float, float]:
    """Ширина (поперёк стрелки), глубина (вдоль стрелки) в метрах."""
    pw = abs(item["x1"] - item["x0"])
    pd = abs(item["y1"] - item["y0"])
    f = face % 360
    # Перед N/S → ширина по X, глубина по Y
    if min(abs(f - 0), abs(f - 180), abs(f - 360)) <= 45:
        return pw, pd
    # Перед E/W → ширина по Y, глубина по X
    return pd, pw


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def main() -> None:
    items = parse_furniture(PLACE.read_text(encoding="utf-8"))
    vjs = VARIANT.read_text(encoding="utf-8")
    walls = parse_js_boxes(vjs, "WALLS")
    openings = parse_js_boxes(vjs, "OPENINGS")
    rooms = parse_js_boxes(vjs, "ROOMS")
    furn_sketch = parse_js_segments(vjs, "FURNITURE")
    terrace_sketch = parse_js_segments(vjs, "TERRACE_FURNITURE")
    door_swings = parse_js_segments(vjs, "DOOR_SWINGS")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    names = {row["id"]: row.get("name", row["id"]) for row in catalog["items"]}
    cm = {
        row["id"]: row.get("cm")
        for row in catalog["items"]
        if row.get("cm")
    }

    xs = [v for it in items for v in (it["x0"], it["x1"])]
    ys = [v for it in items for v in (it["y0"], it["y1"])]
    for w in walls:
        xs += [w[0], w[2]]
        ys += [w[1], w[3]]
    for r in rooms:
        xs += [r[1], r[3]]
        ys += [r[2], r[4]]
    xmin, xmax = min(xs) - PAD, max(xs) + PAD
    ymin, ymax = min(ys) - PAD, max(ys) + PAD
    w_m, h_m = xmax - xmin, ymax - ymin

    # SVG: север вверх через scale(1,-1)
    vb_w = w_m * SCALE + 40
    vb_h = h_m * SCALE + 80
    ox = 20 - xmin * SCALE
    oy = 40 + ymax * SCALE

    colors = {
        "D": "#a8c4e0",
        "K": "#d4b8e0",
        "W": "#c9b896",
        "G": "#b8c9a0",
        "C": "#e0d4a8",
        "S": "#c4a898",
        "A": "#e0b8b8",
        "P": "#b8d0d0",
        "M": "#e0c8d8",
        "B": "#d0d0c0",
        "N": "#c8d8e8",
        "H": "#e8d0a8",
        "J": "#d0c0b0",
        "V": "#a8c8d8",
        "T": "#c0c0c8",
        "R": "#b0c8d8",
        "X": "#c8c0b0",
    }

    parts: list[str] = []
    parts.append(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="{vb_w:.1f}mm" height="{vb_h:.1f}mm" viewBox="0 0 {vb_w:.1f} {vb_h:.1f}"
     data-map="d2-furniture" data-scale="{SCALE}" data-house-dx="-1">
  <title>Карта мебели Д2 — редактируемая</title>
  <desc>Стрелка = перед модели (к комнате). Спинка/бачок/изголовье — против стрелки, к стене.
Двигайте группы g.furn. После правок: python3 house-light/furniture-map/sync_map_to_place.py</desc>
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
  <text class="hint" x="20" y="22" font-size="14">Д2 мебель · подложка = планировка · стрелка = ПЕРЕД · против стрелки = к стене</text>
  <text class="hint" x="20" y="38" font-size="11">Inkscape: слой plan-underlay не трогайте; правьте только furn-*. 1 клетка = 1 м</text>

  <g id="world" transform="translate({ox:.3f},{oy:.3f}) scale({SCALE},{-SCALE})"
     inkscape:label="plan-meters">
    <!-- подложка планировки (не редактировать) -->
    <g id="plan-underlay" inkscape:label="plan-underlay" inkscape:groupmode="layer"
       style="pointer-events:none">
      <g id="plan-rooms">'''
    )

    for room in rooms:
        name, x0, y0, x1, y1 = room[0], room[1], room[2], room[3], room[4]
        if x1 < x0:
            x0, x1 = x1, x0
        if y1 < y0:
            y0, y1 = y1, y0
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        parts.append(
            f'        <rect class="plan-room" x="{x0:.3f}" y="{y0:.3f}" '
            f'width="{x1-x0:.3f}" height="{y1-y0:.3f}" rx="0.04"/>'
        )
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
            f'        <rect class="{cls}" x="{x:.3f}" y="{y:.3f}" width="{max(ww,0.04):.3f}" height="{max(hh,0.04):.3f}"/>'
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

    # сетка поверх подложки, под мебелью
    parts.append('    <g id="grid" inkscape:label="grid" style="pointer-events:none">')
    x0g, x1g = math.floor(xmin), math.ceil(xmax)
    y0g, y1g = math.floor(ymin), math.ceil(ymax)
    for x in range(x0g, x1g + 1):
        parts.append(
            f'      <line class="grid" x1="{x}" y1="{ymin}" x2="{x}" y2="{ymax}"/>'
        )
    for y in range(y0g, y1g + 1):
        parts.append(
            f'      <line class="grid" x1="{xmin}" y1="{y}" x2="{xmax}" y2="{y}"/>'
        )
    parts.append("    </g>")

    # север
    nx, ny = xmax - 1.2, ymax - 0.5
    parts.append(
        f'''    <g id="north" class="axis" transform="translate({nx},{ny})" style="pointer-events:none">
      <polygon points="0,0.55 0.15,0.25 -0.15,0.25"/>
      <line x1="0" y1="0.25" x2="0" y2="-0.1"/>
      <text transform="scale(1,-1)" y="-0.25" text-anchor="middle" font-size="0.28">С</text>
    </g>'''
    )

    parts.append('    <g id="furniture" inkscape:label="furniture" inkscape:groupmode="layer">')

    meta_items = []
    for i, it in enumerate(items, 1):
        face = front_deg(it)
        cx = (it["x0"] + it["x1"]) / 2
        cy = (it["y0"] + it["y1"]) / 2
        width, depth = local_size(it, face)
        # svg rotate при scale(1,-1): svg_rot = -face
        svg_rot = -face
        fid = f"furn-{i:03d}"
        fill = colors.get(it["id"][0], "#cccccc")
        name = names.get(it["id"], it["id"])
        nat = cm.get(it["id"])
        nat_s = f"{nat[0]}×{nat[1]}×{nat[2]} см" if nat else ""
        mirror = "1" if it["mirror"] else "0"
        ka = "1" if it["keepAspect"] else "0"
        h_attr = esc(it["h"] or "")
        raise_attr = esc(it["raise"] or "")
        floor_attr = esc(it["floorY"] or "")
        rot_attr = f'{it["rot"]:g}' if it["rot"] is not None else ""
        wall_attr = it["wall"] or ""
        label = it["id"]
        # текст не зеркалить: scale(1,-1) внутри, компенсировать поворот группы
        text_xf = f"rotate({-svg_rot}) scale(1,-1)"

        parts.append(
            f'''      <g id="{fid}" class="furn" data-model="{esc(it["id"])}" data-front-deg="{face:.1f}"
         data-mirror="{mirror}" data-keep-aspect="{ka}" data-wall="{wall_attr}"
         data-h="{h_attr}" data-raise="{raise_attr}" data-floory="{floor_attr}" data-rot="{rot_attr}"
         data-name="{esc(name)}"
         transform="translate({cx:.4f},{cy:.4f}) rotate({svg_rot:.2f})"
         inkscape:label="{esc(it["id"])} {esc(name)}">
        <title>{esc(it["id"])} — {esc(name)} · перед {face:.0f}°</title>
        <rect class="foot" x="{(-width/2):.4f}" y="{(-depth/2):.4f}"
              width="{width:.4f}" height="{depth:.4f}" fill="{fill}" rx="0.03"/>
        <!-- стрелка к переду (+Y локально) -->
        <g class="orient">
          <rect x="-0.03" y="{-0.02 if depth>0.25 else -depth*0.1}" width="0.06"
                height="{max(depth*0.35, 0.12):.4f}"/>
          <polygon points="0,{depth*0.42:.4f} 0.1,{depth*0.18:.4f} -0.1,{depth*0.18:.4f}"/>
        </g>
        <g transform="{text_xf}">
          <text class="label" y="0.05">{esc(label)}</text>
          <text class="label sub" y="0.20">{esc(name[:22])}</text>
        </g>
      </g>'''
        )
        meta_items.append(
            {
                "svgId": fid,
                "model": it["id"],
                "name": name,
                "cx": cx,
                "cy": cy,
                "width": width,
                "depth": depth,
                "frontDeg": face,
                "mirror": it["mirror"],
                "keepAspect": it["keepAspect"],
                "h": it["h"],
                "wall": it["wall"],
                "natCm": nat,
                "natNote": nat_s,
            }
        )

    parts.append("    </g>")  # furniture
    parts.append("  </g>")  # world

    # JSON для синка (дублирует атрибуты)
    payload = json.dumps(
        {"version": 1, "units": "m", "front": "arrow=+Y local / frontDeg 0=N 90=E", "items": meta_items},
        ensure_ascii=False,
        indent=2,
    )
    parts.append(f'  <script type="application/json" id="furniture-map-json">\n{payload}\n  </script>')
    parts.append("</svg>")

    OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
    meta_path = ROOT / "furniture-map" / "map-d2-meta.json"
    meta_path.write_text(payload + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(items)} items)")
    print(f"wrote {meta_path}")


if __name__ == "__main__":
    main()
