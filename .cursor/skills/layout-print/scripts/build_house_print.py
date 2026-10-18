#!/usr/bin/env python3
"""Лист дома: стены параллельно листу, как на планировке.

Без навеса, въезда, ворот и привязки к углу участка.
Север на листе не вверх: стрелка компаса показывает истинный север.
"""
import math
import re
import sys
from pathlib import Path

from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_floor_print import (  # noqa: E402
    DX,
    DY,
    M_HOUSE,
    M_PAGE,
    SVG,
    apply,
    mul,
    add_outline_dims,
    promote_dim_labels,
    recolor,
    world_matrix,
)

# Всё, что целиком левее этой отметки плана, — навес, въезд или машина.
WEST_CUT = 0.0


def to_site(p):
    return mul(M_HOUSE, mul(M_PAGE, (p[0] + DX, p[1] + DY)))


def north_in_plan():
    """Единичный вектор севера в координатах плана (y вниз)."""
    origin = to_site((0.0, 0.0))
    step = to_site((1.0, 0.0))
    eastish = (step[0] - origin[0], step[1] - origin[1])
    step_y = to_site((0.0, 1.0))
    southish = (step_y[0] - origin[0], step_y[1] - origin[1])
    # site: север = уменьшение y. Ищем (nx, ny) плана, чей образ ≈ (0, -1).
    # Образ (px, py) = px * eastish + py * southish.
    det = eastish[0] * southish[1] - eastish[1] * southish[0]
    # (0, -1) = px * east + py * south
    px = (0 * southish[1] - (-1) * southish[0]) / det
    py = (eastish[0] * -1 - eastish[1] * 0) / det
    length = math.hypot(px, py)
    return (px / length, py / length)


def local_points(el):
    tag = el.tag.split("}")[-1]
    if tag == "line":
        try:
            return [
                (float(el.get("x1")), float(el.get("y1"))),
                (float(el.get("x2")), float(el.get("y2"))),
            ]
        except (TypeError, ValueError):
            return []
    if tag == "rect":
        try:
            w, h = float(el.get("width")), float(el.get("height"))
        except (TypeError, ValueError):
            return []
        if w > 300 or h > 250:
            return []
        x, y = float(el.get("x") or 0), float(el.get("y") or 0)
        return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    if tag in ("polygon", "polyline") and el.get("points"):
        nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("points"))]
        return [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
    if tag == "circle":
        try:
            cx, cy = float(el.get("cx")), float(el.get("cy"))
            r = float(el.get("r") or 0)
        except (TypeError, ValueError):
            return []
        return [(cx - r, cy - r), (cx + r, cy + r)]
    return []


def world_points(el):
    m = world_matrix(el)
    return [apply(m, x, y) for x, y in local_points(el)]


def drop_outside_house(root):
    prefixes = ("canopy", "drive", "gate", "car-")
    exact = {"page-bg", "text6", "sand_bitmap", "rect1904"}
    for el in list(root.iter()):
        parent = el.getparent()
        if parent is None:
            continue
        eid = el.get("id") or ""
        if eid in exact or eid.startswith(prefixes):
            parent.remove(el)
            continue
        if el.tag.split("}")[-1] == "image":
            parent.remove(el)
            continue
        if el.tag.split("}")[-1] not in ("line", "rect", "polygon", "polyline", "circle"):
            continue
        pts = world_points(el)
        if pts and max(p[0] for p in pts) < WEST_CUT:
            parent.remove(el)


def text_box(el):
    raw = "".join(el.itertext()).strip()
    if not raw:
        return []
    style = el.get("style") or ""
    size = 2.2
    found = re.search(r"font-size:\s*([0-9.]+)", style)
    if found:
        size = float(found.group(1))
    elif (el.get("class") or "") == "rmeta":
        size = 1.4
    m = world_matrix(el)
    c = apply(m, float(el.get("x") or 0), float(el.get("y") or 0))
    anchor = el.get("text-anchor") or "middle"
    compact = style.replace(" ", "")
    if "text-anchor:start" in compact:
        anchor = "start"
    elif "text-anchor:end" in compact:
        anchor = "end"
    w = size * (0.55 * len(raw) + 0.6)
    h = size * 1.35
    if anchor == "start":
        x0, x1 = c[0], c[0] + w
    elif anchor == "end":
        x0, x1 = c[0] - w, c[0]
    else:
        x0, x1 = c[0] - w / 2, c[0] + w / 2
    y0, y1 = c[1] - h * 0.85, c[1] + h * 0.45
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def take_total_area(root) -> str:
    """С подписи площадей оставляет только общую и возвращает её текст."""
    total = ""
    for el in list(root.iter()):
        if el.tag.split("}")[-1] != "text":
            continue
        raw = " ".join("".join(el.itertext()).split())
        if raw.startswith("Общая"):
            total = raw
        if raw.startswith(("Жилая", "Общая", "Жилые")):
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)
    return total


def content_points(root):
    pts = []
    for el in root.iter():
        if any(a.tag.split("}")[-1] == "defs" for a in el.iterancestors()):
            continue
        tag = el.tag.split("}")[-1]
        if tag == "text":
            pts.extend(text_box(el))
        else:
            pts.extend(world_points(el))
    return pts


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "plan-1-etazh-variant-d2.svg")
    if src.stem.endswith("-print"):
        raise SystemExit("на вход нужен исходный план, не файл печати")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else str(src.with_name(src.stem + "-dom-print.svg")))
    root = etree.parse(str(src)).getroot()

    for el in list(root):
        tag = el.tag.split("}")[-1]
        if tag in ("namedview", "metadata", "title"):
            root.remove(el)
    drop_outside_house(root)
    total = take_total_area(root)
    for el in root.iter():
        recolor(el)
        if el.tag.split("}")[-1] == "style" and el.text and re.search(r"(^|\n)\s*text\s*\{", el.text):
            el.text = re.sub(r"(^|\n)(\s*)text\s*\{", r"\1\2#drawing text {", el.text)
        # дерево мебели тоже в чёрно-белый лист
        for attr in ("style", "fill", "stroke"):
            val = el.get(attr)
            if val and "#6b3e24" in val.lower():
                el.set(attr, re.sub("#6b3e24", "#222222", val, flags=re.I))

    add_outline_dims(root)
    pts = content_points(root)
    if not pts:
        raise SystemExit("на листе не осталось чертежа")
    pad = 1.2
    minx, maxx = min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad
    miny, maxy = min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad
    # Рамка печатной области: узкая шапка сверху и масштаб снизу, чертёж до самых полей.
    x0, x1, y0, y1 = 4.0, 293.0, 7.4, 203.2
    s = min((x1 - x0) / (maxx - minx), (y1 - y0) / (maxy - miny))
    ox = x0 + ((x1 - x0) - s * (maxx - minx)) / 2
    oy = y0 + ((y1 - y0) - s * (maxy - miny)) / 2
    denom = int(round(100 / s))

    drawing = etree.Element(f"{{{SVG}}}g", id="drawing")
    drawing.set(
        "transform",
        f"translate({ox:.3f},{oy:.3f}) scale({s:.6f}) translate({-minx:.3f},{-miny:.3f})",
    )
    for child in list(root):
        drawing.append(child)
    promote_dim_labels(drawing, s)

    mark = re.search(r"variant-([a-z]\d*)", src.stem, re.I)
    variant = mark.group(1).upper() if mark else src.stem
    sheet = etree.Element(f"{{{SVG}}}svg", nsmap={None: SVG})
    sheet.set("width", "297mm")
    sheet.set("height", "210mm")
    sheet.set("viewBox", "0 0 297 210")
    sheet.set("version", "1.1")
    caption = total or variant
    if total:
        caption = f"{variant} · {total[len('Общая'):].strip()}"
    etree.SubElement(sheet, f"{{{SVG}}}title").text = caption
    etree.SubElement(sheet, f"{{{SVG}}}rect", width="297", height="210", fill="#ffffff")
    font = "DejaVu Sans, Liberation Sans, sans-serif"
    sheet.append(drawing)
    etree.SubElement(sheet, f"{{{SVG}}}rect", id="margin-top", x="0", y="0", width="297", height="7.2", fill="#ffffff")
    etree.SubElement(sheet, f"{{{SVG}}}rect", id="margin-bottom", x="0", y="203.4", width="297", height="6.6", fill="#ffffff")

    head = etree.SubElement(sheet, f"{{{SVG}}}text", x="4", y="4.8", fill="#111111")
    head.set("font-family", font)
    head.set("font-size", "3.1")
    head.set("font-weight", "700")
    head.set("text-anchor", "start")
    head.text = caption

    nx, ny = north_in_plan()
    ccx, ccy = 291.2, 4.2
    tip = (ccx + nx * 2.05, ccy + ny * 2.05)
    tail = (ccx - nx * 1.55, ccy - ny * 1.55)
    px, py = -ny, nx
    compass = etree.fromstring(
        f'<g xmlns="{SVG}" id="compass" fill="none" stroke="#111111" font-family="{font}" font-size="2.1">'
        f'<circle cx="{ccx:.2f}" cy="{ccy:.2f}" r="2.35" fill="#ffffff" stroke-width="0.3"/>'
        f'<line x1="{tail[0]:.2f}" y1="{tail[1]:.2f}" x2="{tip[0]:.2f}" y2="{tip[1]:.2f}" stroke-width="0.45"/>'
        f'<polygon points="{tip[0]:.2f},{tip[1]:.2f} '
        f'{tip[0] - nx * 0.95 + px * 0.45:.2f},{tip[1] - ny * 0.95 + py * 0.45:.2f} '
        f'{tip[0] - nx * 0.95 - px * 0.45:.2f},{tip[1] - ny * 0.95 - py * 0.45:.2f}" fill="#111111" stroke="none"/>'
        f'<text x="{ccx - 4.3:.2f}" y="{ccy + 0.2:.2f}" fill="#111111" stroke="none" '
        f'text-anchor="end" dominant-baseline="middle">С</text></g>'
    )
    sheet.append(compass)

    span = 100 * s
    x10 = 289.5
    x_sb = x10 - span
    x5 = x_sb + span / 2
    bar = etree.fromstring(
        f'<g xmlns="{SVG}" id="scalebar" stroke="#111111" fill="#111111" stroke-width="0.35" '
        f'font-family="{font}" font-size="2.15">'
        f'<line x1="{x_sb:.2f}" y1="206.4" x2="{x10:.2f}" y2="206.4" stroke-width="0.5"/>'
        f'<line x1="{x_sb:.2f}" y1="205.2" x2="{x_sb:.2f}" y2="207.6"/>'
        f'<line x1="{x5:.2f}" y1="205.6" x2="{x5:.2f}" y2="207.2"/>'
        f'<line x1="{x10:.2f}" y1="205.2" x2="{x10:.2f}" y2="207.6"/>'
        f'<text x="{x_sb:.2f}" y="204.6" stroke="none" text-anchor="middle">0</text>'
        f'<text x="{x5:.2f}" y="204.6" stroke="none" text-anchor="middle">5 м</text>'
        f'<text x="{x10:.2f}" y="204.6" stroke="none" text-anchor="middle">10 м</text></g>'
    )
    sheet.append(bar)

    print(f"north plan {nx:.3f},{ny:.3f}  deg from up {math.degrees(math.atan2(nx, -ny)):.1f}")
    print(f"bounds {minx:.1f},{miny:.1f} .. {maxx:.1f},{maxy:.1f}")
    print(f"scale 1:{denom}  s={s:.4f}")
    out.write_bytes(etree.tostring(sheet, xml_declaration=True, encoding="UTF-8"))
    print("wrote", out)


if __name__ == "__main__":
    main()
