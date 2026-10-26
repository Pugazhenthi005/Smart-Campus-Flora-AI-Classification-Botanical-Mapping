FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KERAS_HOME=/app/.keras \
    MPLCONFIGDIR=/app/.matplotlib \
    TF_ENABLE_ONEDNN_OPTS=0 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    PORT=8000

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application assets
COPY backend/ /app/backend/
COPY dataset/ /app/dataset/
COPY frontend/ /app/frontend/

# Ensure workspace-local cache directories
RUN mkdir -p /app/.keras /app/.matplotlib

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/api/health || exit 1

# Start server using dynamic PORT assigned by cloud provider
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir /app/backend
