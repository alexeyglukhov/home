#!/usr/bin/env python3
"""Плоский план топочной Вариант 3 (вид сверху). Объекты в <g> для правки в Inkscape."""
from __future__ import annotations

from pathlib import Path

OUT = Path(__file__).resolve().parent / "plan-v3.svg"
ROOM_W, ROOM_D = 3.5, 1.98
S = 200
SCALE = 140
PAD = 90
WALL_DRAW = 18


def svg_xz(sx: float, sy: float) -> tuple[float, float]:
    return (sx - 300) / S - ROOM_W / 2, (sy - 400) / S - ROOM_D / 2


def svg_rect(sx: float, sy: float, sw: float, sh: float):
    x0, z0 = svg_xz(sx, sy)
    x1, z1 = svg_xz(sx + sw, sy + sh)
    return {
        "x": (x0 + x1) / 2,
        "z": (z0 + z1) / 2,
        "w": abs(x1 - x0),
        "d": abs(z1 - z0),
    }


def px(x: float) -> float:
    return PAD + WALL_DRAW + (x + ROOM_W / 2) * SCALE


def pz(z: float) -> float:
    return PAD + WALL_DRAW + (z + ROOM_D / 2) * SCALE


def gid(name: str) -> str:
    raw = name.lower().replace(" ", "-").replace(".", "").replace(",", "")
    return "eq-" + "".join(c if c.isalnum() or c == "-" else "-" for c in raw)


def main() -> None:
    z_n, z_s = -ROOM_D / 2, ROOM_D / 2
    x_w, x_e = -ROOM_W / 2, ROOM_W / 2
    gas = svg_rect(316, 400, 84, 54)
    el = svg_rect(408, 400, 82, 62)
    bkn = svg_rect(604, 436, 112, 112)
    tt = svg_rect(888, 400, 92, 156)
    fe = svg_rect(568, 735, 61, 61)
    f1 = svg_rect(655, 774, 22, 22)
    f2 = svg_rect(720, 774, 22, 22)
    lap = svg_rect(300, 676, 120, 120)
    fuel = svg_rect(742, 424, 120, 120)
    door = svg_rect(300, 528, 1, 140)
    boiler_d, boiler_z = 0.3, z_n + 0.15
    bkn_r = 0.25
    bkn_z = z_n + bkn_r + 0.1
    tt_w, tt_d = 0.338, 0.510
    s_rail = z_s - 0.18
    greb_len = 0.26
    greb_z = -0.72 - greb_len / 2
    win_x = 0.0  # середина южной стены; проём 0,80×0,80
    door_z = door["z"]

    W = PAD * 2 + WALL_DRAW * 2 + ROOM_W * SCALE + 40
    H = PAD * 2 + WALL_DRAW * 2 + ROOM_D * SCALE + 130

    out: list[str] = []
    out.append(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="{W:.0f}" height="{H:.0f}" viewBox="0 0 {W:.0f} {H:.0f}">
<title>Топочная Вариант 3 — план (вид сверху)</title>
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L6,3 L0,6 Z" fill="#c62828"/>
  </marker>
  <pattern id="frontzone" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="8" stroke="#f9a825" stroke-width="3" opacity="0.45"/>
  </pattern>
</defs>
<rect width="100%" height="100%" fill="#f7f4ec"/>
'''
    )

    out.append(
        f'<g id="layer-notes" inkscape:label="заметки" inkscape:groupmode="layer">'
        f'<text x="{PAD}" y="28" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="700" fill="#222">'
        f"Топочная Вариант 3 — план {ROOM_W:.2f}×{ROOM_D:.2f} м (север вверх)</text>"
        f'<text x="{PAD}" y="46" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#444">'
        f"Синяя полоса = к стене. Красная стрелка = фронт. Объекты сгруппированы: в Inkscape двигайте/вращайте группу целиком.</text>"
        f'<text x="{PAD}" y="62" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#37474f">'
        f"ТТ: АОТВ СТЭН mini-7. Паспорт: зад/бок несгораемая ≥0,10 м; фронт ≥1,25 м. "
        f"0,10+0,51+1,25=1,86 м ≤ 1,98 м.</text></g>\n"
    )

    ox, oy = PAD, PAD
    iw, ih = ROOM_W * SCALE, ROOM_D * SCALE
    out.append('<g id="layer-room" inkscape:label="комната" inkscape:groupmode="layer">\n')
    out.append(
        f'<rect x="{ox}" y="{oy}" width="{iw + WALL_DRAW * 2}" height="{ih + WALL_DRAW * 2}" '
        f'fill="#cfd8dc" stroke="#546e7a" stroke-width="2"/>'
        f'<rect x="{ox + WALL_DRAW}" y="{oy + WALL_DRAW}" width="{iw}" height="{ih}" '
        f'fill="#eceff1" stroke="#90a4ae" stroke-width="1"/>'
        f'<rect x="{ox}" y="{pz(door_z) - 0.35 * SCALE:.1f}" width="{WALL_DRAW}" height="{0.7 * SCALE:.1f}" fill="#f7f4ec"/>'
        f'<rect x="{px(win_x) - 0.4 * SCALE:.1f}" y="{oy + WALL_DRAW + ih}" width="{0.8 * SCALE:.1f}" height="{WALL_DRAW}" '
        f'fill="#bbdefb" stroke="#1565c0" stroke-width="1"/>'
    )
    cx, cy = W - 55, PAD + 40
    out.append(
        f'<g id="compass" inkscape:label="компас" transform="translate({cx},{cy})">'
        f'<circle cx="0" cy="0" r="22" fill="#fff" stroke="#333" stroke-width="1.2"/>'
        f'<polygon points="0,-16 -5,2 5,2" fill="#c62828"/>'
        f'<text x="0" y="34" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="700">С</text></g>'
    )
    out.append(
        f'<text x="{px(0):.1f}" y="{oy + 14}" text-anchor="middle" font-size="12" font-family="DejaVu Sans, Arial, sans-serif" fill="#37474f">север</text>'
        f'<text x="{px(0):.1f}" y="{oy + WALL_DRAW + ih + WALL_DRAW + 16}" text-anchor="middle" font-size="12" font-family="DejaVu Sans, Arial, sans-serif" fill="#37474f">юг</text>'
        f'<text x="{ox + 12}" y="{pz(0):.1f}" text-anchor="middle" font-size="12" font-family="DejaVu Sans, Arial, sans-serif" fill="#37474f" transform="rotate(-90 {ox + 12} {pz(0):.1f})">запад</text>'
        f'<text x="{ox + WALL_DRAW + iw + WALL_DRAW - 12}" y="{pz(0):.1f}" text-anchor="middle" font-size="12" font-family="DejaVu Sans, Arial, sans-serif" fill="#37474f" transform="rotate(90 {ox + WALL_DRAW + iw + WALL_DRAW - 12} {pz(0):.1f})">восток</text>'
    )
    y_dim = oy + WALL_DRAW + ih + WALL_DRAW + 36
    x_dim = ox + WALL_DRAW + iw + WALL_DRAW + 28
    out.append(
        f'<line x1="{ox + WALL_DRAW}" y1="{y_dim}" x2="{ox + WALL_DRAW + iw}" y2="{y_dim}" stroke="#333" stroke-width="1"/>'
        f'<text x="{px(0):.1f}" y="{y_dim + 14}" text-anchor="middle" font-size="12" font-family="DejaVu Sans, Arial, sans-serif">{ROOM_W:.2f} м</text>'
        f'<line x1="{x_dim}" y1="{oy + WALL_DRAW}" x2="{x_dim}" y2="{oy + WALL_DRAW + ih}" stroke="#333" stroke-width="1"/>'
        f'<text x="{x_dim + 14}" y="{pz(0):.1f}" text-anchor="middle" font-size="12" font-family="DejaVu Sans, Arial, sans-serif" transform="rotate(90 {x_dim + 14} {pz(0):.1f})">{ROOM_D:.2f} м</text>'
    )
    out.append("</g>\n")

    # --- equipment layer: each unit is one <g transform="translate(cx,cy)"> ---
    out.append('<g id="layer-equipment" inkscape:label="оборудование" inkscape:groupmode="layer">\n')

    def hatch_local(w_px: float, d_px: float, face: str) -> str:
        t = 5
        if face == "N":
            return f'<rect class="wall-mount" x="{-w_px/2:.1f}" y="{-d_px/2:.1f}" width="{w_px:.1f}" height="{t}" fill="#1565c0"/>'
        if face == "S":
            return f'<rect class="wall-mount" x="{-w_px/2:.1f}" y="{d_px/2 - t:.1f}" width="{w_px:.1f}" height="{t}" fill="#1565c0"/>'
        if face == "W":
            return f'<rect class="wall-mount" x="{-w_px/2:.1f}" y="{-d_px/2:.1f}" width="{t}" height="{d_px:.1f}" fill="#1565c0"/>'
        return f'<rect class="wall-mount" x="{w_px/2 - t:.1f}" y="{-d_px/2:.1f}" width="{t}" height="{d_px:.1f}" fill="#1565c0"/>'

    def arrow_local(face: str, reach: float = 0.22) -> str:
        L = reach * SCALE
        if face == "N":
            x2, y2 = 0, L
        elif face == "S":
            x2, y2 = 0, -L
        elif face == "W":
            x2, y2 = L, 0
        else:
            x2, y2 = -L, 0
        return (
            f'<line class="front" x1="0" y1="0" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="#c62828" stroke-width="2" marker-end="url(#arrow)"/>'
        )

    def label_local(text: str, dy: float = 4) -> str:
        return (
            f'<text class="caption" x="0" y="{dy:.1f}" text-anchor="middle" '
            f'font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#111">{text}</text>'
        )

    def unit(
        name: str,
        x: float,
        z: float,
        w: float,
        d: float,
        face: str,
        *,
        fill: str = "#fff",
        shape: str = "rect",
        extra: str = "",
        reach: float = 0.22,
    ) -> None:
        cx, cy = px(x), pz(z)
        w_px, d_px = w * SCALE, d * SCALE
        if shape == "circle":
            r = max(w, d) / 2 * SCALE
            body = f'<circle class="body" cx="0" cy="0" r="{r:.1f}" fill="{fill}" stroke="#222" stroke-width="1.4"/>'
            hatch = hatch_local(r * 2, r * 2, face)
        else:
            body = (
                f'<rect class="body" x="{-w_px/2:.1f}" y="{-d_px/2:.1f}" width="{w_px:.1f}" height="{d_px:.1f}" '
                f'fill="{fill}" stroke="#222" stroke-width="1.4" rx="2"/>'
            )
            hatch = hatch_local(w_px, d_px, face)
        out.append(
            f'<g id="{gid(name)}" inkscape:label="{name}" transform="translate({cx:.1f},{cy:.1f})">'
            f"{body}{hatch}{arrow_local(face, reach)}{label_local(name)}{extra}</g>\n"
        )

    def safety_extra(dx_m: float, dz_m: float) -> str:
        s = 0.09 * SCALE
        dx, dz = dx_m * SCALE, dz_m * SCALE
        return (
            f'<g class="safety" inkscape:label="ГБ" transform="translate({dx:.1f},{dz:.1f})">'
            f'<rect x="{-s/2:.1f}" y="{-s/2:.1f}" width="{s:.1f}" height="{s:.1f}" fill="#fff3e0" stroke="#e65100" '
            f'stroke-width="1.4" transform="rotate(45)"/>'
            f'<text x="0" y="{0.12 * SCALE:.1f}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" '
            f'font-size="10" fill="#111">ГБ</text></g>'
        )

    # front zones gas/el (separate groups, tied by name)
    for name, sx, sy, sw, sh in (
        ("фронт-газа", 316, 454, 84, 200),
        ("фронт-эл", 408, 462, 82, 200),
    ):
        r = svg_rect(sx, sy, sw, sh)
        out.append(
            f'<g id="{gid(name)}" inkscape:label="{name}" transform="translate({px(r["x"]):.1f},{pz(r["z"]):.1f})">'
            f'<rect x="{-r["w"]*SCALE/2:.1f}" y="{-r["d"]*SCALE/2:.1f}" width="{r["w"]*SCALE:.1f}" height="{r["d"]*SCALE:.1f}" '
            f'fill="url(#frontzone)" stroke="#f9a825" stroke-width="0.8" opacity="0.85"/></g>\n'
        )

    unit(
        "ГАЗ H700",
        gas["x"],
        boiler_z,
        0.4,
        boiler_d,
        "N",
        fill="#fafafa",
        extra=safety_extra(0.18, boiler_d / 2 + 0.05),
    )
    unit(
        "ЭЛ H740",
        el["x"],
        boiler_z,
        0.38,
        boiler_d,
        "N",
        fill="#f5f5f5",
        extra=safety_extra(0.16, boiler_d / 2 + 0.05),
    )
    for name, dx, ww in (
        ("Н-СО", 0.32, 0.22),
        ("колл.СО", 0.55, 0.26),
        ("ГС", 0.78, 0.16),
        ("СВШ", 1.0, 0.14),
    ):
        unit(name, el["x"] + dx, z_n + 0.14, ww, 0.14, "N", fill="#cfd8dc")

    unit("термоаккумулятор", bkn["x"], bkn_z, bkn_r * 2, bkn_r * 2, "N", fill="#9fa8da", shape="circle", reach=0.28)

    # СТЭН mini-7 + отступ + фронт в одной группе
    tt_gap, tt_front = 0.10, 1.25
    tt_z_ok = z_n + tt_gap + tt_d / 2
    cx, cy = px(tt["x"]), pz(tt_z_ok)
    w_px, d_px = tt_w * SCALE, tt_d * SCALE
    # local: body centered at 0; rear gap above body (north = -Y in SVG toward top = smaller z)
    # In our pz: larger z = south = larger SVG y. North wall is -d/2 side of body.
    rear_h = tt_gap * SCALE
    front_h = tt_front * SCALE
    out.append(
        f'<g id="{gid("СТЭН mini-7")}" inkscape:label="СТЭН mini-7" transform="translate({cx:.1f},{cy:.1f})">'
        f'<rect class="rear-gap" x="{-w_px/2:.1f}" y="{-d_px/2 - rear_h:.1f}" width="{w_px:.1f}" height="{rear_h:.1f}" '
        f'fill="#ffcdd2" stroke="#c62828" stroke-width="1" stroke-dasharray="3 2"/>'
        f'<text x="0" y="{-d_px/2 - rear_h/2:.1f}" text-anchor="middle" dy="3" font-size="10" '
        f'font-family="DejaVu Sans, Arial, sans-serif" fill="#111">0,10</text>'
        f'<rect class="body" x="{-w_px/2:.1f}" y="{-d_px/2:.1f}" width="{w_px:.1f}" height="{d_px:.1f}" '
        f'fill="#6d4c41" stroke="#222" stroke-width="1.4" rx="2"/>'
        f'{hatch_local(w_px, d_px, "N")}'
        f'{arrow_local("N", 0.22)}'
        f'{label_local("СТЭН mini-7")}'
        f'<rect class="front-zone" x="{-w_px/2:.1f}" y="{d_px/2:.1f}" width="{w_px:.1f}" height="{front_h:.1f}" '
        f'fill="url(#frontzone)" stroke="#f9a825" stroke-width="0.8" opacity="0.7"/>'
        f'<text x="{0.28*SCALE:.1f}" y="{d_px/2 + front_h/2:.1f}" text-anchor="middle" font-size="10" '
        f'font-family="DejaVu Sans, Arial, sans-serif" fill="#111">фронт 1,25</text>'
        f'{safety_extra(-0.22, tt_d/2 + 0.04)}'
        f"</g>\n"
    )

    fuel_z = min(max(fuel["z"], tt_z_ok), z_s - 0.4)
    unit("топливо", fuel["x"], fuel_z, 0.55, 0.5, "E", fill="#8d6e63")

    for name, xx in (("РБ-СО", 0.35), ("РБ-котлы", 0.75)):
        unit(name, xx, z_n + 0.12, 0.28, 0.28, "N", fill="#c62828", shape="circle", reach=0.18)

    unit("Н-ТТ", svg_xz(732, 400)[0], z_n + 0.2, 0.14, 0.14, "N", fill="#607d8b")
    unit("Н-ТА", svg_xz(751, 400)[0], z_n + 0.2, 0.14, 0.14, "N", fill="#607d8b")
    unit("СН4+СО", svg_xz(487, 400)[0], z_n + 0.04, 0.12, 0.05, "N", fill="#ffcdd2")

    unit("гребёнка", x_w + 0.18, greb_z, 0.12, greb_len, "W", fill="#b0bec5")
    # смес: отдельная группа рядом
    mx, mz = x_w + 0.32, greb_z
    out.append(
        f'<g id="{gid("смес.+Н-ТП")}" inkscape:label="смес.+Н-ТП" transform="translate({px(mx):.1f},{pz(mz):.1f})">'
        f'<rect class="body" x="{-0.06*SCALE:.1f}" y="{-greb_len*SCALE/2:.1f}" width="{0.12*SCALE:.1f}" height="{greb_len*SCALE:.1f}" '
        f'fill="#ffe082" stroke="#f9a825" stroke-width="1.2" stroke-dasharray="4 3" rx="2"/>'
        f'{arrow_local("W", 0.18)}'
        f'<text x="{0.22*SCALE:.1f}" y="{-0.08*SCALE:.1f}" text-anchor="middle" font-size="11" '
        f'font-family="DejaVu Sans, Arial, sans-serif">смес.+Н-ТП</text>'
        f'<text x="{0.22*SCALE:.1f}" y="{0.08*SCALE:.1f}" text-anchor="middle" font-size="10" '
        f'font-family="DejaVu Sans, Arial, sans-serif">(ниже по Y)</text></g>\n'
    )

    unit("дверь", x_w + 0.02, door_z, 0.04, 0.7, "W", fill="#5d4037")
    unit("лапамойка", lap["x"] + 0.15, lap["z"], 0.58, 0.58, "W", fill="#b0bec5")

    unit("автоматика", -0.72, z_s - 0.1, 0.4, 0.12, "S", fill="#eceff1")
    unit("К1", -0.78, z_s - 0.08, 0.16, 0.16, "S", fill="#5d4037", shape="circle")
    unit("Fe H1320", fe["x"], s_rail, 0.48, 0.48, "S", fill="#80deea")
    unit("Ф1", f1["x"], s_rail, 0.12, 0.12, "S", fill="#00838f")
    unit("Ф2", f2["x"], s_rail, 0.12, 0.12, "S", fill="#00838f")
    unit("окно", win_x, z_s - 0.02, 0.8, 0.06, "S", fill="#bbdefb")
    unit("ИБП", svg_xz(795, 762)[0], z_s - 0.12, 0.32, 0.14, "S", fill="#eceff1")
    unit("АКБ", svg_xz(836, 760)[0], z_s - 0.12, 0.3, 0.14, "S", fill="#eceff1")
    unit("приток", x_e - 0.05, 0.1, 0.1, 0.22, "E", fill="#4fc3f7")

    out.append("</g>\n</svg>\n")
    OUT.write_text("".join(out), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
