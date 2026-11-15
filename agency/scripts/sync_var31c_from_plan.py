#!/usr/bin/env python3
"""Сверка agency/var3.1c.svg → 3D WALLS/OPENINGS, подписи, подложка «иное»."""
from __future__ import annotations

import math
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "agency" / "var3.1c.svg"
JS = ROOT / "house-light" / "variant-31c.js"
PNG = ROOT / "house-light" / "var31c-furniture-plan.png"
INOE_SVG = ROOT / "house-light" / "var31c-inoe-underlay.svg"

U = 22.039284 / 2.2
X0 = -249.7699155181818
Y0 = 152.28034229090906
VIEWBOX = (-320.0, -50.0, 250.0, 220.0)  # x, y, w, h


def parse_transform(tr: str) -> tuple[float, ...]:
    if not tr:
        return (1, 0, 0, 1, 0, 0)
    a = b = c = d = e = f = 0.0
    a, d = 1.0, 1.0
    for m in re.finditer(r"(matrix|translate|scale|rotate)\(([^)]*)\)", tr):
        kind, args = m.group(1), [float(x) for x in re.split(r"[,\s]+", m.group(2).strip()) if x]
        if kind == "matrix":
            na, nb, nc, nd, ne, nf = args
        elif kind == "translate":
            tx, ty = args[0], args[1] if len(args) > 1 else 0.0
            na, nb, nc, nd, ne, nf = 1, 0, 0, 1, tx, ty
        elif kind == "scale":
            sx, sy = args[0], args[1] if len(args) > 1 else args[0]
            na, nb, nc, nd, ne, nf = sx, 0, 0, sy, 0, 0
        else:
            ang = math.radians(args[0])
            cos, sin = math.cos(ang), math.sin(ang)
            if len(args) == 1:
                na, nb, nc, nd, ne, nf = cos, sin, -sin, cos, 0, 0
            else:
                cx, cy = args[1], args[2]
                na, nb, nc, nd = cos, sin, -sin, cos
                ne = cx - cos * cx + sin * cy
                nf = cy - sin * cx - cos * cy
        a, b, c, d, e, f = (
            a * na + c * nb,
            b * na + d * nb,
            a * nc + c * nd,
            b * nc + d * nd,
            a * ne + c * nf + e,
            b * ne + d * nf + f,
        )
    return a, b, c, d, e, f


def mul(M, N):
    a, b, c, d, e, f = M
    na, nb, nc, nd, ne, nf = N
    return (
        a * na + c * nb,
        b * na + d * nb,
        a * nc + c * nd,
        b * nc + d * nd,
        a * ne + c * nf + e,
        b * ne + d * nf + f,
    )


def apply(M, x, y):
    a, b, c, d, e, f = M
    return a * x + c * y + e, b * x + d * y + f


def disp_to_m(xd, yd):
    return (xd - X0) / U, (Y0 - yd) / U


def extract_group(svg: str, gid: str) -> str:
    m = re.search(rf'<g\b[^>]*\bid="{re.escape(gid)}"[^>]*>', svg)
    if not m:
        raise SystemExit(f"missing {gid}")
    start = m.start()
    depth = 0
    for mm in re.finditer(r"<g\b[^>]*/>|</?g\b[^>]*>", svg[start:]):
        tok = mm.group(0)
        if tok.startswith("</"):
            depth -= 1
            if depth == 0:
                return svg[start : start + mm.end()]
        elif tok.endswith("/>"):
            continue
        else:
            depth += 1
    raise SystemExit(f"unclosed {gid}")


def layer_items(layer: str):
    stack = [(1, 0, 0, 1, 0, 0)]
    items = []
    for m in re.compile(r"<(/?)(g|rect|path)\b([^>]*)(/?)>").finditer(layer):
        closing, tag, attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
        if tag == "g":
            if closing:
                if len(stack) > 1:
                    stack.pop()
            else:
                tr = re.search(r'\btransform="([^"]*)"', attrs)
                stack.append(mul(stack[-1], parse_transform(tr.group(1) if tr else "")))
                if selfclose and len(stack) > 1:
                    stack.pop()
        elif tag == "rect" and not closing:
            dd = dict(re.findall(r'\b(x|y|width|height)="([^"]+)"', attrs))
            if len(dd) < 4:
                continue
            x, y, w, h = map(float, (dd["x"], dd["y"], dd["width"], dd["height"]))
            fill_m = re.search(r"fill:([^;\"]+)", attrs)
            fill = fill_m.group(1) if fill_m else "#000"
            eid_m = re.search(r'\bid="([^"]+)"', attrs)
            eid = eid_m.group(1) if eid_m else "?"
            tr = re.search(r'\btransform="([^"]*)"', attrs)
            M = mul(stack[-1], parse_transform(tr.group(1) if tr else ""))
            corners = [apply(M, x, y), apply(M, x + w, y), apply(M, x + w, y + h), apply(M, x, y + h)]
            mc = [disp_to_m(*p) for p in corners]
            xs = [p[0] for p in mc]
            ys = [p[1] for p in mc]
            items.append((eid, fill, (min(xs), min(ys), max(xs), max(ys))))
    return items


def fmt2(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def build_walls_openings(items):
    skip = {"rect1691", "rect1693", "rect1695", "rect2718", "rect2720", "rect2722"}
    porch = {"rect592", "rect590", "rect586"}
    walls = []
    seen = set()
    for eid, fill, box in items:
        if fill != "#4d4d4d" or eid in skip:
            continue
        if not (-8 <= box[0] <= 16 and 0 <= box[1] <= 22):
            continue
        key = tuple(round(v, 3) for v in box)
        if key in seen:
            continue
        seen.add(key)
        walls.append([round(box[0], 3), round(box[1], 3), round(box[2], 3), round(box[3], 3)])

    door_i = {
        "rect2161",
        "rect2169",
        "rect2177",
        "rect2185",
        "rect2193",
        "rect2201",
        "rect2213",
        "rect2221",
        "rect2261",
        "rect8548",
    }
    door_d = {"rect2269", "rect1024", "rect2245", "rect2253"}
    opens = []
    for eid, fill, box in items:
        if eid in porch:
            continue
        if not (-8 <= box[0] <= 16 and 0 <= box[1] <= 22):
            continue
        x0, y0, x1, y1 = box
        w, h = x1 - x0, y1 - y0
        if fill == "#ffdd55":
            kind = "y"
        elif fill == "#00ffff":
            kind = "p"
        elif fill == "#ffffff" and 0.5 < max(w, h) < 1.2 and min(w, h) < 0.5:
            if eid in door_d:
                kind = "d"
            elif eid in door_i:
                kind = "i"
            else:
                kind = "d" if y1 >= 17.85 or (9.3 <= y0 <= 9.8) else "i"
        else:
            continue
        opens.append([round(x0, 3), round(y0, 3), round(x1, 3), round(y1, 3), kind])
    return walls, opens


def patch_js(walls, opens):
    js = JS.read_text()

    def fmt_arr(rows, with_kind=False):
        lines = []
        for r in rows:
            if with_kind:
                lines.append(f"  [{r[0]}, {r[1]}, {r[2]}, {r[3]}, '{r[4]}'],")
            else:
                lines.append(f"  [{r[0]}, {r[1]}, {r[2]}, {r[3]}],")
        return "\n".join(lines)

    walls_block = "const WALLS = [\n" + fmt_arr(walls) + "\n];"
    opens_block = "const OPENINGS = [\n" + fmt_arr(opens, True) + "\n];"
    js2, n1 = re.subn(r"const WALLS = \[.*?\];", walls_block, js, count=1, flags=re.S)
    js2, n2 = re.subn(r"const OPENINGS = \[.*?\];", opens_block, js2, count=1, flags=re.S)
    if n1 != 1 or n2 != 1:
        raise SystemExit(f"js patch failed walls={n1} openings={n2}")
    JS.write_text(js2)
    print(f"patched {JS.name}: {len(walls)} walls, {len(opens)} openings")


def patch_room_labels(svg: str) -> str:
    """Обновить явно сдвинутые помещения NE-блока."""
    # Гардеробная: 10,21…14,29 × 11,80…13,62 → 4,08×1,81
    # С/у мастер: 8,58…10,57 × 15,03…17,86 → 1,99×2,83
    updates = {
        "text178": ("7,38 м²", "tspan176", "4,08×1,81"),
        "text220": ("5,63 м²", "tspan218", "1,99×2,83"),
    }
    # find tspan ids from file if needed
    for tid, (area, tsp, dims) in list(updates.items()):
        m = re.search(rf'(id="{tid}">)[^<]*(<tspan[^>]*id="{tsp}"[^>]*>)[^<]*', svg)
        if not m:
            # discover tspan id
            m2 = re.search(rf'id="{tid}">([^<]*)<tspan\b([^>]*)>', svg)
            if not m2:
                print(f"warn: skip label {tid}")
                continue
            tsp_id = re.search(r'\bid="([^"]+)"', m2.group(2))
            tsp = tsp_id.group(1) if tsp_id else tsp
            updates[tid] = (area, tsp, dims)

    for tid, (area, tsp, dims) in updates.items():
        svg, n = re.subn(
            rf'(id="{tid}">)[^<]*(<tspan[^>]*id="{tsp}"[^>]*>)[^<]*',
            rf"\g<1>{area}\g<2>{dims}",
            svg,
            count=1,
        )
        print(f"label {tid}: {area} {dims} (n={n})")

    # Общая: 201,59 -6,65 -4,95 +7,38 +5,63 = 203,00
    svg, n = re.subn(
        r'(id="text276"[^>]*>)[^<]*',
        r"\g<1>Общая 203,00 м²",
        svg,
        count=1,
    )
    print(f"total area n={n}")
    return svg


def build_inoe_underlay_svg(plan_svg: str) -> str:
    """Весь слой «иное» без белого фона листа — для посадки."""
    layer = extract_group(plan_svg, "layer3")
    # убрать page bg
    layer = re.sub(
        r'<rect\b[^>]*\bid="rect2391"[^>]*/>',
        "",
        layer,
        count=1,
    )
    layer = re.sub(
        r'<rect\b[^>]*\bid="rect2391"[^>]*>.*?</rect>',
        "",
        layer,
        count=1,
        flags=re.S,
    )
    # переименовать и сделать полупрозрачным
    layer = layer.replace('id="layer3"', 'id="furniture-underlay" data-role="inoe-underlay"', 1)
    layer = re.sub(
        r'\binkscape:label="иное"',
        'inkscape:label="подложка иное"',
        layer,
        count=1,
    )
    # opacity on group
    if "opacity=" not in layer[:200]:
        layer = layer.replace(
            'id="furniture-underlay" data-role="inoe-underlay"',
            'id="furniture-underlay" data-role="inoe-underlay" opacity="0.55"',
            1,
        )
    return layer


def export_inoe_png():
    """Растр слоя иное (без page bg) через временный SVG + Inkscape."""
    plan = PLAN.read_text()
    layer = extract_group(plan, "layer3")
    layer = re.sub(r'<rect\b[^>]*\bid="rect2391"[^>]*/>', "", layer, count=1)
    layer = layer.replace('id="layer3"', 'id="layer3-export"', 1)
    vb = VIEWBOX
    # bump image opacity for readable 3D decal
    layer = re.sub(
        r'(id="image743"[^>]*\bstyle="[^"]*opacity:)[0-9.]+',
        r"\g<1>0.85",
        layer,
        count=1,
    )
    tmp = INOE_SVG
    tmp.write_text(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{vb[2]}mm" height="{vb[3]}mm" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}">
{layer}
</svg>
'''
    )
    subprocess.run(
        [
            "inkscape",
            str(tmp),
            f"--export-filename={PNG}",
            "--export-type=png",
            "--export-dpi=144",
            "--export-background-opacity=0",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    print(f"wrote {PNG} ({PNG.stat().st_size} bytes)")


def viewbox_img_meters():
    x, y, w, h = VIEWBOX
    # SVG y down; plan y north up
    x0, y_north = disp_to_m(x, y)
    x1, y_south = disp_to_m(x + w, y + h)
    return {
        "x0": round(min(x0, x1), 3),
        "y0": round(min(y_north, y_south), 3),
        "x1": round(max(x0, x1), 3),
        "y1": round(max(y_north, y_south), 3),
    }


def main():
    plan = PLAN.read_text()
    layer1 = extract_group(plan, "layer1")
    items = layer_items(layer1)
    walls, opens = build_walls_openings(items)
    patch_js(walls, opens)

    plan2 = patch_room_labels(plan)
    if plan2 != plan:
        PLAN.write_text(plan2)
        print(f"updated labels in {PLAN.name}")

    underlay = build_inoe_underlay_svg(plan2 if plan2 != plan else plan)
    # store snippet path for build_layout to read
    snippet = ROOT / "agency" / "scripts" / "_var31c_inoe_underlay.snippet.svg"
    snippet.write_text(underlay)
    print(f"wrote underlay snippet {snippet} ({len(underlay)} bytes)")

    export_inoe_png()
    img = viewbox_img_meters()
    print("IMG meters for 3D:", img)


if __name__ == "__main__":
    main()
