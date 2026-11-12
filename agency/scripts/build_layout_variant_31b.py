#!/usr/bin/env python3
"""Посадка варианта 3.1b на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1-1-100.svg
Стены — из agency/var3.1.svg (расширенное крыльцо, без навеса).
Крыша-лекала 3.1 сохраняем, но убираем фронтоны (вальма).
Пунктир и метры: крыльцо 13,89×2,52 (34,99 м²).

Выход: abrikosovaya-22-layout-variant-3.1b-1-100.svg
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape

from build_layout_variant_31 import (
    SRC_PLAN,
    extract_walls_layer,
    plan_m_to_site,
    poly_points,
    replace_group_by_id,
    tag_columns,
    upsert_blind_area,
)

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1-1-100.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1b-1-100.svg"

# Метры с плана var3.1 (U≈9,962; Cx/Cy по колоннам).
PORCH = (-0.072, 18.297, 8.189, 20.834)  # x0,y0,x1,y1
PORCH_W = PORCH[2] - PORCH[0]
PORCH_D = PORCH[3] - PORCH[1]
PORCH_A = PORCH_W * PORCH_D


def fmt2(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


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


def strip_gables(roof: str) -> str:
    """Вальма 3.1b — без фронтонов на лекалах."""
    out = roof
    for gid in ("roof-gable-0", "roof-gable-1", "roof-gable-2", "roof-gable-3"):
        out = re.sub(
            rf'<(?:path|rect)\b(?=[^>]*\bid="{gid}")[^>]*/>',
            "",
            out,
        )
        out = re.sub(
            rf'<(?:path|rect)\b(?=[^>]*\bid="{gid}")[^>]*>.*?</(?:path|rect)>',
            "",
            out,
            flags=re.DOTALL,
        )
    return out


def open_labels() -> str:
    """Подпись крыльца в координатах посадки (план-метры)."""
    px = (PORCH[0] + PORCH[2]) / 2
    py = (PORCH[1] + PORCH[3]) / 2
    ps = plan_m_to_site(px, py)
    porch_poly = [
        plan_m_to_site(PORCH[0], PORCH[1]),
        plan_m_to_site(PORCH[2], PORCH[1]),
        plan_m_to_site(PORCH[2], PORCH[3]),
        plan_m_to_site(PORCH[0], PORCH[3]),
    ]
    font = 'font-family="DejaVu Sans, Liberation Sans, sans-serif"'
    return "\n".join(
        [
            '<g id="open-air-31b" data-role="porch">',
            f'<polygon id="porch-eave" points="{poly_points(porch_poly)}" '
            f'fill="none" stroke="#c0392b" stroke-width="0.4" '
            f'stroke-dasharray="1.6 0.9"/>',
            f'<text id="porch-label" x="{ps[0]:.2f}" y="{ps[1]:.2f}" '
            f'font-size="3.0" font-weight="700" text-anchor="middle" {font} '
            f'fill="#c0392b">крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} · '
            f"{fmt2(PORCH_A)} м²</text>",
            "</g>",
        ]
    )


def upsert_group_after(svg: str, after_id: str, group_id: str, group_xml: str) -> str:
    if f'id="{group_id}"' in svg:
        return replace_group_by_id(svg, group_id, group_xml)
    m = re.search(rf'<[^>]*\bid="{re.escape(after_id)}"[^>]*/?>', svg)
    if not m:
        return svg.replace("</svg>", group_xml + "\n</svg>", 1)
    start = m.start()
    if m.group(0).endswith("/>"):
        insert_at = m.end()
    else:
        depth = 0
        insert_at = m.end()
        for mm in re.finditer(r"<g\b[^>]*/>|</?g\b[^>]*>", svg[start:]):
            tok = mm.group(0)
            if tok.startswith("</"):
                depth -= 1
                if depth == 0:
                    insert_at = start + mm.end()
                    break
            elif tok.endswith("/>"):
                continue
            else:
                depth += 1
    return svg[:insert_at] + "\n" + group_xml + svg[insert_at:]


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

    roof_block = None
    rm = re.search(r'<g\b[^>]*\bid="layer-roof"[^>]*>', svg)
    if rm:
        start = svg.rfind("<g", 0, rm.end())
        depth = 0
        for mm in re.finditer(r"<g\b[^>]*/>|</?g\b[^>]*>", svg[start:]):
            tok = mm.group(0)
            if tok.startswith("</"):
                depth -= 1
                if depth == 0:
                    roof_block = svg[start : start + mm.end()]
                    break
            elif tok.endswith("/>"):
                continue
            else:
                depth += 1
    if not roof_block:
        raise SystemExit("layer-roof missing in base layout")
    roof_block = strip_gables(roof_block)

    new_plan = "\n".join(
        [
            f'<g id="p-plan-31" transform="{preserved}">',
            walls,
            roof_block,
            "  </g>",
        ]
    )
    svg = replace_group_by_id(svg, "p-plan-31", new_plan)
    svg = upsert_blind_area(svg)
    svg = upsert_group_after(svg, "house-eave", "open-air-31b", open_labels())

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
            "Масштаб 1:100. Вальмовая крыша без навеса. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м ({fmt2(PORCH_A)} м²)."
        ),
        "text1419": (
            "Север: въезд по линии западной стены. "
            f"Крыльцо {fmt2(PORCH_W)}×{fmt2(PORCH_D)} м. "
            "Пунктир — обводка крыльца."
        ),
    }
    for tid, text in replacements.items():
        svg = re.sub(
            rf'(id="{tid}"[^>]*>)[^<]*',
            rf"\g<1>{escape(text)}",
            svg,
            count=1,
        )

    svg = re.sub(
        r'<text id="canopy-label"[^>]*>[^<]*</text>\s*',
        "",
        svg,
        count=1,
    )

    OUT.write_text(svg)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"porch {fmt2(PORCH_W)}×{fmt2(PORCH_D)} = {fmt2(PORCH_A)} m²; no canopy")


if __name__ == "__main__":
    main()
