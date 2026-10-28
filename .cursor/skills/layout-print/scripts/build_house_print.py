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


def local_tag(el):
    tag = el.tag
    if not isinstance(tag, str):
        return ""
    return tag.split("}")[-1]


def local_points(el):
    tag = local_tag(el)
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


def drop_axis_marks(root):
    """Убрать кружки осей сечений (А/Б/В/Г и 1…6) — на печати они не нужны."""
    for el in list(root.iter()):
        parent = el.getparent()
        if parent is None:
            continue
        cls = set((el.get("class") or "").split())
        if cls & {"axis", "axisnum"}:
            parent.remove(el)
    _prune_empty_groups(root)


def drop_plan_dims(root):
    """Снести исходную размерную цепочку — её перечертим заново."""
    for el in list(root.iter()):
        parent = el.getparent()
        if parent is None:
            continue
        cls = set((el.get("class") or "").split())
        if cls & {"dim", "ext", "dimnum"}:
            # группу .dim снимаем целиком
            if "dim" in cls and local_tag(el) == "g":
                parent.remove(el)
            elif "dimnum" in cls:
                # текст внутри уже удалённой группы или одиночный
                node = el
                while node.getparent() is not None and local_tag(node.getparent()) == "g":
                    gp = node.getparent()
                    if gp.get("class") == "dim" or (gp.get("transform") or "").startswith("rotate"):
                        node = gp
                        continue
                    break
                p = node.getparent()
                if p is not None:
                    p.remove(node)
            else:
                parent.remove(el)
    _prune_empty_groups(root)


def _prune_empty_groups(root):
    changed = True
    while changed:
        changed = False
        for el in list(root.iter()):
            if local_tag(el) != "g":
                continue
            parent = el.getparent()
            if parent is None:
                continue
            kids = [c for c in el if isinstance(getattr(c, "tag", None), str)]
            if not kids:
                parent.remove(el)
                changed = True


def _fill_of(el) -> str:
    fill = (el.get("fill") or "").strip().lower()
    style = el.get("style") or ""
    found = re.search(r"fill:\s*([^;]+)", style)
    if found:
        fill = found.group(1).strip().lower()
    return fill


def _bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _room_label_pos(root, name: str):
    for el in root.iter():
        if local_tag(el) != "text":
            continue
        raw = "".join(el.itertext()).strip()
        if not raw.startswith(name):
            continue
        m = world_matrix(el)
        return apply(m, float(el.get("x") or 0), float(el.get("y") or 0))
    return None


def _roombox_near(root, name: str):
    label = _room_label_pos(root, name)
    if label is None:
        return None
    best = None
    for el in root.iter():
        if "roombox" not in (el.get("class") or "").split():
            continue
        pts = world_points(el)
        if len(pts) < 3:
            continue
        box = _bbox(pts)
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        dist = math.hypot(cx - label[0], cy - label[1])
        if best is None or dist < best[0]:
            best = (dist, box)
    return None if best is None else best[1]


def _dark_boxes(root):
    out = []
    for el in root.iter():
        if local_tag(el) not in ("rect", "polygon"):
            continue
        if _fill_of(el) not in ("#1a1a1a", "#000", "#000000"):
            continue
        pts = world_points(el)
        if len(pts) < 2:
            continue
        box = _bbox(pts)
        if box[2] - box[0] > 300 or box[3] - box[1] > 250:
            continue
        out.append(box)
    return out


def redraw_house_dims(root):
    """Чистые размеры: корпус, пролёты, крыльцо, терраса — выноски до углов объекта."""
    porch_rb = _roombox_near(root, "Крыльцо")
    terr_rb = _roombox_near(root, "Терраса")
    dark = _dark_boxes(root)
    if not dark:
        return False
    env = (
        min(b[0] for b in dark),
        min(b[1] for b in dark),
        max(b[2] for b in dark),
        max(b[3] for b in dark),
    )
    wall = 1.2  # от roombox до наружной грани
    # Юг крыльца / север террасы задают север и юг корпуса.
    body_n = (porch_rb[3] + wall) if porch_rb else env[1] + 24.5
    body_s = (terr_rb[1] - wall) if terr_rb else env[3] - 34.0
    mid = [b for b in dark if body_n + 2 < (b[1] + b[3]) / 2 < body_s - 2]
    if mid:
        body_w = min(b[0] for b in mid)
        body_e = max(b[2] for b in mid)
    else:
        body_w, body_e = env[0], env[2]

    if porch_rb:
        porch = (porch_rb[0] - wall, env[1], porch_rb[2] + wall, body_n)
    else:
        porch = None
    if terr_rb:
        south = [b for b in dark if (b[1] + b[3]) / 2 > body_s]
        terr_s = max(max(b[3] for b in south), terr_rb[3] + wall) if south else terr_rb[3] + wall
        terrace = (terr_rb[0] - wall, body_s, terr_rb[2] + wall, terr_s)
    else:
        terrace = None

    g = etree.SubElement(root, f"{{{SVG}}}g", id="print-house-dims")
    g.set("fill", "none")
    g.set("stroke", "#111111")
    g.set("stroke-width", "0.22")
    g.set("font-family", "DejaVu Sans, Liberation Sans, sans-serif")

    def fmt_m(units):
        return f"{units / 10:.2f}".replace(".", ",") + " м"

    def stroke(x1, y1, x2, y2, w=0.22):
        etree.SubElement(
            g, f"{{{SVG}}}line",
            x1=f"{x1:.2f}", y1=f"{y1:.2f}", x2=f"{x2:.2f}", y2=f"{y2:.2f}",
            **{"stroke-width": f"{w:.2f}"},
        )

    def tick(x, y, horizontal: bool):
        if horizontal:
            stroke(x, y - 1.1, x, y + 1.1, 0.28)
        else:
            stroke(x - 1.1, y, x + 1.1, y, 0.28)

    def label(x, y, text, rot=0):
        node = etree.SubElement(g, f"{{{SVG}}}g", transform=f"translate({x:.2f},{y:.2f}) rotate({rot})")
        etree.SubElement(
            node, f"{{{SVG}}}rect",
            x=f"{-len(text) * 1.15:.2f}", y="-1.5",
            width=f"{len(text) * 2.3:.2f}", height="3.0",
            fill="#ffffff", stroke="none",
        )
        t = etree.SubElement(
            node, f"{{{SVG}}}text", x="0", y="0", fill="#111111", stroke="none",
        )
        t.set("font-size", "2.4")
        t.set("text-anchor", "middle")
        t.set("dominant-baseline", "middle")
        t.text = text

    def dim_h(x0, x1, y, text, ext_y0, ext_y1, label_dy=-3.2):
        """Горизонтальный размер; выноски заходят на объект и доходят до линии."""
        def ey(obj_y):
            return obj_y + (1.2 if y < obj_y else -1.2)

        stroke(x0, ey(ext_y0), x0, y, 0.26)
        stroke(x1, ey(ext_y1), x1, y, 0.26)
        stroke(x0, y, x1, y, 0.32)
        tick(x0, y, True)
        tick(x1, y, True)
        label((x0 + x1) / 2, y + label_dy, text)

    def dim_v(y0, y1, x, text, ext_x0, ext_x1, label_dx=3.6):
        """Вертикальный размер; выноски заходят на объект и доходят до линии."""
        def ex(obj_x):
            return obj_x + (-1.2 if x > obj_x else 1.2)

        stroke(ex(ext_x0), y0, x, y0, 0.26)
        stroke(ex(ext_x1), y1, x, y1, 0.26)
        stroke(x, y0, x, y1, 0.32)
        tick(x, y0, False)
        tick(x, y1, False)
        label(x + label_dx, (y0 + y1) / 2, text, rot=-90)

    # Стопка: короткие размеры ближе к объекту, длинные — дальше (шаг GAP).
    GAP = 11.0

    def stack_h(items, anchor_y, outward):
        """items: (length, x0, x1, ext_y0, ext_y1, text). outward <0 — вверх листа."""
        items = sorted(items, key=lambda it: it[0])
        for i, (_ln, x0, x1, ey0, ey1, text) in enumerate(items):
            y = anchor_y + outward * GAP * (i + 1)
            label_dy = -3.2 if outward < 0 else 3.4
            dim_h(x0, x1, y, text, ey0, ey1, label_dy=label_dy)

    def stack_v(items, anchor_x, outward):
        """items: (length, y0, y1, ext_x0, ext_x1, text). outward >0 — вправо."""
        items = sorted(items, key=lambda it: it[0])
        for i, (_ln, y0, y1, ex0, ex1, text) in enumerate(items):
            x = anchor_x + outward * GAP * (i + 1)
            label_dx = 4.0 if outward > 0 else -4.0
            dim_v(y0, y1, x, text, ex0, ex1, label_dx=label_dx)

    spans = [40.9, 74.9, 79.5]
    span_sum = sum(spans)
    scale = (body_e - body_w) / span_sum if span_sum else 1.0
    breaks = [body_w]
    for sp in spans[:-1]:
        breaks.append(breaks[-1] + sp * scale)
    breaks.append(body_e)

    # Север: цепочка «отступ | крыльцо | отступ», дальше габарит корпуса.
    # Пролёты — на юг, иначе их выноски режут размер крыльца.
    clear_n = porch[1] if porch else body_n
    if porch:
        px0, py0, px1, py1 = porch
        north_y = clear_n - GAP
        # От края дома до начала крыльца — слева и справа на одной линии с шириной крыльца.
        if px0 - body_w > 2:
            dim_h(body_w, px0, north_y, fmt_m(px0 - body_w), body_n, py0, label_dy=-3.2)
        dim_h(px0, px1, north_y, fmt_m(px1 - px0), py0, py0, label_dy=-3.2)
        if body_e - px1 > 2:
            dim_h(px1, body_e, north_y, fmt_m(body_e - px1), py0, body_n, label_dy=-3.2)
        west_porch = (py1 - py0, py0, py1, px0, px0, fmt_m(py1 - py0))
        print(
            f"крыльцо {fmt_m(px1 - px0)} × {fmt_m(py1 - py0)}; "
            f"отступы {fmt_m(px0 - body_w)} / {fmt_m(body_e - px1)}"
        )
        overall_y = clear_n - GAP * 2
    else:
        west_porch = None
        overall_y = clear_n - GAP
    # Выноски габарита — от северной стены корпуса (не от крыльца), иначе висят в воздухе.
    dim_h(body_w, body_e, overall_y, fmt_m(body_e - body_w), body_n, body_n, label_dy=-3.2)

    east_stack = [(body_s - body_n, body_n, body_s, body_e, body_e, fmt_m(body_s - body_n))]

    if terrace:
        tx0, ty0, tx1, ty1 = terrace
        # Юг: одна цепочка «отступ | терраса | отступ» — без второй линии пролётов.
        south_y = ty1 + GAP
        if tx0 - body_w > 2:
            dim_h(body_w, tx0, south_y, fmt_m(tx0 - body_w), body_s, ty1, label_dy=3.4)
        dim_h(tx0, tx1, south_y, fmt_m(tx1 - tx0), ty1, ty1, label_dy=3.4)
        if body_e - tx1 > 2:
            dim_h(tx1, body_e, south_y, fmt_m(body_e - tx1), ty1, body_s, label_dy=3.4)
        stack_v(
            [(ty1 - ty0, ty0, ty1, tx0, tx0, fmt_m(ty1 - ty0))],
            tx0,
            -1.0,
        )
        print(
            f"терраса {fmt_m(tx1 - tx0)} × {fmt_m(ty1 - ty0)}; "
            f"отступы {fmt_m(tx0 - body_w)} / {fmt_m(body_e - tx1)}"
        )
    else:
        span_y = body_s + GAP
        for a, b in zip(breaks, breaks[1:]):
            dim_h(a, b, span_y, fmt_m(b - a), body_s, body_s, label_dy=3.4)

    if west_porch:
        stack_v([west_porch], west_porch[3], -1.0)
    stack_v(east_stack, body_e, 1.0)

    print(f"корпус {fmt_m(body_e - body_w)} × {fmt_m(body_s - body_n)}")
    return True


def drop_outside_house(root):
    prefixes = ("canopy", "drive", "gate", "car-")
    exact = {"page-bg", "text6", "sand_bitmap", "rect1904"}
    for el in list(root.iter()):
        parent = el.getparent()
        if parent is None:
            continue
        tag = local_tag(el)
        if not tag:
            parent.remove(el)
            continue
        eid = el.get("id") or ""
        if eid in exact or eid.startswith(prefixes):
            parent.remove(el)
            continue
        if tag == "image":
            parent.remove(el)
            continue
        if tag not in ("line", "rect", "polygon", "polyline", "circle"):
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
        if local_tag(el) != "text":
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
        if any(local_tag(a) == "defs" for a in el.iterancestors()):
            continue
        tag = local_tag(el)
        if not tag:
            continue
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
        tag = local_tag(el)
        if tag in ("namedview", "metadata", "title") or not tag:
            root.remove(el)
    drop_outside_house(root)
    drop_axis_marks(root)
    mark = re.search(r"variant-([a-z]\d*)", src.stem, re.I)
    variant = mark.group(1).upper() if mark else src.stem
    if variant == "A":
        drop_plan_dims(root)
    total = take_total_area(root)
    for el in root.iter():
        tag = local_tag(el)
        if not tag:
            continue
        recolor(el)
        if tag == "style" and el.text and re.search(r"(^|\n)\s*text\s*\{", el.text):
            el.text = re.sub(r"(^|\n)(\s*)text\s*\{", r"\1\2#drawing text {", el.text)
        # дерево мебели тоже в чёрно-белый лист
        for attr in ("style", "fill", "stroke"):
            val = el.get(attr)
            if val and "#6b3e24" in val.lower():
                el.set(attr, re.sub("#6b3e24", "#222222", val, flags=re.I))

    if variant == "A":
        redraw_house_dims(root)
    else:
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

    # У A план уже севером вверх; у Д-семейства север берём из привязки к участку.
    if variant == "A":
        nx, ny = 0.0, -1.0
    else:
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
