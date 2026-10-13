#!/usr/bin/env python3
"""Sync the redesigned terrace from the floor plan onto the D2 site plan."""
import math
import re
from lxml import etree

SRC = "plan-1-etazh-variant-d.svg"
LAY = "abrikosovaya-22-layout-variant-d2-1-100.svg"
SVG = "http://www.w3.org/2000/svg"

def q(tag):
    return f"{{{SVG}}}{tag}"

def parse_transform(s):
    if not s:
        return (1, 0, 0, 1, 0, 0)
    m = (1, 0, 0, 1, 0, 0)

    def mul(a, b):
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
            tx, ty = nums[0], nums[1] if len(nums) > 1 else 0
            t = (1, 0, 0, 1, tx, ty)
        elif kind == "scale":
            sx, sy = nums[0], nums[1] if len(nums) > 1 else nums[0]
            t = (sx, 0, 0, sy, 0, 0)
        else:
            ang = math.radians(nums[0])
            c, sn = math.cos(ang), math.sin(ang)
            t = (c, sn, -sn, c, 0, 0)
            if len(nums) >= 3:
                cx, cy = nums[1], nums[2]
                t = mul(mul((1, 0, 0, 1, cx, cy), t), (1, 0, 0, 1, -cx, -cy))
        m = mul(m, t)
    return m

def mul(a, b):
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

def world_matrix(el, stop_id=None):
    chain = []
    e = el
    while e is not None:
        if stop_id and e.get("id") == stop_id:
            break
        chain.append(e)
        e = e.getparent()
    m = (1, 0, 0, 1, 0, 0)
    for e in reversed(chain):
        if e.get("transform"):
            m = mul(m, parse_transform(e.get("transform")))
    return m

def shape_points(el, stop_id=None):
    m = world_matrix(el, stop_id)
    tag = el.tag.split("}")[-1]
    if tag == "rect":
        x = float(el.get("x") or 0)
        y = float(el.get("y") or 0)
        w = float(el.get("width"))
        h = float(el.get("height"))
        return [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)]
    if el.get("points"):
        nums = [float(v) for v in re.findall(r"[-+]?(?:\d+\.?\d*|\.\d+)", el.get("points"))]
        return [apply(m, nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
    return []

def bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)

def to3(x, y):
    return ((x - 27.90) / 10 - 4.42, 18.88 - (y + 31.11) / 10)

src = etree.parse(SRC)
lay = etree.parse(LAY)
sroot = src.getroot()
lroot = lay.getroot()

def sfind(eid):
    els = sroot.xpath(f"//*[@id='{eid}']")
    return els[0] if els else None

def lfind_all(eid):
    return lroot.xpath(f"//*[@id='{eid}']")

page = lfind_all("p-plan-d-page")[0]
s8 = sfind("rect8-L")
l8 = lfind_all("p-rect8-L")[0]
DX = float(l8.get("x")) - float(s8.get("x"))
DY = float(l8.get("y")) - float(s8.get("y"))
print(f"offset {DX:.5f}, {DY:.5f}")

def lay_pts(pts):
    return [(p[0] + DX, p[1] + DY) for p in pts]

def fmt_pts(pts):
    return " ".join(f"{p[0]:.3f},{p[1]:.3f}" for p in pts)

def make(tag, **attrs):
    el = etree.Element(q(tag))
    for k, v in attrs.items():
        el.set(k, v)
    return el

# Drop the previous two-terrace drawing and the old panoramic assemblies.
for eid in [
    "p-g-terr2", "p-roombox-g-terr2", "p-rect2066",
    "p-rect2004", "p-rect2006", "p-rect2008",
    "p-polygon5537", "p-polygon5539", "p-polygon5541", "p-polygon5543",
    "p-g1739", "p-g1090", "p-g1062", "p-rect1099", "p-rect1097",
]:
    for el in lfind_all(eid):
        parent = el.getparent()
        if parent is not None:
            parent.remove(el)
            print("removed", eid)

def place_rect(src_id, lay_id, style):
    pts = lay_pts(shape_points(sfind(src_id)))
    x0, y0, x1, y1 = bbox(pts)
    el = make(
        "rect",
        id=lay_id,
        x=f"{x0:.4f}",
        y=f"{y0:.4f}",
        width=f"{x1 - x0:.4f}",
        height=f"{y1 - y0:.4f}",
        style=style,
    )
    page.append(el)
    return (x0, y0, x1, y1)

win_style = "fill:#00ffff;stroke:#000000;stroke-width:0.22"
yel_style = "fill:#ffdd55;stroke:#000000;stroke-width:0.22"
col_style = "fill:#502d16;stroke:none"

# Moved yellow windows keep their place; redrawn axis-aligned in the plan frame.
for eid in ("rect4132", "rect4380"):
    for old in lfind_all("p-" + eid):
        old.getparent().remove(old)
    place_rect(eid, "p-" + eid, yel_style)

south = place_rect("rect1097", "p-rect1097", win_style)
east = place_rect("rect1064", "p-rect1064", win_style)
print("south window", [round(v, 2) for v in south])
print("east window", [round(v, 2) for v in east])

# Three equal sections. Mullions are the division the plan itself does not draw.
def mullions(box, along_x, prefix):
    x0, y0, x1, y1 = box
    for i, t in enumerate((1 / 3, 2 / 3), 1):
        if along_x:
            x = x0 + (x1 - x0) * t
            page.append(make("line", id=f"{prefix}-{i}", x1=f"{x:.3f}", y1=f"{y0:.3f}", x2=f"{x:.3f}", y2=f"{y1:.3f}",
                              stroke="#111111", **{"stroke-width": "0.16"}))
        else:
            y = y0 + (y1 - y0) * t
            page.append(make("line", id=f"{prefix}-{i}", x1=f"{x0:.3f}", y1=f"{y:.3f}", x2=f"{x1:.3f}", y2=f"{y:.3f}",
                              stroke="#111111", **{"stroke-width": "0.16"}))

mullions(south, True, "p-mullion-south")
mullions(east, False, "p-mullion-east")

# Terrace slab, steps, columns, dashed area.
slab_pts = lay_pts(shape_points(sfind("polygon1114")))
page.append(make(
    "polygon", id="p-polygon1114", points=fmt_pts(slab_pts),
    style="fill:#ffeeaa;stroke:#000000;stroke-width:0.2",
))
for eid, lid in (("polygon2558", "p-polygon2558"), ("polygon2560", "p-polygon2560")):
    pts = lay_pts(shape_points(sfind(eid)))
    page.append(make(
        "polygon", id=lid, points=fmt_pts(pts),
        style="fill:none;stroke:#222222;stroke-width:0.35",
    ))
for eid in ("rect2010", "rect2622", "rect2546", "rect2552"):
    for old in lfind_all("p-" + eid):
        old.getparent().remove(old)
    place_rect(eid, "p-" + eid, col_style)

room = lfind_all("p-roombox-g-terr1")[0]
room.set("points", fmt_pts(lay_pts(shape_points(sfind("roombox-g-terr1")))))
if room.get("transform"):
    del room.attrib["transform"]

# Label sits on the single terrace.
lab = lfind_all("p-g-terr1")[0]
# Source rotate center, shifted into the site-plan copy.
lab.set("transform", f"rotate(-90,{129.14988 + DX:.5f},{-11.25365 + DY:.5f})")
lfind_all("p-g-terr1-name")[0].text = "Терраса"
meta = lfind_all("p-g-terr1-meta")[0]
meta.text = "17,32 м²"
dim = lfind_all("p-g-terr1-dim")[0]
dim.text = "3,00×5,77"

# Dining table: same drawing, rotation center moved with the terrace.
g1904 = lfind_all("p-g1904")[0]
cx, cy = 141.32606, 127.63823
g1904.set("transform", f"matrix(-1,0,0,-1,{2 * cx + DX:.5f},{2 * cy + DY:.5f})")

# Door swing of the north panoramic section, copied from the source symbol.
src_door = sfind("g1074")
door = etree.fromstring(etree.tostring(src_door))
def prefix_ids(el):
    if el.get("id"):
        el.set("id", "p-" + el.get("id"))
    for c in el:
        prefix_ids(c)
prefix_ids(door)
a, b, c, d, e, f = parse_transform(door.get("transform"))
door.set("transform", f"matrix({a:.6g},{b:.6g},{c:.6g},{d:.6g},{e + DX:.5f},{f + DY:.5f})")
page.append(door)

# Porch columns recolored with the terrace posts.
for eid in ("p-rect55", "p-rect57"):
    el = lfind_all(eid)[0]
    style = el.get("style") or ""
    style = style.replace("#1a1a1a", "#502d16")
    el.set("style", style)

# Blind area around the house, porch and the single terrace. 1 m outside.
# Outline in source plan millimetres, y downward.
foot = [
    (27.90, 133.08), (157.05, 133.08), (157.05, 67.15), (206.13, 67.15),
    (206.13, -31.11), (27.90, -31.11), (27.90, 29.09), (12.07, 29.09),
    (12.07, 65.25), (27.90, 65.25),
]
outer = [
    (167.05, 143.08), (167.05, 77.15), (216.13, 77.15), (216.13, -41.11),
    (17.90, -41.11), (17.90, 19.09), (2.07, 19.09), (2.07, 75.25),
    (17.90, 75.25), (17.90, 143.08),
]

def fit_to_root():
    # Two corners of the west wall, source visual -> layout root.
    sp = shape_points(sfind("rect46"))
    lp = shape_points(lfind_all("p-rect46")[0])
    # Use north-west and south-west outer corners: smallest x in source.
    def key(p):
        return (round(p[0], 1), round(p[1], 1))
    # Pair by matching local-corner order (both lists are the same corner sequence).
    pairs = list(zip(sp, lp))
    (x1, y1), (u1, v1) = pairs[0]
    (x2, y2), (u2, v2) = pairs[1]
    # Solve u = a*x + c*y + e, v = b*x + d*y + f with a third point.
    (x3, y3), (u3, v3) = pairs[2]
    import numpy as np
    A = np.array([
        [x1, y1, 1, 0, 0, 0],
        [0, 0, 0, x1, y1, 1],
        [x2, y2, 1, 0, 0, 0],
        [0, 0, 0, x2, y2, 1],
        [x3, y3, 1, 0, 0, 0],
        [0, 0, 0, x3, y3, 1],
    ], dtype=float)
    rhs = np.array([u1, v1, u2, v2, u3, v3], dtype=float)
    sol, *_ = np.linalg.lstsq(A, rhs, rcond=None)
    return sol

try:
    import numpy as np
    sol = fit_to_root()
except Exception as ex:
    print("numpy missing", ex)
    raise

def root_of(x, y, sol=sol):
    a, c, e, b, d, f = sol
    return (a * x + c * y + e, b * x + d * y + f)

def path_of(pts):
    p = [root_of(*pt) for pt in pts]
    return "M " + " L ".join(f"{x:.2f},{y:.2f}" for x, y in p) + " Z"

blind = lfind_all("blind-area")[0]
if blind.get("transform"):
    del blind.attrib["transform"]
blind.set("d", path_of(outer) + " " + path_of(foot))
print("blind updated")

# Source-plan mullions, inserted without rewriting the embedded bitmap.
south_s = bbox(shape_points(sfind("rect1097")))
east_s = bbox(shape_points(sfind("rect1064")))
lines = []
for i, t in enumerate((1 / 3, 2 / 3), 1):
    x = south_s[0] + (south_s[2] - south_s[0]) * t
    lines.append(
        f'  <line id="mullion-south-{i}" x1="{x:.3f}" y1="{south_s[1]:.3f}" x2="{x:.3f}" y2="{south_s[3]:.3f}" stroke="#111111" stroke-width="0.16"/>'
    )
    y = east_s[1] + (east_s[3] - east_s[1]) * t
    lines.append(
        f'  <line id="mullion-east-{i}" x1="{east_s[0]:.3f}" y1="{y:.3f}" x2="{east_s[2]:.3f}" y2="{y:.3f}" stroke="#111111" stroke-width="0.16"/>'
    )
raw = open(SRC, encoding="utf-8").read()
raw = raw.replace("</svg>", "\n".join(lines) + "\n</svg>", 1)
open(SRC, "w", encoding="utf-8").write(raw)
print("source mullions", lines)

lay.write(LAY, xml_declaration=True, encoding="UTF-8")
print("layout written")

# Furniture on the terrace and the door arc, in plan metres.
def segments_of(group_id):
    el = sfind(group_id)
    segs = []
    for node in el.iter():
        tag = node.tag.split("}")[-1]
        if tag == "rect":
            pts = shape_points(node)
            pts3 = [to3(*p) for p in pts]
            for i in range(4):
                a, b = pts3[i], pts3[(i + 1) % 4]
                if math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.08:
                    segs.append((a[0], a[1], b[0], b[1]))
        elif tag == "path" and node.get("d"):
            d = node.get("d")
            mm = re.match(
                r"m\s*([-\d.]+),([-\d.]+)\s*c\s*([-\d.]+),([-\d.]+)\s*([-\d.]+),([-\d.]+)\s*([-\d.]+),([-\d.]+)",
                d,
            )
            if not mm:
                continue
            n = [float(v) for v in mm.groups()]
            p0 = (n[0], n[1])
            p1 = (p0[0] + n[2], p0[1] + n[3])
            p2 = (p0[0] + n[4], p0[1] + n[5])
            p3 = (p0[0] + n[6], p0[1] + n[7])
            m = world_matrix(node)
            samples = []
            for i in range(9):
                t = i / 8
                omt = 1 - t
                x = omt**3 * p0[0] + 3 * omt**2 * t * p1[0] + 3 * omt * t**2 * p2[0] + t**3 * p3[0]
                y = omt**3 * p0[1] + 3 * omt**2 * t * p1[1] + 3 * omt * t**2 * p2[1] + t**3 * p3[1]
                samples.append(to3(*apply(m, x, y)))
            for a, b in zip(samples, samples[1:]):
                segs.append((a[0], a[1], b[0], b[1]))
    return segs

furn = segments_of("g1904")
swing = segments_of("g1074")
print("furniture", len(furn), "swing", len(swing))
if swing:
    ys = [p for s in swing for p in (s[1], s[3])]
    xs = [p for s in swing for p in (s[0], s[2])]
    print("swing bbox", min(xs), min(ys), max(xs), max(ys))

js = open("house-light/variant-d2.js", encoding="utf-8").read()
body = ",\n".join(
    f"  [{a:.3f}, {b:.3f}, {c:.3f}, {d:.3f}]" for a, b, c, d in furn
)
js2, n = re.subn(
    r"const TERRACE_FURNITURE = \[.*?\];",
    "const TERRACE_FURNITURE = [\n" + body + "\n];",
    js,
    count=1,
    flags=re.S,
)
print("furniture replaced", n)

# Drop the old south-door swing and the old terrace-door swing.
old_south = """  [2.262, 2.723, 2.709, 3.529],
  [3.163, 2.781, 3.146, 2.911],
  [3.146, 2.911, 3.120, 3.022],
  [3.120, 3.022, 3.084, 3.116],
  [3.084, 3.116, 3.036, 3.197],
  [3.036, 3.197, 2.975, 3.268],
  [2.975, 3.268, 2.900, 3.331],
  [2.900, 3.331, 2.810, 3.391],
  [2.810, 3.391, 2.704, 3.450],"""
old_east = """  [5.046, 3.476, 4.240, 3.923],
  [4.988, 4.376, 4.858, 4.360],
  [4.858, 4.360, 4.747, 4.334],
  [4.747, 4.334, 4.653, 4.298],
  [4.653, 4.298, 4.572, 4.249],
  [4.572, 4.249, 4.501, 4.188],
  [4.501, 4.188, 4.438, 4.114],
  [4.438, 4.114, 4.378, 4.024],
  [4.378, 4.024, 4.319, 3.918]"""
new_east = ",\n".join(f"  [{a:.3f}, {b:.3f}, {c:.3f}, {d:.3f}]" for a, b, c, d in swing)
if old_south not in js2 or old_east not in js2:
    print("SWING BLOCK MISSING")
else:
    js2 = js2.replace(old_south + "\n" + old_east, new_east, 1)
    print("swings replaced", len(swing))
open("house-light/variant-d2.js", "w", encoding="utf-8").write(js2)
