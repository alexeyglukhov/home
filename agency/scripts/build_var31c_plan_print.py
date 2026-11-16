#!/usr/bin/env python3
"""Печатный лист планировки Вар 3.1c (А4 альбом).

Только слой «иное» и «стены», подписи комнат, размерные линии с выносками
(короткие ближе к дому, габарит — дальше), общая площадь по нормам РБ:
  — отапливаемые ×1,0; терраса ×0,3; крыльцо (неотапл.) ×0,5

Выход: agency/var3.1c-dom-print.svg
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "agency" / "var3.1c.svg"
OUT = ROOT / "agency" / "var3.1c-dom-print.svg"

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
INK = "http://www.inkscape.org/namespaces/inkscape"
SODI = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
NSMAP = {
    None: SVG_NS,
    "xlink": XLINK_NS,
    "inkscape": INK,
    "sodipodi": SODI,
}

U = 22.039284 / 2.2
X0 = -249.7699155181818
Y0 = 152.28034229090906

# Наружные грани стен (план-метры, как в 3D / sync).
BODY_W = -5.365
BODY_E = 14.685
BODY_N = 18.262
BODY_S_LIV = 7.381  # юг гостиной
BODY_S_EAST = 0.945  # юг восточного крыла
JOG_X = 8.182  # западная грань восточного крыла / коридор

# Крыльцо и терраса (план-метры) — как в variant-31c.js (3D).
PORCH_STEPS = [
    (0.14, 18.29, 8.59, 20.83),  # нижняя ступень
    (0.52, 18.29, 8.19, 20.45),  # верхняя ступень
]
PORCH_DECK = (1.02, 17.88, 7.79, 20.03)  # верхняя площадка
PORCH = PORCH_STEPS[0]  # наружный контур для габаритных размеров
TERRACE = (-5.35, 4.79, 8.26, 7.44)

# Внутренние чистые габариты комнат (x0,y0,x1,y1) — грани стен без толщин.
ROOM_CLEARS = {
    "Кухня": (-4.917, 13.866, -0.658, 17.863),
    "Гостиная": (-4.917, 7.780, 2.704, 13.467),
    "Топочная": (-0.509, 15.907, 2.961, 17.863),
    "Тамбур": (3.111, 13.866, 5.310, 17.863),
    "Постирочная": (5.460, 15.500, 8.182, 17.863),
    "С/у мастер": (8.581, 15.034, 10.570, 17.863),
    "Мастер-спальня": (10.210, 13.615, 14.286, 17.863),
}
# Северная цепочка EW (W→E), только комнаты у северного фасада.
NORTH_EW_CHAIN = [
    "Кухня",
    "Топочная",
    "Тамбур",
    "Постирочная",
    "С/у мастер",
    "Мастер-спальня",
]

# L-навес (как в variant-31c.js / rect1753).
CARPORT = {
    "x0": -13.470,
    "x1": 0.215,
    "y0": 9.073,
    "y1": 19.965,
    "xArm": -6.165,
    "yArm": 19.112,
}
CARPORT_POLY = [
    (-13.470, 9.073),
    (-6.165, 9.073),
    (-6.165, 19.112),
    (0.215, 19.112),
    (0.215, 19.965),
    (-13.470, 19.965),
]

# Восточный фасад: чистые пролёты между внутренними гранями стен (без толщин).
# Пары (северная грань проёма, южная грань проёма), метры плана, N→S.
EAST_CLEARS_M = [
    (17.863, 14.052),  # мастер-спальня
    (13.902, 11.803),  # гардеробная
    (11.653, 8.684),  # спальня-2
    (8.534, 6.872),  # гардероб-1
    (6.722, 3.697),  # спальня-1
    (3.547, 1.344),  # кабинет
]

# Внутренние грани корпуса (для чистых размеров крыльев).
BODY_N_IN = 17.863
BODY_S_LIV_IN = 7.780  # северная грань южной стены гостиной
BODY_S_EAST_IN = 1.344
BODY_E_IN = 14.286

# Колонны крыльца (variant-31c.js COLUMNS).
PORCH_COLUMNS = [
    (1.070, 19.570, 1.470, 19.970),
    (7.310, 19.570, 7.710, 19.970),
]

K_TERRACE = 0.3
K_COLD = 0.5
OPEN_NAMES = {"Терраса", "Крыльцо"}
LIVING_NAMES = {
    "Кабинет",
    "Спальня-1",
    "Спальня-2",
    "Мастер-спальня",
    "Гостиная",
}

GAP = 12.0  # шаг стопки размерных линий (uu плана)
EXT_IN = 2.0  # выноска заходит на объект, чтобы явно дойти до грани


def fmt2(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def fmt_m(meters: float) -> str:
    return f"{meters:.2f}".replace(".", ",") + " м"


def m_to_disp(mx: float, my: float) -> tuple[float, float]:
    """План-метры → координаты viewBox плана (как слой «помещения»)."""
    return mx * U + X0, Y0 - my * U


def local_tag(el) -> str:
    tag = el.tag
    if not isinstance(tag, str):
        return ""
    return tag.split("}")[-1]


def parse_rooms(svg_text: str) -> list[dict]:
    rooms = []
    for m in re.finditer(
        r'class="rname"[^>]*>\s*([^<]+)\s*</text>[\s\S]*?class="rmeta"[^>]*>\s*([^<]+)<'
        r'tspan[^>]*>\s*([^<]+)',
        svg_text,
    ):
        name = m.group(1).strip()
        area_s = m.group(2).strip().replace(" м²", "").replace(",", ".")
        dims = m.group(3).strip()
        rooms.append({"name": name, "area": float(area_s), "dims": dims})
    return rooms


def area_block(rooms: list[dict]) -> tuple[float, float, float, float, float, str]:
    heated = sum(r["area"] for r in rooms if r["name"] not in OPEN_NAMES)
    living = sum(r["area"] for r in rooms if r["name"] in LIVING_NAMES)
    terr = next((r["area"] for r in rooms if r["name"] == "Терраса"), 0.0)
    porch = next((r["area"] for r in rooms if r["name"] == "Крыльцо"), 0.0)
    rb = heated + terr * K_TERRACE + porch * K_COLD
    note = (
        f"Общая по нормам РБ: отапливаемые {fmt2(heated)} + "
        f"терраса {fmt2(terr)}×{fmt2(K_TERRACE)} + "
        f"крыльцо (неотапл.) {fmt2(porch)}×{fmt2(K_COLD)} = {fmt2(rb)} м²"
    )
    return living, heated, terr, porch, rb, note


def extract_layer(root, label: str):
    for el in root.iter():
        if local_tag(el) != "g":
            continue
        if el.get(f"{{{INK}}}label") == label or el.get("inkscape:label") == label:
            return el
    return None


def drop_page_bg(layer) -> None:
    for el in list(layer.iter()):
        if local_tag(el) == "rect" and el.get("id") == "rect2391":
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)


def recolor_mono(el) -> None:
    for node in el.iter():
        for attr in ("style", "fill", "stroke"):
            val = node.get(attr)
            if not val:
                continue
            low = val.lower()
            for color in (
                "#ffdd55",
                "#ffff00",
                "#00ffff",
                "#e0b83a",
                "#c0392b",
                "#008000",
                "#ff0000",
                "#0000ff",
                "#00ff00",
            ):
                if color in low:
                    val = re.sub(color, "#888888", val, flags=re.I)
                    low = val.lower()
            if "#4d4d4d" in low:
                val = re.sub("#4d4d4d", "#111111", val, flags=re.I)
            node.set(attr, val)


def _parse_translate(tr: str | None) -> tuple[float, float]:
    if not tr:
        return 0.0, 0.0
    m = re.search(r"translate\(([-\d.e+]+),?\s*([-\d.e+]*)\)", tr)
    if not m:
        return 0.0, 0.0
    return float(m.group(1)), float(m.group(2) or 0)


def collect_room_text_obstacles(rooms_layer) -> list[tuple[float, float, float, float]]:
    """AABB подписей комнат (имя + м²/габарит) в координатах плана."""
    out: list[tuple[float, float, float, float]] = []
    if rooms_layer is None:
        return out
    for el in rooms_layer.iter():
        if local_tag(el) != "text":
            continue
        cls = el.get("class") or ""
        if "rname" not in cls and "rmeta" not in cls:
            continue
        raw = "".join(el.itertext()).strip()
        if not raw:
            continue
        x = float(el.get("x") or 0)
        y = float(el.get("y") or 0)
        cx, cy = x, y
        node = el
        while node is not None and node is not rooms_layer:
            tx, ty = _parse_translate(node.get("transform"))
            cx += tx
            cy += ty
            node = node.getparent()
        is_meta = "rmeta" in cls
        # чуть шире реальной глифы — чтобы размер не наезжал вплотную
        hw = max(6.0, len(raw) * (0.85 if is_meta else 1.05))
        hh = 1.5 if is_meta else 1.9
        out.append((cx, cy, hw, hh))
    return out


def add_outline_dims(
    parent, rooms_layer=None
) -> tuple[float, float, tuple[float, float, float, float]]:
    """Размерные линии + выноски в координатах плана (viewBox).

    Стопка: короткие размеры ближе к дому, габарит — дальше.
    Выноска идёт от грани объекта только до своей размерной линии.
    Возвращает (overall_ew, overall_ns, content_bbox).
    """
    g = etree.SubElement(parent, f"{{{SVG_NS}}}g", id="print-house-dims")
    g.set("fill", "none")
    g.set("stroke", "#111111")
    g.set("stroke-width", "0.22")
    g.set("font-family", "DejaVu Sans, Liberation Sans, sans-serif")

    def stroke(x1, y1, x2, y2, w=0.22):
        etree.SubElement(
            g,
            f"{{{SVG_NS}}}line",
            x1=f"{x1:.2f}",
            y1=f"{y1:.2f}",
            x2=f"{x2:.2f}",
            y2=f"{y2:.2f}",
            **{"stroke-width": f"{w:.2f}"},
        )

    def tick(x, y, horizontal: bool):
        if horizontal:
            stroke(x, y - 1.15, x, y + 1.15, 0.28)
        else:
            stroke(x - 1.15, y, x + 1.15, y, 0.28)

    # Уже занятые прямоугольники: надписи комнат + размеры.
    placed_labels: list[tuple[float, float, float, float]] = list(
        collect_room_text_obstacles(rooms_layer)
    )

    def label_half_size(text: str, size: float, rot: float = 0) -> tuple[float, float]:
        scale = size / 2.5
        hw = len(text) * 1.25 * scale
        hh = 1.65 * scale
        if abs(rot) == 90:
            hw, hh = hh, hw
        return hw, hh

    def labels_overlap(a, b, pad=1.4) -> bool:
        ax, ay, aw, ah = a
        bx, by, bw, bh = b
        return abs(ax - bx) < aw + bw + pad and abs(ay - by) < ah + bh + pad

    def label(x, y, text, rot=0, size=2.5):
        node = etree.SubElement(
            g, f"{{{SVG_NS}}}g", transform=f"translate({x:.2f},{y:.2f}) rotate({rot})"
        )
        etree.SubElement(
            node,
            f"{{{SVG_NS}}}rect",
            x=f"{-len(text) * 1.25:.2f}",
            y="-1.65",
            width=f"{len(text) * 2.5:.2f}",
            height="3.3",
            fill="#ffffff",
            stroke="none",
        )
        t = etree.SubElement(
            node,
            f"{{{SVG_NS}}}text",
            x="0",
            y="0",
            fill="#111111",
            stroke="none",
        )
        t.set("font-size", f"{size:.1f}")
        t.set("font-weight", "700" if size >= 2.7 else "400")
        t.set("text-anchor", "middle")
        t.set("dominant-baseline", "middle")
        t.text = text

    def place_label_along(
        x: float,
        y: float,
        text: str,
        *,
        rot: float = 0,
        size: float = 2.5,
        along: str = "h",
        lo: float | None = None,
        hi: float | None = None,
        prefer: int = 0,
        wall_clear: float = 2.8,
    ) -> None:
        """Ставит подпись; при пересечении сдвигает вдоль размерной линии.

        prefer: 0 — в обе стороны; +1 / −1 — сначала в эту сторону вдоль оси.
        lo/hi — границы пролёта (внутренние грани стен); подпись не ближе wall_clear.
        """
        hw, hh = label_half_size(text, size, rot)
        margin = max((hw if along == "h" else hh) + 0.5, wall_clear)
        a = (lo + margin) if lo is not None else None
        b = (hi - margin) if hi is not None else None
        if a is not None and b is not None and a > b:
            # узкий пролёт — центр, уменьшенный запас
            a = b = (lo + hi) / 2  # type: ignore[operator]

        shifts = [0.0]
        for step in range(1, 20):
            d = step * 1.8
            if prefer >= 0:
                shifts.append(d)
            if prefer <= 0:
                shifts.append(-d)
            if prefer > 0:
                shifts.append(-d)
            elif prefer < 0:
                shifts.append(d)

        def try_pos(cx: float, cy: float) -> bool:
            pos = cx if along == "h" else cy
            if a is not None and pos < a:
                return False
            if b is not None and pos > b:
                return False
            box = (cx, cy, hw, hh)
            if any(labels_overlap(box, p) for p in placed_labels):
                return False
            placed_labels.append(box)
            label(cx, cy, text, rot=rot, size=size)
            return True

        for sh in shifts:
            cx = x + sh if along == "h" else x
            cy = y if along == "h" else y + sh
            if try_pos(cx, cy):
                return

        # Если вдоль линии места нет — чуть перпендикулярно (не на стену пролёта).
        for perp in (2.2, -2.2, 4.0, -4.0, 6.0, -6.0):
            for sh in shifts[:9]:
                if along == "h":
                    cx, cy = x + sh, y + perp
                else:
                    cx, cy = x + perp, y + sh
                if try_pos(cx, cy):
                    return

        # fallback: центр пролёта (всё ещё между lo/hi)
        cx = x
        cy = y
        if a is not None and b is not None:
            mid = (a + b) / 2
            if along == "h":
                cx = mid
            else:
                cy = mid
        placed_labels.append((cx, cy, hw, hh))
        label(cx, cy, text, rot=rot, size=size)

    def dim_h(
        x0,
        x1,
        y,
        text,
        ext_y0,
        ext_y1,
        label_dy,
        *,
        size=2.5,
        ext_in=None,
        prefer=0,
        wall_clear=2.8,
    ):
        """Горизонтальный размер: линия строго от x0 до x1 (грани стен)."""
        inn = EXT_IN if ext_in is None else ext_in

        def ey(obj_y):
            return obj_y + (inn if y < obj_y else -inn)

        stroke(x0, ey(ext_y0), x0, y, 0.26)
        stroke(x1, ey(ext_y1), x1, y, 0.26)
        stroke(x0, y, x1, y, 0.32)
        tick(x0, y, True)
        tick(x1, y, True)
        xa, xb = (x0, x1) if x0 <= x1 else (x1, x0)
        # Подпись на линии (label_dy≈0) или чуть в сторону; всегда между стенами.
        place_label_along(
            (x0 + x1) / 2,
            y + label_dy,
            text,
            size=size,
            along="h",
            lo=xa,
            hi=xb,
            prefer=prefer,
            wall_clear=wall_clear,
        )

    def dim_v(
        y0,
        y1,
        x,
        text,
        ext_x0,
        ext_x1,
        label_dx,
        *,
        size=2.5,
        ext_in=None,
        prefer=0,
        label_lo=None,
        label_hi=None,
        wall_clear=2.8,
    ):
        """Вертикальный размер: линия строго от y0 до y1 (грани стен)."""
        inn = EXT_IN if ext_in is None else ext_in

        def ex(obj_x):
            return obj_x + (-inn if x > obj_x else inn)

        stroke(ex(ext_x0), y0, x, y0, 0.26)
        stroke(ex(ext_x1), y1, x, y1, 0.26)
        stroke(x, y0, x, y1, 0.32)
        tick(x, y0, False)
        tick(x, y1, False)
        ya, yb = (y0, y1) if y0 <= y1 else (y1, y0)
        lo = ya if label_lo is None else max(ya, label_lo)
        hi = yb if label_hi is None else min(yb, label_hi)
        mid = (lo + hi) / 2
        place_label_along(
            x + label_dx,
            mid,
            text,
            rot=-90,
            size=size,
            along="v",
            lo=lo,
            hi=hi,
            prefer=prefer,
            wall_clear=wall_clear,
        )

    def stack_v(items, anchor_x, outward):
        """items: (length_m, y0, y1, ext_x0, ext_x1, text). outward>0 — на восток."""
        items = sorted(items, key=lambda it: it[0])
        for i, (_ln, y0, y1, ex0, ex1, text) in enumerate(items):
            x = anchor_x + outward * GAP * (i + 1)
            label_dx = 4.2 if outward > 0 else -4.2
            dim_v(y0, y1, x, text, ex0, ex1, label_dx=label_dx)

    # --- метры → display ---
    bw, bn = m_to_disp(BODY_W, BODY_N)
    be, _ = m_to_disp(BODY_E, BODY_N)
    _, bs_liv = m_to_disp(BODY_W, BODY_S_LIV)
    _, bs_east = m_to_disp(BODY_E, BODY_S_EAST)

    px0, py0 = m_to_disp(PORCH[0], PORCH[1])
    px1, py1 = m_to_disp(PORCH[2], PORCH[3])
    porch_n, porch_s = min(py0, py1), max(py0, py1)
    porch_w, porch_e = min(px0, px1), max(px0, px1)

    tx0, ty0 = m_to_disp(TERRACE[0], TERRACE[1])
    tx1, ty1 = m_to_disp(TERRACE[2], TERRACE[3])
    terr_n, terr_s = min(ty0, ty1), max(ty0, ty1)
    terr_w, terr_e = min(tx0, tx1), max(tx0, tx1)

    cx0, cy0 = m_to_disp(CARPORT["x0"], CARPORT["y0"])
    cx1, cy1 = m_to_disp(CARPORT["x1"], CARPORT["y1"])
    cx_arm, _ = m_to_disp(CARPORT["xArm"], CARPORT["yArm"])
    canopy_n, canopy_s = min(cy0, cy1), max(cy0, cy1)
    canopy_w, canopy_e = min(cx0, cx1), max(cx0, cx1)
    canopy_arm_e = max(cx0, cx_arm)

    # Контур L-навеса (пунктир).
    poly_pts = [m_to_disp(x, y) for x, y in CARPORT_POLY]
    d_parts = [f"M {poly_pts[0][0]:.2f},{poly_pts[0][1]:.2f}"]
    for x, y in poly_pts[1:]:
        d_parts.append(f"L {x:.2f},{y:.2f}")
    d_parts.append("Z")
    canopy = etree.SubElement(
        g, f"{{{SVG_NS}}}path", id="print-canopy", d=" ".join(d_parts)
    )
    canopy.set("fill", "none")
    canopy.set("stroke", "#111111")
    canopy.set("stroke-width", "0.35")
    canopy.set("stroke-dasharray", "2.2 1.4")

    # Ступени/площадка крыльца — строго по 3D.
    # Растр «иное» даёт сдвиг ступеней → белая маска, затем перерисовка.
    def plan_rect(x0m, y0m, x1m, y1m, *, fill, stroke, sw, oid):
        ax0, ay0 = m_to_disp(x0m, y1m)
        ax1, ay1 = m_to_disp(x1m, y0m)
        node = etree.SubElement(
            g,
            f"{{{SVG_NS}}}rect",
            id=oid,
            x=f"{min(ax0, ax1):.2f}",
            y=f"{min(ay0, ay1):.2f}",
            width=f"{abs(ax1 - ax0):.2f}",
            height=f"{abs(ay1 - ay0):.2f}",
        )
        node.set("fill", fill)
        node.set("stroke", stroke)
        node.set("stroke-width", sw)
        return node

    plan_rect(
        -0.35,
        BODY_N,
        9.05,
        21.15,
        fill="#ffffff",
        stroke="none",
        sw="0",
        oid="print-porch-mask",
    )
    for i, (x0m, y0m, x1m, y1m) in enumerate(PORCH_STEPS):
        plan_rect(
            x0m,
            y0m,
            x1m,
            y1m,
            fill="#d0d0d0" if i == 0 else "#e8e8e8",
            stroke="#111111",
            sw="0.40",
            oid=f"print-porch-step-{i}",
        )
    # В 3D площадка доходит до 17,88 (порог), но на печати это перекрывает
    # наружную стену топочной/тамбура/постирочной — юг площадки = BODY_N.
    plan_rect(
        PORCH_DECK[0],
        BODY_N,
        PORCH_DECK[2],
        PORCH_DECK[3],
        fill="#f2f2f2",
        stroke="#111111",
        sw="0.45",
        oid="print-porch-deck",
    )
    # Проём входной двери в северной стене (как в 3D OPENINGS) — иначе
    # сплошная стена/растр дают ощущение, что ступени «съехали» от входа.
    plan_rect(
        3.718,
        BODY_N_IN,
        4.698,
        BODY_N,
        fill="#ffffff",
        stroke="none",
        sw="0",
        oid="print-porch-door",
    )
    for i, (x0m, y0m, x1m, y1m) in enumerate(PORCH_COLUMNS):
        ax0, ay0 = m_to_disp(x0m, y1m)
        ax1, ay1 = m_to_disp(x1m, y0m)
        x = min(ax0, ax1)
        y = min(ay0, ay1)
        w = abs(ax1 - ax0)
        h = abs(ay1 - ay0)
        pad = max(0.0, (4.5 - min(w, h)) / 2)
        col = etree.SubElement(
            g,
            f"{{{SVG_NS}}}rect",
            id=f"print-porch-col-{i}",
            x=f"{x - pad:.2f}",
            y=f"{y - pad:.2f}",
            width=f"{w + 2 * pad:.2f}",
            height=f"{h + 2 * pad:.2f}",
            fill="#111111",
        )
        col.set("stroke", "#ffffff")
        col.set("stroke-width", "0.35")

    overall_ew = BODY_E - BODY_W
    overall_ns = BODY_N - BODY_S_EAST
    liv_ns_clear = BODY_N_IN - BODY_S_LIV_IN
    _, bn_in = m_to_disp(BODY_W, BODY_N_IN)
    _, bs_liv_in = m_to_disp(BODY_W, BODY_S_LIV_IN)
    canopy_w_m = CARPORT["xArm"] - CARPORT["x0"]
    canopy_d_m = CARPORT["y1"] - CARPORT["y0"]
    canopy_north_w_m = CARPORT["x1"] - CARPORT["x0"]

    # Север: отступы — от северной стены корпуса; ширина крыльца — от границ крыльца.
    # По бокам крыльца выноска идёт от северной грани крыльца вниз до стены дома,
    # чтобы было видно, от какой границы взят размер.
    clear_n = porch_n
    north_y = clear_n - GAP
    if porch_w - bw > 2:
        dim_h(
            bw,
            porch_w,
            north_y,
            fmt_m(PORCH[0] - BODY_W),
            bn,
            bn,
            label_dy=-3.3,
        )
        stroke(porch_w, bn + EXT_IN, porch_w, porch_n + EXT_IN, 0.26)
    dim_h(
        porch_w,
        porch_e,
        north_y,
        fmt_m(PORCH[2] - PORCH[0]),
        porch_n,
        porch_n,
        label_dy=-3.3,
    )
    if be - porch_e > 2:
        dim_h(
            porch_e,
            be,
            north_y,
            fmt_m(BODY_E - PORCH[2]),
            bn,
            bn,
            label_dy=-3.3,
        )
        stroke(porch_e, bn + EXT_IN, porch_e, porch_n + EXT_IN, 0.26)
    dim_h(bw, be, clear_n - GAP * 2, fmt_m(overall_ew), bn, bn, label_dy=-3.3)

    # Север навеса: ширина северной полосы — дальше всех северных размеров дома.
    canopy_north_y = min(canopy_n, clear_n) - GAP * 3
    dim_h(
        canopy_w,
        canopy_e,
        canopy_north_y,
        fmt_m(canopy_north_w_m),
        canopy_n,
        canopy_n,
        label_dy=-3.3,
    )

    # Юг: ширина террасы на своей линии (не сливать с отступом — иначе справа
    # «втекает» в стену восточного крыла, т.к. terr_e ≈ jog).
    south_y = terr_s + GAP
    if terr_w - bw > 2:
        dim_h(
            bw, terr_w, south_y, fmt_m(TERRACE[0] - BODY_W), bs_liv, terr_s, label_dy=3.5
        )
    dim_h(
        terr_w,
        terr_e,
        south_y,
        fmt_m(TERRACE[2] - TERRACE[0]),
        terr_s,
        terr_s,
        label_dy=3.5,
    )
    # Усиленные засечки на обоих концах 13,61 — видно начало и конец.
    for tx in (terr_w, terr_e):
        stroke(tx, south_y - 2.0, tx, south_y + 2.0, 0.40)
    # Левая выноска — по западному краю террасы (открытый угол).
    stroke(terr_w, south_y, terr_w, terr_n - EXT_IN, 0.30)
    stroke(terr_w - 1.4, terr_n, terr_w + 1.4, terr_n, 0.30)
    # Правая: край террасы совпадает со стеной jog → выноска снаружи (восточнее),
    # с короткой привязкой к углу, иначе линия сливается со стеной.
    e_out = terr_e + 2.4
    stroke(terr_e, terr_s, e_out, terr_s, 0.30)
    stroke(e_out, south_y, e_out, terr_n - EXT_IN, 0.30)
    stroke(e_out - 1.4, terr_n, e_out + 1.4, terr_n, 0.30)
    stroke(terr_e, terr_n, e_out, terr_n, 0.26)
    if be - terr_e > 2:
        # Отступ до восточного крыла — на следующей линии стопки.
        south_y2 = south_y + GAP
        dim_h(
            terr_e,
            be,
            south_y2,
            fmt_m(BODY_E - TERRACE[2]),
            terr_s,
            bs_east,
            label_dy=3.5,
        )
        stroke(terr_e, terr_s - EXT_IN, terr_e, south_y2, 0.26)
        stroke(be, bs_east - EXT_IN, be, south_y2, 0.26)

    # Юг западного рукава навеса: ширина рукава.
    dim_h(
        canopy_w,
        canopy_arm_e,
        canopy_s + GAP,
        fmt_m(canopy_w_m),
        canopy_s,
        canopy_s,
        label_dy=3.5,
    )

    # Глубина крыльца — по его западному краю, выноски от границ крыльца.
    stack_v(
        [
            (
                PORCH[3] - PORCH[1],
                porch_n,
                porch_s,
                porch_w,
                porch_w,
                fmt_m(PORCH[3] - PORCH[1]),
            )
        ],
        porch_w,
        -1.0,
    )

    # Запад корпуса: чистая глубина террасы и чистая глубина западного крыла.
    terr_depth = TERRACE[3] - TERRACE[1]
    stack_v(
        [
            (terr_depth, terr_n, terr_s, bw, bw, fmt_m(terr_depth)),
            (liv_ns_clear, bn_in, bs_liv_in, bw, bw, fmt_m(liv_ns_clear)),
        ],
        bw,
        -1.0,
    )

    # Запад навеса: глубина L.
    stack_v(
        [
            (
                canopy_d_m,
                canopy_n,
                canopy_s,
                canopy_w,
                canopy_w,
                fmt_m(canopy_d_m),
            )
        ],
        canopy_w,
        -1.0,
    )

    # Восток: чистые пролёты комнат (без толщин стен), дальше — габарит NS.
    east_chain_x = be + GAP
    east_clears = []
    for y_n_m, y_s_m in EAST_CLEARS_M:
        _, y_n = m_to_disp(BODY_E, y_n_m)
        _, y_s = m_to_disp(BODY_E, y_s_m)
        y0, y1 = min(y_n, y_s), max(y_n, y_s)
        length = y_n_m - y_s_m
        east_clears.append(length)
        dim_v(y0, y1, east_chain_x, fmt_m(length), be, be, label_dx=4.2)
    dim_v(
        bn,
        bs_east,
        be + GAP * 2,
        fmt_m(overall_ns),
        be,
        be,
        label_dx=4.2,
    )

    # Внутренние размеры комнат (чистый пролёт между стенами).
    def room_box(name: str):
        x0, y0, x1, y1 = ROOM_CLEARS[name]
        dx0, dy_n = m_to_disp(x0, y1)
        dx1, dy_s = m_to_disp(x1, y0)
        return (
            min(dx0, dx1),
            max(dx0, dx1),
            min(dy_n, dy_s),
            max(dy_n, dy_s),
            x1 - x0,
            y1 - y0,
        )

    # Внутренние NS: линия строго от северной до южной грани пролёта.
    # Линия чуть западнее центра; подпись в южной зоне — не пересекает EW у севера.
    north_ns_names = (
        "Кухня",
        "Топочная",
        "Тамбур",
        "Постирочная",
        "С/у мастер",
        "Мастер-спальня",
    )
    for name in north_ns_names:
        x0, y0, x1, y1 = ROOM_CLEARS[name]
        xw, xe, yn, ys, ew_m, ns_m = room_box(name)
        xd = xw + (xe - xw) * 0.32
        band = ys - yn
        dim_v(
            yn,
            ys,
            xd,
            fmt_m(ns_m),
            xd,
            xd,
            label_dx=0.0,
            size=2.6,
            ext_in=0.6,
            prefer=1,
            label_lo=yn + band * 0.58,
            label_hi=ys,
            wall_clear=3.2,
        )

    # Северная полоса EW: линия у северной стены (не по центру — там NS).
    north_dim_y_m = BODY_N_IN - 0.45
    _, north_dim_y = m_to_disp(0.0, north_dim_y_m)
    for name in NORTH_EW_CHAIN:
        x0, y0, x1, y1 = ROOM_CLEARS[name]
        rx0, _ = m_to_disp(x0, north_dim_y_m)
        rx1, _ = m_to_disp(x1, north_dim_y_m)
        # NS линия на 0.32 ширины → EW-подпись уводим к востоку от неё.
        dim_h(
            min(rx0, rx1),
            max(rx0, rx1),
            north_dim_y,
            fmt_m(x1 - x0),
            north_dim_y,
            north_dim_y,
            label_dy=0.0,
            size=2.6,
            ext_in=0.6,
            prefer=1,
            wall_clear=3.2,
        )

    # Гостиная — крест не в одной точке: NS чуть западнее центра, EW чуть южнее.
    x0, y0, x1, y1 = ROOM_CLEARS["Гостиная"]
    xw, xe, yn, ys, ew_m, ns_m = room_box("Гостиная")
    xd = xw + (xe - xw) * 0.38
    dim_v(
        yn,
        ys,
        xd,
        fmt_m(ns_m),
        xd,
        xd,
        label_dx=0.0,
        size=2.6,
        ext_in=0.6,
        prefer=-1,
        wall_clear=3.0,
    )
    yd = yn + (ys - yn) * 0.58
    dim_h(
        xw,
        xe,
        yd,
        fmt_m(ew_m),
        yd,
        yd,
        label_dy=0.0,
        size=2.6,
        ext_in=0.6,
        prefer=1,
        wall_clear=3.0,
    )

    xs = [
        canopy_w - GAP * 2,
        be + GAP * 2 + 6,
        bw,
        be,
        porch_w,
        porch_e,
        terr_w,
        terr_e + 4,
    ]
    ys = [
        canopy_north_y - 6,
        canopy_s + GAP + 6,
        porch_n - GAP * 2 - 6,
        terr_s + GAP * 2 + 8,
        bn,
        bs_east,
        canopy_n,
        canopy_s,
    ]
    bbox = (min(xs), min(ys), max(xs), max(ys))

    print(
        f"dims EW {fmt_m(overall_ew)}  NS {fmt_m(overall_ns)}; "
        f"east-clear {[fmt_m(v) for v in east_clears]}; "
        f"liv-clear {fmt_m(liv_ns_clear)}; "
        f"canopy {fmt_m(canopy_w_m)}×{fmt_m(canopy_d_m)} (north {fmt_m(canopy_north_w_m)})"
    )
    return overall_ew, overall_ns, bbox


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    text = src.read_text()
    rooms = parse_rooms(text)
    if not rooms:
        raise SystemExit("no room labels found")
    living, heated, terr, porch, rb, note = area_block(rooms)

    parser = etree.XMLParser(huge_tree=True, recover=True)
    root = etree.parse(str(src), parser).getroot()

    walls = extract_layer(root, "стены")
    inoe = extract_layer(root, "иное")
    rooms_layer = extract_layer(root, "помещения")
    if walls is None or inoe is None:
        raise SystemExit("не найдены слои «стены» / «иное»")

    drop_page_bg(inoe)
    inoe.set("opacity", "0.55")
    for el in inoe.iter():
        if local_tag(el) == "image":
            st = el.get("style") or ""
            if "opacity:" in st:
                el.set("style", re.sub(r"opacity:[0-9.]+", "opacity:0.45", st))

    recolor_mono(walls)
    recolor_mono(inoe)

    # Ступени/площадка крыльца в слое «стены» + растр «иное» дают сдвиг —
    # скрываем векторные ступени; рисуем заново по координатам 3D.
    for eid in ("rect592", "rect590", "rect586"):
        for el in list(walls.iter()):
            if el.get("id") == eid:
                parent = el.getparent()
                if parent is not None:
                    parent.remove(el)

    if rooms_layer is not None:
        for el in list(rooms_layer.iter()):
            eid = el.get("id") or ""
            if eid.startswith("room-summary"):
                parent = el.getparent()
                if parent is not None:
                    parent.remove(el)
        for el in rooms_layer.iter():
            if local_tag(el) != "style" or not el.text:
                continue
            el.text = el.text.replace("font-size:2.35px", "font-size:2.6px")
            el.text = el.text.replace("font-size:1.5px", "font-size:1.7px")
        recolor_mono(rooms_layer)

    drawing = etree.Element(f"{{{SVG_NS}}}g", id="drawing")
    drawing.append(inoe)
    drawing.append(walls)
    if rooms_layer is not None:
        drawing.append(rooms_layer)

    overall_ew, overall_ns, bbox = add_outline_dims(drawing, rooms_layer)
    minx, miny, maxx, maxy = bbox

    # Почти весь лист: без правой легенды, узкие поля под шапку/подвал.
    x0, x1, y0, y1 = 2.5, 294.5, 10.2, 188.5
    s = min((x1 - x0) / (maxx - minx), (y1 - y0) / (maxy - miny))
    ox = x0 + ((x1 - x0) - s * (maxx - minx)) / 2
    oy = y0 + ((y1 - y0) - s * (maxy - miny)) / 2
    drawing.set(
        "transform",
        f"translate({ox:.3f},{oy:.3f}) scale({s:.6f}) translate({-minx:.3f},{-miny:.3f})",
    )
    denom = max(1, int(round(100 / s)))

    sheet = etree.Element(f"{{{SVG_NS}}}svg", nsmap=NSMAP)
    sheet.set("width", "297mm")
    sheet.set("height", "210mm")
    sheet.set("viewBox", "0 0 297 210")
    sheet.set("version", "1.1")
    title = (
        f"Вариант 3.1c · габарит {fmt2(overall_ew)}×{fmt2(overall_ns)} м · "
        f"общая (РБ) {fmt2(rb)} м²"
    )
    etree.SubElement(sheet, f"{{{SVG_NS}}}title").text = title
    etree.SubElement(
        sheet, f"{{{SVG_NS}}}rect", width="297", height="210", fill="#ffffff"
    )
    sheet.append(drawing)

    font = "DejaVu Sans, Liberation Sans, sans-serif"
    etree.SubElement(
        sheet,
        f"{{{SVG_NS}}}rect",
        id="margin-top",
        x="0",
        y="0",
        width="297",
        height="9.8",
        fill="#ffffff",
    )
    etree.SubElement(
        sheet,
        f"{{{SVG_NS}}}rect",
        id="margin-bottom",
        x="0",
        y="189.0",
        width="297",
        height="21",
        fill="#ffffff",
    )

    head = etree.SubElement(sheet, f"{{{SVG_NS}}}text", x="4", y="4.2", fill="#111111")
    head.set("font-family", font)
    head.set("font-size", "3.0")
    head.set("font-weight", "700")
    head.text = (
        f"Вариант 3.1c · планировка · габарит {fmt2(overall_ew)}×{fmt2(overall_ns)} м"
    )

    head2 = etree.SubElement(sheet, f"{{{SVG_NS}}}text", x="4", y="7.8", fill="#333333")
    head2.set("font-family", font)
    head2.set("font-size", "2.15")
    head2.text = (
        f"Жилая {fmt2(living)} м² · отапливаемые {fmt2(heated)} м² · "
        f"общая по нормам РБ {fmt2(rb)} м² · навес L "
        f"{fmt2(CARPORT['xArm']-CARPORT['x0'])}×{fmt2(CARPORT['y1']-CARPORT['y0'])} м"
    )

    foot = etree.SubElement(sheet, f"{{{SVG_NS}}}text", x="4", y="193.5", fill="#333333")
    foot.set("font-family", font)
    foot.set("font-size", "2.05")
    foot.text = note

    foot2 = etree.SubElement(sheet, f"{{{SVG_NS}}}text", x="4", y="197.0", fill="#555555")
    foot2.set("font-family", font)
    foot2.set("font-size", "1.85")
    foot2.text = (
        "Слои: «иное» + «стены» + контур навеса. "
        f"На востоке — размеры комнат, дальше габарит. Масштаб ~1:{denom}."
    )

    span10 = 10.0 * U * s
    x10 = 292.0
    x_sb = x10 - span10
    x5 = x_sb + span10 / 2
    bar = etree.fromstring(
        f'<g xmlns="{SVG_NS}" id="scalebar" stroke="#111111" fill="#111111" stroke-width="0.35" '
        f'font-family="{font}" font-size="1.9">'
        f'<line x1="{x_sb:.2f}" y1="205.5" x2="{x10:.2f}" y2="205.5" stroke-width="0.5"/>'
        f'<line x1="{x_sb:.2f}" y1="204.3" x2="{x_sb:.2f}" y2="206.7"/>'
        f'<line x1="{x5:.2f}" y1="204.7" x2="{x5:.2f}" y2="206.3"/>'
        f'<line x1="{x10:.2f}" y1="204.3" x2="{x10:.2f}" y2="206.7"/>'
        f'<text x="{x_sb:.2f}" y="203.7" stroke="none" text-anchor="middle">0</text>'
        f'<text x="{x5:.2f}" y="203.7" stroke="none" text-anchor="middle">5 м</text>'
        f'<text x="{x10:.2f}" y="203.7" stroke="none" text-anchor="middle">10 м</text></g>'
    )
    sheet.append(bar)

    ccx, ccy = 290.5, 5.0
    tip = (ccx, ccy - 2.0)
    tail = (ccx, ccy + 1.5)
    compass = etree.fromstring(
        f'<g xmlns="{SVG_NS}" id="compass" fill="none" stroke="#111111" font-family="{font}" font-size="2.0">'
        f'<circle cx="{ccx:.2f}" cy="{ccy:.2f}" r="2.3" fill="#ffffff" stroke-width="0.3"/>'
        f'<line x1="{tail[0]:.2f}" y1="{tail[1]:.2f}" x2="{tip[0]:.2f}" y2="{tip[1]:.2f}" stroke-width="0.45"/>'
        f'<polygon points="{tip[0]:.2f},{tip[1]:.2f} {tip[0]-0.4:.2f},{tip[1]+0.9:.2f} '
        f'{tip[0]+0.4:.2f},{tip[1]+0.9:.2f}" fill="#111111" stroke="none"/>'
        f'<text x="{ccx - 3.8:.2f}" y="{ccy + 0.25:.2f}" fill="#111111" stroke="none" '
        f'text-anchor="end" dominant-baseline="middle">С</text></g>'
    )
    sheet.append(compass)

    out.write_bytes(
        etree.tostring(sheet, xml_declaration=True, encoding="UTF-8", pretty_print=False)
    )
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    print(f"living {fmt2(living)}  heated {fmt2(heated)}  RB {fmt2(rb)}")
    print(f"scale ~1:{denom}")


if __name__ == "__main__":
    main()
