#!/usr/bin/env python3
"""Посадка варианта 3.1 на участок Абрикосовая 22.

База участка: abrikosovaya-22-layout-variant-d4-1-100.svg
На посадку идут только:
  — слой стен (layer1 без подложки мебели)
  — слой крыши (layer2 / лекала)
Без слоя помещений и без картинки расстановки мебели.

Дом развёрнут на 180° относительно первой посадки: навес у ворот (запад).
Ортогональный поворот (прямые углы), отступы по ГП 3.1.

Крыша с id для 3D: roof-ridge-* / roof-slope-* / roof-gable-* / column-*

Выход: abrikosovaya-22-layout-variant-3.1-1-100.svg
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
SRC_SITE = ROOT / "abrikosovaya-22-layout-variant-d4-1-100.svg"
SRC_PLAN = ROOT / "agency" / "var3.1.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1-1-100.svg"

S = 10.0

# Участок polygon16 A–B–C–D (CCW)
A = (276.41, 418.68)
B = (756.96, 252.89)
C = (924.99, 549.55)
D = (412.81, 659.59)

# Отступы ГП 3.1 до стен дома (не крыльцо / колонны / навес), м
# Север: 4,70. Запад: у северной точки стены 11,26; у южной ≈9,25
# (разница из‑за косого западного забора при ортогональном доме).
SETBACK_N = 4.70
SETBACK_W_HOUSE = 11.26  # западный отступ у сев.-зап. угла стен
SETBACK_W_SOUTH = 9.25  # контрольный у южного конца зап. фасада
SETBACK_W_CANOPY = 3.65
CANOPY_DEPTH = 5.70
CANOPY_LEN = 11.26

HOUSE_EW = 17.34
HOUSE_NS = 12.50

# Центр rotate(180) на layer1 в var3.1
LAYER1_CX, LAYER1_CY = -203.4953, 52.5567

IMG_X, IMG_Y = -309.8757, -42.984196
IMG_W, IMG_H = 212.76071, 191.08176
PX_W, PX_H = 1109, 996
M_PER_PX = 11.94 / 620.0
U_PER_M = IMG_W / (PX_W * M_PER_PX)  # ≈ 9.962

# Посадка: план развёрнут на 180° (навес/гостиная к воротам на западе)
PLAN_ROTATE_180 = True
# Если True — не пересчитывать матрицу: взять transform с p-plan-31 / house-plan
# из уже существующего OUT (ручная подправка посадки сохраняется).
PRESERVE_TRANSFORM = True


def unit(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    return dx / L, dy / L


def left(u):
    return (-u[1], u[0])


def add(p, *vecs):
    x, y = p
    for v in vecs:
        x += v[0]
        y += v[1]
    return x, y


def scale(u, k):
    return (u[0] * k, u[1] * k)


def fmt2(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def point_at_setbacks(dist_n: float, dist_w: float) -> tuple[float, float]:
    u_ab = unit(A, B)
    n_ab = left(u_ab)
    n_da = left(unit(D, A))
    dn, dw = dist_n * S, dist_w * S
    d = n_ab[0] * n_da[0] + n_ab[1] * n_da[1]
    b = (dw - d * dn) / (1 - d * d)
    a = dn - d * b
    return add(A, scale(n_ab, a), scale(n_da, b))


def site_axes_from_plan():
    """Ортонормированные оси как у D4: фасады ⊥/∥ AB, прямые углы.

    Базово (без PLAN_ROTATE_180): display +X → запад, +Y → север.
    С PLAN_ROTATE_180: display +X → восток, +Y → юг (разворот 180°),
    навес оказывается у ворот на западе.
    """
    n_ab = left(unit(A, B))  # юг внутрь участка
    north = (-n_ab[0], -n_ab[1])
    west = (north[1], -north[0])  # CW 90° от севера (SVG Y вниз)
    if PLAN_ROTATE_180:
        return (-west[0], -west[1]), (-north[0], -north[1])
    return west, north


def poly_points(pts) -> str:
    return " ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in pts)


def site_offset(origin, ex, ey, lx, ly):
    return (origin[0] + lx * ex[0] + ly * ey[0], origin[1] + lx * ex[1] + ly * ey[1])


# Отмостка 1 м вокруг отапливаемого L (план-метры, как в 3D).
BLIND_M = 1.0
BLIND_HOLE_M = [
    (-5.41, 18.31),
    (14.85, 18.31),
    (14.85, 0.80),
    (8.22, 0.80),
    (8.22, 7.25),
    (-5.41, 7.25),
]
BLIND_OUTER_M = [
    (-5.41 - BLIND_M, 18.31 + BLIND_M),
    (14.85 + BLIND_M, 18.31 + BLIND_M),
    (14.85 + BLIND_M, 0.80 - BLIND_M),
    (8.22 - BLIND_M, 0.80 - BLIND_M),
    (8.22 - BLIND_M, 7.25 - BLIND_M),
    (-5.41 - BLIND_M, 7.25 - BLIND_M),
]


def plan_m_to_site(xm: float, ym: float) -> tuple[float, float]:
    """План-метры участка (как house-light) → координаты SVG посадки."""
    east = unit(A, B)
    into = left(east)  # внутрь участка от северного забора
    dxm = xm - (-18.0)
    d_into = 22.877 - ym
    return (
        A[0] + dxm * S * east[0] + d_into * S * into[0],
        A[1] + dxm * S * east[1] + d_into * S * into[1],
    )


def blind_area_path() -> str:
    """evenodd: внешний контур + вырез по стенам дома."""
    def ring(pts_m: list[tuple[float, float]]) -> str:
        pts = [plan_m_to_site(x, y) for x, y in pts_m]
        return "M " + " L ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in pts) + " Z"

    return (
        f'<path id="blind-area" data-role="blind" data-width-m="{BLIND_M:.0f}" '
        f'd="{ring(BLIND_OUTER_M)} {ring(BLIND_HOLE_M)}" '
        f'fill="#d4cfc4" fill-rule="evenodd" stroke="#bdbdb8" stroke-width="0.25"/>'
    )


def upsert_blind_area(svg: str) -> str:
    tag = blind_area_path()
    if re.search(r'\bid="blind-area"', svg):
        return replace_group_by_id(svg, "blind-area", tag)
    # Перед домом / навесом, как у D4 (сразу после дороги/газонов).
    for anchor in ('id="front-court"', 'id="canopy-pad"', 'id="p-plan-31"', 'id="house-plan"'):
        m = re.search(rf"<[^>]*\b{re.escape(anchor)}[^>]*/?>", svg)
        if m:
            return svg[: m.start()] + tag + "\n  " + svg[m.start() :]
    return svg.replace("</svg>", f"  {tag}\n</svg>", 1)


def replace_group_by_id(svg: str, gid: str, new_outer: str) -> str:
    m = re.search(rf"<(?P<tag>\w+)\b[^>]*\bid=\"{re.escape(gid)}\"[^>]*/>", svg)
    if m:
        return svg[: m.start()] + new_outer + svg[m.end() :]
    m = re.search(rf"<(?P<tag>\w+)\b[^>]*\bid=\"{re.escape(gid)}\"[^>]*>", svg)
    if not m:
        raise SystemExit(f"id not found: {gid}")
    tag = m.group("tag")
    start = m.start()
    if tag == "g":
        depth = 0
        for mm in re.finditer(r"<g\b[^>]*/>|</?g\b[^>]*>", svg[start:]):
            tok = mm.group(0)
            if tok.startswith("</"):
                depth -= 1
            elif tok.endswith("/>"):
                continue
            else:
                depth += 1
            if depth == 0:
                return svg[:start] + new_outer + svg[start + mm.end() :]
        raise SystemExit(f"unclosed group {gid}")
    end_m = re.search(rf"</{tag}>", svg[m.end() :])
    if not end_m:
        raise SystemExit(f"no close for {gid}")
    return svg[:start] + new_outer + svg[m.end() + end_m.end() :]


def extract_group(svg: str, gid: str) -> str:
    m = re.search(rf"<g\b[^>]*\bid=\"{re.escape(gid)}\"[^>]*>", svg)
    if not m:
        raise SystemExit(f"missing group {gid}")
    start = m.start()
    depth = 0
    for mm in re.finditer(r"<g\b[^>]*/>|</?g\b[^>]*>", svg[start:]):
        tok = mm.group(0)
        if tok.startswith("</"):
            depth -= 1
        elif tok.endswith("/>"):
            continue
        else:
            depth += 1
        if depth == 0:
            return svg[start : start + mm.end()]
    raise SystemExit(f"unclosed {gid}")


# Объекты слоя «иное» — на посадку не переносим (даже если вдруг остались в layer1).
# rect2279 — обводка террасы, сейчас в слое «стены»; на посадку переносим.
INOE_IDS = (
    "rect2391",  # фон листа
    "image1546",  # мебель
    "rect2334",  # белая заливка L
)


def extract_layer_by_label(svg: str, label: str) -> str | None:
    m = re.search(
        rf'<g\b[^>]*\binkscape:label="{re.escape(label)}"[^>]*>',
        svg,
    )
    if not m:
        return None
    start = svg.rfind("<g", 0, m.end())
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
    return None


def strip_elements_by_id(svg_chunk: str, eids: tuple[str, ...]) -> str:
    out = svg_chunk
    for eid in eids:
        # self-closing
        out = re.sub(
            rf'<(path|rect|image|circle|polygon)\b(?=[^>]*\bid="{eid}")[^>]*/>',
            "",
            out,
            flags=re.DOTALL,
        )
        # open/close
        out = re.sub(
            rf'<(path|rect|image|circle|polygon)\b(?=[^>]*\bid="{eid}")[^>]*>.*?</\1>',
            "",
            out,
            flags=re.DOTALL,
        )
    return out


def extract_walls_layer(plan_svg: str) -> str:
    """Только слой «стены» (не «иное», не мебель)."""
    g = extract_layer_by_label(plan_svg, "стены")
    if g is None:
        g = extract_group(plan_svg, "layer1")
    return walls_only(g)


def extract_roof_layer(plan_svg: str) -> str:
    g = extract_layer_by_label(plan_svg, "крыша")
    if g is None:
        g = extract_group(plan_svg, "layer2")
    return retag_roof(g)


def walls_only(layer1: str) -> str:
    """Слой стен: вычистить всё, что относится к «иное»/мебели."""
    out = re.sub(r"<image\b[\s\S]*?(?:/>|</image>)", "", layer1)
    out = strip_elements_by_id(out, INOE_IDS)
    out = out.replace("fill:#4d4d4d", "fill:#111111")
    out = re.sub(r'\bid="layer1"', 'id="layer-walls" data-role="walls"', out, count=1)
    if 'inkscape:label="' in out:
        out = re.sub(
            r'\binkscape:label="[^"]*"',
            'inkscape:label="стены"',
            out,
            count=1,
        )
    return out


def tag_columns(layer1: str) -> str:
    col_ids = [
        "rect2702",
        "rect2704",
        "rect2706",
        "rect2708",
        "rect2718",
        "rect2720",
        "rect2722",
        "rect532",  # колонны северного крыльца
        "rect588",
    ]
    out = layer1
    for i, cid in enumerate(col_ids):
        out = out.replace(f'id="{cid}"', f'id="column-{i}" data-plan-id="{cid}"', 1)
    # Обводка террасы (слой стены).
    out = out.replace(
        'id="rect2279"',
        'id="terrace-outline" data-plan-id="rect2279" data-role="terrace"',
        1,
    )
    return out


def retag_roof(layer2: str) -> str:
    """Семантические id для лекал крыши (3D Var 3).

    На посадке скаты делаем бледнее, чтобы чёрные стены и мебель читались;
    коньки — насыщеннее (тёмно-синие).
    """
    out = layer2
    ridge_map = {
        "rect563": "roof-ridge-0",
        "rect1234": "roof-ridge-1",
        "rect1242": "roof-ridge-2",
    }
    slope_map = {
        "rect671": "roof-slope-0a",
        "rect1227": "roof-slope-0b",
        "rect1236": "roof-slope-1a",
        "rect1238": "roof-slope-1b",
        "rect1244": "roof-slope-2a",
        "rect1246": "roof-slope-2b",
    }
    gable_map = {
        "rect2897": "roof-gable-0",  # запад навеса
        "path2996": "roof-gable-1",  # запад основного объёма
        "path1090": "roof-gable-2",  # восток основного/восточного крыла
        "path3000": "roof-gable-3",  # юг восточного крыла
    }
    for old, new in {**ridge_map, **slope_map, **gable_map}.items():
        out = out.replace(f'id="{old}"', f'id="{new}" data-plan-id="{old}"', 1)
    out = out.replace('id="g1602"', 'id="roof-block-0" data-role="roof-wing"', 1)
    out = out.replace('id="g1232"', 'id="roof-block-0" data-role="roof-wing"', 1)
    out = out.replace('id="g1240"', 'id="roof-block-1" data-role="roof-wing"', 1)
    out = out.replace('id="g1248"', 'id="roof-block-2" data-role="roof-wing"', 1)
    out = out.replace('id="layer2"', 'id="layer-roof" data-role="roof-lekal"', 1)
    # На посадке слой крыши всегда видим (в плане мог быть скрыт в Inkscape).
    out = re.sub(
        r'(<g\b[^>]*\bid="layer-roof"[^>]*\bstyle=")([^"]*)(")',
        lambda m: m.group(1) + re.sub(r"display:[^;]*;?", "display:inline;", m.group(2)) + m.group(3),
        out,
        count=1,
    )
    if 'id="layer-roof"' in out and "display:inline" not in out[:400]:
        out = out.replace(
            'id="layer-roof" data-role="roof-lekal"',
            'id="layer-roof" data-role="roof-lekal" style="display:inline"',
            1,
        )

    # скаты: бледнее; коньки: ярче и темнее
    def restyle(m: re.Match) -> str:
        tag = m.group(0)
        eid = re.search(r'\bid="([^"]+)"', tag)
        if not eid:
            return tag
        name = eid.group(1)
        if name.startswith("roof-slope-"):
            tag = re.sub(r"opacity:[0-9.]+", "opacity:0.22", tag)
            tag = tag.replace("fill:#00ffff", "fill:#7ec8e3")
        elif name.startswith("roof-ridge-"):
            tag = re.sub(r"opacity:[0-9.]+", "opacity:0.85", tag)
            tag = tag.replace("fill:#0000ff", "fill:#1a237e")
        elif name.startswith("roof-gable-"):
            tag = re.sub(r"opacity:[0-9.]+", "opacity:0.75", tag)
        return tag

    out = re.sub(
        r"<(?:rect|path)\b[^>]*\bid=\"roof-(?:slope|ridge|gable)-[^\"]+\"[^>]*>",
        restyle,
        out,
    )
    return out


def heated_bbox_display() -> tuple[float, float, float, float]:
    """(x_max, y_max, x_min, y_min) отапливаемых стен в display uu var3.1.

    Якорь: восток (max x) и север (min y) по чёрным стенам walls-only;
    габарит 17,34×12,50 м. Колонны навеса западнее min x не входят.
    После PLAN_ROTATE_180: min x → запад, min y → север.
    """
    # walls-only PNG → viewBox (см. build notes)
    x_east = -103.75
    y_north = -1.15
    x_west = x_east - HOUSE_EW * U_PER_M
    y_south = y_north + HOUSE_NS * U_PER_M
    return x_east, y_south, x_west, y_north


def plan_ref_nw_display() -> tuple[float, float]:
    """Точка плана (display) = сев.-зап. угол стен → отступы ГП на участке."""
    x_east, y_south, x_west, y_north = heated_bbox_display()
    if PLAN_ROTATE_180:
        return x_west, y_north
    return x_east, y_south  # без 180° — другой угол; не используется


def heated_l_display() -> list[tuple[float, float]]:
    """L-контур стен в display uu.

    После PLAN_ROTATE_180: min x = запад (гостиная), max x = восток (спальни),
    min y = север, max y = юг. Терраса — вырез с севера у восточного крыла.
    """
    x_east, y_south, x_west, y_north = heated_bbox_display()
    east_wing = 7.64 * U_PER_M  # гостиная/терраса по ширине
    west_wing = HOUSE_EW * U_PER_M - east_wing
    terr_d = 4.81 * U_PER_M
    x_inner = x_west + west_wing  # старт восточного крыла
    # обход от NW по часовой: север зап.крыла → юг → восток → север до террасы → …
    return [
        (x_west, y_north),
        (x_west, y_south),
        (x_east, y_south),
        (x_east, y_north + terr_d),
        (x_inner, y_north + terr_d),
        (x_inner, y_north),
    ]


def build_plan_inner(plan_svg: str) -> str:
    walls = tag_columns(extract_walls_layer(plan_svg))
    roof = extract_roof_layer(plan_svg)

    # только стены + крыша (без «иное» / помещений / мебели).
    # Порядок: стены снизу, крыша сверху (позже в SVG = выше).
    return "\n".join(
        [
            '<g id="p-plan-31">',
            walls,
            roof,
            "</g>",
        ]
    )


def read_preserved_transform() -> str | None:
    if not PRESERVE_TRANSFORM or not OUT.exists():
        return None
    t = OUT.read_text()
    for gid in ("p-plan-31", "house-plan"):
        m = re.search(rf'<g[^>]*\bid="{gid}"[^>]*\btransform="([^"]+)"', t)
        if m:
            return m.group(1)
        m = re.search(rf'\btransform="([^"]+)"[^>]*\bid="{gid}"', t)
        if m:
            return m.group(1)
    return None


def refresh_plan_keep_pose() -> bool:
    """Заменить стены+крышу в OUT, сохранив transform посадки и остальной сайт."""
    preserved = read_preserved_transform()
    if not preserved or not OUT.exists():
        return False
    plan_svg = SRC_PLAN.read_text()
    layout = OUT.read_text()
    walls = tag_columns(extract_walls_layer(plan_svg))
    roof = extract_roof_layer(plan_svg)
    # не тащим p-house-pad / иное — только стены + крыша
    for eid in INOE_IDS:
        if eid in walls or eid in roof:
            raise SystemExit(f"иное id {eid} leaked into walls/roof export")
    new_plan = "\n".join(
        [
            f'<g id="p-plan-31" transform="{preserved}">',
            walls,
            roof,
            "    </g>",
        ]
    )
    layout = replace_group_by_id(layout, "p-plan-31", new_plan)
    layout = upsert_blind_area(layout)
    OUT.write_text(layout)
    print(f"refreshed walls+roof+blind (no иное) in {OUT}")
    print(f"preserve transform: {preserved}")
    return True


def main() -> None:
    if PRESERVE_TRANSFORM and refresh_plan_keep_pose():
        return

    plan_svg = SRC_PLAN.read_text()
    site = SRC_SITE.read_text()

    ex, ey = site_axes_from_plan()
    origin_site = point_at_setbacks(SETBACK_N, SETBACK_W_HOUSE)
    ref_x, ref_y = plan_ref_nw_display()
    x_max, y_max, x_min, y_min = heated_bbox_display()

    sc = S / U_PER_M
    a, b = sc * ex[0], sc * ex[1]
    c, d = sc * ey[0], sc * ey[1]
    e = origin_site[0] - sc * (ex[0] * ref_x + ey[0] * ref_y)
    f = origin_site[1] - sc * (ex[1] * ref_x + ey[1] * ref_y)

    assert abs(math.hypot(a / sc, b / sc) - 1) < 1e-6
    assert abs((a / sc) * (c / sc) + (b / sc) * (d / sc)) < 1e-6

    house_tf = f"matrix({a:.8f},{b:.8f},{c:.8f},{d:.8f},{e:.5f},{f:.5f})"
    inner = build_plan_inner(plan_svg)
    house_plan = f'<g id="house-plan" transform="{house_tf}">\n{inner}\n    </g>'

    def disp_to_site(vx, vy):
        return (a * vx + c * vy + e, b * vx + d * vy + f)

    eave_site = [disp_to_site(x, y) for x, y in heated_l_display()]
    house_eave = (
        f'<polygon id="house-eave" points="{poly_points(eave_site)}" '
        f'fill="none" stroke="#c0392b" stroke-width="0.4" '
        f'stroke-dasharray="1.6 0.9"/>'
    )

    # Западный фасад после PLAN_ROTATE_180: display min-x (x_min)
    # Северный фасад: display min-y (y_min); юг = +y
    # Навес вдоль западной стены от северной грани дома на юг (длина CANOPY_LEN).
    if PLAN_ROTATE_180:
        x_west = x_min
        y_north = y_min
        depth_sign = -1.0
        can_y0 = y_north
        can_y1 = can_y0 + CANOPY_LEN * U_PER_M
    else:
        x_west = x_max
        y_north = y_max
        depth_sign = 1.0
        can_y0 = y_north
        can_y1 = can_y0 - CANOPY_LEN * U_PER_M

    y_hi, y_lo = max(can_y0, can_y1), min(can_y0, can_y1)
    depth_u = CANOPY_DEPTH * U_PER_M
    x_outer = x_west + depth_sign * depth_u
    can_disp = [
        (x_outer, y_hi),
        (x_west, y_hi),
        (x_west, y_lo),
        (x_outer, y_lo),
    ]
    can_site = [disp_to_site(x, y) for x, y in can_disp]
    o0, w0, w1, o1 = can_site
    canopy_pad = (
        f'<polygon id="canopy-pad" points="{poly_points(can_site)}" '
        f'fill="#d9d9d9" stroke="#222222" stroke-width="0.28"/>'
    )
    canopy_eave = (
        f'<polygon id="canopy-eave" points="{poly_points(can_site)}" '
        f'fill="none" stroke="#c0392b" stroke-width="0.4" '
        f'stroke-dasharray="1.6 0.9" stroke-linejoin="miter"/>'
    )
    r0 = ((o0[0] + w0[0]) / 2, (o0[1] + w0[1]) / 2)
    r1 = ((o1[0] + w1[0]) / 2, (o1[1] + w1[1]) / 2)
    canopy_ridge = (
        f'<line id="canopy-ridge" x1="{r0[0]:.2f}" y1="{r0[1]:.2f}" '
        f'x2="{r1[0]:.2f}" y2="{r1[1]:.2f}" fill="none" stroke="#c0392b" '
        f'stroke-width="0.35" stroke-dasharray="1.6 0.9"/>'
    )

    posts = []
    idx = 0
    for fy in (0.08, 0.5, 0.92):
        for fd in (0.12, 0.5, 0.88):
            vx = x_west + depth_sign * depth_u * fd
            vy = y_hi + (y_lo - y_hi) * fy
            cx, cy = disp_to_site(vx, vy)
            half = 1.05
            pts = [
                (cx + (-half) * ex[0] + (-half) * ey[0], cy + (-half) * ex[1] + (-half) * ey[1]),
                (cx + (half) * ex[0] + (-half) * ey[0], cy + (half) * ex[1] + (-half) * ey[1]),
                (cx + (half) * ex[0] + (half) * ey[0], cy + (half) * ex[1] + (half) * ey[1]),
                (cx + (-half) * ex[0] + (half) * ey[0], cy + (-half) * ex[1] + (half) * ey[1]),
            ]
            posts.append(
                f'<polygon id="canopy-post-{idx}" points="{poly_points(pts)}" '
                f'fill="#6b3e24" stroke="none"/>'
            )
            idx += 1
    canopy_posts = '<g id="canopy-posts">\n    ' + "\n    ".join(posts) + "\n  </g>"
    mid = (
        (o0[0] + w0[0] + w1[0] + o1[0]) / 4,
        (o0[1] + w0[1] + w1[1] + o1[1]) / 4,
    )
    canopy_label = (
        f'<text id="canopy-label" x="{mid[0]:.2f}" y="{mid[1]:.2f}" '
        f'font-size="3.2" font-weight="700" text-anchor="middle" '
        f'font-family="DejaVu Sans, Liberation Sans, sans-serif" fill="#c0392b">'
        f"навес {fmt2(CANOPY_DEPTH)}×{fmt2(CANOPY_LEN)}</text>"
    )

    svg = site
    svg = svg.replace(
        'sodipodi:docname="abrikosovaya-22-layout-variant-d4-1-100.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1-1-100.svg"',
    )
    svg = replace_group_by_id(
        svg,
        "title2",
        '<title id="title2">Вариант 3.1. Дом на участке, масштаб 1:100</title>',
    )
    svg = replace_group_by_id(svg, "house-plan", house_plan)
    svg = replace_group_by_id(svg, "canopy-posts", canopy_posts)
    svg = replace_group_by_id(svg, "canopy-ridge", canopy_ridge)
    svg = replace_group_by_id(svg, "canopy-eave", canopy_pad + "\n  " + canopy_eave)
    svg = replace_group_by_id(svg, "house-eave", house_eave)
    svg = upsert_blind_area(svg)
    if 'id="canopy-label"' not in svg:
        svg = svg.replace(
            '<polygon id="house-eave"',
            canopy_label + "\n  <polygon id=\"house-eave\"",
            1,
        )
    else:
        svg = re.sub(
            r'<text id="canopy-label"[^>]*>[^<]*</text>',
            canopy_label,
            svg,
            count=1,
        )

    replacements = {
        "text1411": "Вариант 3.1 · дом на участке",
        "text1413": (
            "Масштаб 1:100. Только стены + лекала крыши. "
            f"Отступ стен: север {fmt2(SETBACK_N)} м; запад "
            f"{fmt2(SETBACK_W_HOUSE)} м (сев.) / {fmt2(SETBACK_W_SOUTH)} м (юг). "
            f"Навес {fmt2(CANOPY_DEPTH)}×{fmt2(CANOPY_LEN)} м у ворот."
        ),
        "text1419": (
            "Северо-запад: въезд с западной дороги, навес "
            f"{fmt2(CANOPY_DEPTH)}×{fmt2(CANOPY_LEN)} м у ворот. "
            "Отступы — до стен дома (не крыльцо/колонны/навес). "
            "Слои: layer-walls, layer-roof."
        ),
    }
    for tid, text in replacements.items():
        svg = re.sub(
            rf'(id="{tid}"[^>]*>)[^<]*',
            rf"\g<1>{escape(text)}",
            svg,
            count=1,
        )

    OUT.write_text(svg)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"transform {house_tf}")
    print(f"NW plan ref ({ref_x:.2f},{ref_y:.2f}) → site {origin_site}")
    print(f"rotate180={PLAN_ROTATE_180} scale={sc:.6f}")
    print(f"|ex|={math.hypot(ex[0], ex[1]):.6f} ex·ey={ex[0]*ey[0]+ex[1]*ey[1]:.9f}")


if __name__ == "__main__":
    main()
