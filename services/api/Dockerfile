# syntax=docker/dockerfile:1

# ── Base ─────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps required by the optional parsers bundled via `.[all]`:
# tesseract + poppler-utils (OCR), libglib2.0-0 / libgomp1 (docling).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        poppler-utils \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/api

# Install dependencies first for better layer caching.
COPY pyproject.toml alembic.ini ./
COPY app ./app
# Keep the image slim: install the optional parser extras except the heavy
# Docling stack (the CUDA/triton torch build a naive ".[all]" would pull is huge).
# Docling can be installed on-demand from the app UI (Settings -> Installed
# Parsers); inside Docker that runtime install is ephemeral unless the
# site-packages live on a volume. MinerU runs via the remote API or the
# mineru-api sidecar, never baked in.
RUN pip install --timeout=60 --retries=5 -e ".[ocr,bibtex,anthropic]"

# ── Runtime ──────────────────────────────────────────────────────────────
FROM base AS runtime

# Persistent data lives on a volume mounted at /data (see docker-compose).
# Absolute paths bypass the repo-root path resolution in config.py.
ENV DATABASE_URL=sqlite:////data/app.sqlite3 \
    STORAGE_DIR=/data/storage \
    ARTICLE_PROCESSOR_DESKTOP_DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8000

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /data && chown -R appuser:appuser /data /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status==200 else 1)" || exit 1

# Apply migrations (env.py overrides the URL from settings) then serve.
# The pipeline worker runs in-process, so a single uvicorn process is enough.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
