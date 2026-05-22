"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import engine, Base
from app.routers import uploads, articles, chat, exports, imports, skills as skills_router, auth, settings_page


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
    return {
        "status": "ok",
        "version": "0.1.0",
        "mock_ai": settings.use_mock_ai,
    }


# Register routers
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(articles.router, prefix="/articles", tags=["articles"])
app.include_router(chat.router, prefix="/articles", tags=["chat"])
app.include_router(exports.router, prefix="/articles", tags=["exports"])
app.include_router(imports.router, prefix="/imports", tags=["imports"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(settings_page.router, prefix="/settings", tags=["settings"])
app.include_router(skills_router.router, prefix="/skills", tags=["skills"])
