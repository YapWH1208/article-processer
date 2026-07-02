"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path as _Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.rate_limit import RateLimitMiddleware
from app.db.session import engine, Base
from app.routers import uploads, articles, chat, exports, imports, skills as skills_router, settings_page, dashboard, dev
from app.services.pipeline.processor import ensure_pipeline_worker_started, resume_incomplete_pipeline_jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown."""
    setup_logging()
    # Create tables if they don't exist (for development convenience)
    # In production, use Alembic migrations.
    Base.metadata.create_all(bind=engine)
    # Ensure storage directories exist
    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    settings.markdown_path.mkdir(parents=True, exist_ok=True)
    settings.exports_path.mkdir(parents=True, exist_ok=True)
    (settings.project_root / "storage" / "images").mkdir(parents=True, exist_ok=True)
    resume_incomplete_pipeline_jobs()
    ensure_pipeline_worker_started()
    yield


app = FastAPI(
    title="Article Processor API",
    description="Document ingestion, AI extraction, RAG Q&A, and graph analysis",
    version="0.1.0",
    lifespan=lifespan,
)

# Add rate limiting before CORS. In Starlette/FastAPI, the last-added
# middleware runs first, so CORS wraps the limiter and 429 responses include
# CORS headers for browsers.
app.add_middleware(RateLimitMiddleware)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health_check():
    # Check dev_config for multi-provider active entry first (matches get_llm_provider priority)
    _active_name, _active_model, _active_protocol, _active_type = _resolve_active_provider()
    if _active_name:
        return {
            "status": "ok",
            "version": "0.1.0",
            "mock_ai": settings.use_mock_ai,
            "llm_provider": _active_type or "custom",
            "llm_model": _active_model or "unknown",
            "llm_provider_name": _active_name,
            "llm_custom_protocol": _active_protocol if _active_type == "custom" else None,
        }

    # Fall back to env-based settings
    llm_model = _resolve_model_name()
    return {
        "status": "ok",
        "version": "0.1.0",
        "mock_ai": settings.use_mock_ai,
        "llm_provider": settings.llm_provider,
        "llm_model": llm_model,
        "llm_custom_protocol": settings.llm_custom_protocol if settings.llm_provider == "custom" else None,
    }


def _resolve_active_provider() -> tuple[str | None, str | None, str | None, str | None]:
    """Check dev_config.json for the active multi-provider entry.

    Returns (name, model, protocol, type) or (None, None, None, None).
    """
    import json
    from pathlib import Path
    dev_config_path = settings.project_root / "data" / "dev_config.json"
    if not dev_config_path.exists():
        return None, None, None, None
    try:
        with open(dev_config_path, "r") as f:
            config = json.load(f)
        providers = config.get("providers", [])
        active_id = config.get("active_provider_id")
        if providers and active_id:
            for p in providers:
                if p.get("id") == active_id:
                    return p.get("name"), p.get("model"), p.get("protocol"), p.get("type")
    except (json.JSONDecodeError, OSError):
        pass
    return None, None, None, None


def _resolve_model_name() -> str:
    """Resolve the effective LLM model name from env settings.

    Mirrors the legacy fallback in ``get_llm_provider()``.
    """
    if settings.use_mock_ai:
        return "mock (no model)"

    provider = settings.llm_provider
    no_key_suffix = " (no key — falls back to mock)"

    if provider == "openai":
        return settings.openai_model if settings.openai_api_key else f"{settings.openai_model}{no_key_suffix}"
    elif provider == "anthropic":
        return settings.anthropic_model if settings.anthropic_api_key else f"{settings.anthropic_model}{no_key_suffix}"
    elif provider == "deepseek":
        return settings.deepseek_model if settings.deepseek_api_key else f"{settings.deepseek_model}{no_key_suffix}"
    elif provider == "openrouter":
        return settings.openrouter_model if settings.openrouter_api_key else f"{settings.openrouter_model}{no_key_suffix}"
    elif provider == "glm":
        return settings.glm_model if settings.glm_api_key else f"{settings.glm_model}{no_key_suffix}"
    elif provider == "minimax":
        return settings.minimax_model if settings.minimax_api_key else f"{settings.minimax_model}{no_key_suffix}"
    elif provider == "mimo":
        return settings.mimo_model if settings.mimo_api_key else f"{settings.mimo_model}{no_key_suffix}"
    elif provider == "kimi":
        return settings.kimi_model if settings.kimi_api_key else f"{settings.kimi_model}{no_key_suffix}"
    elif provider == "custom":
        if settings.llm_custom_model:
            return settings.llm_custom_model
        else:
            return "custom (no model configured)"
    return "unknown"


# Register routers
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(articles.router, prefix="/articles", tags=["articles"])
app.include_router(chat.router, prefix="/articles", tags=["chat"])
app.include_router(exports.router, prefix="/articles", tags=["exports"])
app.include_router(imports.router, prefix="/imports", tags=["imports"])
app.include_router(settings_page.router, prefix="/settings", tags=["settings"])
app.include_router(skills_router.router, prefix="/skills", tags=["skills"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(dev.router, prefix="/dev", tags=["dev"])

# ── Extracted image serving ─────────────────────────────────────────────────

_images_dir = settings.project_root / "storage" / "images"
_images_dir.mkdir(parents=True, exist_ok=True)


def _find_image_path(filename: str) -> _Path | None:
    """Walk storage/images/ to find a file by name (handles timestamped subdirs)."""
    import os as _os
    for dirpath, _dirnames, filenames in _os.walk(str(_images_dir)):
        if filename in filenames:
            return _Path(dirpath) / filename
    return None


@app.get("/images/{filename:path}")
async def serve_extracted_image(filename: str):
    """Serve an extracted image by filename, searching storage/images/ tree.

    This handles the case where images are stored in timestamped subdirectories
    (storage/images/ts/hash.jpg) but referenced as /images/hash.jpg in markdown.
    """
    # Sanity check: only serve image file extensions
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp"}
    ext = _Path(filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=404, detail="Not found")

    file_path = _find_image_path(_Path(filename).name)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(str(file_path))


# Mount storage/images for direct subdirectory access
app.mount("/storage/images", StaticFiles(directory=str(_images_dir)), name="storage_images")
