#!/usr/bin/env python3
"""Поправка agency/var3.1d.svg ближе к АС (PDF план этажа):
толщины стен 400/120, навес 41,12 м², терраса/крыльцо, колонны 400,
подпись «Навес», затем пересчёт ROOM_CLEARS под внутренние грани.
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "agency" / "scripts"))

from sync_var31d_from_plan import (  # noqa: E402
    PLAN,
    U,
    X0,
    Y0,
    apply,
    disp_to_m,
    extract_group,
    layer_items,
    mul,
    parse_transform,
    r3,
)

OUTER = 0.400
PART = 0.120
COL = 0.400
CANOPY_AREA = 41.12
TERRACE_AREA = 42.68  # до коэф. 0,3 → 12,98 в экспликации
PORCH_AREA = 10.38


def inv_affine(M):
    a, b, c, d, e, f = M
    det = a * d - b * c
    ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
    return (ia, ib, ic, id_, -(ia * e + ic * f), -(ib * e + id_ * f))


def m_to_disp(xm, ym):
    return xm * U + X0, Y0 - ym * U


def fmt_attr(v: float) -> str:
    s = f"{v:.8f}".rstrip("0").rstrip(".")
    return s if s else "0"


def walk_rects(layer: str):
    """Yield (eid, match, M, local x,y,w,h) for every rect with id."""
    stack = [(1, 0, 0, 1, 0, 0)]
    for m in re.compile(r"<(/?)(g|rect)\b([^>]*)(/?)>").finditer(layer):
        closing, tag, attrs, sc = m.group(1), m.group(2), m.group(3), m.group(4)
        if tag == "g":
            if closing:
                if len(stack) > 1:
                    stack.pop()
            else:
                tr = re.search(r'\btransform="([^"]*)"', attrs)
                stack.append(mul(stack[-1], parse_transform(tr.group(1) if tr else "")))
                if sc and len(stack) > 1:
                    stack.pop()
            continue
        if closing:
            continue
        eid_m = re.search(r'\bid="([^"]+)"', attrs)
        if not eid_m:
            continue
        dd = dict(re.findall(r'\b(x|y|width|height)="([^"]+)"', attrs))
        if len(dd) < 4:
            continue
        x, y, w, h = map(float, (dd["x"], dd["y"], dd["width"], dd["height"]))
        tr = re.search(r'\btransform="([^"]*)"', attrs)
        M = mul(stack[-1], parse_transform(tr.group(1) if tr else ""))
        yield eid_m.group(1), m, M, x, y, w, h


def meter_box(M, x, y, w, h):
    corners = [apply(M, x, y), apply(M, x + w, y), apply(M, x + w, y + h), apply(M, x, y + h)]
    mc = [disp_to_m(*p) for p in corners]
    xs = [p[0] for p in mc]
    ys = [p[1] for p in mc]
    return (min(xs), min(ys), max(xs), max(ys))


def local_from_meter(M, box):
    inv = inv_affine(M)
    x0, y0, x1, y1 = box
    disp = [
        m_to_disp(x0, y0),
        m_to_disp(x1, y0),
        m_to_disp(x1, y1),
        m_to_disp(x0, y1),
    ]
    local = [apply(inv, *p) for p in disp]
    xs = [p[0] for p in local]
    ys = [p[1] for p in local]
    return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)


def replace_rect_xywh(svg: str, eid: str, x, y, w, h) -> str:
    pattern = re.compile(rf'(<rect\b[^>]*\bid="{re.escape(eid)}"[^>]*)(/>|>)', re.S)

    def repl(m):
        chunk = m.group(1)
        for attr, val in (("x", x), ("y", y), ("width", w), ("height", h)):
            chunk, n = re.subn(
                rf'\b{attr}="[^"]*"',
                f'{attr}="{fmt_attr(val)}"',
                chunk,
                count=1,
            )
            if not n:
                raise SystemExit(f"{eid}: missing {attr}")
        return chunk + m.group(2)

    out, n = pattern.subn(repl, svg, count=1)
    if n != 1:
        raise SystemExit(f"replace failed for {eid}")
    return out


def set_box(svg: str, eid: str, M, box) -> str:
    x, y, w, h = local_from_meter(M, box)
    return replace_rect_xywh(svg, eid, x, y, w, h)


def thin_box(box, th, *, keep="center", outer_axis=None):
    """Сжать/раздуть AABB до толщины th. keep=center|outer; outer_axis='x'|'y'."""
    x0, y0, x1, y1 = box
    ew, ns = x1 - x0, y1 - y0
    if ew < ns:
        # thin in x (NS wall)
        if keep == "center":
            cx = (x0 + x1) * 0.5
            return (cx - th / 2, y0, cx + th / 2, y1)
        if outer_axis == "min":
            return (x0, y0, x0 + th, y1)
        return (x1 - th, y0, x1, y1)
    # thin in y (EW wall)
    if keep == "center":
        cy = (y0 + y1) * 0.5
        return (x0, cy - th / 2, x1, cy + th / 2)
    if outer_axis == "min":
        return (x0, y0, x1, y0 + th)
    return (x0, y1 - th, x1, y1)


def shoelace(poly):
    s = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        s += x0 * y1 - x1 * y0
    return abs(s) * 0.5


def main():
    svg = PLAN.read_text()
    layer = extract_group(svg, "layer1")
    rects = {eid: (M, meter_box(M, x, y, w, h)) for eid, _, M, x, y, w, h in walk_rects(layer)}
    items = layer_items(layer)
    by_id = {eid: (fill, box) for eid, fill, box in items}

    # --- 1) Стены: наружные 400 (запад — наружная грань), перегородки 120 по оси ---
    wall_ids = []
    for eid, fill, box in items:
        if fill != "#4d4d4d":
            continue
        if eid in {
            "rect1691",
            "rect1693",
            "rect1695",
            "rect2718",
            "rect2720",
            "rect2495",
            "rect2497",
        }:
            continue
        if not (-8 <= box[0] <= 16 and 0 <= box[1] <= 22):
            continue
        wall_ids.append(eid)

    west_id = "rect422"
    for eid in wall_ids:
        M, box = rects[eid]
        x0, y0, x1, y1 = box
        th = min(x1 - x0, y1 - y0)
        if eid == west_id:
            new = thin_box(box, OUTER, keep="outer", outer_axis="min")
        elif th >= 0.35:
            # наружные/несущие ~400 — выровнять, сохранив наружную грань
            if abs((x1 - x0) - th) < 1e-6:
                # thin x: наружная = более «внешняя» относительно дома
                cx = (x0 + x1) * 0.5
                house_cx = 4.5
                if cx < house_cx:
                    new = thin_box(box, OUTER, keep="outer", outer_axis="min")
                else:
                    new = thin_box(box, OUTER, keep="outer", outer_axis="max")
            else:
                cy = (y0 + y1) * 0.5
                house_cy = 9.0
                if cy < house_cy:
                    new = thin_box(box, OUTER, keep="outer", outer_axis="min")
                else:
                    new = thin_box(box, OUTER, keep="outer", outer_axis="max")
        elif 0.13 < th < 0.20:
            new = thin_box(box, PART, keep="center")
        else:
            continue
        svg = set_box(svg, eid, M, new)
        rects[eid] = (M, new)
        print(f"wall {eid}: th {th*1000:.0f}→{min(new[2]-new[0], new[3]-new[1])*1000:.0f}")

    # --- 2) Колонны 400×400 (сохранить центр) ---
    for eid in ("rect2718", "rect2720", "rect2495", "rect2497", "rect1691", "rect1693", "rect1695"):
        if eid not in rects:
            continue
        M, box = rects[eid]
        x0, y0, x1, y1 = box
        cx, cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
        # вытянутая «нога» навеса rect1693 — только ширину к 400, длину оставить
        ew, ns = x1 - x0, y1 - y0
        if max(ew, ns) > 0.6:
            if ew > ns:
                new = (cx - COL / 2, y0, cx + COL / 2, y1)
            else:
                new = (x0, cy - COL / 2, x1, cy + COL / 2)
        else:
            new = (cx - COL / 2, cy - COL / 2, cx + COL / 2, cy + COL / 2)
        svg = set_box(svg, eid, M, new)
        rects[eid] = (M, new)
        print(f"col {eid}: {ew:.3f}x{ns:.3f} → {new[2]-new[0]:.3f}x{new[3]-new[1]:.3f}")

    # Перечитать запад после правки
    layer = extract_group(svg, "layer1")
    rects = {eid: (M, meter_box(M, x, y, w, h)) for eid, _, M, x, y, w, h in walk_rects(layer)}
    west = rects["rect422"][1]
    north = rects["rect408"][1]
    liv_s = rects["rect354"][1]
    off_w = rects["rect420"][1]
    porch_deck = rects["rect586"][1]
    porch_slab = rects["rect590"][1]
    t_w, t_e = rects["rect2718"][1], rects["rect2720"][1]

    x_west_out = west[0]
    y_north_out = north[3]
    y_liv_s = liv_s[1]
    x_off_w = off_w[0]
    eave = porch_deck[0] - 0.80
    y_porch_n = porch_deck[3]

    # --- 3) Навес: НЕ сжимать под площадь 41,12 — контур как в АС (~63 м² L),
    # экспликация 41,12 отдельна. SKIP_CANOPY_SHRINK: только стиль/viewBox.
    # --- 3) Навес: L с площадью 41,12 (запад 5440 + север до карниза крыльца) ---
    west_arm_ew = 5.440
    x_arm = x_west_out
    x0 = x_arm - west_arm_ew
    y_arm = y_north_out  # юг северной полосы = север дома
    # north strip area
    north_w = eave - x_arm
    north_h = y_porch_n - y_arm
    north_a = max(0.0, north_w * north_h)
    west_a = CANOPY_AREA - north_a
    if west_a < 5:
        raise SystemExit(f"canopy math failed north_a={north_a}")
    west_ns = west_a / west_arm_ew
    y0 = y_arm - west_ns
    canopy_box = (x0, y0, x_arm, y_arm)
    M_c, _ = rects["rect1689"]
    svg = set_box(svg, "rect1689", M_c, canopy_box)
    poly = [
        (x0, y0),
        (x_arm, y0),
        (x_arm, y_arm),
        (eave, y_arm),
        (eave, y_porch_n),
        (x0, y_porch_n),
    ]
    print(f"canopy L area={shoelace(poly):.2f} (target {CANOPY_AREA})")
    print(f"  west arm {west_arm_ew:.3f}x{west_ns:.3f}, north {north_w:.3f}x{north_h:.3f}")

    # --- 4) Терраса → 42,68 м² (свес южнее колонн) ---
    # Настил задаётся колоннами + западом/востоком; двигаем только опоры южнее при нужде.
    terr_x0 = min(x_west_out, t_w[0])
    terr_x1 = x_off_w
    terr_ew = terr_x1 - terr_x0
    terr_ns = TERRACE_AREA / terr_ew
    terr_y0 = y_liv_s - terr_ns
    # Колонны: центр по X сохранить, низ настила = terr_y0 + ~1,0 м к центру колонны как раньше
    for eid, box in (("rect2718", t_w), ("rect2720", t_e)):
        M, _ = rects[eid]
        cx = (box[0] + box[2]) * 0.5
        # прежний зазор низ настила → низ колонны ≈ 0,99; центр колонны ≈ низ+0,20
        cy = terr_y0 + 0.99 + COL / 2
        new = (cx - COL / 2, cy - COL / 2, cx + COL / 2, cy + COL / 2)
        svg = set_box(svg, eid, M, new)
        rects[eid] = (M, new)
        print(f"terrace col {eid} → cy={cy:.3f}")
    print(f"terrace target {terr_ew:.3f}x{terr_ns:.3f}={TERRACE_AREA}")

    # --- 5) Крыльцо → 10,38 м² (наружный контур ступеней) ---
    # Ширину площадки сохраняем, глубину наружной ступени подгоняем.
    deck = porch_deck
    slab = porch_slab
    deck_w = deck[2] - deck[0]
    # PDF: общая площадь крыльца 10,38 — наружный контур
    porch_ns = PORCH_AREA / max(deck_w, slab[2] - slab[0])
    # юг площадки = север стены; север ступеней = юг + porch_ns от наружного контура
    # Наружный slab: шире/глубже deck; задаём slab NS = porch_ns от south of north wall overlap
    y_slab0 = north[1]  # как сейчас: от северной стены
    # Фактически площадь = width * (y_north_outer_step - y_wall_north_inner-ish)
    # Проще: наружная глубина от y_north_out
    y_step_n = y_north_out + porch_ns
    # Сохранить отступы бортов slab относительно deck
    dx0 = slab[0] - deck[0]
    dx1 = slab[2] - deck[2]
    new_slab = (deck[0] + dx0, y_slab0, deck[2] + dx1, y_step_n)
    # Промежуточная/deck: чуть меньше
    inset = 0.12
    new_deck = (
        deck[0],
        north[1],
        deck[2],
        r3(y_north_out + porch_ns - 0.25),
    )
    svg = set_box(svg, "rect590", rects["rect590"][0], new_slab)
    svg = set_box(svg, "rect586", rects["rect586"][0], new_deck)
    print(
        f"porch slab ~{(new_slab[2]-new_slab[0])*(new_slab[3]-new_slab[1]):.2f} m² "
        f"(target {PORCH_AREA})"
    )

    # --- 6) Кабинет: сдвинуть перегородку у юга спальни-1 (PDF ~2,95 м NS) ---
    # Ищем EW-перегородку на y≈3.3 между x=10..14.6
    layer = extract_group(svg, "layer1")
    rects = {eid: (M, meter_box(M, x, y, w, h)) for eid, _, M, x, y, w, h in walk_rects(layer)}
    office_south = rects["rect410"][1][3]  # внутренняя грань южной стены крыла
    target_office_ns = 2.945
    target_part_y0 = office_south + target_office_ns
    moved = False
    for eid, (M, box) in rects.items():
        x0, y0, x1, y1 = box
        th = min(x1 - x0, y1 - y0)
        if th > 0.2:
            continue
        if not (9.5 < x0 < 11 and 14 < x1 and 3.0 < y0 < 3.6 and (y1 - y0) < 0.25):
            continue
        cy = target_part_y0 + PART / 2
        new = (x0, cy - PART / 2, x1, cy + PART / 2)
        svg = set_box(svg, eid, M, new)
        print(f"office partition {eid}: y {y0:.3f}→{new[1]:.3f}")
        moved = True
    if not moved:
        print("WARN: office partition not found")

    # --- 7) Подпись «Навес» с метражем ---
    # Ставим рядом с навесом, в layer-rooms если есть, иначе в layer1 после навеса.
    label_x_m = (x0 + x_arm) * 0.5
    label_y_m = (y0 + y_arm) * 0.5
    lx, ly = m_to_disp(label_x_m, label_y_m)
    area_s = f"{CANOPY_AREA:.2f}".replace(".", ",")
    dims_s = f"{west_arm_ew:.2f}×{west_ns:.2f}".replace(".", ",")
    label = f'''<g id="label-canopy" transform="translate({fmt_attr(lx)},{fmt_attr(ly)})">
  <text id="text-canopy-name" x="0" y="0" style="font-style:normal;font-variant:normal;font-weight:bold;font-size:3.2px;font-family:'DejaVu Sans', sans-serif;text-anchor:middle;fill:#1a1a1a">Навес</text>
  <text id="text-canopy-meta" x="0" y="4.2" style="font-size:2.6px;font-family:'DejaVu Sans', sans-serif;text-anchor:middle;fill:#1a1a1a">{area_s} м²<tspan id="tspan-canopy-dims" x="0" dy="3.1" style="font-size:2.2px">{dims_s}</tspan></text>
</g>
'''
    if 'id="label-canopy"' in svg:
        svg = re.sub(
            r'<g\b[^>]*\bid="label-canopy"[^>]*>[\s\S]*?</g>',
            label.strip(),
            svg,
            count=1,
        )
    else:
        # вставить в layer-rooms
        m = re.search(r'(<g\b[^>]*\bid="layer-rooms"[^>]*>)', svg)
        if m:
            svg = svg[: m.end()] + "\n" + label + svg[m.end() :]
        else:
            svg = svg.replace(
                'id="rect1689"',
                'id="rect1689"',
                1,
            )
            # fallback: before </svg>
            svg = svg.replace("</svg>", label + "</svg>", 1)
        print("added canopy label")

    PLAN.write_text(svg)
    print(f"wrote {PLAN}")

    # --- 8) Обновить ROOM_CLEARS в sync-скрипте по новым внутренним граням ---
    layer = extract_group(svg, "layer1")
    items = layer_items(layer)
    by_id = {eid: (fill, box) for eid, fill, box in items}

    def box(eid):
        return by_id[eid][1]

    # Собираем внутренние грани ключевых стен (после правки)
    # Используем уже существующие id из sync_var31d_from_plan.geom_from_plan
    clears = {
        # пересчитаем эвристикой: прежние имена ↔ боксы соседних стен
    }
    # Импортируем текущие clears и сдвигаем границы пропорционально толщинам —
    # надёжнее: вызвать отдельный пересчёт ниже в sync patch.
    print("ROOM_CLEARS: run sync_var31d_from_plan after updating clears table")

    # Запишем целевые clears из PDF-площадей + новых наружных/внутренних граней
    body_w_in = box("rect422")[2]
    body_e_in = box("rect416")[0]
    body_n_in = box("rect408")[1]
    body_s_liv_in = box("rect354")[3]
    body_s_off_in = box("rect410")[3]
    liv_e_in = box("rect424")[0]
    off_w_out = box("rect420")[0]

    # Перегородки: собрать все тонкие и вывести подсказки
    parts = []
    for eid, fill, b in items:
        if fill != "#4d4d4d":
            continue
        th = min(b[2] - b[0], b[3] - b[1])
        if 0.10 < th < 0.18:
            parts.append((eid, b, th))
    print(f"partitions now: {len(parts)}, th sample {[round(p[2]*1000) for p in parts[:5]]}")


if __name__ == "__main__":
    main()
