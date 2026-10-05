#!/bin/sh
set -e

echo "============================================================"
echo "          AURA AI 2.0 -- Backend Container Startup          "
echo "============================================================"

# 0. Clean up any stale Hugging Face lock files from previous crashes/restarts
echo "[*] Cleaning up any stale Hugging Face locks..."
rm -rf /root/.cache/huggingface/hub/.locks/* 2>/dev/null || true
rm -rf ~/.cache/huggingface/hub/.locks/* 2>/dev/null || true
rm -rf /app/models/cache/hub/.locks/* 2>/dev/null || true
find / -name "*.lock" -path "*/.locks/*" -delete 2>/dev/null || true

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
