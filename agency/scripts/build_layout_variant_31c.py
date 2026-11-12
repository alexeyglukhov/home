#!/usr/bin/env python3
"""Посадка варианта 3.1c на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1b-1-100.svg (стены/крыльцо как 3.1b).
Добавляет западный навес 4 м на трёх колоннах; свес над террасой без удлинения.

Выход: abrikosovaya-22-layout-variant-3.1c-1-100.svg
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape

from build_layout_variant_31 import plan_m_to_site, poly_points, replace_group_by_id
from build_layout_variant_31b import PORCH, PORCH_A, PORCH_D, PORCH_W, fmt2, upsert_group_after

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1b-1-100.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1c-1-100.svg"

# Карниз / навес: как если бы западная стена была на 4 м западнее (тот же свес).
X0W_HOUSE = -6.15
CANOPY_EXT = 4.0
X0W_CAN = X0W_HOUSE - CANOPY_EXT  # -10.15
X_PLATE_W = -5.36
X_PLATE_CAN = X_PLATE_W - CANOPY_EXT  # -9.36 линия колонн
Y_PLATE_S = 7.30
Y0N = 19.00
NORTH_EXT = 0.5
Y0N_CAN = Y0N + NORTH_EXT
X_PORCH_E = 8.189
CANOPY_W = X_PLATE_W - X0W_CAN
CANOPY_D = Y0N - Y_PLATE_S
CANOPY_A = CANOPY_W * CANOPY_D

# Три колонны на линии «стены − 4 м»; свес за ними = свес за западной стеной.
COLUMNS = [
    (-9.56, 8.00, -9.16, 8.40),
    (-9.56, 12.60, -9.16, 13.00),
    (-9.56, 17.20, -9.16, 17.60),
]


def canopy_labels() -> str:
    """Пунктир навеса, колонны и подпись в координатах посадки."""
    # Контур парковочного навеса + северный свес +0,5 м до края крыльца.
    poly = [
        plan_m_to_site(X0W_CAN, Y_PLATE_S),
        plan_m_to_site(X0W_CAN, Y0N_CAN),
        plan_m_to_site(X_PORCH_E, Y0N_CAN),
        plan_m_to_site(X_PORCH_E, Y0N),
        plan_m_to_site(X_PLATE_W, Y0N),
        plan_m_to_site(X_PLATE_W, Y_PLATE_S),
    ]
    cx = (X0W_CAN + X_PLATE_W) / 2
    cy = (Y_PLATE_S + Y0N) / 2
    ps = plan_m_to_site(cx, cy)
    font = 'font-family="DejaVu Sans, Liberation Sans, sans-serif"'
    lines = [
        '<g id="open-air-31c" data-role="canopy">',
        f'<polygon id="canopy-eave" points="{poly_points(poly)}" '
        f'fill="none" stroke="#c0392b" stroke-width="0.4" '
        f'stroke-dasharray="1.6 0.9"/>',
    ]
    for i, (x0, y0, x1, y1) in enumerate(COLUMNS):
        col = [
            plan_m_to_site(x0, y0),
            plan_m_to_site(x1, y0),
            plan_m_to_site(x1, y1),
            plan_m_to_site(x0, y1),
        ]
        lines.append(
            f'<polygon id="canopy-col-{i}" points="{poly_points(col)}" '
            f'fill="#6b5344" stroke="#4a3a30" stroke-width="0.25"/>'
        )
    lines.append(
        f'<text id="canopy-label" x="{ps[0]:.2f}" y="{ps[1]:.2f}" '
        f'font-size="3.0" font-weight="700" text-anchor="middle" {font} '
        f'fill="#c0392b">навес +{fmt2(CANOPY_EXT)} м · '
        f"{fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} · {fmt2(CANOPY_A)} м²</text>"
    )
    lines.append("</g>")
    return "\n".join(lines)


def main() -> None:
    if not SRC_LAYOUT.exists():
        raise SystemExit(f"missing base layout {SRC_LAYOUT}")

    shutil.copyfile(SRC_LAYOUT, OUT)
    svg = OUT.read_text()
    svg = upsert_group_after(svg, "open-air-31b", "open-air-31c", canopy_labels())

    svg = svg.replace(
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1b-1-100.svg"',
        'sodipodi:docname="abrikosovaya-22-layout-variant-3.1c-1-100.svg"',
    )
    svg = replace_group_by_id(
        svg,
        "title2",
        '<title id="title2">Вариант 3.1c. Дом на участке, масштаб 1:100</title>',
    )

    replacements = {
        "text1411": "Вариант 3.1c · дом на участке",
        "text1413": (
            "Масштаб 1:100. Вальмовая крыша, навес 4 м на западе. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м ({fmt2(PORCH_A)} м²). "
            f"Навес {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} м ({fmt2(CANOPY_A)} м²)."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            f"Навес {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} м на трёх колоннах. "
            "Пунктир — обводка навеса."
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
        f"canopy {fmt2(CANOPY_W)}×{fmt2(CANOPY_D)} = {fmt2(CANOPY_A)} m²; "
        f"porch {fmt2(PORCH_W)}×{fmt2(PORCH_D)} = {fmt2(PORCH_A)} m²"
    )


if __name__ == "__main__":
    main()
