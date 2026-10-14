#!/usr/bin/env python3
"""Печать плана этажа: ориентация как в исходном файле, без поворота.

На лист добавляются северо-западный угол участка, северная и западная
границы до конца дома и отступы дома и навеса до этих границ.
Координаты считаются той же привязкой, что и на схеме участка.
"""
import math
import re
import sys
from pathlib import Path

from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_print import place_callout, place_compass  # noqa: E402

SVG = "http://www.w3.org/2000/svg"
NS = {"svg": SVG}

# Положение плана на схеме D2: сдвиг файла внутрь p-plan-d-page, затем матрицы.
DX, DY = -0.111021, 14.898118
M_PAGE = (0.0, 1.0, -1.0, 0.0, 180.99251, -5.18771)
M_HOUSE = (-0.32613769, -0.94539090, 0.94526515, -0.32613636, 451.34812, 609.25963)

PLOT = [(276.41, 418.68), (756.96, 252.89), (924.99, 549.55), (412.81, 659.59)]
LAT0, LON0 = 53.918361007, 27.860727594

# Наружные углы стен по размерным линиям самого плана.
HOUSE = [
    ("nw", (27.901022, -31.108116)),
    ("ne", (206.13103, -31.108116)),
    ("e", (206.13103, 67.151886)),
    ("in", (125.21104, 67.151886)),
    ("se", (125.21104, 133.05188)),
    ("sw", (27.901022, 133.05188)),
]


def mul(m, p):
    a, b, c, d, e, f = m
    x, y = p
    return (a * x + c * y + e, b * x + d * y + f)


def to_site(p):
    return mul(M_HOUSE, mul(M_PAGE, (p[0] + DX, p[1] + DY)))


def vertex_centroid(pts):
    # Так же, как на печатной схеме участка: среднее вершин контура.
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def geo(site_pt, center):
    north = (center[1] - site_pt[1]) * 0.1
    east = (site_pt[0] - center[0]) * 0.1
    lat = LAT0 + north / 111320.0
    lon = LON0 + east / (111320.0 * math.cos(math.radians(LAT0)))
    return lat, lon


def fmt_deg(lat, lon):
    return f"{lat:.6f}° с.ш.", f"{lon:.6f}° в.д."


def fmt_m(meters):
    return f"{meters:.2f}".replace(".", ",") + " м"


def parse_transform(s):
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


def recolor(el):
    repl = {
        "#ffdd55": "#ffffff",
        "#00ffff": "#ffffff",
        "#ffeeaa": "#ffffff",
        "#c0392b": "#111111",
        "#8a7358": "#222222",
    }
    for attr in ("style", "fill", "stroke"):
        val = el.get(attr)
        if not val:
            continue
        low = val
        for src, dst in repl.items():
            low = re.sub(src, dst, low, flags=re.I)
        if low != val:
            el.set(attr, low)


def canopy_points(root):
    el = root.find(".//svg:path[@id='canopy-eave']", NS)
    nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("d"))]
    # path: m x,y dx,dy dx,dy dx,dy  (relative after the first pair)
    x, y = nums[0], nums[1]
    pts = [(x, y)]
    for i in range(2, 8, 2):
        x += nums[i]
        y += nums[i + 1]
        pts.append((x, y))
    return pts


def edge(p0, p1):
    ux, uy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(ux, uy)
    return (ux / length, uy / length), length


def project(p0, u, p):
    return (p[0] - p0[0]) * u[0] + (p[1] - p0[1]) * u[1]


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def obstacle_segments(root):
    """Отрезки стен и рамки подписей комнат в координатах плана."""
    segs = []
    for el in root.iter():
        if any(a.tag.split("}")[-1] == "defs" for a in el.iterancestors()):
            continue
        tag = el.tag.split("}")[-1]
        m = world_matrix(el)
        if tag == "line":
            try:
                a = apply(m, float(el.get("x1")), float(el.get("y1")))
                b = apply(m, float(el.get("x2")), float(el.get("y2")))
            except (TypeError, ValueError):
                continue
            segs.append((a, b))
        elif tag == "rect":
            try:
                w, h = float(el.get("width")), float(el.get("height"))
            except (TypeError, ValueError):
                continue
            if w > 300 or h > 250:
                continue
            x, y = float(el.get("x") or 0), float(el.get("y") or 0)
            pts = [apply(m, px, py) for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
            segs.extend(zip(pts, pts[1:] + pts[:1]))
        elif tag in ("polygon", "polyline") and el.get("points"):
            nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("points"))]
            pts = [apply(m, nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
            if len(pts) >= 2:
                nxt = pts[1:] + (pts[:1] if tag == "polygon" else [])
                segs.extend(zip(pts, nxt))
        elif tag == "text":
            raw = "".join(el.itertext()).strip()
            if not raw:
                continue
            style = el.get("style") or ""
            cls = el.get("class") or ""
            size = 2.2
            found = re.search(r"font-size:\s*([0-9.]+)", style)
            if found:
                size = float(found.group(1))
            elif cls == "rmeta":
                size = 1.4
            x = float(el.get("x") or 0)
            y = float(el.get("y") or 0)
            c = apply(m, x, y)
            anchor = el.get("text-anchor") or "middle"
            if "text-anchor:start" in style.replace(" ", ""):
                anchor = "start"
            elif "text-anchor:end" in style.replace(" ", ""):
                anchor = "end"
            w = size * (0.52 * len(raw) + 0.4)
            h = size * 1.2
            if anchor == "start":
                x0, x1 = c[0] - size * 0.2, c[0] + w
            elif anchor == "end":
                x0, x1 = c[0] - w, c[0] + size * 0.2
            else:
                x0, x1 = c[0] - w / 2, c[0] + w / 2
            y0, y1 = c[1] - h * 0.9, c[1] + h * 0.35
            box = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
            segs.extend(zip(box, box[1:] + box[:1]))
    return segs


def scale(v, s):
    return (v[0] * s, v[1] * s)


def text_angle(u):
    ang = math.degrees(math.atan2(u[1], u[0]))
    if ang > 90:
        ang -= 180
    elif ang < -90:
        ang += 180
    return ang


# Половина засечки. Выносная выступает за размерную на всю длину засечки.
TICK_ARM = 2.4
PAST_DIM = 2 * TICK_ARM


class Draw:
    def __init__(self):
        self.parts = []
        self.pts = []
        self.segs = []

    def track(self, p):
        self.pts.append(p)

    def line(self, p, q, width):
        self.parts.append(
            f'<line x1="{p[0]:.2f}" y1="{p[1]:.2f}" x2="{q[0]:.2f}" y2="{q[1]:.2f}" stroke-width="{width}"/>'
        )
        self.track(p)
        self.track(q)
        self.segs.append((p, q))

    def tick(self, p, u):
        ang = math.atan2(u[1], u[0]) + math.pi / 4
        d = (math.cos(ang) * TICK_ARM, math.sin(ang) * TICK_ARM)
        self.line((p[0] - d[0], p[1] - d[1]), (p[0] + d[0], p[1] + d[1]), 0.9)

    def dot(self, p, r=1.35):
        self.parts.append(f'<circle cx="{p[0]:.2f}" cy="{p[1]:.2f}" r="{r}" fill="#111111" stroke="none"/>')
        self.track((p[0] - r, p[1] - r))
        self.track((p[0] + r, p[1] + r))

    def label(self, center, u, side, text, size=4.6):
        ang = text_angle(u)
        w = size * (0.52 * len(text) + 0.45)
        h = size * 1.25
        c = add(center, scale(side, h * 0.55 + 1.4))
        self.parts.append(
            f'<g transform="translate({c[0]:.2f},{c[1]:.2f}) rotate({ang:.2f})">'
            f'<rect x="{-w / 2:.2f}" y="{-h / 2:.2f}" width="{w:.2f}" height="{h:.2f}" fill="#ffffff" stroke="none"/>'
            f'<text x="0" y="0" font-size="{size:.2f}" fill="#111111" stroke="none" '
            f'text-anchor="middle" dominant-baseline="middle">{text}</text></g>'
        )
        rad = math.radians(ang)
        ca, sa = math.cos(rad), math.sin(rad)
        corners = []
        for sx in (-w / 2, w / 2):
            for sy in (-h / 2, h / 2):
                corners.append((c[0] + sx * ca - sy * sa, c[1] + sx * sa + sy * ca))
                self.track(corners[-1])
        ring = [corners[i] for i in (0, 1, 3, 2)]
        for i in range(4):
            self.segs.append((ring[i], ring[(i + 1) % 4]))

    def setback(self, corner, foot, text, shift=0.0, along=(1.0, 0.0), at=0.5):
        """Отступ: линия от границы до угла, сдвинутая вдоль границы на shift."""
        delta = scale(along, shift)
        p0 = add(foot, delta)
        p1 = add(corner, delta)
        direction = (p1[0] - p0[0], p1[1] - p0[1])
        length = math.hypot(*direction)
        u = (direction[0] / length, direction[1] / length)
        side = (-u[1], u[0])
        if shift:
            self.line(foot, p0, 0.28)
        self.line(p0, p1, 0.55)
        self.tick(p0, u)
        self.tick(p1, u)
        self.label(add(p0, scale(u, length * at)), u, side, text)

    def from_corner(self, origin, u, outward, stations, base=9.0, gap=12.0):
        """Расстояние от угла участка вдоль границы до проекции угла."""
        ordered = sorted(stations, reverse=True)
        if not ordered:
            return
        outer = base + gap * (len(ordered) - 1)
        # Угол участка: сквозь все линии этой стороны и чуть за крайней.
        self.line(origin, add(origin, scale(outward, outer + PAST_DIM)), 0.45)
        for i, t in enumerate(ordered):
            off = base + gap * i
            p0 = add(origin, scale(outward, off))
            foot = add(origin, scale(u, t))
            p1 = add(foot, scale(outward, off))
            self.line(p0, p1, 0.5)
            self.tick(p0, u)
            self.tick(p1, u)
            # Своя размерная, и за неё только на длину засечки.
            self.line(foot, add(foot, scale(outward, off + PAST_DIM)), 0.4)
            self.label(add(p0, scale(u, t / 2)), u, scale(outward, -1), fmt_m(t / 10))


def content_points(root):
    pts = []
    for el in root.iter():
        if el.get("id") in ("page-bg", "plot-tie"):
            continue
        if any(a.tag.split("}")[-1] == "defs" for a in el.iterancestors()):
            continue
        tag = el.tag.split("}")[-1]
        if tag not in ("rect", "line", "polygon", "polyline", "circle"):
            continue
        m = world_matrix(el)
        if tag == "rect":
            try:
                w = float(el.get("width"))
                h = float(el.get("height"))
            except (TypeError, ValueError):
                continue
            if w > 300 or h > 250:
                continue
            x = float(el.get("x") or 0)
            y = float(el.get("y") or 0)
            for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h)):
                pts.append(apply(m, px, py))
        elif tag == "line":
            for ax, ay in (("x1", "y1"), ("x2", "y2")):
                pts.append(apply(m, float(el.get(ax)), float(el.get(ay))))
        elif tag in ("polygon", "polyline") and el.get("points"):
            nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("points"))]
            for i in range(0, len(nums) - 1, 2):
                pts.append(apply(m, nums[i], nums[i + 1]))
        elif tag == "circle":
            cx, cy, r = float(el.get("cx")), float(el.get("cy")), float(el.get("r") or 0)
            pts.append(apply(m, cx - r, cy - r))
            pts.append(apply(m, cx + r, cy + r))
    return pts


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "plan-1-etazh-variant-d.svg")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else str(src.with_name(src.stem + "-print.svg")))
    root = etree.parse(str(src)).getroot()

    for el in list(root):
        tag = el.tag.split("}")[-1]
        if tag in ("namedview", "metadata", "title") or el.get("id") in ("page-bg", "text6", "namedview498"):
            root.remove(el)
    for el in list(root.iter()):
        if el.getparent() is None:
            continue
        if el.tag.split("}")[-1] == "image" or el.get("id") in ("sand_bitmap",):
            el.getparent().remove(el)
    for el in root.iter():
        recolor(el)
        if el.tag.split("}")[-1] == "style" and el.text and re.search(r"(^|\n)\s*text\s*\{", el.text):
            el.text = re.sub(r"(^|\n)(\s*)text\s*\{", r"\1\2#drawing text {", el.text)

    canopy = canopy_points(root)
    a_plan = None
    # Углы участка в координатах этого плана.
    center = vertex_centroid(PLOT)
    plans = []
    for p in PLOT:
        # обратное преобразование: site -> plan file
        a, b, c, d, e, f = M_HOUSE
        det = a * d - b * c
        x, y = p[0] - e, p[1] - f
        q = ((d * x - c * y) / det, (-b * x + a * y) / det)
        r = (q[1] + M_PAGE[4] * 0 + 5.18771, 180.99251 - q[0])
        # M_PAGE e is 180.99251, f is -5.18771
        # inv: x_page = y_mid + 5.18771, y_page = 180.99251 - x_mid
        plans.append((r[0] - DX, r[1] - DY))
    a_plan, b_plan, _, d_plan = plans
    nu, _ = edge(a_plan, b_plan)
    wu, _ = edge(a_plan, d_plan)
    # наружу от северной стороны — вверх (меньший y), от западной — влево от хода A→D
    north_out = (0.0, -1.0) if nu[0] > 0 else (0.0, 1.0)
    west_out = (-wu[1], wu[0])

    house_pts = [p for _, p in HOUSE]
    north_end_t = max(project(a_plan, nu, p) for p in house_pts)
    west_end_t = max(project(a_plan, wu, p) for p in house_pts)
    north_end = add(a_plan, scale(nu, north_end_t))
    west_end = add(a_plan, scale(wu, west_end_t))

    draw = Draw()
    draw.line(a_plan, north_end, 1.35)
    draw.line(a_plan, west_end, 1.35)
    draw.tick(north_end, nu)
    draw.tick(west_end, wu)
    draw.dot(a_plan, 1.8)
    # выносная от северо-восточного угла дома до конца северной границы
    ne = dict(HOUSE)["ne"]
    draw.line(ne, (ne[0], a_plan[1]), 0.32)

    def foot_on(p0, u, p):
        return add(p0, scale(u, project(p0, u, p)))

    canopy_north = [p for p in canopy if p[1] < 0]
    canopy_west = sorted(canopy, key=lambda p: abs(project(a_plan, west_out, p)))[:2]

    # Север: навес и северная стена параллельны границе, по одному отступу.
    cn_y = min(p[1] for p in canopy_north)
    cn_east = max(canopy_north, key=lambda p: p[0])
    house_north_y = min(p[1] for p in house_pts)
    north_canopy_m = (cn_y - a_plan[1]) / 10.0
    north_house_m = (house_north_y - a_plan[1]) / 10.0
    # 2,24 м стоит восточнее навеса, чтобы не пересечь отступ 11,65 м.
    x_canopy_dim = 78.0
    draw.line(cn_east, (x_canopy_dim, cn_y), 0.28)
    draw.setback((x_canopy_dim, cn_y), (x_canopy_dim, a_plan[1]), fmt_m(north_canopy_m))
    draw.setback((160.0, house_north_y), (160.0, a_plan[1]), fmt_m(north_house_m))

    # Запад: два западных угла навеса и два конца западной стены.
    for p in canopy_west:
        dist = abs(project(a_plan, west_out, p)) / 10.0
        draw.setback(p, foot_on(a_plan, wu, p), fmt_m(dist), at=0.72)
    for key in ("nw", "sw"):
        p = dict(HOUSE)[key]
        dist = abs(project(a_plan, west_out, p)) / 10.0
        # северный угол стены сдвинуть к A, чтобы линия не пересекла навес
        # Северный отступ сдвинут к углу A: иначе перпендикуляр пересекает навес.
        shift = -36.0 if key == "nw" else 8.0
        draw.setback(p, foot_on(a_plan, wu, p), fmt_m(dist), shift=shift, along=wu)
        if key == "nw":
            # Выносная обходит навес: вдоль северной стены, затем выше карниза.
            p1 = add(p, scale(wu, shift))
            draw.line(p, (34.0, p[1]), 0.28)
            draw.line((34.0, p[1]), (34.0, p1[1]), 0.28)
            draw.line((34.0, p1[1]), p1, 0.28)
        else:
            draw.line(p, add(p, scale(wu, shift)), 0.28)

    def cluster(items, end_t):
        kept = []
        for t, kind in sorted(items, key=lambda it: it[0]):
            if t < 6 or t > end_t + 1:
                continue
            if kept and t - kept[-1][0] < 6:
                if kind == "house":
                    kept[-1] = (t, kind)
                continue
            kept.append((t, kind))
        return [t for t, _ in kept]

    def crosses(a, b, poly):
        def cross(p, q, r):
            return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

        def hit(p, q, r, s):
            return cross(r, s, p) * cross(r, s, q) < 0 and cross(p, q, r) * cross(p, q, s) < 0

        for i, r in enumerate(poly):
            if hit(a, b, r, poly[(i + 1) % len(poly)]):
                return True
        return False

    north_items = [(project(a_plan, nu, p), "house") for p in house_pts]
    north_items += [(project(a_plan, nu, p), "canopy") for p in canopy]
    west_items = [(project(a_plan, wu, p), "house") for p in house_pts]
    west_items += [(project(a_plan, wu, p), "canopy") for p in canopy]
    north_stations = cluster(north_items, north_end_t)
    west_stations = cluster(west_items, west_end_t)
    print("north along", [round(t / 10, 2) for t in north_stations])
    print("west along", [round(t / 10, 2) for t in west_stations])
    draw.from_corner(a_plan, nu, north_out, north_stations)
    draw.from_corner(a_plan, wu, west_out, west_stations, base=10.0, gap=13.0)

    def station_off(stations, base, gap):
        ordered = sorted(stations, reverse=True)
        return {t: base + gap * i for i, t in enumerate(ordered)}

    north_off = station_off(north_stations, 9.0, 12.0)
    west_off = station_off(west_stations, 10.0, 13.0)
    for p in house_pts + canopy:
        for origin, u, outward, offs, end_t in (
            (a_plan, nu, north_out, north_off, north_end_t),
            (a_plan, wu, west_out, west_off, west_end_t),
        ):
            t = project(origin, u, p)
            if t < 6 or t > end_t + 1 or not offs:
                continue
            station = min(offs, key=lambda s: abs(s - t))
            if abs(station - t) > 6:
                continue
            foot = add(origin, scale(u, t))
            if crosses(p, foot, house_pts):
                continue
            draw.line(p, add(foot, scale(outward, offs[station] + PAST_DIM)), 0.4)

    for _, p in HOUSE:
        draw.dot(p, 1.15)

    tie = etree.fromstring(
        f'<g xmlns="{SVG}" id="plot-tie" fill="none" stroke="#111111" stroke-width="0.45" '
        f'font-family="DejaVu Sans, Liberation Sans, sans-serif">{"".join(draw.parts)}</g>'
    )
    root.append(tie)

    pts = content_points(root) + draw.pts + canopy
    pad = 10
    minx, maxx = min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad
    miny, maxy = min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad
    x0, x1, y0, y1 = 6.0, 291.0, 21.2, 197.8
    s = min((x1 - x0) / (maxx - minx), (y1 - y0) / (maxy - miny))
    ox = x0 + ((x1 - x0) - s * (maxx - minx)) / 2
    oy = y0 + ((y1 - y0) - s * (maxy - miny)) / 2
    denom = int(round(100 / s))

    def to_page(p):
        return (ox + s * (p[0] - minx), oy + s * (p[1] - miny))

    obstacles = obstacle_segments(root)
    drawing = etree.Element(f"{{{SVG}}}g", id="drawing")
    drawing.set("transform", f"translate({ox:.3f},{oy:.3f}) scale({s:.6f}) translate({-minx:.3f},{-miny:.3f})")
    for child in list(root):
        drawing.append(child)
    sheet = etree.Element(f"{{{SVG}}}svg", nsmap={None: SVG})
    sheet.set("width", "297mm")
    sheet.set("height", "210mm")
    sheet.set("viewBox", "0 0 297 210")
    sheet.set("version", "1.1")
    etree.SubElement(sheet, f"{{{SVG}}}title").text = "Абрикосовая 22, план 1 этажа, вариант D, печать А4"
    etree.SubElement(sheet, f"{{{SVG}}}rect", width="297", height="210", fill="#ffffff")
    font = "DejaVu Sans, Liberation Sans, sans-serif"
    sheet.append(drawing)
    etree.SubElement(sheet, f"{{{SVG}}}rect", id="margin-top", x="0", y="0", width="297", height="20.6", fill="#ffffff")
    etree.SubElement(sheet, f"{{{SVG}}}rect", id="margin-bottom", x="0", y="199.4", width="297", height="10.6", fill="#ffffff")
    header = [
        (6.2, "3.2", "700", "д. Глебковичи, ул. Абрикосовая, 22  ·  план 1 этажа, вариант D"),
        (10.2, "2.25", "400", "Кадастровый номер 623683401601000218  ·  север листа — вверх, ориентация плана сохранена"),
        (14.0, "2.1", "400", f"Печать А4 альбомная  ·  масштаб 1:{denom}  ·  WGS-84"),
        (17.6, "2.0", "400", "Координаты от точки 53,918361° с.ш., 27,860728° в.д. на центре контура. Это не каталог НКЗ."),
    ]
    for y, size, weight, text in header:
        t = etree.SubElement(sheet, f"{{{SVG}}}text", x="8", y=str(y), fill="#111111")
        t.set("font-family", font)
        t.set("font-size", size)
        t.set("font-weight", weight)
        t.set("text-anchor", "start")
        t.text = text

    labels = [("A", a_plan)] + [(name, p) for name, p in HOUSE]
    page_segs = [tuple(to_page(p) for p in seg) for seg in draw.segs + obstacles]
    content = (ox, oy, ox + s * (maxx - minx), oy + s * (maxy - miny))
    ccx, ccy, comp = place_compass(content, (x0, y0, x1, y1), page_segs)
    geo_parts = []
    occupied = [comp]
    for name, p in labels:
        lat, lon = geo(to_site(p), center)
        la, lo = fmt_deg(lat, lon)
        pg = to_page(p)
        if name == "A":
            width, height = 23.0, 10.4
            rows_of = lambda ty: (
                ((ty - 3.2, ty, ty + 2.8)),
                (("A", "3.3", "700"), (la, "2.15", "400"), (lo, "2.15", "400")),
            )
        else:
            width, height = 21.0, 6.2
            rows_of = lambda ty, la=la, lo=lo: (
                (ty - 1.3, ty + 1.3),
                ((la, "2.05", "400"), (lo, "2.05", "400")),
            )
        placed = place_callout(pg, width, height, page_segs, occupied)
        x, ty, anchor, box = placed[0], placed[1], placed[2], placed[3]
        occupied.append(box)
        ys, rows = rows_of(ty)
        y_mid = (ys[0] + ys[-1]) / 2
        attach = x + 0.4 if anchor == "end" else x - 0.4
        geo_parts.append(
            f'<line x1="{pg[0]:.2f}" y1="{pg[1]:.2f}" x2="{attach:.2f}" y2="{y_mid:.2f}" '
            f'stroke="#111111" stroke-width="0.28" fill="none"/>'
            f'<circle cx="{pg[0]:.2f}" cy="{pg[1]:.2f}" r="0.7" fill="#111111" stroke="none"/>'
        )
        for (text, size, weight), yy in zip(rows, ys):
            geo_parts.append(
                f'<text x="{x:.2f}" y="{yy:.2f}" font-size="{size}" font-weight="{weight}" '
                f'text-anchor="{anchor}" dominant-baseline="middle">{text}</text>'
            )
        print(
            f"{name:3} page {pg[0]:6.1f},{pg[1]:6.1f}  label {x:.1f},{ty:.1f} "
            f"hits={placed[4]} cross={placed[5]}  {la} {lo}"
        )

    geo_g = etree.fromstring(
        f'<g xmlns="{SVG}" id="corner-geo" fill="#111111" font-family="{font}">{"".join(geo_parts)}</g>'
    )
    sheet.append(geo_g)

    compass = etree.fromstring(
        f'<g xmlns="{SVG}" id="compass" fill="none" stroke="#111111" font-family="{font}" font-size="2.6">'
        f'<circle cx="{ccx:.2f}" cy="{ccy:.2f}" r="7.2" fill="#ffffff" stroke-width="0.4"/>'
        f'<line x1="{ccx:.2f}" y1="{ccy + 6:.2f}" x2="{ccx:.2f}" y2="{ccy - 6.8:.2f}" stroke-width="0.7"/>'
        f'<polygon points="{ccx:.2f},{ccy - 7.4:.2f} {ccx - 1.7:.2f},{ccy - 2.8:.2f} {ccx + 1.7:.2f},{ccy - 2.8:.2f}" fill="#111111" stroke="none"/>'
        f'<text x="{ccx:.2f}" y="{ccy - 9.8:.2f}" fill="#111111" stroke="none" text-anchor="middle">С</text>'
        f'<text x="{ccx:.2f}" y="{ccy + 10.2:.2f}" fill="#111111" stroke="none" text-anchor="middle">Ю</text>'
        f'<text x="{ccx - 9.4:.2f}" y="{ccy + 0.4:.2f}" fill="#111111" stroke="none" text-anchor="end">З</text>'
        f'<text x="{ccx + 9.4:.2f}" y="{ccy + 0.4:.2f}" fill="#111111" stroke="none" text-anchor="start">В</text></g>'
    )
    sheet.append(compass)

    span = 100 * s
    x_sb = 168.0
    if x_sb + span > 250:
        x_sb = 250 - span
    x5, x10 = x_sb + span / 2, x_sb + span
    bar = etree.fromstring(
        f'<g xmlns="{SVG}" id="scalebar" stroke="#111111" fill="#111111" stroke-width="0.35" '
        f'font-family="{font}" font-size="2.3">'
        f'<line x1="{x_sb:.2f}" y1="204.2" x2="{x10:.2f}" y2="204.2" stroke-width="0.55"/>'
        f'<line x1="{x_sb:.2f}" y1="202.8" x2="{x_sb:.2f}" y2="205.6"/>'
        f'<line x1="{x5:.2f}" y1="203.3" x2="{x5:.2f}" y2="205.1"/>'
        f'<line x1="{x10:.2f}" y1="202.8" x2="{x10:.2f}" y2="205.6"/>'
        f'<text x="{x_sb:.2f}" y="201.4" stroke="none" text-anchor="middle">0</text>'
        f'<text x="{x5:.2f}" y="201.4" stroke="none" text-anchor="middle">5 м</text>'
        f'<text x="{x10:.2f}" y="201.4" stroke="none" text-anchor="middle">10 м</text></g>'
    )
    sheet.append(bar)
    legend = etree.SubElement(sheet, f"{{{SVG}}}text", x="8", y="206.2", fill="#111111")
    legend.set("font-family", font)
    legend.set("font-size", "2.15")
    legend.text = (
        "Вдоль северной и западной границ — расстояние от угла A до проекций углов дома и навеса. "
        "Короткие размеры поперёк границы — отступ стены и навеса."
    )

    print(f"north canopy {north_canopy_m:.3f}  house {north_house_m:.3f}")
    print(f"scale 1:{denom}  s={s:.4f}")
    print(f"A plan {a_plan[0]:.2f},{a_plan[1]:.2f}")
    out.write_bytes(etree.tostring(sheet, xml_declaration=True, encoding="UTF-8"))
    print("wrote", out)


if __name__ == "__main__":
    main()
