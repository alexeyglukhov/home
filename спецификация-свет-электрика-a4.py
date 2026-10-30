#!/usr/bin/env python3
"""Сводные таблицы света и электрики по листам 12–14 чертежи.pdf → A4 PDF."""

from __future__ import annotations

import html
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_SVG = ROOT / "спецификация-свет-электрика-a4.svg"
OUT_PDF = ROOT / "спецификация-свет-электрика-a4.pdf"

# Портретный А4; font-size в SVG — мм (user units = mm)
W, H = 210.0, 297.0
MARGIN = 9.0
PAD_X = 1.8
LINE = 10.2
FS_TITLE = 5.4
FS_SECTION = 4.1
FS_HEAD = 3.3
FS_BODY = 3.6
FS_NOTE = 2.7
ICON = 7.6  # размер картинки светильника / УГО, мм


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def ico(cx: float, cy: float, kind: str) -> str:
    """Светильники — силуэты «как в магазине»; розетки/выключатели — УГО."""
    s = ICON
    h = s / 2
    stroke = 0.2

    # --- светильники (вид товара) ---
    if kind == "lamp-recess":
        # встраиваемый спот: ободок + светящийся центр
        return (
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.92:.2f}" '
            f'fill="#d8dde3" stroke="#444" stroke-width="{stroke}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.72:.2f}" '
            f'fill="#f4f6f8" stroke="#666" stroke-width="{stroke * 0.8}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.42:.2f}" '
            f'fill="#fff4c2" stroke="#c9a84a" stroke-width="{stroke * 0.7}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.16:.2f}" fill="#ffe989"/>'
        )
    if kind == "lamp-recess-ip":
        # то же + уплотнение (влагозащита)
        return (
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.95:.2f}" '
            f'fill="#3a3a3a" stroke="#222" stroke-width="{stroke}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.78:.2f}" '
            f'fill="#cfd4da" stroke="#555" stroke-width="{stroke * 0.8}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.45:.2f}" '
            f'fill="#fff4c2" stroke="#c9a84a" stroke-width="{stroke * 0.7}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{h * 0.16:.2f}" fill="#ffe989"/>'
        )
    if kind == "lamp-surface":
        # накладной: вид сбоку — потолок + цилиндр
        top = cy - h * 0.55
        return (
            f'<line x1="{cx - h * 0.95:.2f}" y1="{top:.2f}" '
            f'x2="{cx + h * 0.95:.2f}" y2="{top:.2f}" '
            f'stroke="#888" stroke-width="{stroke * 1.2}"/>'
            f'<rect x="{cx - h * 0.55:.2f}" y="{top:.2f}" width="{s * 0.55:.2f}" '
            f'height="{s * 0.55:.2f}" rx="0.25" fill="#e8eaed" stroke="#444" '
            f'stroke-width="{stroke}"/>'
            f'<ellipse cx="{cx:.2f}" cy="{top + s * 0.55:.2f}" rx="{h * 0.55:.2f}" '
            f'ry="{h * 0.18:.2f}" fill="#fff4c2" stroke="#c9a84a" stroke-width="{stroke * 0.7}"/>'
        )
    if kind == "lamp-surface-2":
        # другой накладной: плоский диск
        top = cy - h * 0.35
        return (
            f'<line x1="{cx - h * 0.95:.2f}" y1="{top:.2f}" '
            f'x2="{cx + h * 0.95:.2f}" y2="{top:.2f}" '
            f'stroke="#888" stroke-width="{stroke * 1.2}"/>'
            f'<ellipse cx="{cx:.2f}" cy="{top + h * 0.12:.2f}" rx="{h * 0.85:.2f}" '
            f'ry="{h * 0.28:.2f}" fill="#e8eaed" stroke="#444" stroke-width="{stroke}"/>'
            f'<ellipse cx="{cx:.2f}" cy="{top + h * 0.22:.2f}" rx="{h * 0.55:.2f}" '
            f'ry="{h * 0.16:.2f}" fill="#fff4c2" stroke="#c9a84a" stroke-width="{stroke * 0.7}"/>'
        )
    if kind == "lamp-bra":
        # бра: стена + плафон
        wx = cx - h * 0.55
        return (
            f'<line x1="{wx:.2f}" y1="{cy - h * 0.9:.2f}" x2="{wx:.2f}" y2="{cy + h * 0.9:.2f}" '
            f'stroke="#888" stroke-width="{stroke * 1.3}"/>'
            f'<rect x="{wx:.2f}" y="{cy - h * 0.22:.2f}" width="{h * 0.28:.2f}" '
            f'height="{h * 0.44:.2f}" fill="#bbb" stroke="#444" stroke-width="{stroke * 0.8}"/>'
            f'<line x1="{wx + h * 0.28:.2f}" y1="{cy:.2f}" x2="{cx + h * 0.05:.2f}" y2="{cy:.2f}" '
            f'stroke="#666" stroke-width="{stroke * 1.1}"/>'
            f'<path d="M {cx - h * 0.05:.2f} {cy - h * 0.55:.2f} '
            f'Q {cx + h * 0.85:.2f} {cy:.2f} {cx - h * 0.05:.2f} {cy + h * 0.55:.2f} Z" '
            f'fill="#fff4c2" stroke="#c9a84a" stroke-width="{stroke}"/>'
        )
    if kind == "lamp-pend":
        # подвес: потолок + шнур + плафон
        top = cy - h * 0.95
        return (
            f'<line x1="{cx - h * 0.7:.2f}" y1="{top:.2f}" x2="{cx + h * 0.7:.2f}" y2="{top:.2f}" '
            f'stroke="#888" stroke-width="{stroke * 1.2}"/>'
            f'<rect x="{cx - h * 0.18:.2f}" y="{top:.2f}" width="{h * 0.36:.2f}" height="{h * 0.2:.2f}" '
            f'fill="#bbb" stroke="#444" stroke-width="{stroke * 0.7}"/>'
            f'<line x1="{cx:.2f}" y1="{top + h * 0.2:.2f}" x2="{cx:.2f}" y2="{cy + h * 0.05:.2f}" '
            f'stroke="#555" stroke-width="{stroke}"/>'
            f'<path d="M {cx - h * 0.7:.2f} {cy + h * 0.05:.2f} '
            f'L {cx + h * 0.7:.2f} {cy + h * 0.05:.2f} '
            f'L {cx + h * 0.45:.2f} {cy + h * 0.85:.2f} '
            f'L {cx - h * 0.45:.2f} {cy + h * 0.85:.2f} Z" '
            f'fill="#fff4c2" stroke="#c9a84a" stroke-width="{stroke}"/>'
        )

    # --- электрика (УГО) ---
    eu = ICON * 0.72
    eh = eu / 2
    if kind == "sw-1":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#fff" stroke="#2a8f4a" stroke-width="{stroke * 1.3}"/>'
        )
    if kind == "sw-2":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#fff" stroke="#2a8f4a" stroke-width="{stroke * 1.3}"/>'
            f'<line x1="{cx:.2f}" y1="{cy - eh * 0.75:.2f}" x2="{cx:.2f}" y2="{cy + eh * 0.75:.2f}" '
            f'stroke="#2a8f4a" stroke-width="{stroke}"/>'
        )
    if kind == "sw-pass-1":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#fff" stroke="#2a8f4a" stroke-width="{stroke * 1.3}"/>'
            f'<line x1="{cx - eh * 0.55:.2f}" y1="{cy - eh * 0.55:.2f}" '
            f'x2="{cx + eh * 0.55:.2f}" y2="{cy + eh * 0.55:.2f}" '
            f'stroke="#2a8f4a" stroke-width="{stroke}"/>'
        )
    if kind == "sw-pass-2":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#fff" stroke="#2a8f4a" stroke-width="{stroke * 1.3}"/>'
            f'<line x1="{cx - eh * 0.2:.2f}" y1="{cy - eh * 0.55:.2f}" '
            f'x2="{cx + eh * 0.55:.2f}" y2="{cy + eh * 0.55:.2f}" '
            f'stroke="#2a8f4a" stroke-width="{stroke}"/>'
            f'<line x1="{cx - eh * 0.55:.2f}" y1="{cy - eh * 0.55:.2f}" '
            f'x2="{cx + eh * 0.2:.2f}" y2="{cy + eh * 0.55:.2f}" '
            f'stroke="#2a8f4a" stroke-width="{stroke}"/>'
        )
    if kind == "sw-cross":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#fff" stroke="#2a8f4a" stroke-width="{stroke * 1.3}"/>'
            f'<line x1="{cx - eh * 0.5:.2f}" y1="{cy - eh * 0.5:.2f}" '
            f'x2="{cx + eh * 0.5:.2f}" y2="{cy + eh * 0.5:.2f}" '
            f'stroke="#2a8f4a" stroke-width="{stroke}"/>'
            f'<line x1="{cx + eh * 0.5:.2f}" y1="{cy - eh * 0.5:.2f}" '
            f'x2="{cx - eh * 0.5:.2f}" y2="{cy + eh * 0.5:.2f}" '
            f'stroke="#2a8f4a" stroke-width="{stroke}"/>'
        )
    if kind == "sock-220":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#f2d6d6" stroke="#b33" stroke-width="{stroke}"/>'
            f'<circle cx="{cx - eh * 0.22:.2f}" cy="{cy:.2f}" r="{eh * 0.14:.2f}" fill="#b33"/>'
            f'<circle cx="{cx + eh * 0.22:.2f}" cy="{cy:.2f}" r="{eh * 0.14:.2f}" fill="#b33"/>'
        )
    if kind == "sock-ip44":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#f2d6d6" stroke="#b33" stroke-width="{stroke}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{eh * 0.42:.2f}" fill="none" stroke="#b33" '
            f'stroke-width="{stroke}"/>'
            f'<circle cx="{cx - eh * 0.18:.2f}" cy="{cy:.2f}" r="{eh * 0.1:.2f}" fill="#b33"/>'
            f'<circle cx="{cx + eh * 0.18:.2f}" cy="{cy:.2f}" r="{eh * 0.1:.2f}" fill="#b33"/>'
        )
    if kind == "sock-rj45":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#d6e4f8" stroke="#36c" stroke-width="{stroke}"/>'
            f'<path d="M {cx - eh * 0.45:.2f} {cy - eh * 0.25:.2f} L {cx - eh * 0.1:.2f} {cy:.2f} '
            f'L {cx - eh * 0.45:.2f} {cy + eh * 0.25:.2f} Z" fill="#36c"/>'
            f'<path d="M {cx + eh * 0.45:.2f} {cy - eh * 0.25:.2f} L {cx + eh * 0.1:.2f} {cy:.2f} '
            f'L {cx + eh * 0.45:.2f} {cy + eh * 0.25:.2f} Z" fill="#36c"/>'
        )
    if kind == "sock-380":
        return (
            f'<rect x="{cx - eh * 0.75:.2f}" y="{cy - eh * 0.75:.2f}" width="{eu * 0.75:.2f}" '
            f'height="{eu * 0.75:.2f}" fill="#f2d6d6" stroke="#b33" stroke-width="{stroke}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{eh * 0.42:.2f}" fill="none" stroke="#b33" '
            f'stroke-width="{stroke}"/>'
            f'<circle cx="{cx:.2f}" cy="{cy - eh * 0.18:.2f}" r="{eh * 0.08:.2f}" fill="#b33"/>'
            f'<circle cx="{cx - eh * 0.16:.2f}" cy="{cy + eh * 0.12:.2f}" r="{eh * 0.08:.2f}" fill="#b33"/>'
            f'<circle cx="{cx + eh * 0.16:.2f}" cy="{cy + eh * 0.12:.2f}" r="{eh * 0.08:.2f}" fill="#b33"/>'
        )
    if kind.startswith("frame-"):
        n = int(kind.split("-")[1])
        cell = eu * 0.42
        gap = 0.25
        total = n * cell + (n - 1) * gap
        x0 = cx - total / 2
        y0 = cy - cell / 2
        parts = []
        for i in range(n):
            parts.append(
                f'<rect x="{x0 + i * (cell + gap):.2f}" y="{y0:.2f}" width="{cell:.2f}" '
                f'height="{cell:.2f}" fill="none" stroke="#b33" stroke-width="{stroke}"/>'
            )
        return "".join(parts)
    return ""


LIGHTS: list[tuple[str, str, str, int]] = [
    ("СВ-1", "lamp-recess", "Встраиваемый светильник", 17),
    ("СВ-2", "lamp-recess-ip", "Встраиваемый светильник влагозащищенный", 9),
    ("СВ-3", "lamp-surface", "Накладной светильник", 6),
    ("СВ-4", "lamp-surface-2", "Накладной светильник", 3),
    ("СВ-5", "lamp-bra", "Бра", 4),
    ("СВ-6", "lamp-pend", "Подвес", 1),
]

ELECTRICAL: list[tuple[str, str, str, int]] = [
    ("Выключатели", "sw-1", "Выключатель одноклавишный", 6),
    ("Выключатели", "sw-2", "Выключатель двухклавишный", 8),
    ("Выключатели", "sw-pass-1", "Переключатель одноклавишный", 1),
    ("Выключатели", "sw-pass-2", "Переключатель двухклавишный", 3),
    ("Выключатели", "sw-cross", "Перекрестный переключатель двухклавишный", 1),
    ("Розетки", "sock-220", "Розетка 220V", 38),
    ("Розетки", "sock-ip44", "Розетка 220V IP44 влагозащищенная", 20),
    ("Розетки", "sock-rj45", "Интернет розетка RJ45 2×", 4),
    ("Розетки", "sock-380", "Розетка скрытая 3P+E+N 16A 380V IP44", 1),
    ("Рамки", "frame-1", "Рамка на 1 пост", 14),
    ("Рамки", "frame-2", "Рамка на 2 поста", 12),
    ("Рамки", "frame-3", "Рамка на 3 поста", 10),
    ("Рамки", "frame-4", "Рамка на 4 поста", 4),
]

LIGHT_NOTES = [
    "Картинки светильников — упрощённый вид «как в магазине» (не бренд). На планах также",
    "без количества: подсветка раб. поверхности / потолка / зеркал, треки, ниша скрытой подсветки.",
]

ELEC_NOTES = [
    "Высота розеток 300 мм, выключателей 900 мм от чистого пола (если не указано иное).",
    "Окончательные выводы для кухонной техники — после заказа кухни. Кол-во без запаса.",
]


def draw_table(
    parts: list[str],
    y: float,
    title: str,
    headers: tuple[str, ...],
    rows: list[tuple],
    col_w: tuple[float, ...],
    icon_col: int,
) -> float:
    inner = sum(col_w)
    x0 = MARGIN

    parts.append(
        f'<text x="{x0:.2f}" y="{y:.2f}" '
        f'font-family="DejaVu Sans Bold, DejaVu Sans, sans-serif" '
        f'font-size="{FS_SECTION}" fill="#111">{esc(title)}</text>'
    )
    y += 5.0

    head_h = 5.0
    parts.append(
        f'<rect x="{x0:.2f}" y="{y:.2f}" width="{inner:.2f}" height="{head_h:.2f}" '
        f'fill="none" stroke="#111" stroke-width="0.22"/>'
    )
    x = x0
    for i, (h, w) in enumerate(zip(headers, col_w)):
        anchor = "end" if i == len(headers) - 1 else "start"
        tx = x + w - PAD_X if anchor == "end" else x + PAD_X
        parts.append(
            f'<text x="{tx:.2f}" y="{y + 3.4:.2f}" text-anchor="{anchor}" '
            f'font-family="DejaVu Sans Bold, DejaVu Sans, sans-serif" '
            f'font-size="{FS_HEAD}" fill="#111">{esc(h)}</text>'
        )
        if i < len(headers) - 1:
            parts.append(
                f'<line x1="{x + w:.2f}" y1="{y:.2f}" x2="{x + w:.2f}" '
                f'y2="{y + head_h:.2f}" stroke="#111" stroke-width="0.15"/>'
            )
        x += w
    y += head_h

    for ri, row in enumerate(rows):
        row_h = LINE
        parts.append(
            f'<rect x="{x0:.2f}" y="{y:.2f}" width="{inner:.2f}" height="{row_h:.2f}" '
            f'fill="none" stroke="#111" stroke-width="0.15"/>'
        )
        x = x0
        for i, w in enumerate(col_w):
            if i == icon_col:
                parts.append(ico(x + w / 2, y + row_h / 2, row[i]))
            else:
                val = str(row[i])
                anchor = "end" if i == len(col_w) - 1 else "start"
                tx = x + w - PAD_X if anchor == "end" else x + PAD_X
                parts.append(
                    f'<text x="{tx:.2f}" y="{y + row_h * 0.62:.2f}" text-anchor="{anchor}" '
                    f'font-family="DejaVu Sans, sans-serif" font-size="{FS_BODY}" '
                    f'fill="#111">{esc(val)}</text>'
                )
            if i < len(col_w) - 1:
                parts.append(
                    f'<line x1="{x + w:.2f}" y1="{y:.2f}" x2="{x + w:.2f}" '
                    f'y2="{y + row_h:.2f}" stroke="#bbb" stroke-width="0.1"/>'
                )
            x += w
        y += row_h

    return y


def main() -> None:
    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" '
        f'viewBox="0 0 {W} {H}">',
        '<rect width="100%" height="100%" fill="#fff"/>',
    ]

    y = MARGIN + 4
    parts.append(
        f'<text x="{MARGIN:.2f}" y="{y:.2f}" '
        f'font-family="DejaVu Sans Bold, DejaVu Sans, sans-serif" '
        f'font-size="{FS_TITLE}" fill="#111">'
        f"Сводная спецификация: свет и электрика</text>"
    )
    y += 4.5
    parts.append(
        f'<text x="{MARGIN:.2f}" y="{y:.2f}" font-family="DejaVu Sans, sans-serif" '
        f'font-size="{FS_NOTE}" fill="#444">'
        f"Источник: чертежи.pdf, листы 12–14. Кол-во без запаса.</text>"
    )
    y += 6.5

    light_rows = [(t, icon, name, q) for t, icon, name, q in LIGHTS]
    y = draw_table(
        parts,
        y,
        "1. Светильники и свет",
        ("Тип", "Вид", "Наименование", "Кол-во, шт"),
        light_rows,
        (18.0, 16.0, 138.0, 20.0),
        icon_col=1,
    )
    y += 3.0
    for line in LIGHT_NOTES:
        parts.append(
            f'<text x="{MARGIN:.2f}" y="{y:.2f}" font-family="DejaVu Sans, sans-serif" '
            f'font-size="{FS_NOTE}" fill="#333">{esc(line)}</text>'
        )
        y += 3.3

    y += 5.5

    elec_rows = [(g, icon, name, q) for g, icon, name, q in ELECTRICAL]
    y = draw_table(
        parts,
        y,
        "2. Электрика: розетки, выключатели, рамки",
        ("Группа", "УГО", "Наименование", "Кол-во, шт"),
        elec_rows,
        (28.0, 14.0, 130.0, 20.0),
        icon_col=1,
    )
    y += 3.0
    for line in ELEC_NOTES:
        parts.append(
            f'<text x="{MARGIN:.2f}" y="{y:.2f}" font-family="DejaVu Sans, sans-serif" '
            f'font-size="{FS_NOTE}" fill="#333">{esc(line)}</text>'
        )
        y += 3.3

    y += 4.5
    parts.append(
        f'<text x="{MARGIN:.2f}" y="{y:.2f}" font-family="DejaVu Sans, sans-serif" '
        f'font-size="{FS_NOTE}" fill="#555">'
        f"Дизайнер проекта: Табакина Надежда. Лист для закупки / сверки с подрядчиком."
        f"</text>"
    )
    y += 3
    if y > H - MARGIN:
        raise SystemExit(f"Не влезло на лист: низ {y:.1f} мм при высоте {H}")

    parts.append("</svg>")
    OUT_SVG.write_text("\n".join(parts), encoding="utf-8")
    print(f"svg {OUT_SVG} bottom {y:.1f} mm")

    subprocess.run(
        [
            "inkscape",
            "--export-type=pdf",
            f"--export-filename={OUT_PDF}",
            str(OUT_SVG),
        ],
        check=True,
    )
    print(f"pdf {OUT_PDF}")


if __name__ == "__main__":
    main()
