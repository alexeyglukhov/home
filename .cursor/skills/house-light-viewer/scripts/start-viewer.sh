#!/usr/bin/env bash
# Поднимает 3D-вьювер дома на 127.0.0.1:8766, если он ещё не слушает порт.
set -euo pipefail
HOUSE="$(cd "$(dirname "$0")/../../../../house-light" && pwd)"
URL="http://127.0.0.1:8766/"

if curl -sf -o /dev/null --max-time 2 "$URL"; then
  echo "already $URL"
  exit 0
fi

cd "$HOUSE"
nohup python3 -m http.server 8766 --bind 127.0.0.1 >/dev/null 2>&1 &
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -o /dev/null --max-time 1 "$URL"; then
    echo "started $URL"
    exit 0
  fi
  sleep 0.2
done
echo "failed to start $URL" >&2
exit 1
