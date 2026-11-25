#!/usr/bin/env python3
"""Сверка agency/var3.1d.svg → 3D WALLS/OPENINGS/колонны/навес/крыльцо/терраса,
подписи помещений, подложка пола: слои «иное» + «стены» + «помещения».

База 3D — variant-31d.js (клон 3.1c). Стены без rotate(180).
"""
from __future__ import annotations

import math
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "agency" / "var3.1d.svg"
JS = ROOT / "house-light" / "variant-31d.js"
PNG = ROOT / "house-light" / "var31d-furniture-plan.png"
INOE_SVG = ROOT / "house-light" / "var31d-inoe-underlay.svg"
FLOOR_JS = ROOT / "house-light" / "var31d-furniture-floor.js"

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
            fill = (fill_m.group(1) if fill_m else "#000").lower()
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


def r3(v: float) -> float:
    return round(v, 3)


def build_walls_openings(items):
    skip = {
        "rect1691",
        "rect1693",
        "rect1695",
        "rect2718",
        "rect2720",
        "rect2495",
        "rect2497",
    }
    porch = {"rect590", "rect586", "rect592", "rect1689"}
    walls = []
    seen = set()
    by_id = {}
    for eid, fill, box in items:
        by_id[eid] = (fill, box)
        if fill != "#4d4d4d" or eid in skip:
            continue
        if not (-8 <= box[0] <= 16 and 0 <= box[1] <= 22):
            continue
        key = tuple(round(v, 3) for v in box)
        if key in seen:
            continue
        seen.add(key)
        walls.append([r3(box[0]), r3(box[1]), r3(box[2]), r3(box[3])])

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
                kind = "d" if y1 >= 17.7 or (9.2 <= y0 <= 9.9) else "i"
        else:
            continue
        opens.append([r3(x0), r3(y0), r3(x1), r3(y1), kind])
    return walls, opens, by_id


def geom_from_plan(by_id: dict):
    """Колонны / навес / крыльцо / терраса / наружные грани из SVG."""
    def box(eid):
        if eid not in by_id:
            raise SystemExit(f"missing {eid}")
        return by_id[eid][1]

    # Колонны террасы + крыльца
    t_w, t_e = box("rect2718"), box("rect2720")
    p_w, p_e = box("rect2495"), box("rect2497")
    columns = [
        [r3(v) for v in t_w],
        [r3(v) for v in t_e],
        [r3(v) for v in p_w],
        [r3(v) for v in p_e],
    ]
    carport_cols = [
        [r3(v) for v in box("rect1691")],
        [r3(v) for v in box("rect1695")],
        [r3(v) for v in box("rect1693")],
    ]

    # L-навес: западный рукав (rect1689) + северная полоса до карниза козырька крыльца (как 3.1c).
    cport = box("rect1689")
    porch_slab = box("rect590")
    porch_deck = box("rect586")
    eave_porch = 0.80
    # x1 = западный карниз козырька (= левый край площадки − свес), как в 3.1c.
    x_porch_eave = r3(porch_deck[0] - eave_porch)
    y_porch_n = r3(porch_deck[3])
    carport_poly = [
        [r3(cport[0]), r3(cport[1])],
        [r3(cport[2]), r3(cport[1])],
        [r3(cport[2]), r3(cport[3])],
        [x_porch_eave, r3(cport[3])],
        [x_porch_eave, y_porch_n],
        [r3(cport[0]), y_porch_n],
    ]
    carport = {
        "x0": r3(cport[0]),
        "x1": x_porch_eave,
        "y0": r3(cport[1]),
        "y1": y_porch_n,
        "xArm": r3(cport[2]),  # вост. край западного рукава
        "yArm": r3(cport[3]),  # юг северной полосы
    }

    # Ступени: наружный контур = rect590; промежуточная — между slab и deck.
    mid = [
        r3((porch_slab[0] + porch_deck[0]) * 0.5),
        r3(porch_slab[1]),
        r3((porch_slab[2] + porch_deck[2]) * 0.5),
        r3((porch_slab[3] + porch_deck[3]) * 0.5),
    ]
    porch_steps = [
        [r3(porch_slab[0]), r3(porch_slab[1]), r3(porch_slab[2]), r3(porch_slab[3])],
        mid,
    ]
    # Площадка заходит под северную стену у двери.
    north_wall = box("rect408")
    porch_deck_ext = [
        r3(porch_deck[0]),
        r3(north_wall[1]),  # юг площадки = юг северной стены (нахлёст)
        r3(porch_deck[2]),
        r3(porch_deck[3]),
    ]

    # Терраса: от колонн + запад дома до зап. грани восточного крыла, до юж. стены гостиной.
    west = box("rect422")
    liv_s = box("rect354")
    off_w = box("rect420")
    col_s = min(t_w[1], t_e[1])
    # Свес настила южнее колонн ≈ 1,0 м (как в 3.1c).
    terr_y0 = r3(col_s - 0.99)
    terrace = [
        r3(min(west[0], t_w[0])),
        terr_y0,
        r3(off_w[0]),
        r3(liv_s[1]),
    ]

    body = {
        "xWallW": r3(west[0]),
        "xWallWIn": r3(west[2]),
        "xWallE": r3(box("rect416")[2]),
        "xWallEIn": r3(box("rect416")[0]),
        "xWallOffW": r3(off_w[0]),
        "xWallLivE": r3(box("rect424")[2]),
        "xWallLivEIn": r3(box("rect424")[0]),
        "yWallN": r3(north_wall[3]),
        "yWallNIn": r3(north_wall[1]),
        "yWallSLiv": r3(liv_s[1]),
        "yWallSLivIn": r3(liv_s[3]),
        "yWallSOff": r3(box("rect410")[1]),
        "yWallSOffIn": r3(box("rect410")[3]),
        "yCorrS": r3(box("rect414")[1]),  # юг коридора-1 / север гостиной
    }

    liv_void = {
        "x0": body["xWallWIn"],
        "x1": body["xWallLivEIn"],
        "y0": body["yWallSLiv"],
        "y1": 11.56,  # до изгиба конька — пересчитается геометрией крыши
    }

    return {
        "columns": columns,
        "carport_cols": carport_cols,
        "carport_poly": carport_poly,
        "carport": carport,
        "porch_steps": porch_steps,
        "porch_deck": porch_deck_ext,
        "porch_roof": {
            # Карниз козырька: площадка ± свес 0,80 м.
            "x0": r3(porch_deck[0]),
            "x1": r3(porch_deck[2]),
            "yN": r3(porch_deck[3]),
        },
        "terrace": terrace,
        "body": body,
        "liv_void": liv_void,
    }


# Чистые габариты помещений по внутренним граням стен 3.1d.
ROOM_CLEARS = {
    "Гостиная": (-5.163, 7.780, 2.435, 13.467),
    "Кухня": (-5.163, 13.866, -0.901, 17.815),
    "Топочная": (-0.751, 15.869, 3.135, 17.815),
    "Тамбур": (3.284, 13.866, 5.364, 17.815),
    "Постирочная": (5.514, 15.500, 8.182, 17.815),
    "С/у мастер": (8.581, 14.881, 10.570, 17.815),
    "Мастер-спальня": (10.210, 13.610, 14.222, 17.815),
    "Гардеробная": (10.210, 11.289, 14.222, 13.460),
    "Спальня-2": (10.210, 8.200, 14.222, 11.139),
    "Спальня-1": (10.210, 3.375, 14.222, 6.343),
    "Кабинет": (8.581, 0.795, 14.222, 3.225),
    "Гардероб-2": (10.210, 6.492, 12.137, 8.051),
    "Гардероб-1": (12.287, 6.492, 14.222, 8.051),
    "Хоз.блок": (2.834, 9.755, 5.301, 11.235),
    "Ванная": (5.450, 9.755, 8.182, 11.726),
    "Гардероб-3": (5.514, 13.866, 8.182, 15.350),
    "Кладовая": (-0.901, 13.866, 1.421, 15.719),
    "С/у": (1.571, 13.866, 3.135, 15.422),
    "Коридор-1": (8.581, 5.126, 10.060, 13.465),
    # Коридор-2: поперечный холл южнее северной зоны (сев. хоз/ванной → юг кухни/тамбура).
    "Коридор-2": (2.834, 11.385, 8.182, 13.467),
}


def patch_room_labels(svg: str, geom: dict) -> str:
    """Пересчитать м² и габариты по ROOM_CLEARS + терраса/крыльцо."""
    terr = geom["terrace"]
    porch = geom["porch_steps"][0]
    rooms = dict(ROOM_CLEARS)
    rooms["Терраса"] = (terr[0], terr[1], terr[2], terr[3])
    rooms["Крыльцо"] = (porch[0], porch[1], porch[2], porch[3])

    # name → (meta_text_id, tspan_id) from plan
    meta_ids = {
        "Кабинет": ("text129", "tspan127"),
        "Спальня-1": ("text136", "tspan134"),
        "Гардероб-1": ("text143", "tspan141"),
        "Гардероб-2": ("text150", "tspan148"),
        "Спальня-2": ("text157", "tspan155"),
        "Коридор-1": ("text164", "tspan162"),
        "Терраса": ("text171", "tspan169"),
        "Гардеробная": ("text178", "tspan176"),
        "Ванная": ("text185", "tspan183"),
        "Хоз.блок": ("text192", "tspan190"),
        "Гостиная": ("text199", "tspan197"),
        "Коридор-2": ("text206", "tspan204"),
        "Мастер-спальня": ("text213", "tspan211"),
        "С/у мастер": ("text220", "tspan218"),
        "Гардероб-3": ("text227", "tspan225"),
        "Постирочная": ("text234", "tspan232"),
        "Тамбур": ("text241", "tspan239"),
        "Топочная": ("text248", "tspan246"),
        "Кладовая": ("text255", "tspan253"),
        "С/у": ("text262", "tspan260"),
        "Кухня": ("text269", "tspan267"),
        "Крыльцо": ("text2004", "tspan2002"),
    }

    open_names = {"Терраса", "Крыльцо"}
    living_names = {
        "Кабинет",
        "Спальня-1",
        "Спальня-2",
        "Мастер-спальня",
        "Гостиная",
    }
    heated = 0.0
    living = 0.0
    for name, (x0, y0, x1, y1) in rooms.items():
        ew, ns = x1 - x0, y1 - y0
        area = ew * ns
        if name not in open_names:
            heated += area
        if name in living_names:
            living += area
        tid, tsp = meta_ids[name]
        area_s = f"{fmt2(area)} м²"
        dims_s = f"{fmt2(ew)}×{fmt2(ns)}"
        svg, n = re.subn(
            rf'(id="{tid}">)[^<]*(<tspan[^>]*id="{tsp}"[^>]*>)[^<]*',
            rf"\g<1>{area_s}\g<2>{dims_s}",
            svg,
            count=1,
        )
        print(f"label {name}: {area_s} {dims_s} (n={n})")

    body = geom["body"]
    overall_ew = body["xWallE"] - body["xWallW"]
    overall_ns = body["yWallN"] - body["yWallSOff"]
    svg, n = re.subn(
        r'(id="text272"[^>]*>)[^<]*',
        rf'\g<1>Вариант 3.1d · габарит ≈ {fmt2(overall_ew)}×{fmt2(overall_ns)} м',
        svg,
        count=1,
    )
    print(f"summary title n={n}")
    svg, n = re.subn(
        r'(id="text274"[^>]*>)[^<]*',
        rf"\g<1>Жилая {fmt2(living)} м²",
        svg,
        count=1,
    )
    print(f"living n={n}")
    svg, n = re.subn(
        r'(id="text276"[^>]*>)[^<]*',
        rf"\g<1>Общая {fmt2(heated)} м²",
        svg,
        count=1,
    )
    print(f"heated n={n}")
    terr_a = (rooms["Терраса"][2] - rooms["Терраса"][0]) * (
        rooms["Терраса"][3] - rooms["Терраса"][1]
    )
    svg, n = re.subn(
        r'(id="text278"[^>]*>)[^<]*',
        rf"\g<1>Жилые и подсобные, без террасы ({fmt2(terr_a)} м²) и крыльца",
        svg,
        count=1,
    )
    print(f"note n={n}")
    return svg


def fmt_arr(rows, with_kind=False):
    lines = []
    for r in rows:
        if with_kind:
            lines.append(f"  [{r[0]}, {r[1]}, {r[2]}, {r[3]}, '{r[4]}'],")
        else:
            lines.append(f"  [{r[0]}, {r[1]}, {r[2]}, {r[3]}],")
    return "\n".join(lines)


def patch_js(walls, opens, geom):
    js = JS.read_text()
    body = geom["body"]
    pr = geom["porch_roof"]
    eave_porch = 0.80

    walls_block = "const WALLS = [\n" + fmt_arr(walls) + "\n];"
    opens_block = "const OPENINGS = [\n" + fmt_arr(opens, True) + "\n];"

    cols = geom["columns"]
    columns_block = (
        "const COLUMNS = [\n"
        "  // терраса — rect2718 / rect2720\n"
        f"  [{cols[0][0]}, {cols[0][1]}, {cols[0][2]}, {cols[0][3]}],\n"
        f"  [{cols[1][0]}, {cols[1][1]}, {cols[1][2]}, {cols[1][3]}],\n"
        "  // навес крыльца — rect2495 / rect2497\n"
        f"  [{cols[2][0]}, {cols[2][1]}, {cols[2][2]}, {cols[2][3]}],\n"
        f"  [{cols[3][0]}, {cols[3][1]}, {cols[3][2]}, {cols[3][3]}],\n"
        "];"
    )

    cp = geom["carport_poly"]
    carport_poly = (
        "const CARPORT_POLY = [\n"
        + "\n".join(f"  [{p[0]}, {p[1]}]," for p in cp)
        + "\n];"
    )
    c = geom["carport"]
    carport_obj = (
        "const CARPORT = {\n"
        f"  x0: {c['x0']},\n"
        f"  x1: {c['x1']},\n"
        f"  y0: {c['y0']},\n"
        f"  y1: {c['y1']},\n"
        f"  xArm: {c['xArm']}, // вост. край навеса (= дом)\n"
        f"  yArm: {c['yArm']},\n"
        "};"
    )
    cc = geom["carport_cols"]
    carport_cols = (
        "const CARPORT_COLUMNS = [\n"
        "  // rect1691 — южная широкая\n"
        f"  [{cc[0][0]}, {cc[0][1]}, {cc[0][2]}, {cc[0][3]}],\n"
        "  // rect1695 — средняя\n"
        f"  [{cc[1][0]}, {cc[1][1]}, {cc[1][2]}, {cc[1][3]}],\n"
        "  // rect1693 — северная\n"
        f"  [{cc[2][0]}, {cc[2][1]}, {cc[2][2]}, {cc[2][3]}],\n"
        "];"
    )
    terr = geom["terrace"]
    terrace_block = f"const TERRACE = [{terr[0]}, {terr[1]}, {terr[2]}, {terr[3]}];"
    lv = geom["liv_void"]
    liv_void = (
        "const LIV_VOID = { "
        f"x0: {lv['x0']}, x1: {lv['x1']}, y0: {lv['y0']}, y1: {lv['y1']} "
        "};"
    )
    liv_south = f"const LIV_SOUTH_Y = {r3((body['yWallSLiv'] + body['yWallSLivIn']) * 0.5)};"

    js2, n1 = re.subn(r"const WALLS = \[.*?\];", walls_block, js, count=1, flags=re.S)
    js2, n2 = re.subn(r"const OPENINGS = \[.*?\];", opens_block, js2, count=1, flags=re.S)
    js2, n3 = re.subn(r"const COLUMNS = \[.*?\];", columns_block, js2, count=1, flags=re.S)
    js2, n4 = re.subn(
        r"const CARPORT_POLY = \[.*?\];", carport_poly, js2, count=1, flags=re.S
    )
    js2, n5 = re.subn(r"const CARPORT = \{.*?\};", carport_obj, js2, count=1, flags=re.S)
    js2, n6 = re.subn(
        r"const CARPORT_COLUMNS = \[.*?\];", carport_cols, js2, count=1, flags=re.S
    )
    js2, n7 = re.subn(r"const TERRACE = \[.*?\];", terrace_block, js2, count=1, flags=re.S)
    js2, n8 = re.subn(r"const LIV_VOID = \{.*?\};", liv_void, js2, count=1, flags=re.S)
    js2, n9 = re.subn(
        r"const LIV_SOUTH_Y = [^;]+;", liv_south, js2, count=1, flags=re.S
    )
    if min(n1, n2, n3, n4, n5, n6, n7, n8, n9) < 1:
        raise SystemExit(
            f"js array patch failed {[n1, n2, n3, n4, n5, n6, n7, n8, n9]}"
        )

    # Крыша: наружные грани стен.
    repls = {
        r"const xWallW = [^;]+;": f"const xWallW = {body['xWallW']};",
        r"const xWallE = [^;]+;": f"const xWallE = {body['xWallE']};",
        r"const xWallOffW = [^;]+;": f"const xWallOffW = {body['xWallOffW']};",
        r"const xWallLivE = [^;]+;": f"const xWallLivE = {body['xWallLivE']};",
        r"const yWallN = [^;]+;": f"const yWallN = {body['yWallN']};",
        r"const yWallSLiv = [^;]+;": f"const yWallSLiv = {body['yWallSLiv']};",
        r"const yWallSOff = [^;]+;": f"const yWallSOff = {body['yWallSOff']};",
        r"const xLivW = [^;]+;": f"const xLivW = {body['xWallW']};",
        r"const xLivE = [^;]+;": f"const xLivE = {body['xWallLivE']};",
        r"const xOffW = [^;]+;": f"const xOffW = {body['xWallOffW']};",
        r"const xOffE = [^;]+;": f"const xOffE = {body['xWallE']};",
        r"const yPlateS = [^;]+;": f"const yPlateS = {body['yWallSLiv']};",
        r"const yPlateSE = [^;]+;": f"const yPlateSE = {body['yWallSOff']};",
        r"const yWallSLivOut = [^;]+;": f"const yWallSLivOut = {body['yWallSLiv']};",
        r"const yWallSLivIn = [^;]+;": f"const yWallSLivIn = {body['yWallSLivIn']};",
        r"const yWallSOffOut = [^;]+;": f"const yWallSOffOut = {body['yWallSOff']};",
        r"const yWallSOffIn = [^;]+;": f"const yWallSOffIn = {body['yWallSOffIn']};",
        r"const xGableE = [^;]+;": f"const xGableE = {body['xWallLivE']};",
        r"const xGableW = [^;]+;": f"const xGableW = {body['xWallW']};",
    }
    for pat, repl in repls.items():
        js2, n = re.subn(pat, repl, js2, count=1)
        if n != 1:
            print(f"warn: roof const {pat} n={n}")

    # Козырёк крыльца.
    porch_x0 = r3(pr["x0"] - eave_porch)
    porch_x1 = r3(pr["x1"] + eave_porch)
    porch_yn = r3(pr["yN"] + eave_porch)
    js2, n = re.subn(
        r"const porchX0 = [^;]+;",
        f"const porchX0 = {porch_x0};",
        js2,
        count=1,
    )
    js2, n = re.subn(
        r"const porchX1 = [^;]+;",
        f"const porchX1 = {porch_x1};",
        js2,
        count=1,
    )
    js2, n = re.subn(
        r"const porchYN = [^;]+;",
        f"const porchYN = {porch_yn};",
        js2,
        count=1,
    )

    # Ступени и площадка крыльца.
    ps = geom["porch_steps"]
    pd = geom["porch_deck"]
    steps_block = (
        "    const porchSteps = [\n"
        f"      [{ps[0][0]}, {ps[0][1]}, {ps[0][2]}, {ps[0][3]}],\n"
        f"      [{ps[1][0]}, {ps[1][1]}, {ps[1][2]}, {ps[1][3]}],\n"
        "    ];"
    )
    js2, n = re.subn(
        r"    const porchSteps = \[.*?\];", steps_block, js2, count=1, flags=re.S
    )
    if n != 1:
        print(f"warn: porchSteps n={n}")
    deck_block = (
        "  const porchDeck = planBox([\n"
        f"    [{pd[0]}, {pd[1]}], [{pd[2]}, {pd[1]}], [{pd[2]}, {pd[3]}], [{pd[0]}, {pd[3]}],\n"
        "  ], FLOOR * 2 / 3, FLOOR, FLOOR_C, false);"
    )
    js2, n = re.subn(
        r"  const porchDeck = planBox\(\[\s*\[[^\]]+\],\s*\[[^\]]+\],\s*\[[^\]]+\],\s*\[[^\]]+\]\s*\], FLOOR \* 2 / 3, FLOOR, FLOOR_C, false\);",
        deck_block,
        js2,
        count=1,
    )
    if n != 1:
        print(f"warn: porchDeck n={n}")

    # Цоколь / отмостка / балка / потолок — привязка к новым граням.
    # plinth west/east
    js2 = re.sub(
        r"planBox\(\[\[-5\.41, 7\.25\], \[8\.70, 7\.25\], \[8\.70, 18\.31\], \[-5\.41, 18\.31\]\]",
        f"planBox([[{body['xWallW']-0.05:.2f}, {body['yWallSLiv']-0.13:.2f}], "
        f"[{body['xWallOffW']+0.52:.2f}, {body['yWallSLiv']-0.13:.2f}], "
        f"[{body['xWallOffW']+0.52:.2f}, {body['yWallN']+0.10:.2f}], "
        f"[{body['xWallW']-0.05:.2f}, {body['yWallN']+0.10:.2f}]]",
        js2,
        count=1,
    )
    js2 = re.sub(
        r"planBox\(\[\[8\.22, 0\.80\], \[14\.85, 0\.80\], \[14\.85, 18\.31\], \[8\.22, 18\.31\]\]",
        f"planBox([[{body['xWallOffW']:.2f}, {body['yWallSOff']-0.05:.2f}], "
        f"[{body['xWallE']+0.23:.2f}, {body['yWallSOff']-0.05:.2f}], "
        f"[{body['xWallE']+0.23:.2f}, {body['yWallN']+0.10:.2f}], "
        f"[{body['xWallOffW']:.2f}, {body['yWallN']+0.10:.2f}]]",
        js2,
        count=1,
    )

    # yCeilBeam
    y_beam = r3((body["yWallSLiv"] + body["yWallSLivIn"]) * 0.5)
    js2, n = re.subn(
        r"const yCeilBeam = \([^)]+\);",
        f"const yCeilBeam = {y_beam};",
        js2,
        count=1,
    )
    js2, n = re.subn(
        r"const yBeam = \([^)]+\);",
        f"const yBeam = {y_beam};",
        js2,
        count=1,
    )
    js2, n = re.subn(
        r"const xCorr = [^;]+;",
        f"const xCorr = {body['xWallOffW']};",
        js2,
        count=1,
    )

    # Ceiling liv void corners (approx from body)
    js2 = re.sub(
        r"\[-4\.908, 17\.859\]",
        f"[{body['xWallWIn']}, {body['yWallNIn']}]",
        js2,
    )
    js2 = re.sub(
        r"\[14\.403, 17\.859\]",
        f"[{body['xWallEIn']}, {body['yWallNIn']}]",
        js2,
    )
    js2 = re.sub(
        r"\[14\.403, 1\.248\]",
        f"[{body['xWallEIn']}, {body['yWallSOffIn']}]",
        js2,
    )

    # Отмостка
    js2 = re.sub(
        r"const hole = \[\s*\[-5\.41, 18\.31\], \[14\.85, 18\.31\], \[14\.85, 0\.80\],\s*\[8\.22, 0\.80\], \[8\.22, 7\.25\], \[-5\.41, 7\.25\],\s*\];",
        "const hole = [\n"
        f"      [{body['xWallW']-0.05:.2f}, {body['yWallN']+0.10:.2f}], "
        f"[{body['xWallE']+0.23:.2f}, {body['yWallN']+0.10:.2f}], "
        f"[{body['xWallE']+0.23:.2f}, {body['yWallSOff']-0.05:.2f}],\n"
        f"      [{body['xWallOffW']:.2f}, {body['yWallSOff']-0.05:.2f}], "
        f"[{body['xWallOffW']:.2f}, {body['yWallSLiv']-0.13:.2f}], "
        f"[{body['xWallW']-0.05:.2f}, {body['yWallSLiv']-0.13:.2f}],\n"
        "    ];",
        js2,
        count=1,
        flags=re.S,
    )
    js2 = re.sub(
        r"const outer = \[\s*\[-6\.41, 19\.31\], \[15\.85, 19\.31\], \[15\.85, -0\.20\],\s*\[7\.22, -0\.20\], \[7\.22, 6\.25\], \[-6\.41, 6\.25\],\s*\];",
        "const outer = [\n"
        f"      [{body['xWallW']-1.05:.2f}, {body['yWallN']+1.10:.2f}], "
        f"[{body['xWallE']+1.23:.2f}, {body['yWallN']+1.10:.2f}], "
        f"[{body['xWallE']+1.23:.2f}, {body['yWallSOff']-1.05:.2f}],\n"
        f"      [{body['xWallOffW']-1.00:.2f}, {body['yWallSOff']-1.05:.2f}], "
        f"[{body['xWallOffW']-1.00:.2f}, {body['yWallSLiv']-1.13:.2f}], "
        f"[{body['xWallW']-1.05:.2f}, {body['yWallSLiv']-1.13:.2f}],\n"
        "    ];",
        js2,
        count=1,
        flags=re.S,
    )

    # Комментарии про навес
    js2 = js2.replace(
        "Навес для авто — L по agency/var3.1d.svg rect1753: западный рукав + северная полоса до крыльца.",
        "Навес для авто — прямоугольник по agency/var3.1d.svg rect1689 (запад дома).",
    )
    js2 = js2.replace(
        "Плоский навес L (rect1753): запад + север до карниза крыльца; верх = Ze.",
        "Плоский навес (rect1689): запад дома; верх = Ze.",
    )
    js2 = js2.replace(
        "Южная терраса по обводке rect2279: без выреза, до x≈8,26.",
        "Южная терраса: колонны rect2718/2720 + до зап. грани вост. крыла.",
    )

    JS.write_text(js2)
    print(
        f"patched {JS.name}: {len(walls)} walls, {len(opens)} openings; "
        f"carport {c['x0']}…{c['x1']} × {c['y0']}…{c['y1']}; "
        f"terrace {terr}; porch deck {pd}"
    )


def write_furniture_floor_js(img_m: dict, body: dict, terrace: list):
    """3D-деколь «иное» под новые границы пола."""
    hall_x = body["xWallLivE"]
    west_in = body["xWallWIn"]
    east_in = body["xWallEIn"]
    off_w = body["xWallOffW"]
    n_in = body["yWallNIn"]
    s_liv = body["yWallSLivIn"]
    s_off = body["yWallSOffIn"]
    text = f'''// Подложка 3.1d: растр «иное» + «стены» + «помещения» (подписи и метраж).
// PNG: var31d-furniture-plan.png (viewBox плана −320/−50/250×220 → метры ниже).
import * as THREE from "three";

export function markHouseFloor(mesh) {{
  if (!mesh?.material) return mesh;
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 2;
  mesh.material.polygonOffsetUnits = 2;
  return mesh;
}}

export const V31_FLOOR_WEST = [{west_in:.3f}, {s_liv:.3f}, {off_w + 0.32:.3f}, {n_in:.3f}];
export const V31_FLOOR_EAST = [{off_w + 0.18:.3f}, {s_off:.3f}, {east_in:.3f}, {n_in:.3f}];

const TEX_URL = new URL("./var31d-furniture-plan.png", import.meta.url).href;
const IMG = {{ x0: {img_m["x0"]}, y0: {img_m["y0"]}, x1: {img_m["x1"]}, y1: {img_m["y1"]} }};
const OPACITY = 0.55;

const HALL_S_WALL_X = {hall_x:.3f};
const FURN_WEST_HALL = [{west_in - 0.05:.3f}, {s_liv + 0.12:.3f}, HALL_S_WALL_X, {n_in:.3f}];
const FURN_WEST_NORTH = [HALL_S_WALL_X, 9.40, {off_w + 0.27:.3f}, {n_in:.3f}];
const FURN_EAST = [{off_w + 0.27:.3f}, {s_off + 0.05:.3f}, {east_in + 0.03:.3f}, {n_in:.3f}];

const TERRACE_Y_MAX = {terrace[3] + 0.32:.3f};
const TERRACE_DEEP_Y = 9.35;
const TERRACE_X0 = {terrace[0] - 0.05:.3f};
const TERRACE_X1 = {terrace[2] + 0.12:.3f};

let sharedTex = null;

function uvOf(x, y) {{
  return [
    (x - IMG.x0) / (IMG.x1 - IMG.x0),
    (y - IMG.y0) / (IMG.y1 - IMG.y0),
  ];
}}

function planOfUv(u, v) {{
  const x = IMG.x0 + u * (IMG.x1 - IMG.x0);
  const y = IMG.y0 + v * (IMG.y1 - IMG.y0);
  return [x, y];
}}

function onTerrace(x, y) {{
  if (x <= TERRACE_X0 || x >= TERRACE_X1) return false;
  if (y < TERRACE_Y_MAX) return true;
  return x > HALL_S_WALL_X && y < TERRACE_DEEP_Y;
}}

function texture() {{
  if (sharedTex) return sharedTex;
  const loader = new THREE.TextureLoader();
  sharedTex = loader.load(TEX_URL, (tex) => {{
    const img = tex.image;
    if (!img || !img.width) return;
    const w = img.width;
    const h = img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let j = 0; j < h; j++) {{
      for (let i = 0; i < w; i++) {{
        const u = (i + 0.5) / w;
        const v = 1 - (j + 0.5) / h;
        const [x, y] = planOfUv(u, v);
        if (onTerrace(x, y)) {{
          px[(j * w + i) * 4 + 3] = 0;
        }}
      }}
    }}
    ctx.putImageData(data, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
  }});
  if ("colorSpace" in sharedTex && THREE.SRGBColorSpace) {{
    sharedTex.colorSpace = THREE.SRGBColorSpace;
  }}
  sharedTex.anisotropy = 8;
  sharedTex.flipY = true;
  return sharedTex;
}}

/** Деколь слоя «иное» на полу 3.1d (без террасы). */
export function addVar31FurnitureFloor(api, floorZ) {{
  const {{ planToWorld, addMesh }} = api;
  const z = floorZ + 0.005;
  const quads = [
    [
      [FURN_WEST_HALL[0], FURN_WEST_HALL[1]],
      [FURN_WEST_HALL[2], FURN_WEST_HALL[1]],
      [FURN_WEST_HALL[2], FURN_WEST_HALL[3]],
      [FURN_WEST_HALL[0], FURN_WEST_HALL[3]],
    ],
    [
      [FURN_WEST_NORTH[0], FURN_WEST_NORTH[1]],
      [FURN_WEST_NORTH[2], FURN_WEST_NORTH[1]],
      [FURN_WEST_NORTH[2], FURN_WEST_NORTH[3]],
      [FURN_WEST_NORTH[0], FURN_WEST_NORTH[3]],
    ],
    [
      [FURN_EAST[0], FURN_EAST[1]],
      [FURN_EAST[2], FURN_EAST[1]],
      [FURN_EAST[2], FURN_EAST[3]],
      [FURN_EAST[0], FURN_EAST[3]],
    ],
  ];
  const pos = [];
  const uv = [];
  const push = (x, y) => {{
    const [e, n] = planToWorld(x, y);
    pos.push(e, z, n);
    const [u, v] = uvOf(x, y);
    uv.push(u, v);
  }};
  const tri = (a, b, c) => {{
    push(a[0], a[1]);
    push(b[0], b[1]);
    push(c[0], c[1]);
  }};
  for (const [a, b, c, d] of quads) {{
    tri(a, b, c);
    tri(a, c, d);
  }}
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geom.computeVertexNormals();

  const mesh = addMesh(geom, 0xffffff, false);
  mesh.material.dispose();
  mesh.material = new THREE.MeshBasicMaterial({{
    map: texture(),
    transparent: true,
    opacity: OPACITY,
    alphaTest: 0.05,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  }});
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.userData.furniturePlan = true;
  delete mesh.userData.finish;
  return mesh;
}}
'''
    FLOOR_JS.write_text(text)
    print(f"wrote {FLOOR_JS.name}")


def build_inoe_underlay_svg(plan_svg: str) -> str:
    layer = extract_group(plan_svg, "layer3")
    layer = re.sub(r'<rect\b[^>]*\bid="rect2391"[^>]*/>', "", layer, count=1)
    layer = re.sub(
        r'<rect\b[^>]*\bid="rect2391"[^>]*>.*?</rect>',
        "",
        layer,
        count=1,
        flags=re.S,
    )
    layer = layer.replace('id="layer3"', 'id="furniture-underlay" data-role="inoe-underlay"', 1)
    layer = re.sub(
        r'\binkscape:label="иное"',
        'inkscape:label="подложка иное"',
        layer,
        count=1,
    )
    if "opacity=" not in layer[:300]:
        layer = layer.replace(
            'id="furniture-underlay" data-role="inoe-underlay"',
            'id="furniture-underlay" data-role="inoe-underlay" opacity="0.55"',
            1,
        )
    return layer


def _prep_inoe_layer(plan: str) -> str:
    layer = extract_group(plan, "layer3")
    layer = re.sub(r'<rect\b[^>]*\bid="rect2391"[^>]*/>', "", layer, count=1)
    layer = layer.replace('id="layer3"', 'id="layer3-export"', 1)
    layer = re.sub(
        r'(id="image743"[^>]*\bstyle="[^"]*opacity:)[0-9.]+',
        r"\g<1>0.85",
        layer,
        count=1,
    )
    # также style opacity на группе иное
    layer = re.sub(
        r'(id="layer3-export"[^>]*\bstyle="[^"]*opacity:)[0-9.]+',
        r"\g<1>0.85",
        layer,
        count=1,
    )
    return layer


def export_inoe_png(plan: str):
    inoe = _prep_inoe_layer(plan)
    walls = extract_group(plan, "layer1")
    rooms = extract_group(plan, "layer-rooms")
    rooms = re.sub(
        r'<g\b[^>]*\bid="room-summary"[^>]*>[\s\S]*?</g>',
        "",
        rooms,
        count=1,
    )
    vb = VIEWBOX
    INOE_SVG.write_text(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="{vb[2]}mm" height="{vb[3]}mm" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}">
{inoe}
{walls}
{rooms}
</svg>
'''
    )
    subprocess.run(
        [
            "inkscape",
            str(INOE_SVG),
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
    walls, opens, by_id = build_walls_openings(items)
    geom = geom_from_plan(by_id)
    patch_js(walls, opens, geom)

    plan2 = patch_room_labels(plan, geom)
    PLAN.write_text(plan2)
    print(f"updated labels in {PLAN.name}")

    underlay = build_inoe_underlay_svg(plan2)
    snippet = ROOT / "agency" / "scripts" / "_var31d_inoe_underlay.snippet.svg"
    snippet.write_text(underlay)
    print(f"wrote underlay snippet {snippet} ({len(underlay)} bytes)")

    export_inoe_png(plan2)
    img = viewbox_img_meters()
    write_furniture_floor_js(img, geom["body"], geom["terrace"])
    print("IMG meters for 3D:", img)


if __name__ == "__main__":
    main()
