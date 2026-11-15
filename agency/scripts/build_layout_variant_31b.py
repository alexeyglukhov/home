#!/usr/bin/env python3
"""Посадка варианта 3.1b на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1-1-100.svg
Стены — из agency/var3.1.svg (расширенное крыльцо).
Прямоугольный парковочный навес как в 3D / 3.1a.
Пунктир: контур вальмовой крыши + крыльцо + навес. Без машин.

Выход: abrikosovaya-22-layout-variant-3.1b-1-100.svg
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
    SRC_PLAN,
    apply_site_cleanup_and_overlays,
    build_open_air_group,
    extract_walls_layer,
    fmt2,
    furniture_underlay,
    plan_m_to_site,
    poly_points,
    replace_group_by_id,
    tag_columns,
)

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1-1-100.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1b-1-100.svg"

PORCH = (-0.072, 18.297, 8.189, 20.834)  # x0,y0,x1,y1
PORCH_W = PORCH[2] - PORCH[0]
PORCH_D = PORCH[3] - PORCH[1]
PORCH_A = PORCH_W * PORCH_D

CANOPY_W = 13.470 - 5.360
CANOPY_D = 19.500 - 9.073
CANOPY_A = CANOPY_W * CANOPY_D


def extra_tag_columns(walls: str) -> str:
    """Обводка крыльца 3.1b (колонн на крыльце нет)."""
    out = walls.replace(
        'id="rect592"',
        'id="porch-outline" data-plan-id="rect592" data-role="porch"',
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
    return out


def open_air_31b() -> str:
    cx = (-13.470 + -5.360) / 2
    cy = (9.073 + 19.500) / 2
    porch_poly = [
        (PORCH[0], PORCH[1]),
        (PORCH[2], PORCH[1]),
        (PORCH[2], PORCH[3]),
        (PORCH[0], PORCH[3]),
    ]
    # Крыша + навес (как 3.1a) + обводка плиты крыльца.
    g = build_open_air_group(
        "open-air-31b",
        roof_pts=ROOF_EAVE_HIP_M,
        porch_pts=ROOF_PORCH_EAVE_M,
        canopy_pts=CARPORT_RECT_POLY_M,
        columns=CARPORT_COLUMNS_M,
        label=(
            f"навес {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} · {fmt2(CANOPY_A)} м² · "
            f"крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)}"
        ),
        label_at=(cx, cy),
    )
    plate = (
        f'<polygon id="porch-eave" points="{poly_points([plan_m_to_site(*p) for p in porch_poly])}" '
        f'fill="none" stroke="#c0392b" stroke-width="0.4" '
        f'stroke-dasharray="1.6 0.9"/>'
    )
    return g.replace(
        '<g id="open-air-31b" data-role="open-air">',
        '<g id="open-air-31b" data-role="open-air">\n' + plate,
        1,
    )


def main() -> None:
    if not SRC_LAYOUT.exists():
        raise SystemExit(f"missing base layout {SRC_LAYOUT}")

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
    svg = apply_site_cleanup_and_overlays(svg, open_air_31b(), "open-air-31b")

    svg = svg.replace(
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1-1-100.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1b-1-100.svg"',
    )
    svg = replace_group_by_id(
        svg,
        "title2",
        '<title id="title2">Вариант 3.1b. Дом на участке, масштаб 1:100</title>',
    )

    replacements = {
        "text1411": "Вариант 3.1b · дом на участке",
        "text1413": (
            "Масштаб 1:100. Вальмовая крыша, прямоугольный навес. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м ({fmt2(PORCH_A)} м²). "
            f"Навес {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} м ({fmt2(CANOPY_A)} м²). Без машин."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            "Пунктир — контур крыши, навеса и крыльца; три колонны."
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
        f"porch {fmt2(PORCH_W)}×{fmt2(PORCH_D)} = {fmt2(PORCH_A)} m²; "
        f"canopy {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} = {fmt2(CANOPY_A)} m²"
    )


if __name__ == "__main__":
    main()
