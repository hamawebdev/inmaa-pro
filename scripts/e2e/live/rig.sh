#!/usr/bin/env bash
# The live test's mailbox: relay/ copied to a scratch folder and run by `wrangler dev` (Cloudflare's own runtime,
# workerd, on this machine), reachable over real HTTPS through a Cloudflare quick tunnel (no account needed).
#
#   scripts/e2e/live/rig.sh start    # prints the https origin; writes it and the setup key under $LIVE_DIR
#   scripts/e2e/live/rig.sh stop
#
# The tools are installed outside the repository: LIVE_TOOLS holds node_modules/.bin/wrangler and cloudflared.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
LIVE_DIR=${LIVE_DIR:-/mnt/data/inmaa-phone-verify/live-rig}
LIVE_TOOLS=${LIVE_TOOLS:-/mnt/data/inmaa-phone-verify/tools}
PORT=${LIVE_PORT:-8787}

stop() {
  # Everything run from the tools folder (wrangler, its workerd, cloudflared), by what it runs: setsid may fork, and a
  # saved pid could name another process. Wrangler waits on SIGTERM; it gets SIGKILL after five seconds.
  pkill -TERM -f "^[^ ]*node[^ ]* .*$LIVE_TOOLS/" 2>/dev/null || true
  pkill -TERM -f "^$LIVE_TOOLS/" 2>/dev/null || true
  for _ in 1 2 3 4 5; do pgrep -f "$LIVE_TOOLS/" >/dev/null || break; sleep 1; done
  pkill -KILL -f "^[^ ]*node[^ ]* .*$LIVE_TOOLS/" 2>/dev/null || true
  pkill -KILL -f "^$LIVE_TOOLS/" 2>/dev/null || true
  rm -f "$LIVE_DIR"/*.pid
  echo "stopped"
}

start() {
  stop >/dev/null
  rm -rf "$LIVE_DIR/relay"
  mkdir -p "$LIVE_DIR/relay"
  rsync -a --exclude .wrangler --exclude .dev.vars "$REPO/relay/" "$LIVE_DIR/relay/"
  (cd "$REPO" && git rev-parse HEAD && git status --short relay | head -20) >"$LIVE_DIR/relay.version" || true
  sha256sum "$LIVE_DIR"/relay/src/*.ts >>"$LIVE_DIR/relay.version"
  key=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  printf 'SETUP_KEY=%s\n' "$key" >"$LIVE_DIR/relay/.dev.vars"
  printf '%s\n' "$key" >"$LIVE_DIR/setup-key.txt"
  (cd "$LIVE_DIR/relay" && setsid "$LIVE_TOOLS/node_modules/.bin/wrangler" dev --local --ip 127.0.0.1 --port "$PORT" \
    >"$LIVE_DIR/wrangler.log" 2>&1 & echo $! >"$LIVE_DIR/wrangler.pid")
  for _ in $(seq 1 90); do
    curl -s -o /dev/null --max-time 5 -H 'x-inmaa-protocol: 2' "http://127.0.0.1:$PORT/v1/time" && break
    sleep 2
  done
  origin=""
  # The quick-tunnel service sometimes times out: up to three tries. Its own name is api.trycloudflare.com; a
  # tunnel's name is words joined by hyphens.
  for _try in 1 2 3; do
    (setsid "$LIVE_TOOLS/cloudflared" tunnel --no-autoupdate --protocol http2 --url "http://127.0.0.1:$PORT" \
      >"$LIVE_DIR/cloudflared.log" 2>&1 & echo $! >"$LIVE_DIR/cloudflared.pid")
    for _ in $(seq 1 45); do
      origin=$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' "$LIVE_DIR/cloudflared.log" | head -1 || true)
      [ -n "$origin" ] && break
      grep -q "failed to request quick Tunnel" "$LIVE_DIR/cloudflared.log" && break
      sleep 2
    done
    [ -n "$origin" ] && break
    pkill -TERM -f "$LIVE_TOOLS/cloudflared tunnel" 2>/dev/null || true
    sleep 5
  done
  [ -n "$origin" ] || { echo "no tunnel address; see $LIVE_DIR/cloudflared.log" >&2; exit 1; }
  printf '%s\n' "$origin" >"$LIVE_DIR/origin.txt"
  # The tunnel takes a little while to answer after it has an address.
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'x-inmaa-protocol: 2' "$origin/v1/time")" = 200 ] && break
    sleep 3
  done
  curl -s -i --max-time 10 -H 'x-inmaa-protocol: 2' "$origin/v1/time" | grep -iE '^HTTP|x-relay-time'
  echo "$origin"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
