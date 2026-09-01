FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        ffmpeg \
        libgl1 \
        libegl1 \
        libgl1-mesa-dev \
        libglib2.0-0 \
        libxcb1 \
        libx11-xcb1 \
        libxcb-render0 \
        libxcb-shape0 \
        libxcb-xfixes0 \
        libxrender1 \
        libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip + install build tools
RUN pip install --upgrade pip setuptools wheel

# Install Python dependencies directly (no editable install needed in container)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy application code
COPY . .

# Ensure entrypoint is executable and pre-cache core models
RUN chmod +x /app/docker-entrypoint.sh && \
    python /app/scripts/download_models.py || true

# Expose port
EXPOSE 8000

# Entrypoint automatically verifies models & runs database migrations on startup
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Run with uvicorn (reload enabled for development)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "app"]
