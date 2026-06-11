#!/bin/sh
set -e

DB_PATH="/app/db/custom.db"
DB_URL="file:$DB_PATH"

echo "=== Sorteo App - Startup ==="

# ── Database ─────────────────────────────────────────────
if [ ! -f "$DB_PATH" ]; then
    echo "[DB] No database found, initializing..."
    DATABASE_URL="$DB_URL" bunx prisma db push --skip-generate
    echo "[DB] Database initialized at $DB_PATH"
else
    echo "[DB] Database found at $DB_PATH"
    # Apply any pending schema changes
    DATABASE_URL="$DB_URL" bunx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true
fi

export DATABASE_URL="$DB_URL"

# ── Next.js ───────────────────────────────────────────────
echo "[Next.js] Starting on port 3000..."
cd /app/.next/standalone/
NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATABASE_URL="$DATABASE_URL" bun server.js &
NEXT_PID=$!
cd /app

sleep 2
if ! kill -0 "$NEXT_PID" 2>/dev/null; then
    echo "[Next.js] FAILED to start"
    exit 1
fi
echo "[Next.js] Running (PID: $NEXT_PID)"

# ── WebSocket server ──────────────────────────────────────
echo "[WS] Starting WebSocket server on port 3003..."
bun /app/mini-services-dist/mini-service-sorteo-ws.js &
WS_PID=$!

sleep 1
if ! kill -0 "$WS_PID" 2>/dev/null; then
    echo "[WS] FAILED to start"
    exit 1
fi
echo "[WS] Running (PID: $WS_PID)"

# ── Graceful shutdown ─────────────────────────────────────
cleanup() {
    echo "[Shutdown] Stopping services..."
    kill -TERM "$NEXT_PID" "$WS_PID" 2>/dev/null || true
    wait "$NEXT_PID" "$WS_PID" 2>/dev/null || true
    echo "[Shutdown] Done"
    exit 0
}
trap cleanup SIGTERM SIGINT

echo ""
echo "=== All services started ==="
echo "    Caddy  → :81 (reverse proxy)"
echo "    Next.js → :3000"
echo "    WS      → :3003"
echo ""

# ── Caddy (foreground = main process) ────────────────────
exec caddy run --config /app/Caddyfile --adapter caddyfile
