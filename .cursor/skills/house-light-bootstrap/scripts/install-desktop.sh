#!/usr/bin/env bash
# Ставит на рабочий стол пару ярлыков Дом-start и Дом-stop.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
ICON_DIR="$HOME/.local/share/icons"
START_ICON="$ICON_DIR/house-light-viewer.png"
STOP_ICON="$ICON_DIR/house-light-viewer-stop.png"
OPEN="$ROOT/.cursor/skills/house-light-viewer/scripts/open-viewer.sh"
STOP="$ROOT/.cursor/skills/house-light-viewer/scripts/stop-viewer.sh"

mkdir -p "$ICON_DIR" "$DESKTOP"

python3 - "$START_ICON" "$STOP_ICON" << 'PY'
import sys
from PIL import Image, ImageDraw

start_path, stop_path = sys.argv[1], sys.argv[2]

def house():
    S = 1024
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((24, 24, 999, 999), radius=200, fill=(78, 163, 214, 255))
    d.rounded_rectangle((24, 620, 999, 999), radius=200, fill=(62, 140, 196, 255))
    d.rectangle((24, 620, 999, 820), fill=(62, 140, 196, 255))
    d.ellipse((150, 720, 874, 900), fill=(86, 170, 92, 255))
    d.rounded_rectangle((292, 500, 732, 812), radius=8, fill=(255, 247, 232, 255))
    d.polygon([(188, 528), (512, 228), (836, 528)], fill=(198, 72, 52, 255))
    d.polygon([(250, 528), (512, 300), (774, 528)], fill=(168, 52, 40, 255))
    d.rectangle((648, 292, 724, 360), fill=(242, 236, 226, 255))
    d.rectangle((634, 268, 738, 304), fill=(176, 86, 64, 255))

    def window(x, y, w=112, h=112):
        d.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=(110, 190, 220, 255))
        bar = 12
        d.rectangle((x + w // 2 - bar // 2, y + 6, x + w // 2 + bar // 2, y + h - 6), fill=(255, 247, 232, 255))
        d.rectangle((x + 6, y + h // 2 - bar // 2, x + w - 6, y + h // 2 + bar // 2), fill=(255, 247, 232, 255))

    window(330, 548)
    window(582, 548)
    d.rounded_rectangle((464, 612, 560, 812), radius=16, fill=(126, 76, 46, 255))
    d.ellipse((530, 700, 548, 718), fill=(244, 206, 112, 255))
    return im.resize((256, 256), Image.Resampling.LANCZOS)

def slash(im):
    big = im.resize((1024, 1024), Image.Resampling.NEAREST)
    overlay = Image.new("RGBA", big.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    def band(width, fill):
        x0, y0, x1, y1 = 150, 210, 874, 860
        dx, dy = x1 - x0, y1 - y0
        length = (dx * dx + dy * dy) ** 0.5
        px, py = -dy / length * width / 2, dx / length * width / 2
        d.polygon([
            (x0 + px, y0 + py), (x1 + px, y1 + py),
            (x1 - px, y1 - py), (x0 - px, y0 - py),
        ], fill=fill)

    band(118, (255, 255, 255, 255))
    band(78, (196, 48, 40, 255))
    out = Image.alpha_composite(big, overlay)
    return out.resize((256, 256), Image.Resampling.LANCZOS)

house().save(start_path, "PNG")
slash(Image.open(start_path).convert("RGBA")).save(stop_path, "PNG")
print(start_path)
print(stop_path)
PY

write_desktop() {
  local path="$1" name="$2" comment="$3" exec="$4" icon="$5"
  cat > "$path" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=$name
Comment=$comment
Exec=$exec
Icon=$icon
Terminal=false
Categories=Graphics;
StartupNotify=false
EOF
  chmod +x "$path"
  gio set "$path" metadata::trusted true
}

write_desktop "$DESKTOP/Дом-start.desktop" "Дом-start" "Запуск 3D-вьювера участка" "$OPEN" "$START_ICON"
write_desktop "$DESKTOP/Дом-stop.desktop" "Дом-stop" "Остановить 3D-вьювер участка" "$STOP" "$STOP_ICON"
rm -f "$DESKTOP/Дом.desktop"
echo "installed $DESKTOP/Дом-start.desktop"
echo "installed $DESKTOP/Дом-stop.desktop"
