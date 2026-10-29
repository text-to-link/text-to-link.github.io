#!/usr/bin/env bash
# Runs the browser tests. Meant to run inside the Docker image (see the justfile).
# Usage: tools/test.sh [core|e2e|all]
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME_BIN:-google-chrome}"
PORT="${PORT:-8765}"
chrome() { "$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage "$@" 2>/dev/null; }
server=

# prints the <pre id="out"> of a page and fails unless "SUMMARY n/n passed" is there
report() {
  local result
  result=$(sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&amp;/\&/g')
  echo "$result"
  grep -qE "^SUMMARY ([0-9]+)/\1 passed" <<<"$result"
}

core() {
  echo "== core =="
  chrome --dump-dom "file://$PWD/tests/core.test.html" | report
}

e2e() {
  echo "== e2e =="
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  server=$!
  trap 'kill $server 2>/dev/null || true' EXIT
  sleep 1
  chrome --dump-dom --virtual-time-budget=20000 "http://localhost:$PORT/tests/e2e.html" | report
}

case "${1:-all}" in
  core) core ;;
  e2e) e2e ;;
  all) core; e2e ;;
  *) echo "usage: $0 [core|e2e|all]" >&2; exit 2 ;;
esac
