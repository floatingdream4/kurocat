#!/usr/bin/env bash
# Render every BigFish state to one PNG with headless Chrome.
# Usage: tools/render-check/run.sh [output.png]     (run from the repo root, after `npm ci`)
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-render-check.png}"
PORT="${PORT:-8765}"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
npx vite build --config tools/render-check/vite.config.ts >/dev/null
python3 -m http.server "$PORT" --directory tools/render-check/dist >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
"$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=2100,2640 --virtual-time-budget=8000 \
  --screenshot="$OUT" "http://localhost:$PORT/index.html" >/dev/null 2>&1
echo "wrote $OUT"
