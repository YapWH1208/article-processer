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
_APP_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
_PROJECT_ROOT = _APP_ROOT
_DESKTOP_DATA_DIR = os.environ.get("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR", "").strip()
_DATA_ROOT = (
    Path(_DESKTOP_DATA_DIR).expanduser().resolve()
    if _DESKTOP_DATA_DIR
    else _APP_ROOT
)

# Ensure data/ and storage/ directories exist
(_DATA_ROOT / "data").mkdir(parents=True, exist_ok=True)
(_DATA_ROOT / "storage" / "uploads").mkdir(parents=True, exist_ok=True)
(_DATA_ROOT / "storage" / "markdown").mkdir(parents=True, exist_ok=True)
(_DATA_ROOT / "storage" / "exports").mkdir(parents=True, exist_ok=True)
(_DATA_ROOT / "storage" / "images").mkdir(parents=True, exist_ok=True)


def _resolve_path(raw: str) -> str:
    """If *raw* starts with ``./``, resolve it against the mutable data root."""
    if raw.startswith("./"):
        return str(_DATA_ROOT / raw[2:])
    return raw


def _resolve_sqlite_url(raw: str) -> str:
    """Resolve sqlite URLs with ``./`` paths against the mutable data root."""
    if "sqlite:///./" in raw:
        prefix, rel = raw.split("sqlite:///./", 1)
        return f"{prefix}sqlite:///{_DATA_ROOT / rel}"
    return raw


def _settings_env_path() -> Path:
    desktop_env_path = _DATA_ROOT / ".env"
    if _DESKTOP_DATA_DIR:
        return desktop_env_path
    return _APP_ROOT / "services" / "api" / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_settings_env_path()),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./data/app.sqlite3"

    # ── Storage ───────────────────────────────────────────────────────────
    storage_dir: str = "./storage"
    max_upload_mb: int = 50

    # ── Scholarly source authentication ──────────────────────────────────
    # Used only for exact-origin requests to https://api2.openreview.net.
    openreview_username: str = ""
    openreview_password: str = ""
    openreview_access_token: str = ""

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
    # Priority: "mineru_only" | "mineru_first" | "docling" | "pypdf" | "ocr"
    # "mineru_only" (default) is strict: if MinerU is not installed or configured,
    # PDF parsing fails with an error rather than silently falling back.
    # "mineru_first" prefers MinerU but falls back to Docling, then pypdf.
    parser_priority: str = "mineru_only"

    # ── MinerU API ───────────────────────────────────────────────────────
    # When enabled, the MinerU parser strategy uses a remote MinerU service
    # instead of (or before) a local install. No local mineru package needed.
    mineru_api_enabled: bool = False
    # "cloud" = MinerU Precision API (mineru.net, requires key)
    # "selfhosted" = local mineru-api service (POST /tasks, no key needed)
    mineru_api_mode: str = "cloud"
    mineru_api_key: str = ""
    mineru_api_base_url: str = "https://mineru.net"
    # "pipeline" | "vlm" | "MinerU-HTML"
    mineru_api_model: str = "pipeline"
    mineru_api_enable_formula: bool = True
    mineru_api_is_ocr: bool = False
    mineru_api_language: str = "en"
    mineru_api_timeout_seconds: int = 600
    mineru_api_poll_interval: int = 3

    # ── Public base URL ──────────────────────────────────────────────────
    # Used to build absolute image URLs in parsed markdown (defaults to
    # http://localhost:8000 when empty). Override for Docker/remote deploys.
    api_base_url: str = ""

    # ── Server ────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    trust_proxy_headers: bool = False
    trusted_proxies: str = ""

    # ── Resolved helpers ──────────────────────────────────────────────────

    @property
    def database_url_resolved(self) -> str:
        """Return database_url with ``./`` resolved to the mutable data root."""
        return _resolve_sqlite_url(self.database_url)

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
    def images_path(self) -> Path:
        return self.storage_path / "images"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def project_root(self) -> Path:
        return _PROJECT_ROOT

    @property
    def data_path(self) -> Path:
        return _DATA_ROOT


# Expose the .env path for the settings router
DOTENV_PATH = _settings_env_path()

# URL path prefix (no leading slash) of the extracted-images static mount.
# Kept in sync with main.py's `app.mount("/storage/images", ...)`; parsers use
# it to build absolute image URLs in parsed markdown.
IMAGES_URL_PREFIX = "storage/images"


def reload_settings() -> None:
    """Hot-reload settings from the .env file — used by PUT /settings.

    Mutates the global ``settings`` singleton in-place so existing
    references pick up the new values without a restart.
    """
    new_settings = Settings()
    # Copy the resolved paths
    new_settings.database_url = _resolve_sqlite_url(new_settings.database_url)
    new_settings.storage_dir = _resolve_path(new_settings.storage_dir)
    # Preserve the singleton identity so modules that imported ``settings`` keep
    # seeing updates made through PUT /settings.
    for field_name in Settings.model_fields:
        setattr(settings, field_name, getattr(new_settings, field_name))


settings = Settings()

# Patch the database URL used by SQLAlchemy / Alembic
settings.database_url = _resolve_sqlite_url(settings.database_url)
settings.storage_dir = _resolve_path(settings.storage_dir)
