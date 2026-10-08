#!/usr/bin/env bash
# Останавливает 3D-вьювер на 127.0.0.1:8766. Чужие процессы не трогает.
set -euo pipefail
killed=0
while read -r pid cmd; do
  case "$cmd" in
    "python3 -m http.server 8766 --bind 127.0.0.1"*)
      kill "$pid" 2>/dev/null || true
      killed=1
      ;;
  esac
done < <(ps -eo pid=,cmd=)
if [[ "$killed" == 0 ]]; then
  echo "not running"
  exit 0
fi
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! ss -ltn | grep -q '127.0.0.1:8766'; then
    echo "stopped"
    exit 0
  fi
  sleep 0.1
done
echo "failed to stop http://127.0.0.1:8766/" >&2
exit 1
