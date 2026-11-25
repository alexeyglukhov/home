#!/usr/bin/env python3
"""Посадка варианта 3.1d на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1c-1-100.svg (посадка/оси).
Стены — из agency/var3.1d.svg. Прямоугольный навес + три колонны.
Пунктир: контур вальмовой крыши и навеса. Подложка — слой «иное».

Выход: abrikosovaya-22-layout-variant-3.1d-1-100.svg
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape

from build_layout_variant_31 import (
    apply_site_cleanup_and_overlays,
    build_open_air_group,
    extract_walls_layer,
    fmt2,
    replace_group_by_id,
    tag_columns,
)

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1c-1-100.svg"
SRC_PLAN = ROOT / "agency" / "var3.1d.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1d-1-100.svg"

# Наружные грани / навес / крыльцо — sync_var31d_from_plan / variant-31d.js
BODY_W, BODY_E = -5.612, 14.621
BODY_N, BODY_S_LIV, BODY_S_EAST = 18.214, 7.381, 0.396
BODY_OFF_W, BODY_LIV_E = 8.182, 2.834
EAVE, EAVE_TERR, EAVE_PORCH = 0.80, 1.84, 0.80

ROOF_EAVE_HIP_M = [
    (BODY_W - EAVE, BODY_S_LIV - EAVE_TERR),
    (BODY_W - EAVE, BODY_N + EAVE),
    (BODY_E + EAVE, BODY_N + EAVE),
    (BODY_E + EAVE, BODY_S_EAST - EAVE),
    (BODY_OFF_W - EAVE, BODY_S_EAST - EAVE),
    (BODY_OFF_W - EAVE, BODY_S_LIV - EAVE),
    (BODY_LIV_E + EAVE, BODY_S_LIV - EAVE),
    (BODY_LIV_E + EAVE, BODY_S_LIV - EAVE_TERR),
]
ROOF_PORCH_EAVE_M = [
    (0.181 - EAVE_PORCH, BODY_N + EAVE),
    (0.181 - EAVE_PORCH, 19.778 + EAVE_PORCH),
    (7.781 + EAVE_PORCH, 19.778 + EAVE_PORCH),
    (7.781 + EAVE_PORCH, BODY_N + EAVE),
]

CARPORT_POLY_M = [
    (-11.629, 9.947),
    (-5.573, 9.947),
    (-5.573, 19.058),
    (-11.629, 19.058),
]
CARPORT_COLUMNS_M = [
    (-11.529, 10.056, -8.772, 10.564),
    (-11.537, 13.858, -11.031, 14.385),
    (-11.537, 17.707, -11.038, 18.977),
]

PORCH = (-0.078, 18.211, 8.093, 20.066)
PORCH_W = PORCH[2] - PORCH[0]
PORCH_D = PORCH[3] - PORCH[1]
PORCH_A = PORCH_W * PORCH_D

CANOPY_W = -5.573 - (-11.629)
CANOPY_D = 19.058 - 9.947
CANOPY_A = CANOPY_W * CANOPY_D


def ensure_xlink_ns(svg: str) -> str:
    if "xmlns:xlink=" in svg[:2500]:
        return svg
    return svg.replace(
        "<svg",
        '<svg\n   xmlns:xlink="http://www.w3.org/1999/xlink"',
        1,
    )


def inoe_underlay(plan_svg: str) -> str:
    from build_layout_variant_31 import extract_group

    layer = extract_group(plan_svg, "layer3")
    layer = re.sub(r'<rect\b[^>]*\bid="rect2391"[^>]*/>', "", layer, count=1)
    layer = layer.replace(
        'id="layer3"',
        'id="furniture-underlay" data-role="inoe-underlay" opacity="0.55"',
        1,
    )
    layer = re.sub(
        r'\binkscape:label="иное"',
        'inkscape:label="подложка иное"',
        layer,
        count=1,
    )
    return layer.rstrip() + "\n"


def rooms_underlay(plan_svg: str) -> str:
    from build_layout_variant_31 import extract_group

    rooms = extract_group(plan_svg, "layer-rooms")
    rooms = re.sub(
        r'<g\b[^>]*\bid="room-summary"[^>]*>[\s\S]*?</g>',
        "",
        rooms,
        count=1,
    )
    rooms = rooms.replace(
        'id="layer-rooms"',
        'id="layer-rooms" data-role="rooms-underlay"',
        1,
    )
    return rooms.rstrip() + "\n"


def extra_tag_columns(walls: str) -> str:
    """Крыльцо rect590 + колонны крыльца rect2495/2497."""
    out = walls.replace(
        'id="rect590"',
        'id="porch-outline" data-plan-id="rect590" data-role="porch"',
        1,
    )
    out = re.sub(
        r'(id="porch-outline"[^>]*\bstyle=")([^"]*)(")',
        lambda m: m.group(1)
        + re.sub(r"stroke-width:[^;]*", "stroke-width:0.85", m.group(2))
        + m.group(3),
        out,
        count=1,
    )
    for eid, role in (("rect2495", "porch-column"), ("rect2497", "porch-column")):
        out = out.replace(
            f'id="{eid}"',
            f'id="{eid}" data-role="{role}"',
            1,
        )
    return out


def open_air_31d() -> str:
    cx = (-11.629 + -5.573) / 2
    cy = (9.947 + 19.058) / 2
    return build_open_air_group(
        "open-air-31d",
        roof_pts=ROOF_EAVE_HIP_M,
        porch_pts=ROOF_PORCH_EAVE_M,
        canopy_pts=CARPORT_POLY_M,
        columns=CARPORT_COLUMNS_M,
        label=f"навес · {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} · {fmt2(CANOPY_A)} м²",
        label_at=(cx, cy),
    )


def main() -> None:
    if not SRC_LAYOUT.exists():
        raise SystemExit(f"missing base layout {SRC_LAYOUT}")
    if not SRC_PLAN.exists():
        raise SystemExit(f"missing plan {SRC_PLAN}")

    shutil.copyfile(SRC_LAYOUT, OUT)
    svg = OUT.read_text()
    plan = SRC_PLAN.read_text()
    walls = extra_tag_columns(tag_columns(extract_walls_layer(plan)))

    m = re.search(
        r'(<g\b[^>]*\bid="p-plan-31"[^>]*\btransform="([^"]+)"[^>]*>)',
        svg,
    )
    if not m:
        raise SystemExit("p-plan-31 not found")
    preserved = m.group(2)

    new_plan = "\n".join(
        [
            f'<g id="p-plan-31" transform="{preserved}">',
            inoe_underlay(plan),
            walls,
            rooms_underlay(plan),
            "  </g>",
        ]
    )
    svg = replace_group_by_id(svg, "p-plan-31", new_plan)
    svg = ensure_xlink_ns(svg)
    svg = apply_site_cleanup_and_overlays(svg, open_air_31d(), "open-air-31d")

    svg = re.sub(
        r'sodipodi:docname="abrikosovaya-22-layout-variant-3\.1[a-d]?-1-100\.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1d-1-100.svg"',
        svg,
        count=1,
    )
    svg = replace_group_by_id(
        svg,
        "title2",
        '<title id="title2">Вариант 3.1d. Дом на участке, масштаб 1:100</title>',
    )

    replacements = {
        "text1411": "Вариант 3.1d · дом на участке",
        "text1413": (
            "Масштаб 1:100. Вальмовая крыша, навес на западе. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м ({fmt2(PORCH_A)} м²). "
            f"Навес {fmt2(CANOPY_A)} м². Без машин."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            "Подложка — слой «иное» (мебель + правки). "
            "Пунктир — контур крыши и навеса, три колонны."
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
    print(
        f"canopy ≈ {fmt2(CANOPY_A)} m²; "
        f"porch {fmt2(PORCH_W)}×{fmt2(PORCH_D)} = {fmt2(PORCH_A)} m²"
    )


if __name__ == "__main__":
    main()
