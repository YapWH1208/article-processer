"""Settings router — read / write application configuration via .env file."""

import re
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import reload_settings, DOTENV_PATH, _PROJECT_ROOT
from app.core.config import Settings as SettingsClass

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────

PROVIDER_TYPES = ["openai", "anthropic", "custom_openai", "custom_anthropic"]

OPENAI_MODELS = [
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
]
ANTHROPIC_MODELS = [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
    "claude-3-opus-latest",
    "claude-opus-4-20250514",
]
EMBEDDING_MODELS = [
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002",
]


# ── Schemas ──────────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    # Provider
    ai_provider: str
    # OpenAI
    openai_api_key: str          # masked
    openai_model: str
    openai_embedding_model: str
    # Anthropic
    anthropic_api_key: str       # masked
    anthropic_model: str
    # Custom
    custom_api_base: str
    custom_api_key: str          # masked
    custom_model: str
    # Behaviour
    use_mock_ai: bool
    # Limits
    max_upload_mb: int
    # Server (read-only)
    host: str
    port: int
    env_path: str


class SettingsUpdate(BaseModel):
    ai_provider: str | None = None
    openai_api_key: str | None = Field(default=None, max_length=256)
    openai_model: str | None = None
    openai_embedding_model: str | None = None
    anthropic_api_key: str | None = Field(default=None, max_length=256)
    anthropic_model: str | None = None
    custom_api_base: str | None = Field(default=None, max_length=512)
    custom_api_key: str | None = Field(default=None, max_length=256)
    custom_model: str | None = Field(default=None, max_length=256)
    use_mock_ai: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=500)


# ── Helpers ──────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 4:
        return "*" * len(key)
    return "*" * (len(key) - 4) + key[-4:]


def _read_env_file() -> dict[str, str]:
    env_vars: dict[str, str] = {}
    if not DOTENV_PATH.exists():
        return env_vars
    for line in DOTENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            env_vars[key.strip()] = value.strip()
    return env_vars


def _write_env_file(env_vars: dict[str, str]) -> None:
    if not DOTENV_PATH.exists():
        lines: list[str] = []
    else:
        lines = DOTENV_PATH.read_text(encoding="utf-8").splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        if "=" in stripped:
            key = stripped.partition("=")[0].strip()
            if key in env_vars:
                new_lines.append(f"{key}={env_vars[key]}")
                updated_keys.add(key)
            else:
                new_lines.append(line)
        else:
            new_lines.append(line)

    for key, value in env_vars.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}")

    DOTENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _fresh_settings() -> SettingsClass:
    cfg = SettingsClass()
    cfg.database_url = cfg.database_url_resolved
    return cfg


def _build_response(cfg: SettingsClass) -> SettingsResponse:
    return SettingsResponse(
        ai_provider=cfg.ai_provider,
        openai_api_key=_mask_key(cfg.openai_api_key),
        openai_model=cfg.openai_model,
        openai_embedding_model=cfg.openai_embedding_model,
        anthropic_api_key=_mask_key(cfg.anthropic_api_key),
        anthropic_model=cfg.anthropic_model,
        custom_api_base=cfg.custom_api_base,
        custom_api_key=_mask_key(cfg.custom_api_key),
        custom_model=cfg.custom_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        host=cfg.host,
        port=cfg.port,
        env_path=str(DOTENV_PATH),
    )


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=SettingsResponse)
def get_settings():
    """Return current application settings (secrets masked)."""
    return _build_response(_fresh_settings())


@router.put("", response_model=SettingsResponse)
def update_settings(update: SettingsUpdate):
    """Update application settings and persist to .env."""
    env_vars = _read_env_file()

    # ── Provider ──────────────────────────────────────────────────────
    if update.ai_provider is not None:
        if update.ai_provider not in PROVIDER_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown provider '{update.ai_provider}'. "
                       f"Available: {', '.join(PROVIDER_TYPES)}",
            )
        env_vars["AI_PROVIDER"] = update.ai_provider

    # ── OpenAI ─────────────────────────────────────────────────────────
    if update.openai_api_key is not None:
        if not all(c == "*" for c in update.openai_api_key):
            env_vars["OPENAI_API_KEY"] = update.openai_api_key

    if update.openai_model is not None:
        # Allow any model for custom providers, validate only for built-in
        cfg = _fresh_settings()
        if cfg.ai_provider == "openai" and update.openai_model not in OPENAI_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown OpenAI model '{update.openai_model}'.",
            )
        env_vars["OPENAI_MODEL"] = update.openai_model

    if update.openai_embedding_model is not None:
        if update.openai_embedding_model not in EMBEDDING_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown embedding model '{update.openai_embedding_model}'.",
            )
        env_vars["OPENAI_EMBEDDING_MODEL"] = update.openai_embedding_model

    # ── Anthropic ──────────────────────────────────────────────────────
    if update.anthropic_api_key is not None:
        if not all(c == "*" for c in update.anthropic_api_key):
            env_vars["ANTHROPIC_API_KEY"] = update.anthropic_api_key

    if update.anthropic_model is not None:
        # Allow any model name (custom endpoints may use different names)
        env_vars["ANTHROPIC_MODEL"] = update.anthropic_model

    # ── Custom provider ────────────────────────────────────────────────
    if update.custom_api_base is not None:
        env_vars["CUSTOM_API_BASE"] = update.custom_api_base

    if update.custom_api_key is not None:
        if not all(c == "*" for c in update.custom_api_key):
            env_vars["CUSTOM_API_KEY"] = update.custom_api_key

    if update.custom_model is not None:
        env_vars["CUSTOM_MODEL"] = update.custom_model

    # ── Behaviour / Limits ─────────────────────────────────────────────
    if update.use_mock_ai is not None:
        env_vars["USE_MOCK_AI"] = str(update.use_mock_ai).lower()

    if update.max_upload_mb is not None:
        env_vars["MAX_UPLOAD_MB"] = str(update.max_upload_mb)

    try:
        _write_env_file(env_vars)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write .env: {e}")

    try:
        reload_settings()
    except Exception as e:
        logger.error(f"Settings reload failed after write: {e}")

    return get_settings()
