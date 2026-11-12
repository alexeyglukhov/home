#!/usr/bin/env python3
"""Посадка варианта 3.1a на участок Абрикосовая 22.

База: abrikosovaya-22-layout-variant-3.1-1-100.svg (как 3.1).
Без парковочного навеса; въезд с севера по линии западной стены — как у 3.1c.

Выход: abrikosovaya-22-layout-variant-3.1a-1-100.svg
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from xml.sax.saxutils import escape

from build_layout_variant_31 import replace_group_by_id

ROOT = Path(__file__).resolve().parents[2]
SRC_LAYOUT = ROOT / "abrikosovaya-22-layout-variant-3.1-1-100.svg"
OUT = ROOT / "abrikosovaya-22-layout-variant-3.1a-1-100.svg"


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

    replacements = {
        "text1411": "Вариант 3.1a · дом на участке",
        "text1413": (
            "Масштаб 1:100. Как 3.1 без парковочного навеса. "
            "Въезд с севера по линии западной стены (ворота 4 м, калитка справа)."
        ),
        "text1419": (
            "Север: въезд по линии западной стены, как у 3.1c. "
            "Парковочный навес снят — будет переделан. "
            "Слои: furniture-underlay, layer-walls."
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


if __name__ == "__main__":
    main()
