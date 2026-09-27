#!/usr/bin/env python3
"""Собрать геометрию дома для просмотра теней в браузере."""
import json
import math
import re
from collections import deque
from pathlib import Path

import numpy as np

ROOT = Path("/home/gao/work/home5")
LAYOUT = ROOT / "abrikosovaya-22-layout-v1-drenazh-1-100.svg"
MIRROR = ROOT / "abrikosovaya-22-house-1-100-mirror.svg"
OUT = Path(__file__).with_name("geometry.json")
PLAN_W = 12.710

# Матрица плана на схеме: +X плана → восток-северо-восток, +Y плана → вход.
A, B, C, D = 0.945323, -0.326137, -0.326137, -0.945323
E, F = 521.178, 576.237
DET = A * D - C * B
AZ_X = math.atan2(A, -B)
AZ_Y = math.atan2(C, -D)

CELL = 0.05
WALL_H = 2.7
ROOF_T = 0.16
OVERHANG = 0.4
# Окно: от 1/6 до 5/6 высоты стены. Дверь: от пола до 5/6.
SILL = WALL_H / 6
HEAD = WALL_H * 5 / 6
LAT, LON = 53.91834, 27.86070


def parse_loops(d):
    tokens = re.findall(r"[MLZ]|[-+]?(?:\d+\.\d+|\d+)", d)
    loops, cur, i = [], [], 0
    while i < len(tokens):
        t = tokens[i]
        if t == "M":
            cur = [(float(tokens[i + 1]) / 10, float(tokens[i + 2]) / 10)]
            i += 3
        elif t == "L":
            cur.append((float(tokens[i + 1]) / 10, float(tokens[i + 2]) / 10))
            i += 3
        elif t == "Z":
            if len(cur) >= 3:
                loops.append(cur)
            cur = []
            i += 1
        else:
            raise SystemExit(f"неизвестная команда контура: {t}")
    return loops


def page_to_plan(x, y):
    x -= E
    y -= F
    u = (D * x - C * y) / DET
    v = (-B * x + A * y) / DET
    return u / 10, v / 10


def to_east_north(x, y):
    east = x * math.sin(AZ_X) + y * math.sin(AZ_Y)
    north = x * math.cos(AZ_X) + y * math.cos(AZ_Y)
    return east, north


def raster(loops, ox, oy, w, h):
    mask = np.zeros((h, w), np.uint8)
    for row in range(h):
        y = oy + (row + 0.5) * CELL
        hits = []
        for loop in loops:
            n = len(loop)
            for i in range(n):
                x0, y0 = loop[i]
                x1, y1 = loop[(i + 1) % n]
                if y0 == y1:
                    continue
                if (y0 <= y < y1) or (y1 <= y < y0):
                    t = (y - y0) / (y1 - y0)
                    hits.append(x0 + t * (x1 - x0))
        hits.sort()
        for k in range(0, len(hits) - 1, 2):
            c0 = max(0, min(w, int((hits[k] - ox) / CELL)))
            c1 = max(0, min(w, int((hits[k + 1] - ox) / CELL)))
            if c1 > c0:
                mask[row, c0:c1] = 1
    return mask


def shift_or(src, dy, dx):
    h, w = src.shape
    sh = np.zeros_like(src)
    y0, y1 = max(0, dy), h + min(0, dy)
    x0, x1 = max(0, dx), w + min(0, dx)
    sh[y0:y1, x0:x1] = src[y0 - dy : y1 - dy, x0 - dx : x1 - dx]
    return sh


def dilate(mask, radius):
    out = mask.copy()
    r = int(radius)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx > r * r or (dy == 0 and dx == 0):
                continue
            out |= shift_or(mask, dy, dx)
    return out


def erode(mask, radius):
    out = mask.copy()
    r = int(radius)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx > r * r or (dy == 0 and dx == 0):
                continue
            out &= shift_or(mask, dy, dx)
    return out


def mirror_loops(loops):
    return [[(PLAN_W - x, y) for x, y in loop] for loop in loops]


def components(mask):
    seen = np.zeros_like(mask)
    found = []
    h, w = mask.shape
    for r in range(h):
        for c in range(w):
            if not mask[r, c] or seen[r, c]:
                continue
            q = deque([(r, c)])
            seen[r, c] = 1
            cells = [(r, c)]
            while q:
                y, x = q.popleft()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dy == 0 and dx == 0:
                            continue
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = 1
                            q.append((ny, nx))
                            cells.append((ny, nx))
            found.append(cells)
    return found


def has_door_arc(op, syms, ox, oy):
    """Четверть окружности у косяка: символы в кольце 0,4–1,15 м на разных углах."""
    h, w = syms.shape
    corners = (
        (op["x0"], op["y0"]),
        (op["x1"], op["y0"]),
        (op["x0"], op["y1"]),
        (op["x1"], op["y1"]),
    )
    for hx, hy in corners:
        bins = set()
        count = 0
        r0 = max(0, int((hy - 1.2 - oy) / CELL))
        r1 = min(h, int((hy + 1.2 - oy) / CELL) + 1)
        c0 = max(0, int((hx - 1.2 - ox) / CELL))
        c1 = min(w, int((hx + 1.2 - ox) / CELL) + 1)
        for r in range(r0, r1):
            for c in range(c0, c1):
                if not syms[r, c]:
                    continue
                x = ox + (c + 0.5) * CELL
                y = oy + (r + 0.5) * CELL
                dist = math.hypot(x - hx, y - hy)
                if 0.40 <= dist <= 1.15:
                    bins.add(int(math.atan2(y - hy, x - hx) / (math.pi / 8)))
                    count += 1
        if count >= 8 and len(bins) >= 3:
            return True
    return False


def touches_outside(op, outline):
    mx = (op["x0"] + op["x1"]) / 2
    my = (op["y0"] + op["y1"]) / 2
    if op["axis"] == "H":
        probes = ((mx, op["y0"] - 0.2), (mx, op["y1"] + 0.2))
    else:
        probes = ((op["x0"] - 0.2, my), (op["x1"] + 0.2, my))
    return any(not point_in_poly(x, y, outline) for x, y in probes)


def find_openings(walls, syms, ox, oy, outline):
    """Разрывы стен. Окно — линия остекления или наружный проём без дуги двери."""
    h, w = walls.shape
    strokes = []
    for cells in components(syms):
        rs = [p[0] for p in cells]
        cs = [p[1] for p in cells]
        bw = (max(cs) - min(cs) + 1) * CELL
        bh = (max(rs) - min(rs) + 1) * CELL
        short, long = min(bw, bh), max(bw, bh)
        if short <= 0.20 and long >= 0.55 and long >= short * 3:
            strokes.append((ox + min(cs) * CELL, oy + min(rs) * CELL,
                            ox + (max(cs) + 1) * CELL, oy + (max(rs) + 1) * CELL))

    def slots(axis):
        raw = []
        if axis == "H":
            for row in range(h):
                c = 0
                while c < w:
                    if not walls[row, c]:
                        c += 1
                        continue
                    left0 = c
                    while c < w and walls[row, c]:
                        c += 1
                    left1 = c
                    gap0 = c
                    while c < w and not walls[row, c]:
                        c += 1
                    gap1 = c
                    if gap1 >= w or gap1 == gap0:
                        continue
                    right0 = c
                    while c < w and walls[row, c]:
                        c += 1
                    right1 = c
                    gap = (gap1 - gap0) * CELL
                    if 0.55 <= gap <= 2.7 and (left1 - left0) * CELL >= 0.12 and (right1 - right0) * CELL >= 0.12:
                        raw.append((row, gap0, gap1))
                    c = right0
            groups = []
            for row, g0, g1 in raw:
                hit = None
                for cl in groups:
                    if abs(int(np.median(cl["g0"])) - g0) <= 4 and abs(int(np.median(cl["g1"])) - g1) <= 4 and row <= cl["r1"] + 2:
                        hit = cl
                        break
                if hit:
                    hit["r1"] = row
                    hit["g0"].append(g0)
                    hit["g1"].append(g1)
                else:
                    groups.append({"r0": row, "r1": row, "g0": [g0], "g1": [g1], "axis": "H"})
            return groups
        for col in range(w):
            r = 0
            while r < h:
                if not walls[r, col]:
                    r += 1
                    continue
                top0 = r
                while r < h and walls[r, col]:
                    r += 1
                top1 = r
                gap0 = r
                while r < h and not walls[r, col]:
                    r += 1
                gap1 = r
                if gap1 >= h or gap1 == gap0:
                    continue
                bot0 = r
                while r < h and walls[r, col]:
                    r += 1
                bot1 = r
                gap = (gap1 - gap0) * CELL
                if 0.55 <= gap <= 2.7 and (top1 - top0) * CELL >= 0.12 and (bot1 - bot0) * CELL >= 0.12:
                    raw.append((col, gap0, gap1))
                r = bot0
        groups = []
        for col, g0, g1 in raw:
            hit = None
            for cl in groups:
                if abs(int(np.median(cl["g0"])) - g0) <= 4 and abs(int(np.median(cl["g1"])) - g1) <= 4 and col <= cl["c1"] + 2:
                    hit = cl
                    break
            if hit:
                hit["c1"] = col
                hit["g0"].append(g0)
                hit["g1"].append(g1)
            else:
                groups.append({"c0": col, "c1": col, "g0": [g0], "g1": [g1], "axis": "V"})
        return groups

    openings = []
    for cl in slots("H") + slots("V"):
        g0 = int(np.median(cl["g0"]))
        g1 = int(np.median(cl["g1"]))
        if cl["axis"] == "H":
            c0, c1, r0, r1 = g0, g1, cl["r0"], cl["r1"]
            span = (c1 - c0) * CELL
            thick = (r1 - r0 + 1) * CELL
        else:
            c0, c1, r0, r1 = cl["c0"], cl["c1"], g0, g1
            span = (r1 - r0) * CELL
            thick = (c1 - c0 + 1) * CELL
        if not (0.08 <= thick <= 0.65 and 0.55 <= span <= 2.7):
            continue
        if thick < 0.22 and span > 1.35:
            continue
        box = walls[r0:r1 + 1, c0:c1]
        if box.size == 0 or box.mean() > 0.25:
            continue
        x0, y0 = ox + c0 * CELL, oy + r0 * CELL
        x1, y1 = ox + c1 * CELL, oy + (r1 + 1) * CELL
        window = False
        for sx0, sy0, sx1, sy1 in strokes:
            ow = min(x1, sx1) - max(x0, sx0)
            oh = min(y1, sy1) - max(y0, sy0)
            if ow > 0.02 and oh > 0.02 and max(ow, oh) > 0.40:
                window = True
                break
        op = {
            "axis": cl["axis"], "span": span, "thick": thick,
            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
        }
        if window:
            kind = "window"
        elif has_door_arc(op, syms, ox, oy):
            kind = "door"
        elif touches_outside(op, outline):
            kind = "window"
        else:
            kind = "door"
        if kind == "door" and span < 0.70:
            continue
        openings.append({
            "kind": kind, "axis": cl["axis"], "span": span, "thick": thick,
            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "c0": c0, "c1": c1, "r0": r0, "r1": r1,
        })

    kept = []
    for op in openings:
        if any(not (op["x1"] < prev["x0"] + 0.08 or prev["x1"] < op["x0"] + 0.08 or
                    op["y1"] < prev["y0"] + 0.08 or prev["y1"] < op["y0"] + 0.08) for prev in kept):
            continue
        kept.append(op)
    # Внутренняя линия входного проёма попала в окна из-за штрихов порога.
    # Тот же пролёт, что и входная дверь, остаётся дверью: без балки на полу.
    for op in kept:
        if op["kind"] != "window" or op["axis"] != "H":
            continue
        for other in kept:
            if other["kind"] != "door" or other["axis"] != "H":
                continue
            overlap = min(op["x1"], other["x1"]) - max(op["x0"], other["x0"])
            width = min(op["x1"] - op["x0"], other["x1"] - other["x0"])
            ygap = max(op["y0"], other["y0"]) - min(op["y1"], other["y1"])
            if width > 1.2 and overlap > 0.6 * width and 0 <= ygap < 0.9:
                op["kind"] = "door"
                break
    kept.extend(corner_windows(walls, syms, ox, oy))
    return refine_entrance(kept)


def refine_entrance(openings):
    """Вход не на всю ширину проёма: дверь как из прихожей, рядом окно, колонна террасы отдельно."""
    refs = [
        op["span"] for op in openings
        if op["kind"] == "door" and 13.5 <= op["y0"] <= 16.2 and 0.75 <= op["span"] <= 1.15
    ]
    door_w = float(np.median(refs)) if refs else 0.90
    out = []
    for op in openings:
        # Пустой пролёт террасы между колонной и стеной — не дверь и без перемычки.
        if op["axis"] == "H" and op["span"] > 1.5 and op["y0"] >= 16.65:
            continue
        entrance = (
            op["axis"] == "H" and op["span"] > 1.8
            and 15.7 <= op["y0"] <= 16.6 and op["x0"] < 6.0 and op["x1"] > 7.0
        )
        if not entrance:
            out.append(op)
            continue
        split = op["x1"] - door_w
        if not (op["x0"] + 0.4 < split < op["x1"] - 0.4):
            out.append(op)
            continue
        # Дуга двери у правого косяка. Слева от неё — остекление, не створка.
        span = op["x1"] - op["x0"]
        cut = op["c0"] + int(round((split - op["x0"]) / span * (op["c1"] - op["c0"])))
        window = dict(op)
        window.update(kind="window", x1=split, span=split - op["x0"], c1=cut)
        door = dict(op)
        door.update(kind="door", x0=split, span=op["x1"] - split, c0=cut)
        out.extend((window, door))
    return out


def corner_windows(walls, syms, ox, oy):
    """Угловое окно: стена обрывается, перпендикулярная начинается через проём, в проёме штрихи остекления."""
    h, w = walls.shape
    found = []

    def add(x0, y0, x1, y1):
        if x1 - x0 < 0.25 or y1 - y0 < 0.25:
            return
        c0 = max(0, int((x0 - ox) / CELL))
        r0 = max(0, int((y0 - oy) / CELL))
        c1 = min(w, int(math.ceil((x1 - ox) / CELL)))
        r1 = min(h, int(math.ceil((y1 - oy) / CELL)))
        if walls[r0:r1, c0:c1].mean() > 0.2:
            return
        found.append({
            "kind": "window", "axis": "L", "span": max(x1 - x0, y1 - y0), "thick": min(x1 - x0, y1 - y0),
            "x0": x0, "y0": y0, "x1": x1, "y1": y1,
            "c0": c0, "c1": c1, "r0": r0, "r1": r1 - 1,
        })

    # Низ вертикальной стены без встречного косяка.
    ends = []
    for c in range(w):
        r = 0
        while r < h:
            if not walls[r, c]:
                r += 1
                continue
            r0 = r
            while r < h and walls[r, c]:
                r += 1
            r1 = r
            e = r
            while e < h and not walls[e, c]:
                e += 1
            if (r1 - r0) * CELL >= 0.8 and (e - r1) * CELL >= 2.5:
                ends.append((c, r0, r1))
            r = max(r, r1)
    groups = []
    for c, r0, r1 in ends:
        hit = None
        for g in groups:
            if abs(g["r1"] - r1) <= 3 and c <= g["c1"] + 2:
                hit = g
                break
        if hit:
            hit["c1"] = c
            hit["r1"] = max(hit["r1"], r1)
            hit["r0"] = min(hit["r0"], r0)
        else:
            groups.append({"c0": c, "c1": c, "r0": r0, "r1": r1})
    for g in groups:
        thick = (g["c1"] - g["c0"] + 1) * CELL
        if not (0.30 <= thick <= 0.65):
            continue
        x0 = ox + g["c0"] * CELL
        x1 = ox + (g["c1"] + 1) * CELL
        y_end = oy + g["r1"] * CELL
        # Перпендикулярная стена ниже и сбоку.
        r_a = g["r1"]
        r_b = min(h, g["r1"] + int(2.2 / CELL))
        for side in (1, -1):
            c_a = g["c1"] + 1 if side == 1 else 0
            c_b = w if side == 1 else g["c0"]
            if c_b <= c_a:
                continue
            band = walls[r_a:r_b, c_a:c_b]
            if band.size == 0 or band.sum() < 8:
                continue
            rows = np.where(band.mean(axis=1) > 0.15)[0]
            if len(rows) < 4:
                continue
            # первая плотная горизонтальная полоса
            start = rows[0]
            end = start
            for row in rows[1:]:
                if row <= end + 2:
                    end = row
                else:
                    break
            if (end - start + 1) * CELL < 0.30 or (end - start + 1) * CELL > 0.70:
                continue
            strip = walls[r_a + start:r_a + end + 1, c_a:c_b]
            cols = np.where(strip.mean(axis=0) > 0.45)[0]
            if len(cols) < 4:
                continue
            near = cols[0] if side == 1 else cols[-1]
            far_gap = (near if side == 1 else (c_b - c_a - 1 - near)) * CELL
            if not (0.45 <= far_gap <= 2.3):
                continue
            y0 = oy + (r_a + start) * CELL
            y1 = oy + (r_a + end + 1) * CELL
            if side == 1:
                legs = [(x0, y_end, x1, y0), (x0, y0, ox + (c_a + near) * CELL, y1)]
            else:
                legs = [(x0, y_end, x1, y0), (ox + (c_a + near + 1) * CELL, y0, x1, y1)]
            # Штрихи остекления лежат на одной из створок, проём общий.
            total = 0
            for ax0, ay0, ax1, ay1 in legs:
                cc0 = max(0, int((ax0 - ox) / CELL))
                rr0 = max(0, int((ay0 - oy) / CELL))
                cc1 = min(w, int(math.ceil((ax1 - ox) / CELL)))
                rr1 = min(h, int(math.ceil((ay1 - oy) / CELL)))
                if rr1 > rr0 and cc1 > cc0:
                    total += int(syms[rr0:rr1, cc0:cc1].sum())
            if total < 12:
                continue
            for leg in legs:
                add(*leg)
    return found


def drop_junk_columns(mask, ox, oy):
    """Убрать отдельные плоские куски внутри комнат. Колонна террасы остаётся."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    removed = 0
    for r in range(h):
        for c in range(w):
            if not mask[r, c] or seen[r, c]:
                continue
            q = deque([(r, c)])
            seen[r, c] = 1
            cells = [(r, c)]
            while q:
                y, x = q.popleft()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1
                        q.append((ny, nx))
                        cells.append((ny, nx))
            rs = [p[0] for p in cells]
            cs = [p[1] for p in cells]
            bw = (max(cs) - min(cs) + 1) * CELL
            bh = (max(rs) - min(rs) + 1) * CELL
            cx = ox + (min(cs) + max(cs) + 1) * CELL / 2
            cy = oy + (min(rs) + max(rs) + 1) * CELL / 2
            # Только короткий отдельный кусок. Длинная перегородка, даже тонкая, остаётся.
            # Колонна южной террасы — квадрат на внешнем углу. Квадрат у крыльца тоже на плане.
            terrace = math.hypot(cx - 0.35, cy - 0.35) < 0.45
            porch = math.hypot(cx - 4.72, cy - 17.05) < 0.55
            column = max(bw, bh) <= 0.60 and len(cells) * CELL * CELL < 0.35
            if terrace or porch or not column:
                continue
            for y, x in cells:
                mask[y, x] = 0
            removed += 1
    return removed


def greedy(mask):
    used = np.zeros_like(mask)
    rects = []
    h, w = mask.shape
    for y in range(h):
        x = 0
        while x < w:
            if mask[y, x] == 0 or used[y, x]:
                x += 1
                continue
            x2 = x + 1
            while x2 < w and mask[y, x2] and not used[y, x2]:
                x2 += 1
            y2 = y + 1
            while y2 < h and np.all(mask[y2, x:x2]) and not np.any(used[y2, x:x2]):
                y2 += 1
            used[y:y2, x:x2] = 1
            rects.append((x, y, x2, y2))
            x = x2
    return rects


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y):
            xint = (x1 - x0) * (y - y0) / (y1 - y0 + 0.0) + x0
            if x < xint:
                inside = not inside
    return inside


def offset_polygon(pts, dist):
    area = 0.0
    for i, (x, y) in enumerate(pts):
        x1, y1 = pts[(i + 1) % len(pts)]
        area += x * y1 - x1 * y
    sign = 1.0 if area > 0 else -1.0
    normals = []
    for i, (x0, y0) in enumerate(pts):
        x1, y1 = pts[(i + 1) % len(pts)]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        normals.append((sign * dy / length, sign * -dx / length))
    out = []
    for i, (x, y) in enumerate(pts):
        n0 = normals[i - 1]
        n1 = normals[i]
        mx, my = n0[0] + n1[0], n0[1] + n1[1]
        length = math.hypot(mx, my) or 1.0
        mx, my = mx / length, my / length
        denom = mx * n1[0] + my * n1[1]
        if abs(denom) < 0.25:
            denom = 0.25 if denom >= 0 else -0.25
        scale = max(-dist * 3, min(dist * 3, dist / denom))
        out.append((x + mx * scale, y + my * scale))
    return out


def triangulate(poly):
    """Ушная клиппировка. Многоугольник без дыр, обход по часовой на экране (y вниз)."""
    pts = poly[:]
    idx = list(range(len(pts)))

    def cross(i, j, k):
        ax, ay = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
        bx, by = pts[k][0] - pts[j][0], pts[k][1] - pts[j][1]
        return ax * by - ay * bx

    def inside(p, a, b, c):
        # барицентрические координаты
        x, y = p
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            return False
        u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
        v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den
        w = 1 - u - v
        return u >= -1e-9 and v >= -1e-9 and w >= -1e-9

    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        n = len(idx)
        clipped = False
        for t in range(n):
            i0, i1, i2 = idx[t - 1], idx[t], idx[(t + 1) % n]
            if cross(i0, i1, i2) <= 1e-9:
                continue
            a, b, c = pts[i0], pts[i1], pts[i2]
            if any(inside(pts[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((a, b, c))
            del idx[t]
            clipped = True
            break
        if not clipped:
            break
    if len(idx) == 3:
        tris.append((pts[idx[0]], pts[idx[1]], pts[idx[2]]))
    return tris


def sun_az_el(year, month, day, hour, minute):
    """Азимут от севера по часовой, высота над горизонтом. Время минское, UTC+3."""
    import datetime as dt

    when = dt.datetime(year, month, day, hour, minute, tzinfo=dt.timezone.utc) - dt.timedelta(hours=3)
    n = when.timestamp() / 86400 + 2440587.5 - 2451545.0
    lam_deg = (280.460 + 0.9856474 * n) % 360
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = math.radians(lam_deg) + math.radians(1.915) * math.sin(g) + math.radians(0.020) * math.sin(2 * g)
    eps = math.radians(23.439 - 0.0000004 * n)
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    gmst = math.radians((280.46061837 + 360.98564736629 * n) % 360)
    ha = gmst + math.radians(LON) - ra
    lat = math.radians(LAT)
    sin_el = math.sin(lat) * math.sin(dec) + math.cos(lat) * math.cos(dec) * math.cos(ha)
    el = math.asin(max(-1.0, min(1.0, sin_el)))
    cos_az = (math.sin(dec) - math.sin(el) * math.sin(lat)) / (math.cos(el) * math.cos(lat) + 1e-12)
    az = math.acos(max(-1.0, min(1.0, cos_az)))
    if math.sin(ha) > 0:
        az = 2 * math.pi - az
    return math.degrees(az) % 360, math.degrees(el)


def main():
    layout = LAYOUT.read_text()
    mirror = MIRROR.read_text()
    loops = mirror_loops(parse_loops(re.search(r'<path id="walls"[^>]*d="([^"]+)"', mirror).group(1)))
    symbol_loops = mirror_loops(parse_loops(re.search(r'<path id="symbols"[^>]*d="([^"]+)"', mirror).group(1)))
    outline_line = next(line for line in layout.splitlines() if 'stroke="#222"' in line and "points=" in line)
    outline_page = [tuple(map(float, p.split(","))) for p in re.search(r'points="([^"]+)"', outline_line).group(1).split()]
    outline = [(PLAN_W - x, y) for x, y in (page_to_plan(x, y) for x, y in outline_page)]
    # Зеркало меняет обход контура. Свес и триангуляция ждут положительную площадь.
    area = 0.0
    for i, (x, y) in enumerate(outline):
        x1, y1 = outline[(i + 1) % len(outline)]
        area += x * y1 - x1 * y
    if area < 0:
        outline.reverse()
    roof_poly = offset_polygon(outline, OVERHANG)

    xs = [p[0] for loop in loops for p in loop] + [p[0] for p in roof_poly]
    ys = [p[1] for loop in loops for p in loop] + [p[1] for p in roof_poly]
    pad = 0.3
    ox, oy = min(xs) - pad, min(ys) - pad
    w = int(math.ceil((max(xs) + pad - ox) / CELL))
    h = int(math.ceil((max(ys) + pad - oy) / CELL))
    walls = raster(loops, ox, oy, w, h)
    syms = raster(symbol_loops, ox, oy, w, h)
    removed = drop_junk_columns(walls, ox, oy)
    print(f"убрано отдельных столбиков: {removed}")
    openings = find_openings(walls, syms, ox, oy, outline)
    # В проёме стены нет на всю высоту: у окна подоконник и перемычка, у двери только перемычка.
    for op in openings:
        walls[op["r0"]:op["r1"] + 1, op["c0"]:op["c1"]] = 0

    def rects_to_boxes(rects, y0, y1, cx, cy):
        boxes = []
        for x0, r0, x1, r1 in rects:
            px0 = ox + x0 * CELL
            px1 = ox + x1 * CELL
            py0 = oy + r0 * CELL
            py1 = oy + r1 * CELL
            e0, n0 = to_east_north(px0, py0)
            e1, n1 = to_east_north(px0, py1)
            e2, n2 = to_east_north(px1, py0)
            e3, n3 = to_east_north(px1, py1)
            east0, east1 = min(e0, e1, e2, e3), max(e0, e1, e2, e3)
            north0, north1 = min(n0, n1, n2, n3), max(n0, n1, n2, n3)
            # Прямоугольник сетки повёрнут относительно сторон света, поэтому
            # храним четыре угла плана, а не ось-параллельный ящик.
            corners = [(px0, py0), (px1, py0), (px1, py1), (px0, py1)]
            world = []
            for px, py in corners:
                east, north = to_east_north(px, py)
                world.append([east - cx, y0, north - cy])
            boxes.append({"y0": y0, "y1": y1, "ring": world})
        return boxes

    # Центр — середина внешнего контура.
    ce = cn = 0.0
    for x, y in outline:
        e, n = to_east_north(x, y)
        ce += e
        cn += n
    ce /= len(outline)
    cn /= len(outline)

    def world_ring(poly, y):
        ring = []
        for x, yplan in poly:
            east, north = to_east_north(x, yplan)
            ring.append([round(east - ce, 4), round(y, 4), round(north - cn, 4)])
        return ring

    wall_boxes = rects_to_boxes(greedy(walls), 0.0, WALL_H, ce, cn)
    for op in openings:
        rect = [(op["c0"], op["r0"], op["c1"], op["r1"] + 1)]
        wall_boxes.extend(rects_to_boxes(rect, HEAD, WALL_H, ce, cn))
        if op["kind"] == "window":
            wall_boxes.extend(rects_to_boxes(rect, 0.0, SILL, ce, cn))

    roof_tris = []
    for a, b, c in triangulate(roof_poly):
        tri = []
        for x, yplan in (a, b, c):
            east, north = to_east_north(x, yplan)
            tri.append([round(east - ce, 4), round(WALL_H, 4), round(north - cn, 4)])
        roof_tris.append(tri)
    roof_top = []
    for a, b, c in triangulate(roof_poly):
        tri = []
        for x, yplan in (a, b, c):
            east, north = to_east_north(x, yplan)
            tri.append([round(east - ce, 4), round(WALL_H + ROOF_T, 4), round(north - cn, 4)])
        roof_top.append(tri)

    floor_tris = []
    for a, b, c in triangulate(outline):
        tri = []
        for x, yplan in (a, b, c):
            east, north = to_east_north(x, yplan)
            tri.append([round(east - ce, 4), 0.02, round(north - cn, 4)])
        floor_tris.append(tri)

    plot = []
    n_win = sum(op["kind"] == "window" for op in openings)
    n_door = sum(op["kind"] == "door" for op in openings)
    print(f"проёмы: окна {n_win}, двери {n_door}")
    for op in openings:
        print(f"  {op['kind']:6} {op['axis']} {op['span']:.2f}×{op['thick']:.2f}  ({op['x0']:.2f},{op['y0']:.2f})")

    for line in layout.splitlines():
        if line.startswith("<polygon points=") and 'fill="#b7d48c"' in line:
            for pair in re.search(r'points="([^"]+)"', line).group(1).split():
                px, py = map(float, pair.split(","))
                x, y = page_to_plan(px, py)
                east, north = to_east_north(x, y)
                plot.append([round(east - ce, 3), round(north - cn, 3)])
            break

    data = {
        "lat": LAT,
        "lon": LON,
        "tz": 3,
        "wallHeight": WALL_H,
        "roofOverhang": OVERHANG,
        "sill": SILL,
        "head": HEAD,
        "azimuthXDeg": round(math.degrees(AZ_X), 2),
        "azimuthYDeg": round(math.degrees(AZ_Y), 2),
        "walls": wall_boxes,
        "lintels": [],
        "sills": [],
        "roofBottom": roof_tris,
        "roofTop": roof_top,
        "roofRing": world_ring(roof_poly, WALL_H),
        "roofRingTop": world_ring(roof_poly, WALL_H + ROOF_T),
        "floor": floor_tris,
        "plot": plot,
    }
    payload = json.dumps(data, separators=(",", ":"))
    OUT.write_text(payload)
    OUT.with_name("geometry.js").write_text("export default " + payload + ";\n")
    print(f"стены {len(wall_boxes)} крыша {len(roof_tris)} → {OUT.name} {OUT.stat().st_size}")
    for label, hm in (("март 9:00", (2026, 3, 21, 9, 0)), ("июнь 9:00", (2026, 6, 21, 9, 0)),
                      ("июнь 13:10", (2026, 6, 21, 13, 10)), ("декабрь 12:00", (2026, 12, 21, 12, 0))):
        az, el = sun_az_el(*hm)
        print(f"  {label}: азимут {az:.1f}° высота {el:.1f}°")


if __name__ == "__main__":
    main()
