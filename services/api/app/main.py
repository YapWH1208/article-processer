"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine, Base
from app.routers import uploads, articles, chat, exports, imports, skills as skills_router, auth, settings_page, dashboard


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
    # Resolve the effective model name based on provider config
    model_name = _resolve_model_name()

    return {
        "status": "ok",
        "version": "0.1.0",
        "mock_ai": settings.use_mock_ai,
        "llm_provider": settings.llm_provider,
        "llm_model": model_name,
        "embedding_provider": settings.embedding_provider,
        "embedding_model": _resolve_embedding_model(),
    }


def _resolve_model_name() -> str:
    """Resolve the effective LLM model name from settings."""
    if settings.use_mock_ai:
        return "mock (no model)"
    provider = settings.llm_provider
    if provider == "openai":
        return settings.openai_model
    elif provider == "anthropic":
        return settings.anthropic_model
    elif provider == "deepseek":
        return settings.deepseek_model
    elif provider == "openrouter":
        return settings.openrouter_model
    elif provider == "glm":
        return settings.glm_model
    elif provider == "minimax":
        return settings.minimax_model
    elif provider == "mimo":
        return settings.mimo_model
    elif provider == "kimi":
        return settings.kimi_model
    elif provider == "custom":
        return settings.llm_custom_model or "custom (no model set)"
    return "unknown"


def _resolve_embedding_model() -> str:
    """Resolve the effective embedding model name from settings."""
    if settings.use_mock_ai:
        return "mock"
    if settings.embedding_provider == "openai":
        return settings.openai_embedding_model
    elif settings.embedding_provider == "custom":
        return settings.embedding_custom_model or "custom"
    return "unknown"


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

# Mount storage/images for extracted figure serving
_images_dir = settings.project_root / "storage" / "images"
_images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage/images", StaticFiles(directory=str(_images_dir)), name="storage_images")
