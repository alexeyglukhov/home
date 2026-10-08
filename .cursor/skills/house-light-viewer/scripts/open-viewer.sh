#!/usr/bin/env bash
# Поднимает один 3D-вьювер и показывает его в браузере.
# Если страница уже открыта, новое окно не создаётся — активируется существующее.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
HOUSE="$(cd "$DIR/../../../../house-light" && pwd)"
URL="http://127.0.0.1:8766/"
TITLE="$(sed -n 's:.*<title>\(.*\)</title>.*:\1:p' "$HOUSE/index.html" | head -1)"

"$DIR/start-viewer.sh"

# Cinnamon при запуске ярлыка задаёт GIO_LAUNCHED_DESKTOP_FILE, и тогда
# запуск Chrome может открыть ещё одну копию вместо уже открытого окна.
unset GIO_LAUNCHED_DESKTOP_FILE GIO_LAUNCHED_DESKTOP_FILE_PID || true

if [[ -n "$TITLE" ]] && wmctrl -a "$TITLE"; then
  exit 0
fi

if command -v google-chrome >/dev/null 2>&1; then
  nohup google-chrome "$URL" >/dev/null 2>&1 &
else
  nohup xdg-open "$URL" >/dev/null 2>&1 &
fi
disown || true
