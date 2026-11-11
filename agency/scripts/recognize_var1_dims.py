#!/usr/bin/env python3
"""Оцифровка варианта 1 по PNG-скриншоту dims.

Эталон: agency/Screenshot from 2026-11-05 22-01-52.png
Калибровка: наружные грани отапливаемого → 17340 × 9860 мм.

Модель в метрах: (0,0)=СЗ наружный угол отапливаемого; +X восток; +Y юг.
Без мебели: стены / окна / двери / колонны / комнаты.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "svg"
PREV = ROOT / "preview"
SHOT = ROOT / "Screenshot from 2026-11-05 22-01-52.png"
FONT = "DejaVu Sans, Liberation Sans, sans-serif"

# --- PNG calibration (px) ---
# Outer faces of heated volume on screenshot
PX_XW, PX_XE = 352.0, 1138.0
PX_YN, PX_YSE = 91.0, 538.0
SCALE = 17340.0 / (PX_XE - PX_XW)  # mm/px ≈ 22.061
# West south wall (кладовая) on screenshot
# Юг кладовой (наружная грань) — пик стены на PNG, не рама листа
PX_YSW = 846.0  # наружный юг кладовой (пик штриховки на PNG)

TW = 0.40
TI = 0.20
PS = 0.30

W = 17.34
H_EAST = 9.86
H_WEST = (PX_YSW - PX_YN) * SCALE / 1000.0  # ≈ 16.19

# Горизонтальные стены зап.блока по пикам PNG (м от севера)
Y_N_IN = (111 - PX_YN) * SCALE / 1000.0      # 0.44
Y_NORTH_S = (281 - PX_YN) * SCALE / 1000.0   # 4.19
Y_KOT_N = (296 - PX_YN) * SCALE / 1000.0     # 4.52
Y_KOT_S = (414 - PX_YN) * SCALE / 1000.0     # 7.13
Y_GI_S = (537 - PX_YN) * SCALE / 1000.0      # 9.84 ≈ H_EAST
Y_TAMB_S = (630 - PX_YN) * SCALE / 1000.0    # 11.89
Y_PO_S = (743 - PX_YN) * SCALE / 1000.0      # 14.38
# Y_SW outer = H_WEST
X_TERR = 9.52
TERR_W, TERR_H = 4.40, 3.74
CW = 6.36
# Навес: 300+4300+300+1460; 300+3300+300+3400+300
CH_POST = 7.60


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def g(uid: str, label: str, body: str, x=0.0, y=0.0, rot=0.0) -> str:
    parts = []
    if rot:
        parts.append(f"translate({x:.4f},{y:.4f}) rotate({rot:.3f})")
    elif x or y:
        parts.append(f"translate({x:.4f},{y:.4f})")
    tr = f' transform="{" ".join(parts)}"' if parts else ""
    return (
        f'<g id="{esc(uid)}" inkscape:label="{esc(label)}"'
        f' inkscape:transform-center-x="0" inkscape:transform-center-y="0"{tr}>\n'
        f"{body}\n</g>"
    )


def wall(uid, label, x, y, w, h, kind="ext") -> str:
    """Стена как в D4: сплошная заливка #1a1a1a, без штриховки."""
    cls = "geom" if kind == "ext" else "geom-int"
    return g(uid, label, f'<rect x="0" y="0" width="{w:.4f}" height="{h:.4f}" class="{cls}"/>', x, y)


def post(uid, label, x, y) -> str:
    return g(
        uid,
        label,
        f'<rect x="0" y="0" width="{PS:.4f}" height="{PS:.4f}" class="post"/>',
        x,
        y,
    )


def room_fill(uid, x, y, w, h, open_=False) -> str:
    cls = "open-fill" if open_ else "room-fill"
    return (
        f'<rect id="{esc(uid)}" class="{cls}" x="{x:.4f}" y="{y:.4f}" '
        f'width="{max(w,0.05):.4f}" height="{max(h,0.05):.4f}"/>'
    )


def label(uid, name, area, cx, cy) -> str:
    body = (
        f'<text class="rname" x="0" y="-0.15">{esc(name)}</text>'
        f'<text class="rmeta" x="0" y="0.35">{area:.2f} м²</text>'
    )
    return g(uid, f"подпись {name}", body, cx, cy)


def window_h(uid, x, y, length, wall_t=TW) -> str:
    """Окно как в D4: светло-серый проём в толщине стены + чёрная обводка."""
    body = (
        f'<rect x="0" y="{-wall_t/2:.4f}" width="{length:.4f}" height="{wall_t:.4f}" '
        f'class="window"/>'
    )
    return g(uid, f"окно {uid}", body, x, y)


def window_v(uid, x, y, length, wall_t=TW) -> str:
    body = (
        f'<rect x="{-wall_t/2:.4f}" y="0" width="{wall_t:.4f}" height="{length:.4f}" '
        f'class="window"/>'
    )
    return g(uid, f"окно {uid}", body, x, y)


def door_h(uid, x, y, width=0.90, open_dir=1, hinge="L", wall_t=TW) -> str:
    """Дверь в горизонтальной стене. Проём вдоль +X; open_dir=+1 дуга в +Y, -1 в −Y."""
    if hinge == "L":
        if open_dir > 0:
            arc = f"M 0,0 A {width:.4f},{width:.4f} 0 0 1 {width:.4f},{width:.4f}"
        else:
            arc = f"M 0,0 A {width:.4f},{width:.4f} 0 0 0 {width:.4f},{-width:.4f}"
    else:
        if open_dir > 0:
            arc = f"M {width:.4f},0 A {width:.4f},{width:.4f} 0 0 0 0,{width:.4f}"
        else:
            arc = f"M {width:.4f},0 A {width:.4f},{width:.4f} 0 0 1 0,{-width:.4f}"
    body = (
        f'<rect x="0" y="{-wall_t/2:.4f}" width="{width:.4f}" height="{wall_t:.4f}" class="door-opening"/>'
        f'<rect x="0" y="{-0.04:.4f}" width="{width:.4f}" height="0.08" class="door-leaf"/>'
        f'<path d="{arc}" class="door-arc"/>'
    )
    return g(uid, f"дверь {uid}", body, x, y)


def door_v(uid, x, y, width=0.90, open_dir=1, hinge="T", wall_t=TW) -> str:
    """Дверь в вертикальной стене. Проём вдоль +Y; open_dir=+1 дуга в +X (в дом с запада)."""
    if hinge == "T":
        if open_dir > 0:
            arc = f"M 0,0 A {width:.4f},{width:.4f} 0 0 0 {width:.4f},{width:.4f}"
        else:
            arc = f"M 0,0 A {width:.4f},{width:.4f} 0 0 1 {-width:.4f},{width:.4f}"
    else:  # hinge bottom
        if open_dir > 0:
            arc = f"M 0,{width:.4f} A {width:.4f},{width:.4f} 0 0 1 {width:.4f},0"
        else:
            arc = f"M 0,{width:.4f} A {width:.4f},{width:.4f} 0 0 0 {-width:.4f},0"
    body = (
        f'<rect x="{-wall_t/2:.4f}" y="0" width="{wall_t:.4f}" height="{width:.4f}" class="door-opening"/>'
        f'<rect x="{-0.04:.4f}" y="0" width="0.08" height="{width:.4f}" class="door-leaf"/>'
        f'<path d="{arc}" class="door-arc"/>'
    )
    return g(uid, f"дверь {uid}", body, x, y)


# =============================================================================
# Комнаты — оцифровка по PNG (м). Якоря: наружный контур + размерные чистые габариты.
# Y-уровни сверены с пиками горизонтальных стен на скрине.
# =============================================================================

def geometry():
    """Комнаты по пикам стен PNG + размерным чистым габаритам."""
    # --- Y from PNG peaks (authoritative) ---
    y_n_in = Y_N_IN
    y_north_s = Y_NORTH_S
    y_kot_n, y_kot_s = Y_KOT_N, Y_KOT_S
    y_gi_n = y_kot_s + 0.05
    y_gi_s = Y_GI_S
    y_tamb_n = Y_GI_S
    y_tamb_s = Y_TAMB_S
    y_po_n = Y_TAMB_S + 0.05
    y_po_s = Y_PO_S
    y_kl_n = Y_PO_S + 0.05
    y_kl_s = H_WEST - TW

    # --- X north strip ---
    x = TW
    x_hoz0, x_hoz1 = x, x + 1.98
    x = x_hoz1 + TI
    x_cab0, x_cab1 = x, x + 3.40
    x = x_cab1 + TI
    x_g1_0, x_g1_1 = x, x + 1.42
    x = x_g1_1 + TI
    inner_e = W - TW
    rest = inner_e - x
    bed = (rest - 1.42 - 2 * TI) / 2
    x_s1_0, x_s1_1 = x, x + bed
    x = x_s1_1 + TI
    x_s2_0, x_s2_1 = x, x + bed
    x = x_s2_1 + TI
    x_g2_0, x_g2_1 = x, x + 1.42

    WEST_W = 3.72
    x_w0, x_w1 = TW, TW + WEST_W

    # East wet: мастер 3.48 у востока; две ванные 1.90; гард-М только над мастером
    x_master0 = inner_e - 3.48
    x_bath2_0 = x_master0 - TI - 1.90
    x_bath1_0 = x_bath2_0 - TI - 1.90

    # Коридор под спальнями (не под мастером); глубина ~0.90 → площадь ~6.34
    y_cor_n = y_north_s + 0.05
    y_cor_s = y_cor_n + 0.90
    # Гардероб-М над мастером: 3.48 × 1.90 = 6.61
    y_gm_n = y_cor_n
    y_gm_s = y_gm_n + 1.90
    # Ванные / мастер под гардеробом-М / коридором до юга востока
    y_wet_n = y_gm_s + 0.05
    y_wet_s = H_EAST - TW
    # ванные чуть короче мастера по площади 5.57/1.9=2.93
    bath_h = min(2.93, y_wet_s - y_wet_n)
    master_h = y_wet_s - y_wet_n

    nh = y_north_s - y_n_in  # ~3.75

    rooms = [
        ("Хозблок", 7.52, x_hoz0, y_n_in, 1.98, nh),
        ("Кабинет", 12.92, x_cab0, y_n_in, 3.40, nh),
        ("Гардероб-1", 5.40, x_g1_0, y_n_in, 1.42, nh),
        ("Спальня-1", round(bed * nh, 2), x_s1_0, y_n_in, bed, nh),
        ("Спальня-2", round(bed * nh, 2), x_s2_0, y_n_in, bed, nh),
        ("Гардероб-2", 5.40, x_g2_0, y_n_in, 1.42, nh),
        ("Котельная", 9.82, x_w0, y_kot_n, WEST_W, y_kot_s - y_kot_n),
        ("Коридор", 6.34, x_g1_0, y_cor_n, x_master0 - x_g1_0, y_cor_s - y_cor_n),
        ("Гардероб-М", 6.62, x_master0, y_gm_n, 3.48, y_gm_s - y_gm_n),
        ("Ванная-1", 5.57, x_bath1_0, y_wet_n, 1.90, bath_h),
        ("Ванная-2", 5.57, x_bath2_0, y_wet_n, 1.90, bath_h),
        ("Мастер-спальня", 10.75, x_master0, y_wet_n, 3.48, master_h),
        ("Гардероб-вх", 5.07, x_w0, y_gi_n, 2.04, y_gi_s - y_gi_n),
        ("С/у", 3.42, x_w0 + 2.04 + TI, y_gi_n, 1.50, min(2.28, y_gi_s - y_gi_n)),
        ("Тамбур", 6.35, x_w0, y_tamb_n, 3.34, y_tamb_s - y_tamb_n),
        ("Постирочная", 8.27, x_w0, y_po_n, WEST_W, y_po_s - y_po_n),
        ("Кладовая", 6.92, x_w0, y_kl_n, WEST_W, max(0.4, y_kl_s - y_kl_n)),
    ]

    living = {
        "name": "Кухня-гостиная",
        "area": 55.27,
        "parts": [
            (x_w1 + TI, y_cor_n, x_bath1_0 - (x_w1 + TI), y_wet_s - y_cor_n),
            (x_w1 + TI, H_EAST - TW, X_TERR - (x_w1 + TI), H_WEST - TW - (H_EAST - TW)),
        ],
    }

    return {
        "bed": bed,
        "rooms": rooms,
        "living": living,
        "anchors": {
            "x_w0": x_w0, "x_w1": x_w1, "WEST_W": WEST_W,
            "y_north_s": y_north_s, "y_kot_n": y_kot_n, "y_kot_s": y_kot_s,
            "y_gi_n": y_gi_n, "y_gi_s": y_gi_s,
            "y_tamb_n": y_tamb_n, "y_tamb_s": y_tamb_s,
            "y_po_n": y_po_n, "y_po_s": y_po_s,
            "y_kl_n": y_kl_n, "y_kl_s": y_kl_s,
            "y_cor_n": y_cor_n, "y_cor_s": y_cor_s,
            "y_wet_n": y_wet_n, "y_wet_s": y_wet_s,
            "x_bath1_0": x_bath1_0, "x_bath2_0": x_bath2_0, "x_master0": x_master0,
            "x_hoz0": x_hoz0, "x_hoz1": x_hoz1, "x_cab0": x_cab0, "x_cab1": x_cab1,
            "x_g1_0": x_g1_0, "x_g1_1": x_g1_1,
            "x_s1_0": x_s1_0, "x_s1_1": x_s1_1, "x_s2_0": x_s2_0, "x_s2_1": x_s2_1,
            "x_g2_0": x_g2_0, "inner_e": inner_e,
        },
    }


def build() -> str:
    geo = geometry()
    A = geo["anchors"]
    rooms = geo["rooms"]
    living = geo["living"]
    parts: list[str] = []

    # rooms
    fills = ['<g id="layer-rooms" inkscape:label="помещения" inkscape:groupmode="layer">']
    for name, area, x, y, w, h in rooms:
        fills.append(room_fill(f"fill-{name}", x, y, w, h))
    for i, (x, y, w, h) in enumerate(living["parts"]):
        if w > 0.05 and h > 0.05:
            fills.append(room_fill(f"fill-living-{i}", x, y, w, h))
    fills.append(room_fill("fill-terrace", X_TERR, H_EAST, TERR_W, TERR_H, open_=True))
    kl_x = X_TERR + TERR_W
    if kl_x < W - TW:
        fills.append(room_fill("fill-klumba", kl_x, H_EAST, W - TW - kl_x, min(TERR_H, 2.4), open_=True))
    fills.append(room_fill("fill-carport", -CW, 0.0, CW, CH_POST, open_=True))
    fills.append("</g>")
    parts.append("\n".join(fills))

    labs = ['<g id="layer-labels" inkscape:label="подписи" inkscape:groupmode="layer">']
    for name, area, x, y, w, h in rooms:
        labs.append(label(f"lab-{name}", name, area, x + w / 2, y + h / 2))
    lx = living["parts"][0]
    labs.append(label("lab-living", living["name"], living["area"], lx[0] + lx[2] / 2, lx[1] + lx[3] / 2))
    labs.append(label("lab-terrace", "Терраса", 16.63, X_TERR + TERR_W / 2, H_EAST + TERR_H / 2))
    labs.append(label("lab-carport", "Навес 2 м/м", 36.70, -CW / 2, CH_POST / 2))
    labs.append("</g>")
    parts.append("\n".join(labs))

    # walls — outer L; север/запад режем на простенки (как в D4), проёмы — окна/двери
    walls = ['<g id="layer-walls" inkscape:label="стены" inkscape:groupmode="layer">']
    # Север: цепочка 1020 680 2040 1700 … (простенок / проём / …)
    north_chain = [1.02, 0.68, 2.04, 1.70, 1.61, 0.60, 1.53, 1.70, 1.36, 1.70, 1.70, 0.68, 1.02]
    cx = 0.0
    ni = 0
    for i, seg in enumerate(north_chain):
        if i % 2 == 0:  # простенок
            walls.append(wall(f"wall-ext-N-{ni}", f"север простенок {ni}", cx, 0, seg, TW))
            ni += 1
        cx += seg
    # Запад: сплошная стена; проёмы поверх (окна #e6e6e6 / двери — вырез), как в D4
    walls.append(wall("wall-ext-W", "стена наружная запад", 0, 0, TW, H_WEST))
    walls.append(wall("wall-ext-E", "стена наружная восток", W - TW, 0, TW, H_EAST))
    # Юг востока к террасе: простенок 680 + три окна 1020 + хвост до востока
    walls.append(wall("wall-ext-S-e-0", "юг восток простенок", X_TERR, H_EAST - TW, 0.68, TW))
    sx = X_TERR + 0.68 + 3 * 1.02
    if sx < W:
        walls.append(wall("wall-ext-S-e-end", "юг восток хвост", sx, H_EAST - TW, W - sx, TW))
    walls.append(
        wall(
            "wall-ext-E-recess",
            "стена запад террасы (угол)",
            X_TERR - TW,
            H_EAST - TW,
            TW,
            H_WEST - (H_EAST - TW),
        )
    )
    walls.append(wall("wall-ext-S-west", "стена юг запада", 0, H_WEST - TW, X_TERR - TW, TW))

    # north-strip partitions
    nh = A["y_north_s"] - TW
    walls.append(wall("wall-int-hoz-cab", "хоз|кабинет", A["x_hoz1"], TW, TI, nh, "int"))
    walls.append(wall("wall-int-cab-g1", "кабинет|гард", A["x_cab1"], TW, TI, nh, "int"))
    walls.append(wall("wall-int-g1-s1", "гард|спальня1", A["x_g1_1"], TW, TI, nh, "int"))
    walls.append(wall("wall-int-s1-s2", "спальни", A["x_s1_1"], TW, TI, nh, "int"))
    walls.append(wall("wall-int-s2-g2", "спальня2|гард", A["x_s2_1"], TW, TI, nh, "int"))
    walls.append(wall("wall-int-north-s", "юг северной полосы", TW, A["y_north_s"], W - 2 * TW, TI, "int"))

    # west column
    walls.append(
        wall(
            "wall-int-west-e",
            "восток зап.блока",
            A["x_w1"],
            A["y_north_s"] + TI,
            TI,
            H_WEST - TW - (A["y_north_s"] + TI),
            "int",
        )
    )
    walls.append(wall("wall-int-kot-s", "юг котельной", TW, A["y_kot_s"], A["WEST_W"], TI, "int"))
    walls.append(wall("wall-int-gi-su", "гард|су", TW + 2.04, A["y_gi_n"], TI, A["y_gi_s"] - A["y_gi_n"], "int"))
    walls.append(wall("wall-int-gi-s", "юг гард/су", TW, A["y_gi_s"], A["WEST_W"], TI, "int"))
    walls.append(wall("wall-int-tamb-s", "юг тамбура", TW, A["y_tamb_s"], A["WEST_W"], TI, "int"))
    walls.append(wall("wall-int-po-s", "юг постирочной", TW, A["y_po_s"], A["WEST_W"], TI, "int"))

    # corridor / wet
    walls.append(
        wall(
            "wall-int-cor-s",
            "юг коридора",
            A["x_g1_0"],
            A["y_cor_s"],
            A["inner_e"] - A["x_g1_0"],
            TI,
            "int",
        )
    )
    walls.append(
        wall("wall-int-bath1-2", "ванная1|2", A["x_bath1_0"] + 1.90, A["y_wet_n"], TI, A["y_wet_s"] - A["y_wet_n"], "int")
    )
    walls.append(
        wall("wall-int-bath-master", "ванная|мастер", A["x_bath2_0"] + 1.90, A["y_wet_n"], TI, A["y_wet_s"] - A["y_wet_n"], "int")
    )
    walls.append(
        wall(
            "wall-int-wet-w",
            "запад мокрого блока",
            A["x_bath1_0"] - TI,
            A["y_cor_n"],
            TI,
            A["y_wet_s"] - A["y_cor_n"],
            "int",
        )
    )
    walls.append("</g>")
    parts.append("\n".join(walls))

    # windows — стиль D4 (#e6e6e6); позиции по размерной цепи / чёрным проёмам PNG
    wins = ['<g id="layer-windows" inkscape:label="окна" inkscape:groupmode="layer">']
    cx = 0.0
    wi = 0
    for i, seg in enumerate(north_chain):
        if i % 2 == 1:
            wins.append(window_h(f"win-N-{wi}", cx, TW / 2, seg))
            wi += 1
        cx += seg
    # западные окна 680 (не двери) — по цепочке размеров PNG
    for i, (wy, wl) in enumerate(
        [
            (A["y_gi_n"] + 0.55, 0.68),
            (A["y_po_n"] + 0.55, 0.68),
            (A["y_kl_n"] + 0.40, 0.68),
        ]
    ):
        wins.append(window_v(f"win-W-{i}", TW / 2, wy, wl))
    # восток: три окна 1700
    ey = TW + 1.0
    for i in range(3):
        wins.append(window_v(f"win-E-{i}", W - TW / 2, ey, 1.70))
        ey += 1.70 + 1.70
    # юг к террасе: 3×1020
    sx = X_TERR + 0.68
    for i in range(3):
        wins.append(window_h(f"win-S-{i}", sx, H_EAST - TW / 2, 1.02))
        sx += 1.02
    wins.append("</g>")
    parts.append("\n".join(wins))

    # doors — стиль D4: вырез + полотно + пунктирная дуга
    doors = ['<g id="layer-doors" inkscape:label="двери" inkscape:groupmode="layer">']
    # с навеса (западная стена): проём 930, открывание в дом (+X)
    doors.append(door_v("door-hoz", TW / 2, TW + 0.75, 0.93, open_dir=1))
    doors.append(door_v("door-kotel", TW / 2, A["y_kot_n"] + 0.70, 0.93, open_dir=1))
    doors.append(door_v("door-entry", TW / 2, A["y_tamb_n"] + 0.55, 0.93, open_dir=1))
    # из коридора в комнаты северной полосы: проём в южной грани полосы, дуга на север (−Y)
    doors.append(door_h("door-s1", A["x_s1_0"] + 0.4, A["y_north_s"], 0.90, open_dir=-1))
    doors.append(door_h("door-s2", A["x_s2_0"] + 0.4, A["y_north_s"], 0.90, open_dir=-1))
    doors.append(door_h("door-cab", A["x_cab1"] - 1.0, A["y_north_s"], 0.90, open_dir=-1, hinge="R"))
    doors.append("</g>")
    parts.append("\n".join(doors))

    # columns
    posts = ['<g id="layer-structure" inkscape:label="колонны" inkscape:groupmode="layer">']
    for i, px in enumerate([-CW, -CW + 0.30 + 4.30]):
        for j, py in enumerate([0.0, 3.60, 7.30]):
            posts.append(post(f"post-carport-{i*3+j}", f"колонна навеса {i*3+j+1}", px, py))
    posts.append(post("post-terr-0", "колонна террасы С", X_TERR + TERR_W - PS, H_EAST))
    posts.append(post("post-terr-1", "колонна террасы Ю", X_TERR + TERR_W - PS, H_EAST + PS + 3.14))
    posts.append("</g>")
    parts.append("\n".join(posts))

    notes = [
        "Вариант 1 · оцифровка PNG (только чёрный контур) · стиль как plan-1-etazh-variant-d4",
        f"Калибровка {SCALE:.3f} мм/пкс → 17340×9860; H_west={H_WEST:.2f} м.",
        "Стены #1a1a1a; окна #e6e6e6; двери — вырез + полотно + пунктирная дуга.",
    ]

    vb_w = CW + W + 3.2
    vb_h = max(H_WEST, H_EAST + TERR_H) + 2.8
    pad_x = CW + 1.0
    pad_y = 1.6

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="{vb_w*10:.1f}mm" height="{vb_h*10:.1f}mm"
     viewBox="0 0 {vb_w:.2f} {vb_h:.2f}">
<title>Агентство · Вариант 1 · оцифровка PNG</title>
<desc>Стены/окна/двери в стиле plan-1-etazh-variant-d4-dom-print.svg. 1 ед.=1 м.</desc>
<defs>
  <style type="text/css"><![CDATA[
    .geom {{ fill: #1a1a1a; stroke: none; }}
    .geom-int {{ fill: #1a1a1a; stroke: none; }}
    .post {{ fill: #222222; stroke: none; }}
    .window {{ fill: #e6e6e6; stroke: #000000; stroke-width: 0.03; }}
    .door-opening {{ fill: #ffffff; stroke: #000000; stroke-width: 0.02; }}
    .door-leaf {{ fill: #1a1a1a; stroke: none; }}
    .door-arc {{ fill: none; stroke: #000000; stroke-width: 0.03; stroke-dasharray: 0.08 0.05; }}
    .room-fill {{ fill: #f7f7f7; stroke: none; }}
    .open-fill {{ fill: none; stroke: #8a8a8a; stroke-width: 0.04; stroke-dasharray: 0.25 0.15; }}
    .rname {{ font-family: {FONT}; font-size: 0.34px; font-weight: 700; fill: #1a1a1a; text-anchor: middle; }}
    .rmeta {{ font-family: {FONT}; font-size: 0.24px; fill: #333; text-anchor: middle; }}
  ]]></style>
</defs>
<sodipodi:namedview id="nv" pagecolor="#ffffff" inkscape:deskcolor="#d1d1d1"/>
<rect width="100%" height="100%" fill="#ffffff"/>
{chr(10).join(f'<text x="0.4" y="{0.5+i*0.38:.2f}" font-size="0.26" fill="#333" font-family="{FONT}">{esc(n)}</text>' for i,n in enumerate(notes))}
<g id="plan" inkscape:label="план" inkscape:groupmode="layer" transform="translate({pad_x},{pad_y})">
{chr(10).join(parts)}
</g>
</svg>
'''


def main() -> None:
    PREV.mkdir(parents=True, exist_ok=True)
    geo = geometry()
    svg = build()
    path = OUT / "agency-var1-plan-walls.svg"
    path.write_text(svg, encoding="utf-8")

    rec = {
        "source": str(SHOT.name),
        "calibration": {
            "px_outer": {"XW": PX_XW, "XE": PX_XE, "YN": PX_YN, "YSE": PX_YSE, "YSW": PX_YSW},
            "mm_per_px": SCALE,
            "heated_m": [W, H_EAST],
            "H_west_m": round(H_WEST, 3),
        },
        "bed_w_m": round(geo["bed"], 3),
        "rooms": [
            {"name": n, "area": a, "x": round(x, 3), "y": round(y, 3), "w": round(w, 3), "h": round(h, 3)}
            for n, a, x, y, w, h in geo["rooms"]
        ],
    }
    (OUT / "agency-var1-recognition.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {path} ({len(svg)//1024} KiB)")
    print(f"scale={SCALE:.3f} mm/px  H_WEST={H_WEST:.2f}  bed={geo['bed']:.3f}")
    print(f"rooms={len(geo['rooms'])}")
    for r in geo["rooms"]:
        print(f"  {r[0]:16s} {r[2]:6.2f},{r[3]:6.2f}  {r[4]:5.2f}×{r[5]:5.2f}")


if __name__ == "__main__":
    main()
