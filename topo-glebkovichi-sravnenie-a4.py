#!/usr/bin/env python3
"""Альбомный лист А4: сравнение топосъёмки для д. Глебковичи."""

import html
from pathlib import Path

from PIL import ImageFont

OUT_SVG = Path(__file__).with_suffix(".svg")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONTB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

W, H = 297.0, 210.0
MARGIN = 8.0
BODY = 8.05  # pt
HEAD = 8.0
TITLE = 13.0
LINE = 3.15  # mm


def text_width(text, size_pt, bold=False):
    px = max(size_pt * 96 / 72, 1)
    font = ImageFont.truetype(FONTB if bold else FONT, px)
    return font.getlength(text) / 96 * 25.4


def wrap(text, size_pt, max_mm, bold=False):
    words = text.split()
    if not words:
        return [""]
    lines, cur = [], ""
    for word in words:
        trial = word if not cur else cur + " " + word
        if text_width(trial, size_pt, bold) <= max_mm:
            cur = trial
            continue
        if cur:
            lines.append(cur)
            cur = ""
        if text_width(word, size_pt, bold) <= max_mm:
            cur = word
            continue
        buf = ""
        for ch in word:
            trial = buf + ch
            if text_width(trial, size_pt, bold) <= max_mm:
                buf = trial
            else:
                if buf:
                    lines.append(buf)
                buf = ch
        cur = buf
    if cur:
        lines.append(cur)
    return lines


COLUMNS = [
    ("Исполнитель", 34),
    ("Цена для района, руб.", 34),
    ("Телефоны", 38),
    ("Сайт", 48),
    ("Лицензия / аттестат", 46),
    ("Карта по стандарту", 40),
    ("Рейтинг по отзывам", 41),
]

ROWS = [
    [
        "1. ООО «ТопДиАл», УНП 193737750, ул. Петруся Бровки, 30",
        "Район, участок и улица: от 210. Город Минск: от 270.",
        "+375 29 119-59-74",
        "https://topdial.by/services/topograficheskaya-semka/",
        "0000852-ИЗ, изыскания, 1–4 класс, до 15.07.2029. 0017352-СТ, геодезия в строительстве, до 15.07.2029.",
        "Съёмка под сети. Регистрацию в архитектуре района в прайсе не расписали, спросить в договоре.",
        "Независимого рейтинга нет. 5 благодарностей на своём сайте, без оценок.",
    ],
    [
        "2. ИП Трошко С.В., УНП 191812769",
        "Участок до 25 соток: 270–370. Вынос границ: от 140.",
        "+375 29 333-46-30",
        "https://bygeo.by/ceny/",
        "Квалификационный аттестат заявлен на сайте. Номер в открытом реестре не найден.",
        "В каталоге масштабы 1:500 и 1:1000. Регистрацию в геослужбе подтвердить в смете.",
        "orgpage.by: 0 отзывов.",
    ],
    [
        "3. ООО «ЗемУстрой», УНП 693324670, Ждановичи, 76к5; юр. адрес Слуцк",
        "Топосъёмка: от 300. Границы: от 150.",
        "+375 29 550-62-62, +375 44 550-62-62",
        "https://zemustroy.by/",
        "С 14.03.2025, ОКЭД 71123. Номер аттестата на сайте не опубликован.",
        "Рельеф и коммуникации, согласование с эксплуатирующими организациями. Масштаб 1:500 и регистрацию спросить отдельно.",
        "Независимых отзывов нет.",
    ],
    [
        "4. ООО «ТехГазМонтаж», УНП 790610712, Кульман, 21Б, оф. 55",
        "Вне Минска, в том числе Глебковичи: 280. Город Минск: 400.",
        "+375 29 307-65-15, +375 17 360-48-68, +375 29 602-50-30. Бобруйск: +375 29 382-02-77",
        "https://gaztgm.by/geodezija",
        "0018592-СТ до 30.01.2030: геодезия в строительстве. Аттестата изысканий ИЗ в реестре нет.",
        "На сайте план 1:500 и техотчёт. Для архитектуры района аттестат слабее, чем ИЗ.",
        "Отзывы про газ и отопление, не про съёмку. firmi.by 5,0 / 4. remkarta 4,27 / 26. Карточка места 4,5 / 8; жалоба: цена +40%.",
    ],
    [
        "5. ИП Кудряков М.С., УНП 192694800, Сурганова, 48А, каб. 2",
        "Сейчас: по заявке. Раньше на сайте: от 300.",
        "+375 29 886-29-61",
        "https://geodez.by/",
        "ИЗ №242560, изыскания, до 12.12.2030. СТ №242559, ведущий геодезист, до 12.12.2030. Это аттестаты специалиста, не организации.",
        "План с рельефом и коммуникациями. Регистрацию в архитектуре в услуге не назвали.",
        "Независимых отзывов нет.",
    ],
    [
        "6. ООО «ГеоПланета», УНП 190853089, Мележа, 5, корп. 1, оф. 217",
        "Цены на сайте нет. Смета по заявке.",
        "+375 17 272-31-89, +375 29 767-43-88",
        "https://geoplaneta.by/",
        "0000816-ИЗ, II категория, до 11.03.2029. 0016773-СТ, II категория, до 11.03.2029. Реестр 2025: соответствует.",
        "Условные знаки по законодательству. Подземные коммуникации, установление границ.",
        "firmi.by: 5,0 / 9 отзывов, 2019–2025. Один отзыв автор назвал случайным. 2pos.by: 4,7 / 28.",
    ],
    [
        "7. ООО «ГЕОЭКСПЕРТ», УНП 192493326, Радиальная, 54Б, ком. 19",
        "Цены на сайте нет. Смету обещают за 2 часа.",
        "+375 44 553-31-88, +375 29 553-30-81",
        "https://geoekspert.by/",
        "0000726-ИЗ, изыскания. 0014860-СТ, геодезия в строительстве. Сайт: II категория, до 20.05.2027.",
        "Регистрация в отделах архитектуры. Согласование в Минскинжпроекте.",
        "По этому УНП отзывов нет. Не путать с УНП 691401002, Молодечно: там 5,0 по 1 отзыву 2013 г.",
    ],
]


def esc(text):
    return html.escape(text, quote=True)


def main():
    inner = W - 2 * MARGIN
    widths = [c[1] for c in COLUMNS]
    assert abs(sum(widths) - inner) < 0.2, sum(widths)
    pad_x = 1.1
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="297mm" height="210mm" viewBox="0 0 {W} {H}">',
        '<rect width="297" height="210" fill="#ffffff"/>',
        f'<text x="{MARGIN}" y="13.2" font-family="DejaVu Sans, sans-serif" font-size="4.4" font-weight="700" fill="#111">Топосъёмка, д. Глебковичи, ул. Абрикосовая, 22</text>',
        f'<text x="{MARGIN}" y="17.6" font-family="DejaVu Sans, sans-serif" font-size="2.55" fill="#333">Кадастр 623683401601000218 · 0,1545 га · Минский район. Цены — опубликованные минимумы, руб., срез 20.10.2026. Не смета на этот адрес.</text>',
    ]
    y = 20.2
    # header
    header_lines = []
    max_h = 1
    for title, width in COLUMNS:
        lines = wrap(title, HEAD, width - 2 * pad_x, bold=True)
        header_lines.append(lines)
        max_h = max(max_h, len(lines))
    header_h = 2.2 + max_h * 3.05
    x = MARGIN
    parts.append(f'<rect x="{MARGIN}" y="{y}" width="{inner}" height="{header_h}" fill="#f2f2f2" stroke="#111" stroke-width="0.25"/>')
    for lines, width in zip(header_lines, widths):
        ty = y + 2.7
        for line in lines:
            parts.append(
                f'<text x="{x + pad_x}" y="{ty:.2f}" font-family="DejaVu Sans, sans-serif" font-size="2.7" font-weight="700" fill="#111">{esc(line)}</text>'
            )
            ty += 3.05
        x += width
        if x < MARGIN + inner - 0.1:
            parts.append(f'<line x1="{x:.2f}" y1="{y}" x2="{x:.2f}" y2="{y + header_h}" stroke="#111" stroke-width="0.2"/>')
    y += header_h

    for row in ROWS:
        wrapped = []
        n = 1
        for cell, width in zip(row, widths):
            lines = wrap(cell, BODY, width - 2 * pad_x, bold=False)
            wrapped.append(lines)
            n = max(n, len(lines))
        row_h = 2.2 + n * LINE
        parts.append(f'<rect x="{MARGIN}" y="{y:.2f}" width="{inner}" height="{row_h:.2f}" fill="#ffffff" stroke="#111" stroke-width="0.2"/>')
        x = MARGIN
        for col_i, (lines, width) in enumerate(zip(wrapped, widths)):
            ty = y + 2.85
            href = row[3] if col_i == 3 else None
            if href:
                parts.append(f'<a xlink:href="{esc(href)}">')
            for line in lines:
                parts.append(
                    f'<text x="{x + pad_x:.2f}" y="{ty:.2f}" font-family="DejaVu Sans, sans-serif" font-size="2.75" fill="#111">{esc(line)}</text>'
                )
                ty += LINE
            if href:
                parts.append("</a>")
            x += width
            if x < MARGIN + inner - 0.1:
                parts.append(
                    f'<line x1="{x:.2f}" y1="{y:.2f}" x2="{x:.2f}" y2="{y + row_h:.2f}" stroke="#bbb" stroke-width="0.15"/>'
                )
        y += row_h

    note = (
        "Вне таблицы: Гео Маяк, geom.by, +375 29 779-96-01, +375 29 637-07-84, границы от 150, разрешение № 03150/0580533. "
        "ИП Пилецкий, geohelp.by, +375 29 584-10-54, землеустроительное дело от 550, это не топосъёмка. "
        "Источники: сайты исполнителей, att.bsc.by, firmi.by, 2pos.by, orgpage.by, remkarta."
    )
    note_y = y + 4.2
    for line in wrap(note, 7.4, inner):
        parts.append(
            f'<text x="{MARGIN}" y="{note_y:.2f}" font-family="DejaVu Sans, sans-serif" font-size="2.5" fill="#333">{esc(line)}</text>'
        )
        note_y += 3.2
    if note_y > H - 3:
        raise SystemExit(f"Не влезло на лист: низ текста {note_y:.1f} мм")
    parts.append("</svg>")
    OUT_SVG.write_text("\n".join(parts), encoding="utf-8")
    print(f"svg {OUT_SVG} bottom {note_y:.1f} mm")


if __name__ == "__main__":
    main()
