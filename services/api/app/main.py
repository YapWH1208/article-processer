"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine, Base
from app.routers import uploads, articles, chat, exports, imports, skills as skills_router, auth, settings_page, dashboard, dev


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
    yield


app = FastAPI(
    title="Article Processor API",
    description="Document ingestion, AI extraction, RAG Q&A, and graph analysis",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    # Resolve the effective model names based on provider config
    llm_model = _resolve_model_name()
    emb_model = _resolve_embedding_model()

    return {
        "status": "ok",
        "version": "0.1.0",
        "mock_ai": settings.use_mock_ai,
        "llm_provider": settings.llm_provider,
        "llm_model": llm_model,
        "llm_custom_protocol": settings.llm_custom_protocol if settings.llm_provider == "custom" else None,
        "embedding_provider": settings.embedding_provider,
        "embedding_model": emb_model,
        "embedding_custom_protocol": settings.embedding_custom_base_url if settings.embedding_provider == "custom" else None,
    }


def _resolve_model_name() -> str:
    """Resolve the effective LLM model name from settings.

    Mirrors the logic in ``get_llm_provider()`` factory so the health
    endpoint always reports the model that would actually be used,
    including fallback annotations.
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


def _resolve_embedding_model() -> str:
    """Resolve the effective embedding model name from settings.

    Mirrors the logic in ``get_embedding_provider()`` factory so the
    health endpoint always reports the model that would actually be used.
    """
    if settings.use_mock_ai:
        return "mock"
    if settings.embedding_provider == "openai":
        if settings.openai_api_key:
            return settings.openai_embedding_model
        else:
            return f"{settings.openai_embedding_model} (no key — will fall back to mock)"
    elif settings.embedding_provider == "custom":
        if settings.embedding_custom_base_url and settings.embedding_custom_model:
            return settings.embedding_custom_model
        elif settings.embedding_custom_model:
            return f"{settings.embedding_custom_model} (no endpoint — will fall back to mock)"
        else:
            return "custom (no model configured)"
    return f"unknown provider: {settings.embedding_provider}"


# Register routers
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(articles.router, prefix="/articles", tags=["articles"])
app.include_router(chat.router, prefix="/articles", tags=["chat"])
app.include_router(exports.router, prefix="/articles", tags=["exports"])
app.include_router(imports.router, prefix="/imports", tags=["imports"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(settings_page.router, prefix="/settings", tags=["settings"])
app.include_router(skills_router.router, prefix="/skills", tags=["skills"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(dev.router, prefix="/dev", tags=["dev"])

# Mount storage/images for extracted figure serving
_images_dir = settings.project_root / "storage" / "images"
_images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage/images", StaticFiles(directory=str(_images_dir)), name="storage_images")
