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

# Canonical model choices
AVAILABLE_MODELS = [
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
]
EMBEDDING_MODELS = [
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002",
]


# ── Schemas ──────────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    openai_api_key: str          # masked — only last 4 chars shown
    openai_model: str
    openai_embedding_model: str
    use_mock_ai: bool
    max_upload_mb: int
    host: str
    port: int
    env_path: str                # where .env is stored

    class Config:
        # Model-level, not serialisation — use model_config in pydantic v2
        pass


class SettingsUpdate(BaseModel):
    openai_api_key: str | None = Field(default=None, min_length=0, max_length=256)
    openai_model: str | None = None
    openai_embedding_model: str | None = None
    use_mock_ai: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=500)


# ── Helpers ──────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    """Return a masked version of the API key showing only last 4 chars."""
    if not key:
        return ""
    if len(key) <= 4:
        return "*" * len(key)
    return "*" * (len(key) - 4) + key[-4:]


def _read_env_file() -> dict[str, str]:
    """Parse the .env file into a dict of KEY=VALUE pairs."""
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
    """Write updated env vars back to .env, preserving comments."""
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

    # Append any keys not found in the original file
    for key, value in env_vars.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}")

    DOTENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


# ── Endpoints ────────────────────────────────────────────────────────────

def _fresh_settings() -> SettingsClass:
    """Return a fresh Settings instance re-read from the .env file."""
    cfg = SettingsClass()
    cfg.database_url = cfg.database_url_resolved
    return cfg


@router.get("", response_model=SettingsResponse)
def get_settings():
    """Return current application settings (secrets masked)."""
    cfg = _fresh_settings()
    return SettingsResponse(
        openai_api_key=_mask_key(cfg.openai_api_key),
        openai_model=cfg.openai_model,
        openai_embedding_model=cfg.openai_embedding_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        host=cfg.host,
        port=cfg.port,
        env_path=str(DOTENV_PATH),
    )


@router.put("", response_model=SettingsResponse)
def update_settings(update: SettingsUpdate):
    """Update application settings and persist to .env.

    Only provided fields are updated. Changes take effect immediately
    (the settings singleton is reloaded after the write).
    """
    env_vars = _read_env_file()

    if update.openai_api_key is not None:
        # If the user sends the masked key unchanged, don't overwrite
        if not all(c == "*" for c in update.openai_api_key):
            env_vars["OPENAI_API_KEY"] = update.openai_api_key

    if update.openai_model is not None:
        if update.openai_model not in AVAILABLE_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model '{update.openai_model}'. "
                       f"Available: {', '.join(AVAILABLE_MODELS)}",
            )
        env_vars["OPENAI_MODEL"] = update.openai_model

    if update.openai_embedding_model is not None:
        if update.openai_embedding_model not in EMBEDDING_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown embedding model '{update.openai_embedding_model}'. "
                       f"Available: {', '.join(EMBEDDING_MODELS)}",
            )
        env_vars["OPENAI_EMBEDDING_MODEL"] = update.openai_embedding_model

    if update.use_mock_ai is not None:
        env_vars["USE_MOCK_AI"] = str(update.use_mock_ai).lower()

    if update.max_upload_mb is not None:
        env_vars["MAX_UPLOAD_MB"] = str(update.max_upload_mb)

    try:
        _write_env_file(env_vars)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write .env: {e}")

    # Reload settings so changes take effect in-process
    try:
        reload_settings()
    except Exception as e:
        logger.error(f"Settings reload failed after write: {e}")

    # Return fresh settings
    return get_settings()
