#!/bin/sh
set -e

echo "============================================================"
echo "          AURA AI 2.0 -- Backend Container Startup          "
echo "============================================================"

# 1. Ensure required local models exist (downloads automatically if missing)
if [ ! -f "/app/models/face/mediapipe/face_landmarker.task" ] || [ ! -f "/app/models/face/ferplus/emotion-ferplus-8.onnx" ]; then
    echo "[*] Checking/downloading local models..."
    python /app/scripts/download_models.py || true
fi

# 2. Automatically apply any pending database migrations
echo "[*] Running database migrations..."
alembic upgrade head || {
    echo "[WARNING] Database migration failed on first attempt. Waiting for PostgreSQL..."
    sleep 3
    alembic upgrade head || echo "[WARNING] Alembic migration skipped or failed."
}

# 3. Start the application
echo "[*] Starting Aura AI 2.0 Backend..."
exec "$@"
