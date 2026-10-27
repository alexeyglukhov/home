#!/usr/bin/env python3
"""Переносит plan-1-etazh-variant-d4.svg в метраж, 3D, 2D и подложку карты.

Мебельный слой карты не трогает: каталог и расставленные пятна остаются.
"""
from __future__ import annotations

import math
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_map_d2 import sketch_paths, wall_rect  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "plan-1-etazh-variant-d4.svg"
LAYOUT = ROOT / "abrikosovaya-22-layout-variant-d4-1-100.svg"
JS = ROOT / "house-light" / "variant-d4.js"
MAP = ROOT / "house-light" / "furniture-map-d4.svg"

SVG = "http://www.w3.org/2000/svg"
SX0, SY0 = 27.901022, -31.108116
CELL = 0.25
LIVING = {"Кабинет", "Спальня-1", "Гостиная", "Мастер-спальня", "Спальня-2"}
OUTDOOR = {"Терраса", "Крыльцо"}


def parse_transform(s: str):
    if not s:
        return (1, 0, 0, 1, 0, 0)
    m = (1, 0, 0, 1, 0, 0)

    def mm(a, b):
        return (
            a[0] * b[0] + a[2] * b[1],
            a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3],
            a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4],
            a[1] * b[4] + a[3] * b[5] + a[5],
        )

    for kind, args in re.findall(r"(matrix|translate|scale|rotate)\(([^)]*)\)", s):
        nums = [float(x) for x in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", args)]
        if kind == "matrix":
            t = tuple(nums[:6])
        elif kind == "translate":
            t = (1, 0, 0, 1, nums[0], nums[1] if len(nums) > 1 else 0.0)
        elif kind == "scale":
            sy = nums[1] if len(nums) > 1 else nums[0]
            t = (nums[0], 0, 0, sy, 0, 0)
        else:
            ang = math.radians(nums[0])
            c, sn = math.cos(ang), math.sin(ang)
            t = (c, sn, -sn, c, 0, 0)
            if len(nums) >= 3:
                t = mm(mm((1, 0, 0, 1, nums[1], nums[2]), t), (1, 0, 0, 1, -nums[1], -nums[2]))
        m = mm(m, t)
    return m


def compose(a, b):
    return (
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    )


def apply(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def world_matrix(el):
    chain = []
    e = el
    while e is not None:
        chain.append(e)
        e = e.getparent()
    m = (1, 0, 0, 1, 0, 0)
    for e in reversed(chain):
        if e.get("transform"):
            m = compose(m, parse_transform(e.get("transform")))
    return m


def fill_of(el) -> str:
    style = el.get("style") or ""
    found = re.search(r"fill:\s*([^;]+)", style)
    return (found.group(1).strip() if found else el.get("fill") or "").lower()


def to_plan(x, y):
    return ((x - SX0) / 10.0 - 4.42, 18.88 - (y - SY0) / 10.0)


def fmt(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def shoelace(pts) -> float:
    area = 0.0
    for i, (x1, y1) in enumerate(pts):
        x2, y2 = pts[(i + 1) % len(pts)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0 / 100.0


def inside(pts, x, y) -> bool:
    hit = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            hit = not hit
        j = i
    return hit


def overlap_box(a, b) -> bool:
    ix = min(a[2], b[2]) - max(a[0], b[0])
    iy = min(a[3], b[3]) - max(a[1], b[1])
    return ix > 0.05 and iy > 0.05


def near_terrace(pts, x, y) -> bool:
    if inside(pts, x, y):
        return True
    for i, (x1, y1) in enumerate(pts):
        x2, y2 = pts[(i + 1) % len(pts)]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (length * length)))
        if math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) < 0.85:
            return True
    return False


def _dp(points, eps):
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1
    best_i, best_d = 0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        dist = abs(dy * px - dx * py + bx * ay - by * ax) / length
        if dist > best_d:
            best_i, best_d = i, dist
    if best_d <= eps:
        return [points[0], points[-1]]
    left = _dp(points[: best_i + 1], eps)
    right = _dp(points[best_i:], eps)
    return left[:-1] + right


def room_outline(owner, index, minx, miny) -> str:
    ys, xs = np.where(owner == index)
    if len(xs) == 0:
        return ""
    cells = set(zip(ys.tolist(), xs.tolist()))
    nxt = {}
    def add(ax, ay, bx, by):
        nxt.setdefault((round(ax, 2), round(ay, 2)), []).append((round(bx, 2), round(by, 2)))
    for r, c in cells:
        x0, y0 = minx + c * CELL, miny + r * CELL
        x1, y1 = x0 + CELL, y0 + CELL
        if (r - 1, c) not in cells:
            add(x1, y0, x0, y0)
        if (r + 1, c) not in cells:
            add(x0, y1, x1, y1)
        if (r, c - 1) not in cells:
            add(x0, y0, x0, y1)
        if (r, c + 1) not in cells:
            add(x1, y1, x1, y0)
    parts = []
    while nxt:
        start = next(iter(nxt))
        cur = start
        loop = [start]
        guard = 0
        while nxt.get(cur) and guard < 20000:
            guard += 1
            dest = nxt[cur].pop()
            if not nxt[cur]:
                del nxt[cur]
            cur = dest
            if cur == start:
                break
            loop.append(cur)
        if len(loop) < 4:
            continue
        simple = _dp(loop, 0.45)
        if len(simple) < 3:
            continue
        parts.append("M " + " L ".join(f"{x:.2f},{y:.2f}" for x, y in simple) + " Z")
    return " ".join(parts)


def poly_points(el):
    nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("points") or "")]
    m = world_matrix(el)
    return [apply(m, nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]


def rect_corners(el):
    x, y = float(el.get("x") or 0), float(el.get("y") or 0)
    w, h = float(el.get("width")), float(el.get("height"))
    m = world_matrix(el)
    pts = [apply(m, px, py) for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def paint(mask, minx, miny, box):
    x0, y0, x1, y1 = box
    h, w = mask.shape
    c0 = max(0, int((x0 - minx) / CELL))
    c1 = min(w - 1, int((x1 - minx) / CELL))
    r0 = max(0, int((y0 - miny) / CELL))
    r1 = min(h - 1, int((y1 - miny) / CELL))
    if c1 >= c0 and r1 >= r0:
        mask[r0 : r1 + 1, c0 : c1 + 1] = True


def prune_underlay(el) -> None:
    """Убирает размеры, навес и дорогу. Чертёж стен и мебели остаётся как на плане."""
    drop_class = {"dim", "ext", "axis", "dimnum"}
    own = set((el.get("class") or "").split())
    if "roombox" in own and "fill:" not in (el.get("style") or ""):
        el.set("fill", "none")
        if not el.get("stroke") and "stroke:" not in (el.get("style") or ""):
            el.set("stroke", "#8a8a8a")
            el.set("stroke-width", "0.22")
            el.set("stroke-dasharray", "1.3 0.8")
    for child in list(el):
        cls = set((child.get("class") or "").split())
        eid = child.get("id") or ""
        tag = child.tag.split("}")[-1]
        if tag in ("namedview", "metadata", "defs", "style", "title"):
            el.remove(child)
            continue
        if eid in ("page-bg", "text6", "rect1904") or eid.startswith(("canopy", "drive", "gate")):
            el.remove(child)
            continue
        if cls & drop_class:
            el.remove(child)
            continue
        if tag == "rect" and "fill:" not in (child.get("style") or "") and not child.get("fill"):
            try:
                if float(child.get("width") or 0) > 40 and float(child.get("height") or 0) > 40:
                    el.remove(child)
                    continue
            except ValueError:
                pass
        prune_underlay(child)
    if el.get("id") and not str(el.get("id")).startswith("u-"):
        el.set("id", "u-" + el.get("id"))


def drop_covered_walls(walls):
    """Короткий кусок поверх более длинной стены той же ориентации — не вторая стена.

    Иначе торец дубля читается как край проёма и выедает настоящую стену.
    """
    keep = []
    for i, a in enumerate(walls):
        horizontal = (a[2] - a[0]) >= (a[3] - a[1])
        drop = False
        for j, b in enumerate(walls):
            if i == j:
                continue
            if horizontal != ((b[2] - b[0]) >= (b[3] - b[1])):
                continue
            if horizontal:
                overlap = min(a[3], b[3]) - max(a[1], b[1])
                longer = (b[2] - b[0]) > (a[2] - a[0]) + 0.5
                inside = a[0] >= b[0] - 0.4 and a[2] <= b[2] + 0.4
            else:
                overlap = min(a[2], b[2]) - max(a[0], b[0])
                longer = (b[3] - b[1]) > (a[3] - a[1]) + 0.5
                inside = a[1] >= b[1] - 0.4 and a[3] <= b[3] + 0.4
            if overlap > 0.5 and longer and inside:
                drop = True
                break
        if not drop:
            keep.append(a)
    return keep


def gaps(segs, along, lo, hi):
    segs = sorted(segs, key=lambda s: s[0 if along == 0 else 1])
    out = []
    for i, a in enumerate(segs):
        for b in segs[i + 1 :]:
            if along == 0:
                overlap = min(a[3], b[3]) - max(a[1], b[1])
                gap = b[0] - a[2]
                if overlap >= 0.8 and lo < gap < hi:
                    out.append((a[2], max(a[1], b[1]), b[0], min(a[3], b[3])))
            else:
                overlap = min(a[2], b[2]) - max(a[0], b[0])
                gap = b[1] - a[3]
                if overlap >= 0.8 and lo < gap < hi:
                    out.append((max(a[0], b[0]), a[3], min(a[2], b[2]), b[1]))
    return out


def flatten_path(d: str):
    tokens = re.findall(r"[MmLlHhVvCcQqZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", d)
    i = 0
    cx = cy = 0.0
    sx = sy = 0.0
    cmd = ""
    pts = []

    def num():
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    while i < len(tokens):
        if tokens[i].isalpha() or tokens[i] in "MmLlHhVvCcQqZz":
            cmd = tokens[i]
            i += 1
        if cmd in "Mm":
            x, y = num(), num()
            if cmd == "m":
                x += cx
                y += cy
            cx, cy = x, y
            sx, sy = cx, cy
            pts.append((cx, cy))
            cmd = "l" if cmd == "m" else "L"
        elif cmd in "Ll":
            x, y = num(), num()
            if cmd == "l":
                x += cx
                y += cy
            cx, cy = x, y
            pts.append((cx, cy))
        elif cmd in "Hh":
            x = num()
            cx = x + (cx if cmd == "h" else 0)
            pts.append((cx, cy))
        elif cmd in "Vv":
            y = num()
            cy = y + (cy if cmd == "v" else 0)
            pts.append((cx, cy))
        elif cmd in "Cc":
            x1, y1, x2, y2, x, y = num(), num(), num(), num(), num(), num()
            if cmd == "c":
                x1 += cx
                y1 += cy
                x2 += cx
                y2 += cy
                x += cx
                y += cy
            p0 = np.array((cx, cy))
            p1 = np.array((x1, y1))
            p2 = np.array((x2, y2))
            p3 = np.array((x, y))
            for step in range(1, 7):
                t = step / 6
                u = 1 - t
                p = u**3 * p0 + 3 * u**2 * t * p1 + 3 * u * t**2 * p2 + t**3 * p3
                pts.append((float(p[0]), float(p[1])))
            cx, cy = x, y
        elif cmd in "Zz":
            cx, cy = sx, sy
            pts.append((cx, cy))
        else:
            break
    return pts


def replace_const(text: str, name: str, body: str) -> str:
    pat = rf"const {name} = \[[\s\S]*?\n\];"
    new = f"const {name} = [\n{body}\n];"
    out, n = re.subn(pat, new, text, count=1)
    if n != 1:
        raise SystemExit(f"не нашёл const {name}")
    return out


def main() -> None:
    root = etree.parse(str(PLAN)).getroot()
    boxes = []
    for el in root.iter():
        if el.tag.split("}")[-1] != "rect":
            continue
        fill = fill_of(el)
        if fill not in ("#1a1a1a", "#ffdd55", "#00ffff", "#ffffff"):
            continue
        try:
            box = rect_corners(el)
        except (TypeError, ValueError):
            continue
        boxes.append((fill, box, el.get("id") or ""))

    walls = [b for f, b, _ in boxes if f == "#1a1a1a" and 0.4 < min(b[2] - b[0], b[3] - b[1]) < 8]
    walls = drop_covered_walls(walls)
    horiz = [w for w in walls if (w[3] - w[1]) <= (w[2] - w[0])]
    vert = [w for w in walls if (w[2] - w[0]) < (w[3] - w[1])]
    raw_seals = gaps(horiz, 0, 3.5, 20) + gaps(vert, 1, 3.5, 20)
    seals = []
    for seal in raw_seals:
        blocked = False
        for wall in walls:
            ix = min(seal[2], wall[2]) - max(seal[0], wall[0])
            iy = min(seal[3], wall[3]) - max(seal[1], wall[1])
            if ix > 1.0 and iy > 0.4:
                blocked = True
                break
        if not blocked:
            seals.append(seal)

    labels = []
    for el in root.iter():
        if el.tag.split("}")[-1] != "text" or "rname" not in (el.get("class") or ""):
            continue
        raw = "".join(el.itertext()).strip()
        if not raw or raw.startswith(("Жилая", "Общая", "Жилые")):
            continue
        m = world_matrix(el)
        x = float(el.get("x") or 0)
        y = float(el.get("y") or 0)
        px, py = apply(m, x, y)
        labels.append({"name": raw, "x": px, "y": py, "el": el})

    outdoor_poly = {}
    for el in root.iter():
        eid = el.get("id") or ""
        if eid not in ("roombox-g-terr1", "roombox-porch"):
            continue
        pts = poly_points(el)
        outdoor_poly["Терраса" if "terr" in eid else "Крыльцо"] = pts

    all_boxes = [b for f, b, _ in boxes if f != "#ffffff"] + seals
    minx = min(b[0] for b in all_boxes) - 8
    miny = min(b[1] for b in all_boxes) - 8
    maxx = max(b[2] for b in all_boxes) + 8
    maxy = max(b[3] for b in all_boxes) + 8
    width = int((maxx - minx) / CELL) + 1
    height = int((maxy - miny) / CELL) + 1
    wall = np.zeros((height, width), dtype=bool)
    for fill, box, _ in boxes:
        if fill not in ("#1a1a1a", "#ffdd55", "#00ffff"):
            continue
        if fill == "#1a1a1a" and min(box[2] - box[0], box[3] - box[1]) > 12:
            continue
        paint(wall, minx, miny, box)
    for seal in seals:
        paint(wall, minx, miny, seal)

    outside = np.zeros_like(wall)
    queue = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not wall[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if not wall[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and not wall[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    floor = ~wall & ~outside

    def nearest(px, py, rad=20):
        r = int((py - miny) / CELL)
        c = int((px - minx) / CELL)
        if 0 <= r < height and 0 <= c < width and floor[r, c]:
            return r, c
        best = None
        reach = int(rad / CELL)
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                rr, cc = r + dy, c + dx
                if 0 <= rr < height and 0 <= cc < width and floor[rr, cc]:
                    dist = dy * dy + dx * dx
                    if best is None or dist < best[0]:
                        best = (dist, rr, cc)
        return None if best is None else (best[1], best[2])

    for lab in labels:
        lab["seed"] = nearest(lab["x"], lab["y"])

    owner = np.full((height, width), -1, np.int16)
    queue = deque()
    for i, lab in enumerate(labels):
        if lab["name"] in OUTDOOR or lab["seed"] is None:
            continue
        r, c = lab["seed"]
        if owner[r, c] == -1:
            owner[r, c] = i
            queue.append((r, c))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and floor[ny, nx] and owner[ny, nx] == -1:
                owner[ny, nx] = owner[y, x]
                queue.append((ny, nx))

    cell_m2 = (CELL / 10) ** 2
    for i, lab in enumerate(labels):
        if lab["name"] in outdoor_poly and inside(outdoor_poly[lab["name"]], lab["x"], lab["y"]):
            pts = outdoor_poly[lab["name"]]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            lab["area"] = shoelace(pts)
            lab["bw"] = (max(xs) - min(xs)) / 10
            lab["bh"] = (max(ys) - min(ys)) / 10
            lab["svg_box"] = (min(xs), min(ys), max(xs), max(ys))
            continue
        ys, xs = np.where(owner == i)
        if len(xs) == 0:
            lab["area"] = 0.0
            lab["bw"] = lab["bh"] = 0.0
            continue
        lab["area"] = float(len(xs) * cell_m2)
        lab["bw"] = (xs.max() - xs.min() + 1) * CELL / 10
        lab["bh"] = (ys.max() - ys.min() + 1) * CELL / 10

    # Метраж с листа — истина: flood по диагональным стенам иногда раздувает площадь.
    for lab in labels:
        parent = lab["el"].getparent()
        if parent is None:
            continue
        meta = None
        for sib in parent:
            if "rmeta" in (sib.get("class") or ""):
                meta = sib
                break
        if meta is None:
            continue
        raw = "".join(meta.itertext()).strip()
        am = re.search(r"(\d+[.,]\d+)\s*м²", raw)
        dm = re.search(r"(\d+[.,]\d+)\s*×\s*(\d+[.,]\d+)", raw)
        if am:
            lab["area"] = float(am.group(1).replace(",", "."))
        if dm:
            lab["bw"] = float(dm.group(1).replace(",", "."))
            lab["bh"] = float(dm.group(2).replace(",", "."))

    for lab in labels:
        parent = lab["el"].getparent()
        meta = None
        for sib in parent:
            if "rmeta" in (sib.get("class") or ""):
                meta = sib
                break
        if meta is None or lab["area"] <= 0:
            continue
        meta.text = f"{fmt(lab['area'])} м²"
        for node in meta:
            if node.tag.split("}")[-1] == "tspan":
                node.text = f"{fmt(lab['bw'])}×{fmt(lab['bh'])}"
                break

    counted = [lab for lab in labels if lab["area"] > 0 and lab["name"] not in OUTDOOR]
    total = sum(lab["area"] for lab in counted)
    living = sum(lab["area"] for lab in counted if lab["name"] in LIVING)
    for el in root.iter():
        if el.tag.split("}")[-1] != "text":
            continue
        raw = "".join(el.itertext()).strip()
        if raw.startswith("Жилая"):
            el.text = f"Жилая {fmt(living)} м²"
        elif raw.startswith("Общая"):
            el.text = f"Общая {fmt(total)} м²"

    # Пунктир комнат заново, терраса и крыльцо остаются своими полигонами.
    for el in list(root.iter()):
        eid = el.get("id") or ""
        if eid.startswith("roombox-d4-") and el.getparent() is not None:
            el.getparent().remove(el)
    for i, lab in enumerate(labels):
        if lab["name"] in OUTDOOR or lab["area"] <= 0:
            continue
        d = room_outline(owner, i, minx, miny)
        if not d:
            continue
        path = etree.SubElement(root, f"{{{SVG}}}path")
        path.set("class", "roombox")
        path.set("id", f"roombox-d4-{i}")
        path.set("d", d)

    lines_only = len(sys.argv) > 1 and sys.argv[1] == "lines"
    if not lines_only:
        PLAN.write_bytes(etree.tostring(root, xml_declaration=True, encoding="UTF-8"))

    def plan_box(box):
        x0, y0, x1, y1 = box
        a = to_plan(x0, y1)
        b = to_plan(x1, y0)
        return (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))

    def faces(box, pad=6.0):
        """Улица и пол по разные стороны проёма, а не вдоль стены."""
        x0, y0, x1, y1 = box
        vertical = (y1 - y0) >= (x1 - x0)
        sides = {"out": [False, False], "floor": [False, False]}
        c0 = max(0, int((x0 - pad - minx) / CELL))
        c1 = min(width - 1, int((x1 + pad - minx) / CELL))
        r0 = max(0, int((y0 - pad - miny) / CELL))
        r1 = min(height - 1, int((y1 + pad - miny) / CELL))
        for r in range(r0, r1 + 1):
            cy = miny + (r + 0.5) * CELL
            for c in range(c0, c1 + 1):
                cx = minx + (c + 0.5) * CELL
                if vertical:
                    if not (y0 - 1 <= cy <= y1 + 1):
                        continue
                    if cx < x0 - 1:
                        side = 0
                    elif cx > x1 + 1:
                        side = 1
                    else:
                        continue
                    if cx < x0 - pad or cx > x1 + pad:
                        continue
                else:
                    if not (x0 - 1 <= cx <= x1 + 1):
                        continue
                    if cy < y0 - 1:
                        side = 0
                    elif cy > y1 + 1:
                        side = 1
                    else:
                        continue
                    if cy < y0 - pad or cy > y1 + pad:
                        continue
                if outside[r, c]:
                    sides["out"][side] = True
                if floor[r, c]:
                    sides["floor"][side] = True
        return (sides["out"][0] and sides["floor"][1]) or (sides["out"][1] and sides["floor"][0])

    terr_plan = [to_plan(x, y) for x, y in outdoor_poly.get("Терраса", [])]

    openings = []
    window_plan = []
    for fill, box, _ in boxes:
        if fill not in ("#ffdd55", "#00ffff"):
            continue
        if max(box[2] - box[0], box[3] - box[1]) < 3:
            continue
        pb = plan_box(box)
        ext = faces(box)
        # Окно, в том числе внутреннее: в ходьбе не вырезается. Дверь — это разрыв стены.
        kind = "p" if ext and (fill == "#00ffff" or max(pb[2] - pb[0], pb[3] - pb[1]) > 2.4) else "y"
        openings.append((*pb, kind))
        window_plan.append(pb)
    for seal in seals:
        pb = plan_box(seal)
        span = max(pb[2] - pb[0], pb[3] - pb[1])
        if span < 0.45:
            continue
        if any(overlap_box(pb, w) for w in window_plan):
            continue
        ext = faces(seal)
        kind = "d" if ext else "i"
        cx, cy = (pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2
        if ext and terr_plan and near_terrace(terr_plan, cx, cy):
            kind = "g"
        openings.append((*pb, kind))

    wall_plan = []
    for box in walls:
        pb = plan_box(box)
        if min(pb[2] - pb[0], pb[3] - pb[1]) < 0.05:
            continue
        wall_plan.append(pb)

    def on_wall(pb) -> bool:
        for w in wall_plan:
            vertical = (w[2] - w[0]) < (w[3] - w[1])
            if vertical:
                across = min(w[2], pb[2]) - max(w[0], pb[0])
                along = min(w[3], pb[3]) - max(w[1], pb[1])
                if across > (w[2] - w[0]) * 0.4 and along > 0.55:
                    return True
            else:
                across = min(w[3], pb[3]) - max(w[1], pb[1])
                along = min(w[2], pb[2]) - max(w[0], pb[0])
                if across > (w[3] - w[1]) * 0.4 and along > 0.55:
                    return True
        return False

    # Полотно двери закрашено белым поверх стены, разрыва в стене нет.
    for fill, box, _ in boxes:
        if fill != "#ffffff":
            continue
        span = max(box[2] - box[0], box[3] - box[1])
        thick = min(box[2] - box[0], box[3] - box[1])
        if not (6.5 <= span <= 12 and thick <= 3.6):
            continue
        pb = plan_box(box)
        if any(overlap_box(pb, op) for op in openings if op[4] in ("d", "i", "g")):
            continue
        if not on_wall(pb):
            continue
        ext = faces(box)
        cx, cy = (pb[0] + pb[2]) / 2, (pb[1] + pb[3]) / 2
        kind = "g" if ext and terr_plan and near_terrace(terr_plan, cx, cy) else ("d" if ext else "i")
        openings.append((*pb, kind))

    def room_rects(i):
        active = {}
        rects = []
        row_end = height
        for r in range(height + 1):
            spans = []
            if r < height:
                c = 0
                while c < width:
                    if owner[r, c] == i:
                        c1 = c
                        while c1 + 1 < width and owner[r, c1 + 1] == i:
                            c1 += 1
                        spans.append((c, c1))
                        c = c1 + 1
                    else:
                        c += 1
            nxt = {}
            for span in spans:
                nxt[span] = active.get(span, r)
            for span, r0 in active.items():
                if span not in nxt:
                    rects.append((span[0], r0, span[1], r - 1))
            active = nxt
        out = []
        for c0, r0, c1, r1 in rects:
            x0 = minx + c0 * CELL
            y0 = miny + r0 * CELL
            x1 = minx + (c1 + 1) * CELL
            y1 = miny + (r1 + 1) * CELL
            pb = plan_box((x0, y0, x1, y1))
            if (pb[2] - pb[0]) * (pb[3] - pb[1]) < 0.01:
                continue
            out.append(pb)
        return out

    rooms_js = []
    for i, lab in enumerate(labels):
        if lab["area"] <= 0:
            print("нет площади", lab["name"])
            continue
        if lab["name"] in outdoor_poly:
            pb = plan_box(lab["svg_box"])
            parts = [pb]
        else:
            parts = room_rects(i)
            if not parts and np.any(owner == i):
                parts = [plan_box((
                    minx + np.where(owner == i)[1].min() * CELL,
                    miny + np.where(owner == i)[0].min() * CELL,
                    minx + (np.where(owner == i)[1].max() + 1) * CELL,
                    miny + (np.where(owner == i)[0].max() + 1) * CELL,
                ))]
            if not parts and lab["area"] > 0 and lab.get("bw", 0) > 0 and lab.get("bh", 0) > 0:
                px, py = to_plan(lab["x"], lab["y"])
                parts = [(
                    px - lab["bw"] / 2, py - lab["bh"] / 2,
                    px + lab["bw"] / 2, py + lab["bh"] / 2,
                )]
        if not parts:
            print("нет контура", lab["name"])
            continue
        x0 = min(p[0] for p in parts)
        y0 = min(p[1] for p in parts)
        x1 = max(p[2] for p in parts)
        y1 = max(p[3] for p in parts)
        largest = max(parts, key=lambda p: (p[2] - p[0]) * (p[3] - p[1]))
        box_txt = ", ".join(f"[{p[0]:.2f}, {p[1]:.2f}, {p[2]:.2f}, {p[3]:.2f}]" for p in parts)
        # area/bw/bh с плана — 3D не суммирует перекрывающиеся прямоугольники заново.
        rooms_js.append(
            f'  ["{lab["name"]}", {largest[0]:.2f}, {largest[1]:.2f}, {largest[2]:.2f}, {largest[3]:.2f}, 0.46, null, null, [{box_txt}], {lab["area"]:.2f}, {lab["bw"]:.2f}, {lab["bh"]:.2f}],'
        )
        lab["parts"] = parts
        lab["bbox"] = (x0, y0, x1, y1)

    furn = []
    swings = []
    door_centers = [((o[0] + o[2]) / 2, (o[1] + o[3]) / 2) for o in openings if o[4] in ("d", "i", "g")]

    def keep_line(el) -> bool:
        cls = el.get("class") or ""
        eid = el.get("id") or ""
        if cls in ("dim", "ext", "axis", "roombox") or eid.startswith(("drive", "gate", "canopy", "roombox")):
            return False
        return True

    def add_seg(x0, y0, x1, y1, swing=False):
        if math.hypot(x1 - x0, y1 - y0) < 0.012:
            return
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        if not (-6.5 <= mx <= 13.9 and 2.1 <= my <= 19.3):
            return
        seg = (x0, y0, x1, y1)
        if swing:
            swings.append(seg)
        else:
            furn.append(seg)

    for el in root.iter():
        if any(a.tag.split("}")[-1] == "defs" for a in el.iterancestors()):
            continue
        tag = el.tag.split("}")[-1]
        if not keep_line(el):
            continue
        if tag == "line":
            try:
                m = world_matrix(el)
                a = apply(m, float(el.get("x1")), float(el.get("y1")))
                b = apply(m, float(el.get("x2")), float(el.get("y2")))
            except (TypeError, ValueError):
                continue
            pa, pb = to_plan(*a), to_plan(*b)
            add_seg(*pa, *pb)
        elif tag == "rect":
            # Стены и окна уже объёмы. Остальные прямоугольники — мебель, в том числе залитая.
            if fill_of(el) in ("#1a1a1a", "#ffdd55", "#00ffff", "#ffeeaa", "#ececec"):
                continue
            try:
                x, y = float(el.get("x") or 0), float(el.get("y") or 0)
                w, h = float(el.get("width")), float(el.get("height"))
            except (TypeError, ValueError):
                continue
            if w > 40 or h > 40 or w < 0.04 or h < 0.04:
                continue
            m = world_matrix(el)
            pts = [to_plan(*apply(m, px, py)) for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
            span = max(max(p[0] for p in pts) - min(p[0] for p in pts), max(p[1] for p in pts) - min(p[1] for p in pts))
            if span > 8:
                continue
            for a, b in zip(pts, pts[1:] + pts[:1]):
                add_seg(*a, *b)
        elif tag in ("polygon", "polyline"):
            nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("points") or "")]
            if len(nums) < 4:
                continue
            m = world_matrix(el)
            pts = [to_plan(*apply(m, nums[i], nums[i + 1])) for i in range(0, len(nums) - 1, 2)]
            seq = pts + pts[:1] if tag == "polygon" else pts
            for a, b in zip(seq, seq[1:]):
                add_seg(*a, *b)
        elif tag in ("ellipse", "circle"):
            m = world_matrix(el)
            cx = float(el.get("cx") or 0)
            cy = float(el.get("cy") or 0)
            rx = float(el.get("r") or el.get("rx") or 0)
            ry = float(el.get("r") or el.get("ry") or 0)
            if rx < 0.05 or ry < 0.05 or rx > 30 or ry > 30:
                continue
            pts = []
            for step in range(16):
                ang = math.tau * step / 16
                pts.append(to_plan(*apply(m, cx + math.cos(ang) * rx, cy + math.sin(ang) * ry)))
            for a, b in zip(pts, pts[1:] + pts[:1]):
                add_seg(*a, *b)
        elif tag == "path" and (el.get("id") or "") not in ("rect1904", "canopy-eave"):
            d = el.get("d") or ""
            if "c" not in d.lower() and "l" not in d.lower():
                continue
            local = flatten_path(d)
            if len(local) < 2:
                continue
            m = world_matrix(el)
            pts = [to_plan(*apply(m, x, y)) for x, y in local]
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            near = any(math.hypot(cx - dx, cy - dy) < 1.15 for dx, dy in door_centers)
            swing = near and "c" in d.lower()
            for a, b in zip(pts, pts[1:]):
                add_seg(*a, *b, swing=swing)

    def on_terrace(seg) -> bool:
        if len(terr_plan) < 3:
            return False
        return inside(terr_plan, (seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2)

    terrace_furn = [s for s in furn if on_terrace(s)]
    furn = [s for s in furn if not on_terrace(s)]

    def seg_body(segs):
        return "\n".join(f"  [{a:.3f}, {b:.3f}, {c:.3f}, {d:.3f}]," for a, b, c, d in segs)

    def box_body(items, kind=False):
        lines = []
        for it in items:
            if kind:
                lines.append(f"  [{it[0]:.2f}, {it[1]:.2f}, {it[2]:.2f}, {it[3]:.2f}, '{it[4]}'],")
            else:
                lines.append(f"  [{it[0]:.2f}, {it[1]:.2f}, {it[2]:.2f}, {it[3]:.2f}],")
        return "\n".join(lines)

    js = JS.read_text(encoding="utf-8")
    js = replace_const(js, "WALLS", box_body(wall_plan))
    js = replace_const(js, "OPENINGS", box_body(openings, kind=True))
    js = replace_const(js, "FURNITURE", seg_body(furn))
    js = replace_const(js, "DOOR_SWINGS", seg_body(swings))
    js = replace_const(js, "TERRACE_FURNITURE", seg_body(terrace_furn))
    js = replace_const(js, "ROOMS", "\n".join(rooms_js))
    JS.write_text(js, encoding="utf-8")
    if lines_only:
        return

    # 2D: та же планировка внутри поворота на участок.
    layout = etree.parse(str(LAYOUT)).getroot()
    shift = layout.find(f".//{{{SVG}}}g[@id='p-d4-shift']")
    if shift is None:
        raise SystemExit("в схеме нет p-d4-shift")
    for child in list(shift):
        shift.remove(child)
    skip_tags = {"namedview", "metadata", "defs", "style", "title", "sodipodi"}
    for child in list(root):
        tag = child.tag.split("}")[-1]
        if tag in skip_tags or child.get("id") in ("page-bg", "text6"):
            continue
        clone = etree.fromstring(etree.tostring(child))
        for node in clone.iter():
            if node.get("id"):
                node.set("id", "p-" + node.get("id"))
        shift.append(clone)
    LAYOUT.write_bytes(etree.tostring(layout, xml_declaration=True, encoding="UTF-8"))

    # Подложка карты — сам чертёж плана, не упрощённые штрихи.
    # Слой furniture не меняется.
    mp = etree.parse(str(MAP)).getroot()
    under = mp.find(f".//{{{SVG}}}g[@id='plan-underlay']")
    if under is None:
        raise SystemExit("в карте нет plan-underlay")
    for child in list(under):
        under.remove(child)
    drawing = etree.SubElement(under, f"{{{SVG}}}g", id="plan-drawing")
    # svg-пользовательские → метры плана (y на север). #world потом переворачивает y.
    drawing.set("transform", "translate(-7.2101,15.7692) scale(0.1,-0.1)")
    style = etree.SubElement(drawing, f"{{{SVG}}}style")
    style.text = """
      #plan-drawing text { font-family: DejaVu Sans, Liberation Sans, sans-serif; font-size: 2.2px; fill: #1a1a1a; text-anchor: middle; }
      #plan-drawing .rname { font-size: 2.2px; font-weight: 700; }
      #plan-drawing .rmeta { font-size: 1.4px; font-weight: 400; fill: #333; }
      #plan-drawing .roombox { fill: none; stroke: #8a8a8a; stroke-width: 0.22; stroke-dasharray: 1.3 0.8; }
    """
    skip_tags = {"namedview", "metadata", "defs", "style", "title", "sodipodi"}
    for child in list(root):
        tag = child.tag.split("}")[-1]
        if tag in skip_tags or child.get("id") in ("page-bg", "text6", "rect1904"):
            continue
        clone = etree.fromstring(etree.tostring(child))
        prune_underlay(clone)
        if clone.tag.split("}")[-1] == "g" and len(clone) == 0:
            continue
        drawing.append(clone)
    MAP.write_bytes(etree.tostring(mp, xml_declaration=True, encoding="UTF-8"))

    print(f"жилая {living:.2f}  общая {total:.2f}")
    for lab in labels:
        mark = "жил" if lab["name"] in LIVING else ("вне" if lab["name"] in OUTDOOR else "")
        print(f"  {lab['name']:22} {lab['area']:6.2f}  {lab['bw']:.2f}×{lab['bh']:.2f}  {mark}")
    kinds = {}
    for op in openings:
        kinds[op[4]] = kinds.get(op[4], 0) + 1
    print(f"стены {len(wall_plan)}  проёмы {len(openings)} {kinds}  линии {len(furn)}  терраса {len(terrace_furn)}  дуги {len(swings)}")
    for lab in labels:
        if lab["area"] <= 0 or "parts" not in lab:
            continue
        box_area = sum((p[2] - p[0]) * (p[3] - p[1]) for p in lab["parts"])
        if abs(box_area - lab["area"]) > 0.4:
            print(f"  расхождение {lab['name']}: клетки {lab['area']:.2f} прямоугольники {box_area:.2f}")


if __name__ == "__main__":
    main()
