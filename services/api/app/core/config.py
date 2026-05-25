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
(_PROJECT_ROOT / "storage" / "images").mkdir(parents=True, exist_ok=True)


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

    # ── LLM Provider ──────────────────────────────────────────────────────
    # "openai" | "anthropic" | "custom" | "deepseek" | "openrouter" |
    # "glm" | "minimax" | "mimo" | "kimi"
    llm_provider: str = "openai"
    # When llm_provider = "custom", which protocol to speak
    llm_custom_protocol: str = "openai"  # "openai" | "anthropic"
    llm_custom_base_url: str = ""        # e.g. http://localhost:11434/v1
    llm_custom_api_key: str = ""
    llm_custom_model: str = ""           # e.g. llama3.1:8b

    # OpenAI keys (used when llm_provider = "openai" or embedding_provider = "openai")
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"

    # Anthropic keys (used when llm_provider = "anthropic")
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    # ── Additional Provider API Keys ──────────────────────────────────────
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_coding_model: str = "deepseek-coder"

    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4.1-mini"
    openrouter_coding_model: str = ""

    glm_api_key: str = ""
    glm_model: str = "glm-4-plus"
    glm_coding_model: str = ""

    minimax_api_key: str = ""
    minimax_model: str = "MiniMax-Text-01"
    minimax_coding_model: str = ""

    mimo_api_key: str = ""
    mimo_model: str = "MiniMax-M1"
    mimo_coding_model: str = ""

    kimi_api_key: str = ""
    kimi_model: str = "moonshot-v1-8k"
    kimi_coding_model: str = ""

    # ── Behaviour ─────────────────────────────────────────────────────────
    use_mock_ai: bool = True

    # ── Parsing ──────────────────────────────────────────────────────────
    # Priority: "mineru_first" | "docling" | "pypdf" | "ocr"
    parser_priority: str = "mineru_first"

    # ── Server ────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    trust_proxy_headers: bool = False
    trusted_proxies: str = ""

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
