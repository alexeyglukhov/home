#!/usr/bin/env python3
"""Посадка варианта 3.1c на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1b-1-100.svg (крыльцо как 3.1b).
Стены — из agency/var3.1c.svg. L-навес + три колонны по плану/3D.
Пунктир: контур вальмовой крыши и навеса. Без машин.

Выход: abrikosovaya-22-layout-variant-3.1c-1-100.svg
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
    replace_group_by_id,
    tag_columns,
)
from build_layout_variant_31b import PORCH_A, PORCH_D, PORCH_W, extra_tag_columns

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1b-1-100.svg"
SRC_PLAN = ROOT / "agency" / "var3.1c.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1c-1-100.svg"
def ensure_xlink_ns(svg: str) -> str:
    """Слой «иное» несёт xlink:href — без xmlns:xlink файл не открывается."""
    if 'xmlns:xlink=' in svg[:2500]:
        return svg
    return svg.replace(
        "<svg",
        '<svg\n   xmlns:xlink="http://www.w3.org/1999/xlink"',
        1,
    )


def inoe_underlay(plan_svg: str) -> str:
    """Весь слой «иное» из var3.1c (картинка + объекты поверх), не только PNG."""
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

CANOPY_W = 13.470 - 6.165  # западный рукав
CANOPY_D = 19.965 - 9.073
CANOPY_A = (13.470 - 6.165) * (19.112 - 9.073) + (0.215 - (-13.470)) * (19.965 - 19.112)


def open_air_31c() -> str:
    cx = (-13.470 + -6.165) / 2
    cy = (9.073 + 19.112) / 2
    return build_open_air_group(
        "open-air-31c",
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
            inoe_underlay(plan),
            walls,
            "  </g>",
        ]
    )
    svg = replace_group_by_id(svg, "p-plan-31", new_plan)
    svg = ensure_xlink_ns(svg)
    svg = apply_site_cleanup_and_overlays(svg, open_air_31c(), "open-air-31c")

    svg = re.sub(
        r'sodipodi:docname="abrikosovaya-22-layout-variant-3\.1[a-d]?-1-100\.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1c-1-100.svg"',
        svg,
        count=1,
    )
    svg = replace_group_by_id(
        svg,
        "title2",
        '<title id="title2">Вариант 3.1c. Дом на участке, масштаб 1:100</title>',
    )

    replacements = {
        "text1411": "Вариант 3.1c · дом на участке",
        "text1413": (
            "Масштаб 1:100. Вальмовая крыша, L-навес на западе. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м ({fmt2(PORCH_A)} м²). "
            f"Навес {fmt2(CANOPY_A)} м². Без машин."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            "Подложка — слой «иное» (мебель + правки). "
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
