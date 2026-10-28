#!/usr/bin/env python3
"""Собрать монохромный лист А4 по 2D-схеме участка.

Исходный SVG не меняется. Геометрия читается из файла:
polygon16 (углы A–B–C–D по обходу), стены дома, canopy-eave, drive-apron, front-court.
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

from lxml import etree

SVG = "http://www.w3.org/2000/svg"
NS = {"svg": SVG}

LAT0 = 53.918361007
LON0 = 27.860727594
M_PER_DEG = 111320.0
CADASTRAL = "623683401601000218"
PLACE = "д. Глебковичи, ул. Абрикосовая, 22"
# Половина засечки. Выносная выступает за размерную на всю длину засечки.
TICK_ARM = 2.6
PAST_DIM = 2 * TICK_ARM

KEEP_FILL = {
    "#1a1a1a", "#000", "#000000", "#6b3e24", "#3a3028", "#241c16",
    "#2a2e34", "#222", "#222222", "#111", "#111111",
    "#e6e6e6", "#f4f4f4", "#ffffff", "#fff",
}
GROUND_IDS = {"blind-area", "front-court", "drive-apron"}
ROAD_IDS = {"polygon18", "polygon20"}
DROP_IDS = {"g1245", "g1263", "namedview1425", "g4440", "drive-strip"}


def local(tag: str) -> str:
    return tag.split("}")[-1] if isinstance(tag, str) else ""


def parse_points(s: str) -> list[tuple[float, float]]:
    nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", s or "")]
    return list(zip(nums[0::2], nums[1::2]))


def apply_transform(raw: str, x: float, y: float) -> tuple[float, float]:
    if not raw:
        return x, y
    for kind, args in re.findall(r"([a-zA-Z]+)\s*\(([^)]*)\)", raw):
        a = [float(v) for v in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", args)]
        kind = kind.lower()
        if kind == "matrix" and len(a) == 6:
            x, y = a[0] * x + a[2] * y + a[4], a[1] * x + a[3] * y + a[5]
        elif kind == "translate":
            x += a[0]
            y += a[1] if len(a) > 1 else 0.0
        elif kind == "scale":
            sx = a[0]
            sy = a[1] if len(a) > 1 else sx
            x, y = x * sx, y * sy
        elif kind == "rotate":
            ang = math.radians(a[0])
            ca, sa = math.cos(ang), math.sin(ang)
            if len(a) >= 3:
                cx, cy = a[1], a[2]
                x, y = x - cx, y - cy
                x, y = ca * x - sa * y, sa * x + ca * y
                x, y = x + cx, y + cy
            else:
                x, y = ca * x - sa * y, sa * x + ca * y
    return x, y


def site_point(el, x: float, y: float) -> tuple[float, float]:
    node = el
    while node is not None:
        x, y = apply_transform(node.get("transform"), x, y)
        node = node.getparent()
    return x, y


def style_map(el) -> dict[str, str]:
    out = {}
    raw = el.get("style") or ""
    for part in raw.split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def paint(el, key: str) -> str | None:
    if el.get(key):
        return el.get(key)
    return style_map(el).get(key)


def set_paint(el, key: str, value: str) -> None:
    if el.get(key) is not None or key not in style_map(el):
        el.set(key, value)
    sm = style_map(el)
    if key in sm or el.get("style"):
        sm[key] = value
        el.set("style", ";".join(f"{k}:{v}" for k, v in sm.items()))


def color_hex(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower()
    if v in ("none", "transparent"):
        return None
    m = re.match(r"#([0-9a-f]{3,8})", v)
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h[:6]


def luminance(hx: str) -> float:
    r, g, b = int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)
    return 0.299 * r + 0.587 * g + 0.114 * b


def num(el, key: str) -> float | None:
    raw = el.get(key)
    if raw is None or raw == "":
        return 0.0
    try:
        return float(raw)
    except ValueError:
        return None


def shape_points(el) -> list[tuple[float, float]]:
    tag = local(el.tag)
    if tag == "rect":
        x, y, w, h = num(el, "x"), num(el, "y"), num(el, "width"), num(el, "height")
        if None in (x, y, w, h):
            return []
        local_pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    elif tag in ("polygon", "polyline"):
        local_pts = parse_points(el.get("points"))
    elif tag == "path":
        local_pts = path_points(el.get("d") or "")
    else:
        return []
    return [site_point(el, x, y) for x, y in local_pts]


def path_points(d: str) -> list[tuple[float, float]]:
    pts = []
    cx = cy = 0.0
    sx = sy = 0.0
    for cmd, args in re.findall(r"([MmLlHhVvZz])([^MmLlHhVvZz]*)", d):
        nums = [float(v) for v in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", args)]
        if cmd in "Mm":
            i = 0
            while i + 1 < len(nums):
                if cmd == "M" or (cmd == "m" and not pts and i == 0):
                    cx, cy = nums[i], nums[i + 1]
                elif cmd == "m":
                    cx, cy = cx + nums[i], cy + nums[i + 1]
                else:
                    cx, cy = nums[i], nums[i + 1]
                if i == 0:
                    sx, sy = cx, cy
                pts.append((cx, cy))
                i += 2
        elif cmd in "Ll":
            i = 0
            while i + 1 < len(nums):
                if cmd == "l":
                    cx, cy = cx + nums[i], cy + nums[i + 1]
                else:
                    cx, cy = nums[i], nums[i + 1]
                pts.append((cx, cy))
                i += 2
        elif cmd in "Hh":
            for n in nums:
                cx = cx + n if cmd == "h" else n
                pts.append((cx, cy))
        elif cmd in "Vv":
            for n in nums:
                cy = cy + n if cmd == "v" else n
                pts.append((cx, cy))
        elif cmd in "Zz":
            cx, cy = sx, sy
            pts.append((cx, cy))
        else:
            return []
    return pts


def poly_area(pts: list[tuple[float, float]]) -> float:
    if len(pts) < 3:
        return 0.0
    s = 0.0
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        s += p[0] * q[1] - q[0] * p[1]
    return abs(s) / 2


def point_in(poly, x, y) -> bool:
    inside = False
    j = len(poly) - 1
    for i, p in enumerate(poly):
        q = poly[j]
        if ((p[1] > y) != (q[1] > y)) and (
            x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1] + 1e-12) + p[0]
        ):
            inside = not inside
        j = i
    return inside


def house_corners(root) -> list[tuple[float, float]]:
    house = root.find(".//svg:g[@id='house-v2']", NS)
    if house is None:
        raise SystemExit("в схеме нет группы house-v2")
    polys = []
    for el in house.iter():
        fill = color_hex(paint(el, "fill"))
        cls = el.get("class") or ""
        if fill not in ("#1a1a1a", "#000000") and "geom" not in cls.split():
            continue
        pts = shape_points(el)
        if len(pts) >= 3 and poly_area(pts) > 0.2:
            polys.append(pts)
    if not polys:
        raise SystemExit("не нашёл заливки стен #1a1a1a внутри house-v2")
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    cell = 0.45
    minx, maxx, miny, maxy = min(xs) - cell, max(xs) + cell, min(ys) - cell, max(ys) + cell
    nx = int((maxx - minx) / cell) + 2
    ny = int((maxy - miny) / cell) + 2
    occ: set[tuple[int, int]] = set()
    for poly in polys:
        pxs = [p[0] for p in poly]
        pys = [p[1] for p in poly]
        i0 = max(0, int((min(pxs) - minx) / cell) - 1)
        i1 = min(nx - 1, int((max(pxs) - minx) / cell) + 1)
        j0 = max(0, int((min(pys) - miny) / cell) - 1)
        j1 = min(ny - 1, int((max(pys) - miny) / cell) + 1)
        for j in range(j0, j1 + 1):
            y = miny + (j + 0.5) * cell
            for i in range(i0, i1 + 1):
                x = minx + (i + 0.5) * cell
                if point_in(poly, x, y):
                    occ.add((i, j))
    outside = flood_outside(occ, nx, ny)
    foot = {(i, j) for i in range(nx) for j in range(ny) if (i, j) not in outside}
    loop = boundary_loop(foot)
    if len(loop) < 4:
        raise SystemExit("контур дома не замкнулся")
    world = [(minx + i * cell, miny + j * cell) for i, j in loop]
    simple = rdp_closed(world, 3.2)
    corners = [simple[i] for i in range(len(simple)) if abs(turn(simple, i)) > 20]
    corners = drop_short(corners, 40)
    if len(corners) < 4:
        raise SystemExit(f"у контура дома {len(corners)} углов, жду хотя бы 4")
    return corners


def drop_short(pts, min_len):
    pts = list(pts)
    changed = True
    while changed and len(pts) > 4:
        changed = False
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            if hypot(sub(b, a)) < min_len:
                del pts[(i + 1) % len(pts)]
                changed = True
                break
    return pts


def flood_outside(occ: set[tuple[int, int]], nx: int, ny: int) -> set[tuple[int, int]]:
    from collections import deque

    seen: set[tuple[int, int]] = set()
    q: deque[tuple[int, int]] = deque()
    for i in range(nx):
        for j in (0, ny - 1):
            if (i, j) not in occ and (i, j) not in seen:
                seen.add((i, j))
                q.append((i, j))
    for j in range(ny):
        for i in (0, nx - 1):
            if (i, j) not in occ and (i, j) not in seen:
                seen.add((i, j))
                q.append((i, j))
    while q:
        i, j = q.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ni, nj = i + di, j + dj
            if 0 <= ni < nx and 0 <= nj < ny and (ni, nj) not in occ and (ni, nj) not in seen:
                seen.add((ni, nj))
                q.append((ni, nj))
    return seen


def boundary_loop(foot: set[tuple[int, int]]) -> list[tuple[int, int]]:
    succ: dict[tuple[int, int], tuple[int, int]] = {}

    def add(a, b):
        succ[a] = b

    for i, j in foot:
        if (i - 1, j) not in foot:
            add((i, j), (i, j + 1))
        if (i, j + 1) not in foot:
            add((i, j + 1), (i + 1, j + 1))
        if (i + 1, j) not in foot:
            add((i + 1, j + 1), (i + 1, j))
        if (i, j - 1) not in foot:
            add((i + 1, j), (i, j))
    unseen = set(succ)
    best = []
    best_area = -1.0
    while unseen:
        start = min(unseen)
        loop = [start]
        cur = succ[start]
        unseen.discard(start)
        guard = 0
        while cur != start and cur in succ and guard <= len(succ) + 2:
            loop.append(cur)
            unseen.discard(cur)
            cur = succ[cur]
            guard += 1
        area = 0.0
        for i, (x1, y1) in enumerate(loop):
            x2, y2 = loop[(i + 1) % len(loop)]
            area += x1 * y2 - x2 * y1
        if abs(area) > best_area and len(loop) >= 4:
            best_area = abs(area)
            best = loop
    return best


def rdp_closed(pts, eps):
    i0 = min(range(len(pts)), key=lambda i: (pts[i][1], pts[i][0]))
    i1 = max(range(len(pts)), key=lambda i: hypot(sub(pts[i], pts[i0])))

    def chain(i, j):
        out = []
        k = i
        while True:
            out.append(pts[k])
            if k == j:
                break
            k = (k + 1) % len(pts)
        return out

    merged = rdp(chain(i0, i1), eps)[:-1] + rdp(chain(i1, i0), eps)[:-1]
    kept = []
    n = len(merged)
    for i, p in enumerate(merged):
        a, b = merged[i - 1], merged[(i + 1) % n]
        length = hypot(sub(b, a)) or 1
        area = abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]))
        if area / length > 1.2:
            kept.append(p)
    return kept or merged


def rdp(pts, eps):
    if len(pts) < 3:
        return list(pts)
    keep = [pts[0]]

    def rec(a, b):
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1
        best, bestd = -1, 0.0
        for i in range(a + 1, b):
            px, py = pts[i]
            dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if dist > bestd:
                bestd, best = dist, i
        if bestd > eps and best >= 0:
            rec(a, best)
            keep.append(pts[best])
            rec(best, b)

    rec(0, len(pts) - 1)
    keep.append(pts[-1])
    return keep


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def hypot(v) -> float:
    return math.hypot(v[0], v[1])


def turn(pts, i) -> float:
    a, b = pts[i - 1], pts[(i + 1) % len(pts)]
    p = pts[i]
    u, v = sub(p, a), sub(b, p)
    return math.degrees(math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]))


def restyle(root) -> None:
    style = root.find(".//svg:g[@id='house-v2']/svg:style", NS)
    if style is not None and style.text and "display: none" not in style.text:
        style.text += "\n#house-v2 .dim, #house-v2 .ext, #house-v2 .dimnum { display: none; }\n"
    for el in list(root.iter()):
        if el.get("id") in DROP_IDS or (el.get("id") or "").startswith("car-"):
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)
    for el in list(root.iter()):
        if local(el.tag) != "text":
            continue
        if el.get("id") in {f"text14{n}" for n in range(11, 23)}:
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)
            continue
        raw = "".join(el.itertext()).strip()
        if re.fullmatch(r"\d+(?:[.,]\d+)?\s*м", raw):
            node = el
            inside = False
            while node is not None:
                if node.get("id") == "house-v2":
                    inside = True
                    break
                node = node.getparent()
            if not inside and el.getparent() is not None:
                el.getparent().remove(el)

    for el in root.iter():
        eid = el.get("id") or ""
        if eid == "polygon14":
            set_paint(el, "fill", "#ffffff")
            set_paint(el, "stroke", "none")
        elif eid == "polygon16":
            set_paint(el, "fill", "#ffffff")
            set_paint(el, "stroke", "#111111")
            set_paint(el, "stroke-width", "1.15")
        elif eid in ROAD_IDS:
            set_paint(el, "fill", "#f3f3f3")
            set_paint(el, "stroke", "#bdbdbd")
            set_paint(el, "stroke-width", "0.3")
        elif eid in GROUND_IDS:
            set_paint(el, "fill", "#ffffff")
            set_paint(el, "stroke", "#222222")
            set_paint(el, "stroke-width", "0.3")
        elif eid in ("canopy-eave", "house-eave", "canopy-ridge"):
            set_paint(el, "stroke", "#111111")
            set_paint(el, "fill", "none")
        elif eid == "p-polygon1114":
            set_paint(el, "fill", "#ffffff")
        else:
            fill = color_hex(paint(el, "fill"))
            if not fill or fill in KEEP_FILL:
                stroke = color_hex(paint(el, "stroke"))
                if stroke and stroke not in KEEP_FILL | {"#8a8a8a", "#333333", "#333", "#bdbdbd"}:
                    if luminance(stroke) < 80 or luminance(stroke) > 150:
                        set_paint(el, "stroke", "#333333")
                continue
            pts = shape_points(el)
            if poly_area(pts) >= 800 and luminance(fill) > 70:
                set_paint(el, "fill", "#ffffff")


def edge_of(p0, p1, center):
    u = sub(p1, p0)
    L = hypot(u)
    u = (u[0] / L, u[1] / L)
    left = (-u[1], u[0])
    if dot(left, sub(center, p0)) < 0:
        out = left
    else:
        out = (-left[0], -left[1])
    return {"p0": p0, "p1": p1, "u": u, "L": L, "out": out}


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def mul(v, s):
    return (v[0] * s, v[1] * s)


def proj(p, e):
    t = dot(sub(p, e["p0"]), e["u"])
    on = -0.8 <= t <= e["L"] + 0.8
    tc = max(0.0, min(e["L"], t))
    return tc, hypot(sub(p, (e["p0"][0] + e["u"][0] * tc, e["p0"][1] + e["u"][1] * tc))), on


def at(e, t, off=0.0):
    p = add(e["p0"], mul(e["u"], t))
    if off:
        p = add(p, mul(e["out"], off))
    return p


def text_angle(u) -> float:
    ang = math.degrees(math.atan2(u[1], u[0]))
    if ang > 90:
        ang -= 180
    elif ang < -90:
        ang += 180
    return ang


def unique_corners(pts: list[tuple[float, float]], tol: float = 1.2) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for p in pts:
        if any(hypot(sub(p, q)) < tol for q in out):
            continue
        out.append(p)
    return out


def yard_buildings(root) -> list[dict]:
    """Гараж, хозблок и баня со схемы A (и похожих): углы наружного контура."""
    found: list[dict] = []

    def take(el, name: str) -> None:
        if el is None:
            return
        pts = unique_corners(shape_points(el))
        # замыкающая точка полилинии
        if len(pts) >= 2 and hypot(sub(pts[0], pts[-1])) < 1.5:
            pts = pts[:-1]
        if len(pts) >= 3:
            found.append({"name": name, "corners": pts})

    take(root.find(".//svg:polyline[@id='polyline934']", NS), "garage")
    # Пол бани = наружные стены; отмостка path1129 шире на 1 м.
    take(root.find(".//svg:polygon[@id='polygon1137']", NS), "bath")
    if not any(b["name"] == "bath" for b in found):
        path = root.find(".//svg:path[@id='path1129']", NS)
        if path is not None:
            pts = shape_points(path)
            # первый контур до возврата к старту
            if len(pts) >= 4:
                ring = pts[:4]
                found.append({"name": "bath", "corners": unique_corners(ring)})
    return found


def build_dims(plot, house, canopy, apron, gate_posts=None, yard=None, setback_buildings=None):
    center = (sum(p[0] for p in plot) / 4, sum(p[1] for p in plot) / 4)
    a, b, c, d = plot
    edges = [edge_of(a, b, center), edge_of(b, c, center), edge_of(c, d, center), edge_of(a, d, center)]
    clear = 0.0
    if apron:
        clear = max(dot(sub(p, edges[3]["p0"]), edges[3]["out"]) for p in apron)
    base = [28.0, 28.0, 28.0, max(32.0, clear + 16.0)]
    objs = [{"name": f"H{i}", "p": p, "kind": "house"} for i, p in enumerate(house)]
    objs += [{"name": f"N{i}", "p": p, "kind": "canopy"} for i, p in enumerate(canopy)]
    # Гараж/баню в цепочку по забору не ставим — только отступы span_dim ниже,
    # иначе куча выносок без нормальной размерной линии.
    yard = yard or []
    parts: list[str] = []
    bbox: list[tuple[float, float]] = []
    segs: list[tuple[tuple[float, float], tuple[float, float]]] = []

    def track(p):
        bbox.append(p)

    def line(p, q, w):
        parts.append(
            f'<line x1="{p[0]:.2f}" y1="{p[1]:.2f}" x2="{q[0]:.2f}" y2="{q[1]:.2f}" stroke-width="{w:.2f}"/>'
        )
        track(p)
        track(q)
        segs.append((p, q))

    def tick(p, u):
        ang = math.atan2(u[1], u[0]) + math.pi / 4
        dlt = (math.cos(ang) * TICK_ARM, math.sin(ang) * TICK_ARM)
        line((p[0] - dlt[0], p[1] - dlt[1]), (p[0] + dlt[0], p[1] + dlt[1]), 1.05)

    def label(center_p, u, out, text, size=8.4):
        ang = text_angle(u)
        w = size * (0.54 * len(text) + 0.5)
        h = size * 1.18
        gap = h * 0.55 + 1.2
        cpos = add(center_p, mul(out, gap))
        parts.append(
            f'<g transform="translate({cpos[0]:.2f},{cpos[1]:.2f}) rotate({ang:.2f})">'
            f'<rect x="{-w/2:.2f}" y="{-h/2:.2f}" width="{w:.2f}" height="{h:.2f}" fill="#ffffff" stroke="none"/>'
            f'<text x="0" y="0" font-size="{size:.2f}" fill="#111111" stroke="none" text-anchor="middle" dominant-baseline="middle">{text}</text></g>'
        )
        rad = math.radians(ang)
        ca, sa = math.cos(rad), math.sin(rad)
        corners = []
        for sx in (-w / 2, w / 2):
            for sy in (-h / 2, h / 2):
                corners.append((cpos[0] + sx * ca - sy * sa, cpos[1] + sx * sa + sy * ca))
                track(corners[-1])
        order = (0, 1, 3, 2)
        ring = [corners[i] for i in order]
        for i in range(4):
            segs.append((ring[i], ring[(i + 1) % 4]))

    def fmt(units):
        return f"{units / 10:.2f}".replace(".", ",") + " м"

    def marks_of(e, tmin, tmax):
        marks = [0.0]
        if tmin > 6 and abs(tmin - marks[-1]) > 6:
            marks.append(tmin)
        if abs(tmax - marks[-1]) > 6 and e["L"] - tmax > 6:
            marks.append(tmax)
        if e["L"] - marks[-1] > 6:
            marks.append(e["L"])
        else:
            marks[-1] = e["L"]
        return marks

    report = []
    for ei, e in enumerate(edges):
        ts = [proj(p, e)[0] for p in house if proj(p, e)[2]]
        tmin, tmax = min(ts), max(ts)
        marks = marks_of(e, tmin, tmax)
        interior = [m for m in marks if 4 < m < e["L"] - 4]
        attached = {m: [] for m in interior}
        loose = []
        for o in objs:
            t, dist, on = proj(o["p"], e)
            if not on or t < 6 or t > e["L"] - 6:
                continue
            near = min(interior, key=lambda m: abs(t - m)) if interior else None
            if near is not None and abs(t - near) <= 7:
                attached[near].append({"o": o, "t": t, "d": dist})
            elif dist <= 165:
                loose.append({"o": o, "t": t, "d": dist})
        loose.sort(key=lambda item: item["t"])
        clusters = []
        for item in loose:
            if clusters and abs(item["t"] - clusters[-1]["t"]) <= 6:
                clusters[-1]["items"].append(item)
                clusters[-1]["t"] = sum(x["t"] for x in clusters[-1]["items"]) / len(clusters[-1]["items"])
            else:
                clusters.append({"t": item["t"], "items": [item]})
        def span_of(t):
            # Число — от ближнего конца стороны. При равенстве побеждает запад или север:
            # начало AB, BC и AD; на CD (восток в начале) — конец, угол D.
            to_start = t
            to_end = e["L"] - t
            use_start = to_start < to_end if ei == 2 else to_start <= to_end
            if use_start:
                return 0.0, t, t
            return t, e["L"], to_end

        clusters.sort(key=lambda cl: -span_of(cl["t"])[2])
        off0 = base[ei]
        gap = 17.0
        gate_ts = []
        if gate_posts:
            got = []
            for gp in gate_posts:
                gt, gd, gon = proj(gp, e)
                if gon and gd < 15:
                    got.append((gt, gp))
            if len(got) == len(gate_posts) and max(t for t, _ in got) - min(t for t, _ in got) > 6:
                gate_ts = sorted(got, key=lambda item: item[0])
        # Только кластеры с подписью — иначе выноска торчит без размерной.
        labeled = []
        for cl in clusters:
            a, b, dist = span_of(cl["t"])
            if dist > 8:
                labeled.append((cl, a, b, dist))
        n_extra = len(labeled) + (1 if gate_ts else 0)
        outer_out = off0 + gap * n_extra
        # Стопка всегда снаружи границы. Внутрь газона линии не ставятся.
        sign, off0, outer = 1.0, off0, outer_out
        text_n = mul(e["out"], -1.0)

        def soff(off):
            return sign * off

        # Выноска от угла объекта до своей размерной (без хвоста за линию).
        for m, cs in attached.items():
            if not cs:
                continue
            for item in cs:
                line(item["o"]["p"], at(e, item["t"], soff(off0)), 0.75)
        start_reach = off0
        end_reach = off0
        for i, (cl, a, _b, _dist) in enumerate(labeled):
            off = off0 + gap * (i + 1)
            if a == 0.0:
                start_reach = off
            else:
                end_reach = off
        if gate_ts:
            start_reach = outer
        for i, (cl, a, b, dist) in enumerate(labeled):
            off = off0 + gap * (i + 1)
            for item in cl["items"]:
                line(item["o"]["p"], at(e, item["t"], soff(off)), 0.75)
            line(at(e, a, soff(off)), at(e, b, soff(off)), 0.6)
            tick(at(e, a, soff(off)), e["u"])
            tick(at(e, b, soff(off)), e["u"])
            label(at(e, (a + b) / 2, soff(off)), e["u"], text_n, fmt(dist))
            end_name = "начала" if a == 0.0 else "конца"
            report.append(
                f"{ei} +{dist/10:.2f}м от {end_name} "
                + ",".join(it["o"]["name"] for it in cl["items"])
            )
        # Углы участка — сквозь стопку до крайней размерной, без торчащего хвоста.
        line(at(e, 0, 0), at(e, 0, soff(start_reach)), 0.6)
        line(at(e, e["L"], 0), at(e, e["L"], soff(end_reach)), 0.6)
        line(at(e, 0, soff(off0)), at(e, e["L"], soff(off0)), 0.6)
        for m in marks:
            tick(at(e, m, soff(off0)), e["u"])
        for p0, p1 in zip(marks, marks[1:]):
            if p1 - p0 >= 12:
                label(at(e, (p0 + p1) / 2, soff(off0)), e["u"], text_n, fmt(p1 - p0))
        if gate_ts:
            off = outer
            last = gate_ts[-1][0]
            line(at(e, 0, soff(off)), at(e, last, soff(off)), 0.6)
            ticks = [0.0] + [t for t, _ in gate_ts]
            for t in ticks:
                tick(at(e, t, soff(off)), e["u"])
            for p0, p1 in zip(ticks, ticks[1:]):
                if p1 - p0 < 8:
                    continue
                text = fmt(p1 - p0)
                width = 8.4 * (0.54 * len(text) + 0.5)
                mid = (p0 + p1) / 2
                # Калитка короче подписи: сдвинуть текст за конец отрезка, чтобы не наехать на ворота.
                if p1 - p0 < width:
                    mid = p1 + width / 2 + 2.0
                label(at(e, mid, soff(off)), e["u"], text_n, text)
            for t, gp in gate_ts:
                line(gp, at(e, t, soff(off)), 0.6)
            report.append("ворота/калитка " + " ".join(f"{t/10:.2f}" for t, _ in gate_ts))
    # Отступы от забора до стен и просветы между постройками — как подписи на 3D.
    if setback_buildings is not None:
        buildings = list(setback_buildings)
    else:
        buildings = [{"name": "house", "corners": house}]
        if canopy:
            buildings.append({"name": "canopy", "corners": canopy})
        buildings.extend(yard)

    def side_vec(p0, p1):
        dlt = sub(p1, p0)
        L = hypot(dlt) or 1.0
        return (-dlt[1] / L, dlt[0] / L)

    def span_dim(p0, p1, text, side=1.0, gap=5.5):
        if hypot(sub(p1, p0)) < 8:
            return
        n = side_vec(p0, p1)
        n = mul(n, side)
        a0 = add(p0, mul(n, gap))
        a1 = add(p1, mul(n, gap))
        line(p0, a0, 0.55)
        line(p1, a1, 0.55)
        line(a0, a1, 0.7)
        tick(a0, sub(p1, p0))
        tick(a1, sub(p1, p0))
        mid = mul(add(a0, a1), 0.5)
        u = sub(p1, p0)
        Lu = hypot(u) or 1.0
        label(mid, (u[0] / Lu, u[1] / Lu), n, text, size=7.6)

    # К каждой постройке — отступы только до двух ближайших заборов.
    house_like = {"house", "А", "A", "Д4", "D4"}
    for bld in buildings:
        ranked = []
        for ei, e in enumerate(edges):
            hits = []
            for p in bld["corners"]:
                t, dist, on = proj(p, e)
                if not on or dist < 8 or dist > 200:
                    continue
                if dot(sub(p, e["p0"]), e["out"]) > 0:
                    continue
                hits.append((dist, t, p))
            if not hits:
                continue
            hits.sort(key=lambda item: item[0])
            near = [h for h in hits if h[0] - hits[0][0] <= 4.0]
            dist, t, p = min(near, key=lambda item: abs(item[1] - sum(h[1] for h in near) / len(near)))
            ranked.append((dist, ei, t, p))
        ranked.sort(key=lambda item: item[0])
        keep_n = 4 if bld["name"] in house_like else 2
        for dist, ei, t, p in ranked[:keep_n]:
            foot = at(edges[ei], t, 0)
            text = fmt(dist)
            if bld["name"] in ("А", "A", "Д4", "D4"):
                text = f"{bld['name']} {text}"
            span_dim(p, foot, text, side=1.0 if ei in (0, 3) else -1.0, gap=4.0)
            report.append(f"отступ {bld['name']}→ребро{ei} {dist/10:.2f}м")

    def nearest_pair(ca, cb):
        best = None
        for p in ca:
            for q in cb:
                d = hypot(sub(p, q))
                if best is None or d < best[0]:
                    best = (d, p, q)
        return best

    by_name = {b["name"]: b["corners"] for b in buildings}
    bath = by_name.get("bath")
    for hname in ("house", "А", "A"):
        if hname in by_name and bath:
            pair = nearest_pair(by_name[hname], bath)
            if pair and 20 < pair[0] < 250:
                d, p, q = pair
                span_dim(p, q, fmt(d), side=1.0, gap=5.0)
                report.append(f"{hname}→баня {d/10:.2f}м")
            break

    for p in plot:
        parts.append(
            f'<circle cx="{p[0]:.2f}" cy="{p[1]:.2f}" r="2.6" fill="#111111" stroke="#ffffff" stroke-width="0.8"/>'
        )
        track(p)
    group = (
        '<g id="print-dims" fill="none" stroke="#111111" stroke-width="0.55" '
        'font-family="DejaVu Sans, Liberation Sans, sans-serif">' + "".join(parts) + "</g>"
    )
    return group, bbox, report, segs


def geo_of(plot):
    cx = sum(p[0] for p in plot) / len(plot)
    cy = sum(p[1] for p in plot) / len(plot)
    cos = math.cos(math.radians(LAT0))
    out = []
    for x, y in plot:
        north = (cy - y) * 0.1
        east = (x - cx) * 0.1
        lat = LAT0 + north / M_PER_DEG
        lon = LON0 + east / (M_PER_DEG * cos)
        out.append((lat, lon))
    return out


def variant_name(path: Path) -> str:
    m = re.search(r"variant-([a-z0-9]+)", path.stem, re.I)
    return m.group(1).upper() if m else path.stem


def _cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def segs_cross(a, b, c, d):
    d1, d2 = _cross(c, d, a), _cross(c, d, b)
    d3, d4 = _cross(a, b, c), _cross(a, b, d)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and d1 != 0 and d2 != 0


def box_hits_seg(box, a, b):
    x0, y0, x1, y1 = box
    if x0 <= a[0] <= x1 and y0 <= a[1] <= y1:
        return True
    if x0 <= b[0] <= x1 and y0 <= b[1] <= y1:
        return True
    corners = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
    return any(segs_cross(a, b, corners[i], corners[(i + 1) % 4]) for i in range(4))


def boxes_overlap(a, b, gap=1.0):
    return not (a[2] + gap < b[0] or b[2] + gap < a[0] or a[3] + gap < b[1] or b[3] + gap < a[1])


def leader_blocked(p, q, segs, tol=2.4):
    for a, b in segs:
        if not segs_cross(p, q, a, b):
            continue
        # Пересечение у самой точки угла — это граница, на которой точка стоит.
        denom = (p[0] - q[0]) * (a[1] - b[1]) - (p[1] - q[1]) * (a[0] - b[0])
        if abs(denom) < 1e-9:
            continue
        t = ((p[0] - a[0]) * (a[1] - b[1]) - (p[1] - a[1]) * (a[0] - b[0])) / denom
        hit = (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))
        if math.hypot(hit[0] - p[0], hit[1] - p[1]) > tol:
            return True
    return False


def sandwiched(box, segs, reach=7.0):
    """Текст между двумя линиями с двух сторон: это стопка размеров, не пустое место."""
    bands = (
        (box[0], box[1] - reach, box[2], box[1] - 0.2),
        (box[0], box[3] + 0.2, box[2], box[3] + reach),
        (box[0] - reach, box[1], box[0] - 0.2, box[3]),
        (box[2] + 0.2, box[1], box[2] + reach, box[3]),
    )
    hit = [any(box_hits_seg(band, a, b) for a, b in segs) for band in bands]
    return (hit[0] and hit[1]) or (hit[2] and hit[3])


def place_callout(pg, width, height, segs, occupied):
    """Якорь подписи в ближайшем прямоугольнике, который не задевает линии, постройки и чужой текст."""
    best = None
    best_score = 1e18
    for dist in (10, 14, 18, 24, 32, 42, 54, 68, 84):
        for k in range(32):
            ang = k * math.tau / 32
            ux, uy = math.cos(ang), math.sin(ang)
            anchor = "start" if ux >= 0 else "end"
            x = pg[0] + ux * dist
            ty = pg[1] + uy * dist
            if anchor == "start":
                box = (x - 0.6, ty - height / 2, x + width, ty + height / 2)
            else:
                box = (x - width, ty - height / 2, x + 0.6, ty + height / 2)
            if box[0] < 5 or box[2] > 292 or box[1] < 22 or box[3] > 197.2:
                continue
            if any(boxes_overlap(box, o) for o in occupied):
                continue
            pad = (box[0] - 2.0, box[1] - 2.0, box[2] + 2.0, box[3] + 2.0)
            hits = sum(1 for a, b in segs if box_hits_seg(pad, a, b))
            attach = (x, ty)
            blocked = leader_blocked(pg, attach, segs)
            # Пересечение текста с линией важнее длины сноски.
            score = dist + hits * 1000 + (500 if sandwiched(box, segs) else 0) + (25 if blocked else 0)
            if score < best_score:
                best_score = score
                best = (x, ty, anchor, box, hits, blocked)
    if best is None:
        box = (pg[0] + 8, pg[1] + 4, pg[0] + 8 + width, pg[1] + 4 + height)
        return (pg[0] + 8, pg[1] + height / 2, "start", box, 99, True)
    return best


def page_obstacle_box(pts, to_page, pad=1.5):
    """Рамка постройки на листе — подпись координат внутрь не ставить."""
    if len(pts) < 3:
        return None
    pages = [to_page(p) for p in pts]
    xs = [p[0] for p in pages]
    ys = [p[1] for p in pages]
    return (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)


def place_compass(box, page, segs):
    """Центр компаса у края уже занятого прямоугольника, в зазоре без линий."""
    bw, bh = 24.0, 24.0
    x0, y0, x1, y1 = page
    bx0, by0, bx1, by1 = box
    gaps = {
        "right": x1 - bx1,
        "left": bx0 - x0,
        "bottom": y1 - by1,
        "top": by0 - y0,
    }
    order = sorted(gaps, key=gaps.get, reverse=True)
    best = None
    best_score = 1e18
    for side in order:
        for slide in (0.15, 0.4, 0.65, 0.85):
            if side == "right":
                cx, cy = bx1 + 2 + bw / 2, by0 + slide * (by1 - by0)
            elif side == "left":
                cx, cy = bx0 - 2 - bw / 2, by0 + slide * (by1 - by0)
            elif side == "bottom":
                cy, cx = by1 + 2 + bh / 2, bx0 + slide * (bx1 - bx0)
            else:
                cy, cx = by0 - 2 - bh / 2, bx0 + slide * (bx1 - bx0)
            cx = min(max(cx, x0 + bw / 2), x1 - bw / 2)
            cy = min(max(cy, y0 + bh / 2), y1 - bh / 2)
            comp = (cx - 12.2, cy - 12.2, cx + 12.2, cy + 12.2)
            hits = sum(1 for a, b in segs if box_hits_seg(comp, a, b))
            score = hits * 100 + (0 if side == order[0] else 5) + abs(slide - 0.15) * 8
            if score < best_score:
                best_score = score
                best = (cx, cy, comp)
            if hits == 0 and side == order[0]:
                return cx, cy, comp
    return best


def sheet(drawing_xml: str, plot, bbox, geos, variant: str, segs, obstacles=None) -> str:
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    pad = 4
    minx, maxx = min(xs) - pad, max(xs) + pad
    miny, maxy = min(ys) - pad, max(ys) + pad
    x0, x1, y0, y1 = 6.0, 291.0, 21.2, 197.8
    s = min((x1 - x0) / (maxx - minx), (y1 - y0) / (maxy - miny))
    ox = x0 + ((x1 - x0) - s * (maxx - minx)) / 2
    oy = y0 + ((y1 - y0) - s * (maxy - miny)) / 2
    denom = int(round(100 / s))

    def to_page(p):
        return ox + s * (p[0] - minx), oy + s * (p[1] - miny)

    content = (ox, oy, ox + s * (maxx - minx), oy + s * (maxy - miny))
    page_segs = []
    for a, b in segs:
        page_segs.append((to_page(a), to_page(b)))
    ccx, ccy, comp = place_compass(content, (x0, y0, x1, y1), page_segs)
    names = "ABCD"
    chunks = []
    # Компас + дома/баня/гараж — подписи углов сюда не класть.
    occupied = [comp]
    for ring in obstacles or []:
        box = page_obstacle_box(ring, to_page)
        if box is not None:
            occupied.append(box)
    for i, p in enumerate(plot):
        pg = to_page(p)
        lat = f"{geos[i][0]:.6f}° с.ш."
        lon = f"{geos[i][1]:.6f}° в.д."
        letter = names[i]
        placed = place_callout(pg, 24.0, 11.2, page_segs, occupied)
        x, ty, anchor, box = placed[0], placed[1], placed[2], placed[3]
        occupied.append(box)
        ys = [ty - 3.4, ty, ty + 3.2]
        y_mid = (ys[0] + ys[-1]) / 2
        attach = x + 0.4 if anchor == "end" else x - 0.4
        chunks.append(
            f'<line x1="{pg[0]:.2f}" y1="{pg[1]:.2f}" x2="{attach:.2f}" y2="{y_mid:.2f}" '
            f'stroke="#111111" stroke-width="0.28" fill="none"/>'
            f'<circle cx="{pg[0]:.2f}" cy="{pg[1]:.2f}" r="0.75" fill="#111111" stroke="none"/>'
            f'<text x="{x:.2f}" y="{ys[0]:.2f}" font-size="3.4" font-weight="700" text-anchor="{anchor}" dominant-baseline="middle">{letter}</text>'
            f'<text x="{x:.2f}" y="{ys[1]:.2f}" font-size="2.3" text-anchor="{anchor}" dominant-baseline="middle">{lat}</text>'
            f'<text x="{x:.2f}" y="{ys[2]:.2f}" font-size="2.3" text-anchor="{anchor}" dominant-baseline="middle">{lon}</text>'
        )
        print(f"  подпись {letter} x={x:.1f} y={ty:.1f} {anchor} пересечений={placed[4]} сноска_через_линию={placed[5]}")
    area_m2 = poly_area(plot) / 100
    area = f"{area_m2 / 10000:.4f}".replace(".", ",")
    span = 100 * s
    x_sb = 188.0
    if x_sb + span > 292:
        x_sb = 292 - span
    x5, x10 = x_sb + span / 2, x_sb + span
    tf = f"translate({ox:.3f},{oy:.3f}) scale({s:.6f}) translate({-minx:.3f},{-miny:.3f})"
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="{SVG}" width="297mm" height="210mm" viewBox="0 0 297 210" version="1.1">
<title>{PLACE}, вариант {variant}, печать А4</title>
<rect width="297" height="210" fill="#ffffff"/>
<g id="drawing" transform="{tf}">
<title id="title2">Вариант {variant}. Дом на участке, масштаб 1:{denom}</title>
{drawing_xml}
</g>
<rect id="margin-top" x="0" y="0" width="297" height="20.6" fill="#ffffff"/>
<rect id="margin-bottom" x="0" y="199.4" width="297" height="10.6" fill="#ffffff"/>
<g id="corner-geo" fill="#111111" font-family="DejaVu Sans, Liberation Sans, sans-serif">{"".join(chunks)}</g>
<g id="sheet-title" fill="#111111" font-family="DejaVu Sans, Liberation Sans, sans-serif">
<text x="8" y="6.2" font-size="3.2" font-weight="700" text-anchor="start">{PLACE}  ·  вариант {variant}</text>
<text x="8" y="10.2" font-size="2.25" text-anchor="start">Кадастровый номер {CADASTRAL}  ·  {area} га  ·  север листа — вверх</text>
<text x="8" y="14.0" font-size="2.1" text-anchor="start">Печать А4 альбомная  ·  масштаб 1:{denom}  ·  WGS-84</text>
<text x="8" y="17.6" font-size="2.0" text-anchor="start">Координаты углов от точки 53,918361° с.ш., 27,860728° в.д. на центре контура. Это не каталог НКЗ.</text>
</g>
<text x="8" y="206.2" font-size="2.05" fill="#111111" font-family="DejaVu Sans, Liberation Sans, sans-serif">Габарит дома — длины отрезков. Отдельные линии от ближнего конца стороны. Ворота и калитка — своя линия. Выносные от углов.</text>
<g id="compass" fill="none" stroke="#111111" stroke-width="0.35">
<circle cx="{ccx:.2f}" cy="{ccy:.2f}" r="7.2" fill="#ffffff"/>
<line x1="{ccx:.2f}" y1="{ccy + 6:.2f}" x2="{ccx:.2f}" y2="{ccy - 6.8:.2f}" stroke-width="0.45"/>
<polygon fill="#111111" stroke="none" points="{ccx:.2f},{ccy - 7.4:.2f} {ccx - 1.5:.2f},{ccy - 4.8:.2f} {ccx + 1.5:.2f},{ccy - 4.8:.2f}"/>
<text x="{ccx:.2f}" y="{ccy - 9.8:.2f}" fill="#111111" stroke="none" font-size="2.8" font-weight="700" text-anchor="middle" dominant-baseline="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif">С</text>
<text x="{ccx:.2f}" y="{ccy + 10.2:.2f}" fill="#111111" stroke="none" font-size="2.8" font-weight="700" text-anchor="middle" dominant-baseline="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif">Ю</text>
<text x="{ccx - 9.4:.2f}" y="{ccy + 0.4:.2f}" fill="#111111" stroke="none" font-size="2.8" font-weight="700" text-anchor="end" dominant-baseline="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif">З</text>
<text x="{ccx + 9.4:.2f}" y="{ccy + 0.4:.2f}" fill="#111111" stroke="none" font-size="2.8" font-weight="700" text-anchor="start" dominant-baseline="middle" font-family="DejaVu Sans, Liberation Sans, sans-serif">В</text>
</g>
<g id="scalebar" stroke="#111111" fill="#111111" stroke-width="0.35" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="2.3">
<line x1="{x_sb:.2f}" y1="204.5" x2="{x10:.2f}" y2="204.5" stroke-width="0.55"/>
<line x1="{x_sb:.2f}" y1="203.1" x2="{x_sb:.2f}" y2="205.9"/>
<line x1="{x5:.2f}" y1="203.6" x2="{x5:.2f}" y2="205.4"/>
<line x1="{x10:.2f}" y1="203.1" x2="{x10:.2f}" y2="205.9"/>
<text x="{x_sb:.2f}" y="201.8" stroke="none" text-anchor="middle">0</text>
<text x="{x5:.2f}" y="201.8" stroke="none" text-anchor="middle">5 м</text>
<text x="{x10:.2f}" y="201.8" stroke="none" text-anchor="middle">10 м</text>
</g>
</svg>
'''


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("нужен путь к SVG схемы")
    src = Path(sys.argv[1]).resolve()
    if src.stem.endswith("-print"):
        raise SystemExit("на вход нужен исходный чертёж, не файл печати")
    out = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else src.with_name(src.stem + "-print.svg")
    root = etree.parse(str(src)).getroot()
    plot_el = root.find(".//svg:polygon[@id='polygon16']", NS)
    if plot_el is None:
        raise SystemExit("нет polygon16")
    plot = parse_points(plot_el.get("points"))
    if len(plot) != 4:
        raise SystemExit("polygon16 должен быть четырёхугольником A-B-C-D")
    canopy_el = root.find(".//svg:polygon[@id='canopy-eave']", NS)
    canopy = parse_points(canopy_el.get("points")) if canopy_el is not None else []
    apron_el = root.find(".//svg:polygon[@id='drive-apron']", NS)
    front_el = root.find(".//svg:polygon[@id='front-court']", NS)
    apron = parse_points(apron_el.get("points")) if apron_el is not None else []
    front = parse_points(front_el.get("points")) if front_el is not None else []
    house = house_corners(root)
    print("углы дома, м от первого:")
    for i, p in enumerate(house):
        print(f"  H{i} {p[0]:.2f},{p[1]:.2f}")
    if canopy:
        print(f"углы навеса: {len(canopy)}")
    yard = yard_buildings(root)
    for bld in yard:
        print(f"  {bld['name']}: {len(bld['corners'])} углов")
    restyle(root)
    gate_posts = []
    for n in (4, 5, 6):
        pel = root.find(f".//svg:polygon[@id='fence-post-{n}']", NS)
        if pel is None:
            gate_posts = []
            break
        pts = parse_points(pel.get("points"))
        gate_posts.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))
    dims, bbox, report, segs = build_dims(plot, house, canopy, apron, gate_posts or None, yard)
    print("отдельные размеры:")
    for row in report:
        print(" ", row)
    def ring(pts):
        if len(pts) < 2:
            return []
        return [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]

    segs = segs + ring(plot) + ring(house) + ring(canopy) + ring(apron) + ring(front)
    for bld in yard:
        segs = segs + ring(bld["corners"])
    for p in plot + apron + front:
        bbox.append(p)
    # выкинуть служебные узлы редактора и собрать чертёж
    for el in list(root):
        if local(el.tag) in ("namedview", "metadata", "title"):
            root.remove(el)
    body = "".join(etree.tostring(el, encoding=str) for el in root)
    body += dims
    geos = geo_of(plot)
    for i, (lat, lon) in enumerate(geos):
        print(f"  { 'ABCD'[i] } {lat:.6f} {lon:.6f}")
    obstacles = [house]
    if canopy:
        obstacles.append(canopy)
    obstacles.extend(bld["corners"] for bld in yard)
    xml = sheet(body, plot, bbox, geos, variant_name(src), segs, obstacles)
    tree = etree.fromstring(xml.encode())
    drawing = tree.find(f".//{{{SVG}}}g[@id='drawing']")
    scale = float(re.search(r"scale\(([0-9.]+)\)", drawing.get("transform")).group(1))
    from build_floor_print import promote_dim_labels
    promote_dim_labels(drawing, scale, plan_dims=False)
    out.write_bytes(etree.tostring(tree, xml_declaration=True, encoding="UTF-8"))
    print(f"записан {out}")


if __name__ == "__main__":
    main()
