#!/usr/bin/env python3
"""Посадка варианта 3.1a на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1-1-100.svg.
Прямоугольный парковочный навес (без северной полосы L), колонны как у 3.1d.
Контур крыши — как у 3.1 (вальма/фронтоны дома без L-навеса: отдельный canopy).

Выход: abrikosovaya-22-layout-variant-3.1a-1-100.svg
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape

from build_layout_variant_31 import (
    CARPORT_COLUMNS_M,
    CARPORT_RECT_POLY_M,
    ROOF_EAVE_HIP_M,
    ROOF_PORCH_EAVE_M,
    apply_site_cleanup_and_overlays,
    build_open_air_group,
    fmt2,
    replace_group_by_id,
)

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1-1-100.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1a-1-100.svg"

CANOPY_W = 13.470 - 5.360
CANOPY_D = 19.500 - 9.073
CANOPY_A = CANOPY_W * CANOPY_D


def open_air_31a() -> str:
    cx = (-13.470 + -5.360) / 2
    cy = (9.073 + 19.500) / 2
    return build_open_air_group(
        "open-air-31a",
        roof_pts=ROOF_EAVE_HIP_M,
        porch_pts=ROOF_PORCH_EAVE_M,
        canopy_pts=CARPORT_RECT_POLY_M,
        columns=CARPORT_COLUMNS_M,
        label=f"навес {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} · {fmt2(CANOPY_A)} м²",
        label_at=(cx, cy),
    )


def main() -> None:
    if not SRC_LAYOUT.exists():
        raise SystemExit(f"missing base layout {SRC_LAYOUT}")

    shutil.copyfile(SRC_LAYOUT, OUT)
    svg = OUT.read_text()

    svg = svg.replace(
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1-1-100.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1a-1-100.svg"',
    )
    svg = replace_group_by_id(
        svg,
        "title2",
        '<title id="title2">Вариант 3.1a. Дом на участке, масштаб 1:100</title>',
    )
    svg = apply_site_cleanup_and_overlays(svg, open_air_31a(), "open-air-31a")

    replacements = {
        "text1411": "Вариант 3.1a · дом на участке",
        "text1413": (
            "Масштаб 1:100. Прямоугольный навес у западной стены. "
            f"Навес {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} м ({fmt2(CANOPY_A)} м²). Без машин."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            "Пунктир — контур крыши и навеса, три колонны. "
            "Слои: furniture-underlay, layer-walls, open-air-31a."
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
    print(f"canopy {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} = {fmt2(CANOPY_A)} m²")


if __name__ == "__main__":
    main()
