#!/usr/bin/env python3
"""Слой помещений для agency/var3.1.svg в стиле plan-1-etazh-variant-d4.svg.

- подпись: имя, площадь, W×H (без пунктирных обводок)
- сводка: жилая / общая / габарит дома
Площади — с плана агентства (Вар 3.1); W×H — по размерным цепочкам PDF.
Дом повёрнут на 180°; текст подписей остаётся читаемым.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "var3.1.svg"
JSON = ROOT / "svg" / "agency-var3.1-recognition.json"

# Embedded PNG placement in page SVG units
IMG_X, IMG_Y = -309.8757, -42.984196
IMG_W, IMG_H = 212.76071, 191.08176
PX_W, PX_H = 1109, 996

# PDF right-plan crop → image pixels (furniture plan)
PDF_X0, PDF_Y0 = 870.0, 275.0
PDF_X1, PDF_Y1 = 1460.0, 755.0

# Метры на пиксель подложки: крыло гостиной 11,94 м ≈ 620 px
M_PER_PX = 11.94 / 620.0

# Габарит отапливаемого контура (м), по размерным цепочкам Вар 3.1
HOUSE_EW = 17.34  # длинная сторона (западный блок + гостиная)
HOUSE_NS = 12.50  # глубина L

# Дом вверх ногами; подписи остаются читаемыми (без поворота текста)
FLIP_180 = True
CX = IMG_X + IMG_W / 2
CY = IMG_Y + IMG_H / 2
# Подписи после flip чуть уезжали вправо — сдвиг влево (ед. SVG)
LABEL_DX = -6.5
LABEL_DY = 0.0
# Подложка с мебелью полупрозрачная; белый фон под ней — непрозрачный
IMAGE_OPACITY = 0.45
BG_OPACITY = 1.0


def pdf_to_px(px: float, py: float) -> tuple[float, float]:
    ix = (px - PDF_X0) / (PDF_X1 - PDF_X0) * PX_W
    iy = (py - PDF_Y0) / (PDF_Y1 - PDF_Y0) * PX_H
    return ix, iy


def px_to_svg(ix: float, iy: float) -> tuple[float, float]:
    return IMG_X + ix / PX_W * IMG_W, IMG_Y + iy / PX_H * IMG_H


def flip_xy(x: float, y: float) -> tuple[float, float]:
    """Поворот на 180° вокруг центра подложки (для якорей подписей)."""
    return 2 * CX - x, 2 * CY - y


def fmt2(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")

# name, area, PDF label center, heated, clear width m (depth = area/width)
ROOMS = [
    ("Кабинет", 16.45, 954, 299, True, 5.70),
    ("Спальня-1", 11.02, 938, 366, True, 4.08),
    ("Гардероб-1", 3.17, 898, 429, True, 1.98),
    ("Гардероб-2", 3.17, 959, 440, True, 1.98),
    ("Спальня-2", 11.02, 922, 489, True, 4.08),
    ("Коридор-1", 11.91, 1008, 481, True, 1.50),
    ("Терраса", 36.78, 1136, 409, False, 7.64),
    ("Гардеробная", 8.85, 925, 564, True, 2.86),
    ("Ванная", 5.60, 1076, 526, True, 2.20),
    ("Хоз. пом.", 3.88, 1146, 519, True, 1.70),
    ("Гостиная", 43.55, 1306, 524, True, 7.64),
    ("Коридор-2", 8.42, 1117, 582, True, 1.40),
    ("Мастер-спальня", 18.08, 933, 629, True, 4.28),
    ("С/у мастер", 5.42, 900, 700, True, 2.00),
    ("Гардероб-3", 4.77, 1084, 641, True, 1.50),
    ("Постирочная", 6.52, 1082, 696, True, 2.74),
    ("Тамбур", 8.25, 1159, 704, True, 3.50),
    ("Топочная", 6.93, 1241, 699, True, 3.50),
    ("Кладовая", 4.14, 1261, 644, True, 1.90),
    ("С/у", 2.01, 1209, 644, True, 0.98),
    ("Кухня", 17.20, 1361, 669, True, 4.00),
]

ZHILAYA_NAMES = {
    "Кабинет",
    "Спальня-1",
    "Спальня-2",
    "Мастер-спальня",
    "Гостиная",
}


def build_layer() -> tuple[str, dict]:
    lines: list[str] = []
    lines.append('<g id="layer-rooms" inkscape:label="помещения" inkscape:groupmode="layer">')
    lines.append('<style type="text/css"><![CDATA[')
    lines.append(
        ".rname{font-family:'DejaVu Sans',Arial,sans-serif;font-size:2.35px;"
        "font-weight:700;fill:#1a1a1a;text-anchor:middle}"
    )
    lines.append(
        ".rmeta{font-family:'DejaVu Sans',Arial,sans-serif;font-size:1.5px;"
        "font-weight:400;fill:#333;text-anchor:middle}"
    )
    lines.append(
        ".rsum{font-family:'DejaVu Sans',Arial,sans-serif;font-size:2.5px;"
        "font-weight:700;fill:#1a1a1a;text-anchor:start}"
    )
    lines.append(
        ".rsum2{font-family:'DejaVu Sans',Arial,sans-serif;font-size:1.65px;"
        "fill:#444;text-anchor:start}"
    )
    lines.append("]]></style>")

    meta_rooms = []
    for i, (name, area, pxx, pyy, heated, width) in enumerate(ROOMS):
        # площадь — с плана агентства; H = S/W для подписи габарита
        depth = round(area / width, 2)
        w_show, h_show = width, depth
        if name == "Коридор-1":
            w_show, h_show = depth, width
        ix, iy = pdf_to_px(pxx, pyy)
        scx, scy = px_to_svg(ix, iy)
        lcx, lcy = flip_xy(scx, scy) if FLIP_180 else (scx, scy)
        lcx += LABEL_DX
        lcy += LABEL_DY
        lines.append(f'<g id="roomlabel-v31-{i}" transform="translate({lcx:.3f},{lcy:.3f})">')
        lines.append(f'<text class="rname" y="-1.15">{name}</text>')
        lines.append(
            f'<text class="rmeta" y="1.25">{fmt2(area)} м²'
            f'<tspan dx="0.65">{fmt2(w_show)}×{fmt2(h_show)}</tspan></text>'
        )
        lines.append("</g>")
        meta_rooms.append(
            {
                "name": name,
                "area": area,
                "kind": "heated" if heated else "open",
                "w": round(w_show, 2),
                "h": round(h_show, 2),
            }
        )

    zhilaya = round(sum(r["area"] for r in meta_rooms if r["name"] in ZHILAYA_NAMES), 2)
    obshaya = round(sum(r["area"] for r in meta_rooms if r["kind"] == "heated"), 2)
    terr = next(r["area"] for r in meta_rooms if r["name"] == "Терраса")

    sx = IMG_X + 2
    sy = IMG_Y + IMG_H + 7
    lines.append(f'<g id="room-summary-v31" transform="translate({sx:.3f},{sy:.3f})">')
    lines.append(
        f'<text class="rsum" y="0">Вариант 3.1 · габарит ≈ {fmt2(HOUSE_EW)}×{fmt2(HOUSE_NS)} м</text>'
    )
    lines.append(f'<text class="rsum" y="3.1">Жилая {fmt2(zhilaya)} м²</text>')
    lines.append(f'<text class="rsum" y="6.2">Общая {fmt2(obshaya)} м²</text>')
    lines.append(
        f'<text class="rsum2" y="8.8">Жилые и подсобные, без террасы ({fmt2(terr)} м²)</text>'
    )
    lines.append("</g>")
    lines.append("</g>")

    meta = {
        "source": "var3.1.svg / Вар 3.1.pdf",
        "zhilaya_m2": zhilaya,
        "obshaya_m2": obshaya,
        "terrace_m2": terr,
        "outer_m": [HOUSE_EW, HOUSE_NS],
        "flip_180": FLIP_180,
        "rooms": meta_rooms,
    }
    return "\n".join(lines), meta


def ensure_underlay_opacity(svg: str) -> str:
    """Картинка с мебелью полупрозрачная; белый фон под ней — нет."""
    svg, _ = re.subn(
        r'(id="image1546"[\s\S]*?style="opacity:)[0-9.]+',
        rf"\g<1>{IMAGE_OPACITY}",
        svg,
        count=1,
    )
    svg, _ = re.subn(
        r'(style="opacity:)[0-9.]+(;fill:#ffffff;stroke:none;stroke-width:0\.486)',
        rf"\g<1>{BG_OPACITY}\2",
        svg,
        count=1,
    )
    return svg


def ensure_plan_flipped(svg: str) -> str:
    """Поворот подложки: transform на layer1 (без лишней вложенности)."""
    # снять старую обёртку plan-flip, если осталась от прошлой версии
    while 'id="plan-flip"' in svg:
        m = re.search(r'<g\b[^>]*\bid="plan-flip"[^>]*>\s*', svg)
        if not m:
            break
        start, after = m.start(), m.end()
        depth = 1
        i = after
        while i < len(svg) and depth:
            if svg.startswith("</g>", i):
                depth -= 1
                if depth == 0:
                    svg = svg[:start] + svg[after:i] + svg[i + 4 :]
                    break
                i += 4
            elif svg.startswith("<g", i) and (i + 2 >= len(svg) or svg[i + 2] in " \n\r\t>"):
                depth += 1
                i += 2
            else:
                i += 1
        else:
            break

    m = re.search(r'<g\b([^>]*\bid="layer1"[^>]*)>', svg)
    if not m:
        raise SystemExit("layer1 not found")
    attrs = m.group(1)
    # убрать прежний transform у layer1
    attrs2 = re.sub(r'\s*transform="[^"]*"', "", attrs)
    if FLIP_180:
        attrs2 = attrs2.rstrip() + f' transform="rotate(180,{CX:.4f},{CY:.4f})"'
    return svg[: m.start()] + f"<g{attrs2}>" + svg[m.end() :]


def remove_group_by_id(svg: str, gid: str) -> str:
    """Удалить <g id=gid>...</g> с учётом вложенности."""
    m = re.search(rf'<g\b[^>]*\bid="{re.escape(gid)}"[^>]*>', svg)
    if not m:
        # multiline attrs: id may be on a later line inside the tag
        m = re.search(
            rf'<g\b(?:[^>]|\n)*?\bid="{re.escape(gid)}"(?:[^>]|\n)*?>',
            svg,
        )
    if not m:
        return svg
    start, after = m.start(), m.end()
    depth = 1
    i = after
    while i < len(svg) and depth:
        if svg.startswith("</g>", i):
            depth -= 1
            if depth == 0:
                return svg[:start] + svg[i + 4 :]
            i += 4
        elif svg.startswith("<g", i) and (i + 2 >= len(svg) or svg[i + 2] in " \n\r\t>"):
            depth += 1
            i += 2
        else:
            i += 1
    raise SystemExit(f"unbalanced group {gid}")


def inject(svg: str, layer: str) -> str:
    svg = remove_group_by_id(svg, "layer-rooms")
    svg = ensure_plan_flipped(svg)
    svg = ensure_underlay_opacity(svg)
    if "xmlns:inkscape=" not in svg:
        svg = svg.replace(
            "<svg",
            '<svg\n   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
            1,
        )
    if "</svg>" not in svg:
        raise SystemExit("missing </svg>")
    return svg.replace("</svg>", "\n" + layer + "\n</svg>")


def main() -> None:
    layer, meta = build_layer()
    text = SVG.read_text(encoding="utf-8")
    SVG.write_text(inject(text, layer), encoding="utf-8")
    JSON.parent.mkdir(parents=True, exist_ok=True)
    JSON.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {SVG.relative_to(ROOT.parent)}")
    print(f"wrote {JSON.relative_to(ROOT.parent)}")
    print(
        f"Жилая {meta['zhilaya_m2']} м² · Общая {meta['obshaya_m2']} м² · "
        f"терраса {meta['terrace_m2']} м² · flip={FLIP_180}"
    )


if __name__ == "__main__":
    main()
