#!/usr/bin/env bash
# Starts and stops Bluebird as a normal app: database, API and web page together.
#   bluebird start   start everything in the background and open the browser
#   bluebird stop    stop it
#   bluebird status  show what is running
#   bluebird open    open the browser
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.data/run"
WEB_PORT="${BLUEBIRD_PORT:-3000}"
mkdir -p "$RUN"

alive() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }

open_browser() {
  local url="http://localhost:$WEB_PORT"
  if command -v open >/dev/null 2>&1; then open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
  fi
  echo "Bluebird is at $url"
}

wait_for() { # url, seconds
  for _ in $(seq 1 "$2"); do
    if curl -fsS -o /dev/null "$1" 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

start() {
  cd "$ROOT"
  export LC_ALL="${LC_ALL:-en_US.UTF-8}"
  bash scripts/dev-db.sh up
  if [ ! -d apps/api/dist ] || [ ! -d apps/web/.next ]; then
    echo "Building Bluebird (first start only)..."
    pnpm build
  fi
  pnpm db:migrate >/dev/null
  if ! alive api; then
    (cd apps/api && nohup pnpm start >"$RUN/api.log" 2>&1 & echo $! >"$RUN/api.pid")
  fi
  if ! alive web; then
    (cd apps/web && nohup pnpm exec next start -p "$WEB_PORT" >"$RUN/web.log" 2>&1 & echo $! >"$RUN/web.pid")
  fi
  if wait_for "http://localhost:$WEB_PORT" 60; then open_browser
  else echo "Bluebird did not answer in time. See $RUN/web.log and $RUN/api.log." >&2; exit 1; fi
}

stop() {
  for name in web api; do
    if alive "$name"; then
      pkill -P "$(cat "$RUN/$name.pid")" 2>/dev/null || true
      kill "$(cat "$RUN/$name.pid")" 2>/dev/null || true
      echo "Stopped $name."
    fi
    rm -f "$RUN/$name.pid"
  done
  (cd "$ROOT" && bash scripts/dev-db.sh down) || true
}

status() {
  for name in api web; do
    if alive "$name"; then echo "$name: running"; else echo "$name: stopped"; fi
  done
  (cd "$ROOT" && bash scripts/dev-db.sh status 2>&1 | head -1) || true
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  open) open_browser ;;
  *) echo "Usage: bluebird [start|stop|restart|status|open]" >&2; exit 2 ;;
esac
