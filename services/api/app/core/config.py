"""Application configuration loaded from environment variables.

All relative paths are resolved against the project root (the repo root,
containing services/, apps/, data/, storage/), NOT the current working
directory.  This makes the app safe to start from any CWD.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# ── Project root detection ───────────────────────────────────────────────
# config.py lives at <project-root>/services/api/app/core/config.py
# Walk up: core → app → api → services → project root (4 levels)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent

# Ensure data/ and storage/ directories exist
(_PROJECT_ROOT / "data").mkdir(exist_ok=True)
(_PROJECT_ROOT / "storage" / "uploads").mkdir(parents=True, exist_ok=True)
(_PROJECT_ROOT / "storage" / "markdown").mkdir(parents=True, exist_ok=True)
(_PROJECT_ROOT / "storage" / "exports").mkdir(parents=True, exist_ok=True)


def _resolve_path(raw: str) -> str:
    """If *raw* starts with ``./``, resolve it against the project root."""
    if raw.startswith("./"):
        return str(_PROJECT_ROOT / raw[2:])
    return raw


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / "services" / "api" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./data/app.sqlite3"

    # ── Storage ───────────────────────────────────────────────────────────
    storage_dir: str = "./storage"
    max_upload_mb: int = 50

    # ── AI ────────────────────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    use_mock_ai: bool = True

    # ── Server ────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    # ── Resolved helpers ──────────────────────────────────────────────────

    @property
    def database_url_resolved(self) -> str:
        """Return database_url with ``./`` resolved to project root."""
        url = self.database_url
        # sqlite:///./data/app.sqlite3 → sqlite:///<project-root>/data/app.sqlite3
        if "sqlite:///./" in url:
            prefix, rel = url.split("sqlite:///./", 1)
            return f"{prefix}sqlite:///{_PROJECT_ROOT / rel}"
        return url

    @property
    def storage_path(self) -> Path:
        return Path(_resolve_path(self.storage_dir))

    @property
    def uploads_path(self) -> Path:
        return self.storage_path / "uploads"

    @property
    def markdown_path(self) -> Path:
        return self.storage_path / "markdown"

    @property
    def exports_path(self) -> Path:
        return self.storage_path / "exports"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def project_root(self) -> Path:
        return _PROJECT_ROOT


# Expose the .env path for the settings router
DOTENV_PATH = _PROJECT_ROOT / "services" / "api" / ".env"


def reload_settings() -> None:
    """Hot-reload settings from the .env file — used by PUT /settings.

    Mutates the global ``settings`` singleton in-place so existing
    references pick up the new values without a restart.
    """
    global settings
    new_settings = Settings()
    # Copy the resolved paths
    new_settings.database_url = new_settings.database_url_resolved
    new_settings.storage_dir = _resolve_path(new_settings.storage_dir)
    settings = new_settings


settings = Settings()

# Patch the database URL used by SQLAlchemy / Alembic
settings.database_url = settings.database_url_resolved
settings.storage_dir = _resolve_path(settings.storage_dir)
