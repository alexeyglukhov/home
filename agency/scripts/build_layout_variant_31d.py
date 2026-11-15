#!/usr/bin/env python3
"""Посадка варианта 3.1d на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1c-1-100.svg (посадка/оси).
Стены — из agency/var3.1d.svg. L-навес + три колонны; П-крыша (свес 0,80 м).
Пунктир: контур крыши и навеса. Без машин.

Выход: abrikosovaya-22-layout-variant-3.1d-1-100.svg
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape

from build_layout_variant_31 import (
    CARPORT_COLUMNS_M,
    CARPORT_L_POLY_M,
    ROOF_EAVE_HIP_M,
    ROOF_PORCH_EAVE_M,
    apply_site_cleanup_and_overlays,
    build_open_air_group,
    extract_walls_layer,
    fmt2,
    furniture_underlay,
    replace_group_by_id,
    tag_columns,
)
from build_layout_variant_31b import PORCH_A, PORCH_D, PORCH_W, extra_tag_columns
from build_layout_variant_31c import CANOPY_A, CANOPY_D, CANOPY_W

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1c-1-100.svg"
SRC_PLAN = ROOT / "agency" / "var3.1d.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1d-1-100.svg"


def open_air_31d() -> str:
    cx = (-13.470 + -6.165) / 2
    cy = (9.073 + 19.112) / 2
    return build_open_air_group(
        "open-air-31d",
        roof_pts=ROOF_EAVE_HIP_M,
        porch_pts=ROOF_PORCH_EAVE_M,
        canopy_pts=CARPORT_L_POLY_M,
        columns=CARPORT_COLUMNS_M,
        label=f"навес L · {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} · {fmt2(CANOPY_A)} м²",
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
            furniture_underlay(),
            walls,
            "  </g>",
        ]
    )
    svg = replace_group_by_id(svg, "p-plan-31", new_plan)
    svg = apply_site_cleanup_and_overlays(svg, open_air_31d(), "open-air-31d")

    svg = svg.replace(
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1c-1-100.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1d-1-100.svg"',
    )
    # docname could already be 3.1c after copy — also handle if stripped
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
            "Масштаб 1:100. П-крыша (свес 0,80 м), L-навес на западе. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м ({fmt2(PORCH_A)} м²). "
            f"Навес {fmt2(CANOPY_A)} м². Без машин."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            "Пунктир — контур крыши и L-навеса, три колонны."
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
        f"canopy L ≈ {fmt2(CANOPY_A)} m²; "
        f"porch {fmt2(PORCH_W)}×{fmt2(PORCH_D)} = {fmt2(PORCH_A)} m²"
    )


if __name__ == "__main__":
    main()
