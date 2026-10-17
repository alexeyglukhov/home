#!/usr/bin/env python3
"""Читает furniture-map-d2.svg и переписывает D2_FURNITURE в furniture-place-d2.js.

Поддерживает transform после Inkscape: translate, rotate(a), rotate(a,cx,cy),
matrix, scale.

Пишет:
  frontDeg — куда смотрит стрелка (+Y локально) в плане: 0=N 90=E 180=S 270=W
  footW/footD — ширина×глубина пятна в метрах (поперёк/вдоль стрелки), с учётом scale
  fromMap: true — 3D вписывает модель в пятно без keepAspect и без смены модели
"""
from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "furniture-map-d2.svg"
PLACE = ROOT / "furniture-place-d2.js"
NS = {"svg": "http://www.w3.org/2000/svg"}


def mat_mul(a: list[float], b: list[float]) -> list[float]:
    a1, b1, c1, d1, e1, f1 = a
    a2, b2, c2, d2, e2, f2 = b
    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ]


def mat_apply(m: list[float], x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def parse_transform(tr: str) -> list[float]:
    if not tr or not tr.strip():
        return [1, 0, 0, 1, 0, 0]
    m = [1, 0, 0, 1, 0, 0]
    token = re.compile(
        r"(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)"
    )
    for kind, args_s in token.findall(tr):
        args = [float(x) for x in re.split(r"[,\s]+", args_s.strip()) if x]
        if kind == "matrix" and len(args) >= 6:
            local = args[:6]
        elif kind == "translate":
            tx = args[0]
            ty = args[1] if len(args) > 1 else 0.0
            local = [1, 0, 0, 1, tx, ty]
        elif kind == "scale":
            sx = args[0]
            sy = args[1] if len(args) > 1 else sx
            local = [sx, 0, 0, sy, 0, 0]
        elif kind == "rotate":
            ang = math.radians(args[0])
            cos_a, sin_a = math.cos(ang), math.sin(ang)
            r = [cos_a, sin_a, -sin_a, cos_a, 0, 0]
            if len(args) >= 3:
                cx, cy = args[1], args[2]
                local = mat_mul(
                    mat_mul([1, 0, 0, 1, cx, cy], r),
                    [1, 0, 0, 1, -cx, -cy],
                )
            else:
                local = r
        elif kind == "skewX":
            t = math.tan(math.radians(args[0]))
            local = [1, 0, t, 1, 0, 0]
        elif kind == "skewY":
            t = math.tan(math.radians(args[0]))
            local = [1, t, 0, 1, 0, 0]
        else:
            continue
        m = mat_mul(m, local)
    return m


def front_to_wall(front_deg: float) -> str:
    f = ((front_deg % 360) + 360) % 360
    if abs(f - 0) <= 45 or abs(f - 360) <= 45:
        return "S"
    if abs(f - 180) <= 45:
        return "N"
    if abs(f - 90) <= 45:
        return "W"
    if abs(f - 270) <= 45:
        return "E"
    opts = [(0, "S"), (90, "W"), (180, "N"), (270, "E")]
    return min(opts, key=lambda o: abs(((f - o[0] + 180) % 360) - 180))[1]


def find_foot(g, tag) -> ET.Element | None:
    for child in g:
        ctag = child.tag.split("}")[-1]
        if ctag == "rect" and "foot" in child.attrib.get("class", "").split():
            return child
    # Inkscape иногда вкладывает глубже
    for child in g.iter():
        ctag = child.tag.split("}")[-1]
        if ctag == "rect" and "foot" in child.attrib.get("class", "").split():
            return child
    return None


def main() -> None:
    tree = ET.parse(SVG)
    root = tree.getroot()

    def tag(name: str) -> str:
        return f"{{{NS['svg']}}}{name}" if root.tag.startswith("{") else name

    furns = []
    for g in root.iter(tag("g")):
        cls = g.attrib.get("class", "")
        tokens = cls.split()
        gid = g.attrib.get("id", "")
        # Палитра: только канонические catalog-XXX. Копии (g4011…) с class
        # catalog-item / data-nosync всё равно синхронизируем — иначе после
        # Ctrl+C в Inkscape объекты «есть на карте, нет в 3D».
        if gid.startswith("catalog-"):
            continue
        if "furn" not in tokens and "catalog-item" not in tokens:
            continue
        model = g.attrib.get("data-model")
        if not model:
            continue
        m = parse_transform(g.attrib.get("transform", ""))
        foot = find_foot(g, tag)
        if foot is None:
            print("skip no foot", model, g.attrib.get("id"))
            continue

        fx = float(foot.attrib["x"])
        fy = float(foot.attrib["y"])
        fw = float(foot.attrib["width"])
        fd = float(foot.attrib["height"])

        # Масштаб локальных осей (ширина = +X, глубина/стрелка = +Y)
        a, b, c, d = m[0], m[1], m[2], m[3]
        scale_x = math.hypot(a, b)
        scale_y = math.hypot(c, d)
        foot_w = abs(fw * scale_x)
        foot_d = abs(fd * scale_y)
        # зеркало: отрицательный det или data-mirror
        det = a * d - b * c
        mirror = det < -1e-9 or g.attrib.get("data-mirror") == "1"

        corners = [
            (fx, fy),
            (fx + fw, fy),
            (fx + fw, fy + fd),
            (fx, fy + fd),
        ]
        world = [mat_apply(m, x, y) for x, y in corners]
        xs = [p[0] for p in world]
        ys = [p[1] for p in world]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)

        # Куда смотрит стрелка (+Y локально) в плане
        o = mat_apply(m, 0.0, 0.0)
        p = mat_apply(m, 0.0, 1.0)
        arrow_dx, arrow_dy = p[0] - o[0], p[1] - o[1]
        # atan2(east, north): 0=N, 90=E
        front = math.degrees(math.atan2(arrow_dx, arrow_dy))
        front = ((front % 360) + 360) % 360
        front_snap = ((round(front / 90) * 90) % 360 + 360) % 360

        wall = front_to_wall(front_snap)
        h_raw = (g.attrib.get("data-h") or "").strip()
        raise_raw = (g.attrib.get("data-raise") or "").strip()
        floor_raw = (g.attrib.get("data-floory") or "").strip()
        rot_raw = (g.attrib.get("data-rot") or "").strip()

        furns.append(
            {
                "id": model,
                "x0": x0,
                "y0": y0,
                "x1": x1,
                "y1": y1,
                "footW": foot_w,
                "footD": foot_d,
                "frontDeg": front_snap,
                "wall": wall,
                "rot": rot_raw,
                "h": h_raw,
                "raise": raise_raw,
                "floorY": floor_raw,
                "mirror": mirror,
            }
        )

    if not furns:
        raise SystemExit("no furn groups found — open furniture-map-d2.svg?")

    lines = [
        "export const D2_FURNITURE = [",
        "  // Сгенерировано из furniture-map-d2.svg — правьте карту, затем sync_map_to_place.py",
    ]
    for it in furns:
        bits = [
            f'id: "{it["id"]}"',
            f'x0: {it["x0"]:.3f}',
            f'y0: {it["y0"]:.3f}',
            f'x1: {it["x1"]:.3f}',
            f'y1: {it["y1"]:.3f}',
            f'footW: {it["footW"]:.3f}',
            f'footD: {it["footD"]:.3f}',
            f'frontDeg: {it["frontDeg"]:.0f}',
            "fromMap: true",
        ]
        # wall — подсказка «спинка к …»; 3D-rot из frontDeg
        bits.append(f'wall: "{it["wall"]}"')
        if it["h"]:
            bits.append(f'h: {it["h"]}')
        if it["raise"]:
            bits.append(f'raise: {it["raise"]}')
        if it["floorY"]:
            bits.append(f'floorY: {it["floorY"]}')
        if it["mirror"]:
            bits.append("mirror: true")
        lines.append(f"  {{ {', '.join(bits)} }},")
    lines.append("];")
    block = "\n".join(lines)

    js = PLACE.read_text(encoding="utf-8")
    new_js, n = re.subn(
        r"export const D2_FURNITURE = \[[\s\S]*?\];",
        block,
        js,
        count=1,
    )
    if n != 1:
        raise SystemExit("failed to replace D2_FURNITURE")
    PLACE.write_text(new_js, encoding="utf-8")
    print(f"synced {len(furns)} items → {PLACE}")


def ancestor_matrix(node, parent) -> list[float]:
    m = parse_transform(node.attrib.get("transform", ""))
    up = parent.get(node)
    while up is not None:
        m = mat_mul(parse_transform(up.attrib.get("transform", "")), m)
        up = parent.get(up)
    return m


def world_matrix(root: ET.Element) -> list[float]:
    tag = root.tag.split("}")[-1]
    world = None
    for g in root.iter():
        if g.tag.split("}")[-1] == "g" and g.attrib.get("id") == "world":
            world = g
            break
    if world is None:
        raise SystemExit("world layer not found")
    _ = tag
    return parse_transform(world.attrib.get("transform", ""))


def to_plan(world: list[float], x: float, y: float) -> tuple[float, float]:
    a, _b, _c, d, e, f = world
    return (x - e) / a, (y - f) / d


def collect_plan_items(svg_path: Path) -> list[dict]:
    """Пятна, которые Inkscape вынес в координаты листа, переводит в метры плана."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    parent = {child: node for node in root.iter() for child in node}
    world = world_matrix(root)

    def tag(name: str) -> str:
        return f"{{{NS['svg']}}}{name}" if root.tag.startswith("{") else name

    furns = []
    skipped = 0
    for g in root.iter(tag("g")):
        cls = g.attrib.get("class", "")
        tokens = cls.split()
        gid = g.attrib.get("id", "")
        if gid.startswith("catalog-"):
            continue
        if "furn" not in tokens and "catalog-item" not in tokens:
            continue
        model = g.attrib.get("data-model")
        if not model:
            continue
        foot = find_foot(g, tag)
        if foot is None:
            print("skip no foot", model, gid)
            continue
        m = ancestor_matrix(g, parent)
        fx = float(foot.attrib["x"])
        fy = float(foot.attrib["y"])
        fw = float(foot.attrib["width"])
        fd = float(foot.attrib["height"])
        origin = to_plan(world, *mat_apply(m, 0.0, 0.0))
        unit_x = to_plan(world, *mat_apply(m, 1.0, 0.0))
        unit_y = to_plan(world, *mat_apply(m, 0.0, 1.0))
        sx = math.hypot(unit_x[0] - origin[0], unit_x[1] - origin[1])
        sy = math.hypot(unit_y[0] - origin[0], unit_y[1] - origin[1])
        det = (unit_x[0] - origin[0]) * (unit_y[1] - origin[1]) - (unit_x[1] - origin[1]) * (unit_y[0] - origin[0])
        corners = [to_plan(world, *mat_apply(m, x, y)) for x, y in (
            (fx, fy), (fx + fw, fy), (fx + fw, fy + fd), (fx, fy + fd),
        )]
        xs = [p[0] for p in corners]
        ys = [p[1] for p in corners]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if not (-7.5 <= cx <= 14.2 and 1.5 <= cy <= 20.0):
            skipped += 1
            continue
        arrow_dx = unit_y[0] - origin[0]
        arrow_dy = unit_y[1] - origin[1]
        front = math.degrees(math.atan2(arrow_dx, arrow_dy))
        front = ((front % 360) + 360) % 360
        front_snap = ((round(front / 90) * 90) % 360 + 360) % 360
        on_terrace = 5.32 <= cx <= 8.50 and 2.46 <= cy <= 9.05
        furns.append({
            "id": model,
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "footW": abs(fw * sx),
            "footD": abs(fd * sy),
            "frontDeg": front_snap,
            "wall": front_to_wall(front_snap),
            "h": (g.attrib.get("data-h") or "").strip(),
            "raise": (g.attrib.get("data-raise") or "").strip(),
            "floorY": "0.40" if on_terrace else (g.attrib.get("data-floory") or "").strip(),
            "mirror": det < -1e-6 or g.attrib.get("data-mirror") == "1",
        })
    if skipped:
        print(f"skipped {skipped} outside the house")
    return furns


def write_d5(items: list[dict]) -> None:
    place = ROOT / "furniture-place-d5.js"
    lines = [
        "// Расстановка Д5. Источник — furniture-map-d4.svg.",
        "// Карту правьте там, затем: python3 furniture-map/sync_map_to_place.py d5",
        'import { mountFurniture, CAB_H, COUNTER_H, RAISE } from "./furniture-place-d2.js";',
        "",
        "export const D5_FURNITURE = [",
    ]
    for it in items:
        bits = [
            f'id: "{it["id"]}"',
            f'x0: {it["x0"]:.3f}',
            f'y0: {it["y0"]:.3f}',
            f'x1: {it["x1"]:.3f}',
            f'y1: {it["y1"]:.3f}',
            f'footW: {it["footW"]:.3f}',
            f'footD: {it["footD"]:.3f}',
            f'frontDeg: {it["frontDeg"]:.0f}',
            "fromMap: true",
            f'wall: "{it["wall"]}"',
        ]
        if it["h"]:
            bits.append(f'h: {it["h"]}')
        if it["raise"]:
            bits.append(f'raise: {it["raise"]}')
        if it["floorY"]:
            bits.append(f'floorY: {it["floorY"]}')
        if it["mirror"]:
            bits.append("mirror: true")
        lines.append("  { " + ", ".join(bits) + " },")
    lines += [
        "];",
        "",
        "export function mountD5Furniture(group, api) {",
        "  return mountFurniture(group, api, D5_FURNITURE);",
        "}",
        "",
    ]
    place.write_text("\n".join(lines), encoding="utf-8")
    print(f"synced {len(items)} items → {place}")


def main_d5() -> None:
    items = collect_plan_items(ROOT / "furniture-map-d4.svg")
    if not items:
        raise SystemExit("no placed furniture on the D4 map")
    write_d5(items)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "d5":
        main_d5()
    else:
        main()
