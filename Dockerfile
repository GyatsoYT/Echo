# Multi-stage / clean Python 3.11 image
FROM python:3.11-slim

# Prevent writing .pyc and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

WORKDIR /app

# Install build dependencies for C-extensions (numpy, pillow, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies in an isolated layer for Docker caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Ensure upload and data directories exist
RUN mkdir -p /data/audio /data static/audio

EXPOSE 5000

# Run gunicorn with production configuration
CMD ["sh", "-c", "gunicorn app:app --workers 2 --threads 2 --worker-class gthread --bind 0.0.0.0:${PORT:-5000} --timeout 120"]
