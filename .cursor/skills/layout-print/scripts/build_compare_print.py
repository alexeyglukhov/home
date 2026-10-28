#!/usr/bin/env python3
"""Совмещённый лист А4: контуры домов А и Д4 на одном участке.

Только контуры (без планировок внутри), забор, гараж/баня с варианта А,
основные размеры от забора и углов для обоих домов.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from lxml import etree

from build_floor_print import promote_dim_labels
from build_print import (
    NS,
    PLACE,
    SVG,
    build_dims,
    edge_of,
    geo_of,
    house_corners,
    parse_points,
    proj,
    sheet,
    yard_buildings,
)

ROOT = Path(__file__).resolve().parents[4]  # …/home5
SRC_A = ROOT / "abrikosovaya-22-layout-variant-a-1-100.svg"
SRC_D4 = ROOT / "abrikosovaya-22-layout-variant-d4-1-100.svg"
OUT = ROOT / "abrikosovaya-22-layout-compare-a-d4-print.svg"


def pts_attr(pts: list[tuple[float, float]]) -> str:
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in pts)


def centroid(pts: list[tuple[float, float]]) -> tuple[float, float]:
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def gate_posts_of(root) -> list[tuple[float, float]]:
    posts = []
    for n in (4, 5, 6):
        pel = root.find(f".//svg:polygon[@id='fence-post-{n}']", NS)
        if pel is None:
            return []
        pts = parse_points(pel.get("points"))
        posts.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))
    return posts


def chain_corners(plot, *houses: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Только крайние проекции домов на каждую сторону — без промежуточных углов."""
    center = (sum(p[0] for p in plot) / 4, sum(p[1] for p in plot) / 4)
    a, b, c, d = plot
    edges = [edge_of(a, b, center), edge_of(b, c, center), edge_of(c, d, center), edge_of(a, d, center)]
    out: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for e in edges:
        hits = []
        for house in houses:
            for p in house:
                t, _dist, on = proj(p, e)
                if on:
                    hits.append((t, p))
        if not hits:
            continue
        hits.sort(key=lambda item: item[0])
        for _t, p in (hits[0], hits[-1]):
            key = (round(p[0], 2), round(p[1], 2))
            if key not in seen:
                seen.add(key)
                out.append(p)
    return out


def drawing_xml(plot, house_a, house_d4, yard, apron, front) -> str:
    parts = [
        f'<polygon id="plot" points="{pts_attr(plot)}" fill="#ffffff" stroke="#111111" stroke-width="2.2"/>'
    ]
    if apron:
        parts.append(
            f'<polygon id="drive-apron" points="{pts_attr(apron)}" fill="#e8e8e8" stroke="#111111" stroke-width="0.7"/>'
        )
    if front:
        parts.append(
            f'<polygon id="front-court" points="{pts_attr(front)}" fill="#f4f4f4" stroke="#111111" stroke-width="0.55"/>'
        )
    for bld in yard:
        tag = {"garage": "Гараж", "bath": "Баня", "shed": "Сарай"}.get(bld["name"], bld["name"])
        cx, cy = centroid(bld["corners"])
        parts.append(
            f'<polygon points="{pts_attr(bld["corners"])}" fill="#ffffff" stroke="#111111" stroke-width="1.1"/>'
            f'<text x="{cx:.2f}" y="{cy:.2f}" font-size="9" fill="#111111" stroke="none" '
            f'text-anchor="middle" dominant-baseline="middle" '
            f'font-family="DejaVu Sans, Liberation Sans, sans-serif">{tag}</text>'
        )
    # А — сплошной, Д4 — штрих.
    ca = centroid(house_a)
    cd = centroid(house_d4)
    parts.append(
        f'<g id="house-a" fill="none" stroke="#111111" stroke-width="1.7">'
        f'<polygon points="{pts_attr(house_a)}"/>'
        f'<text x="{ca[0]:.2f}" y="{ca[1]:.2f}" font-size="14" font-weight="700" fill="#111111" '
        f'stroke="none" text-anchor="middle" dominant-baseline="middle" '
        f'font-family="DejaVu Sans, Liberation Sans, sans-serif">А</text></g>'
    )
    parts.append(
        f'<g id="house-d4" fill="none" stroke="#111111" stroke-width="1.55" '
        f'stroke-dasharray="7 4">'
        f'<polygon points="{pts_attr(house_d4)}"/>'
        f'<text x="{cd[0]:.2f}" y="{cd[1]:.2f}" font-size="14" font-weight="700" fill="#111111" '
        f'stroke="none" text-anchor="middle" dominant-baseline="middle" '
        f'font-family="DejaVu Sans, Liberation Sans, sans-serif">Д4</text></g>'
    )
    # Легенда у угла A участка — координаты листа потом сдвинут; ставим в мировых у севера забора.
    lx = (plot[0][0] + plot[1][0]) / 2
    ly = min(p[1] for p in plot) - 18
    parts.append(
        f'<g id="legend" font-family="DejaVu Sans, Liberation Sans, sans-serif" fill="#111111" stroke="none">'
        f'<line x1="{lx - 40:.2f}" y1="{ly:.2f}" x2="{lx - 18:.2f}" y2="{ly:.2f}" '
        f'stroke="#111111" stroke-width="1.7"/>'
        f'<text x="{lx - 14:.2f}" y="{ly:.2f}" font-size="9" dominant-baseline="middle">вариант А</text>'
        f'<line x1="{lx + 55:.2f}" y1="{ly:.2f}" x2="{lx + 77:.2f}" y2="{ly:.2f}" '
        f'stroke="#111111" stroke-width="1.55" stroke-dasharray="7 4"/>'
        f'<text x="{lx + 81:.2f}" y="{ly:.2f}" font-size="9" dominant-baseline="middle">вариант Д4</text>'
        f"</g>"
    )
    return "\n".join(parts)


def main() -> None:
    src_a = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SRC_A
    src_d4 = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else SRC_D4
    out = Path(sys.argv[3]).resolve() if len(sys.argv) > 3 else OUT

    root_a = etree.parse(str(src_a)).getroot()
    root_d4 = etree.parse(str(src_d4)).getroot()
    plot = parse_points(root_a.find(".//svg:polygon[@id='polygon16']", NS).get("points"))
    if len(plot) != 4:
        raise SystemExit("polygon16 должен быть четырёхугольником A-B-C-D")
    house_a = house_corners(root_a)
    house_d4 = house_corners(root_d4)
    yard = yard_buildings(root_a)
    apron_el = root_a.find(".//svg:polygon[@id='drive-apron']", NS)
    front_el = root_a.find(".//svg:polygon[@id='front-court']", NS)
    apron = parse_points(apron_el.get("points")) if apron_el is not None else []
    front = parse_points(front_el.get("points")) if front_el is not None else []
    gates = gate_posts_of(root_a) or gate_posts_of(root_d4)

    print(f"А: {len(house_a)} углов, Д4: {len(house_d4)} углов")
    for b in yard:
        print(f"  {b['name']}: {len(b['corners'])} углов")

    # Цепочка по забору — только крайние проекции; отступы — отдельно А и Д4.
    chain = chain_corners(plot, house_a, house_d4)
    setbacks = [
        {"name": "А", "corners": house_a},
        {"name": "Д4", "corners": house_d4},
        *yard,
    ]
    dims, bbox, report, segs = build_dims(
        plot, chain, [], apron, gates or None, yard, setback_buildings=setbacks
    )
    print("отдельные размеры:")
    for row in report:
        print(" ", row)

    def ring(pts):
        if len(pts) < 2:
            return []
        return [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]

    segs = segs + ring(plot) + ring(house_a) + ring(house_d4) + ring(apron) + ring(front)
    for bld in yard:
        segs = segs + ring(bld["corners"])
    for p in plot + apron + front + house_a + house_d4:
        bbox.append(p)
    for bld in yard:
        bbox.extend(bld["corners"])

    body = drawing_xml(plot, house_a, house_d4, yard, apron, front) + dims
    geos = geo_of(plot)
    for i, (lat, lon) in enumerate(geos):
        print(f"  {'ABCD'[i]} {lat:.6f} {lon:.6f}")
    obstacles = [house_a, house_d4, *(b["corners"] for b in yard)]
    xml = sheet(body, plot, bbox, geos, "А+Д4", segs, obstacles)
    # Подправить шапку/подвал под сравнение.
    xml = xml.replace(
        f"{PLACE}  ·  вариант А+Д4",
        f"{PLACE}  ·  сравнение контуров А и Д4",
    )
    xml = xml.replace(
        "Габарит дома — длины отрезков. Отдельные линии от ближнего конца стороны. Ворота и калитка — своя линия. Выносные от углов.",
        "Сплошной контур — А, штриховой — Д4. Размеры от забора и углов участка; отступы подписаны А / Д4.",
    )
    tree = etree.fromstring(xml.encode())
    drawing = tree.find(f".//{{{SVG}}}g[@id='drawing']")
    scale = float(re.search(r"scale\(([0-9.]+)\)", drawing.get("transform")).group(1))
    promote_dim_labels(drawing, scale, plan_dims=False)
    out.write_bytes(etree.tostring(tree, xml_declaration=True, encoding="UTF-8"))
    print(f"записан {out}")


if __name__ == "__main__":
    # убрать ошибочный placeholder из import, если остался
    main()
