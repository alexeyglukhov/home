#!/usr/bin/env bash
# Поднимает 3D-вьювер дома на 0.0.0.0:8766, если он ещё не слушает порт.
# Локально открывается как http://127.0.0.1:8766/, с других машин — по LAN-адресу.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
HOUSE="$(cd "$DIR/../../../../house-light" && pwd)"
URL="http://127.0.0.1:8766/"
LOCK="${XDG_RUNTIME_DIR:-/tmp}/house-light-viewer.lock"
VIEWER_PASSWORD='tlstr2'

viewer_up() {
  curl -sf -o /dev/null --max-time 2 "$URL"
}

if viewer_up; then
  echo "already $URL"
  exit 0
fi

mkdir -p "$(dirname "$LOCK")"
exec 9>"$LOCK"
flock 9

if viewer_up; then
  echo "already $URL"
  exit 0
fi

cd "$HOUSE"
HOUSE_VIEWER_PASSWORD="$VIEWER_PASSWORD" nohup python3 "$DIR/serve-viewer.py" >/dev/null 2>&1 &
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if viewer_up; then
    echo "started $URL"
    exit 0
  fi
  sleep 0.2
done
echo "failed to start $URL" >&2
exit 1
