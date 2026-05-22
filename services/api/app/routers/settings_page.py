"""Settings router — read / write application configuration via .env file."""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import reload_settings, DOTENV_PATH
from app.core.config import Settings as SettingsClass

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────

LLM_PROVIDERS = ["openai", "anthropic", "custom"]
LLM_CUSTOM_PROTOCOLS = ["openai", "anthropic"]
EMBEDDING_PROVIDERS = ["openai", "custom"]

OPENAI_MODELS = ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
ANTHROPIC_MODELS = [
    "claude-sonnet-4-20250514", "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest", "claude-3-opus-latest", "claude-opus-4-20250514",
]
EMBEDDING_MODELS = ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"]


# ── Schemas ──────────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    # LLM
    llm_provider: str
    llm_custom_protocol: str
    llm_custom_base_url: str
    llm_custom_api_key: str       # masked
    llm_custom_model: str
    openai_api_key: str            # masked
    openai_model: str
    anthropic_api_key: str         # masked
    anthropic_model: str
    # Embedding
    embedding_provider: str
    embedding_custom_base_url: str
    embedding_custom_api_key: str  # masked
    embedding_custom_model: str
    openai_embedding_model: str
    # Behaviour
    use_mock_ai: bool
    max_upload_mb: int
    # Server (read-only)
    host: str
    port: int
    env_path: str


class SettingsUpdate(BaseModel):
    # LLM
    llm_provider: str | None = None
    llm_custom_protocol: str | None = None
    llm_custom_base_url: str | None = Field(default=None, max_length=512)
    llm_custom_api_key: str | None = Field(default=None, max_length=256)
    llm_custom_model: str | None = Field(default=None, max_length=256)
    openai_api_key: str | None = Field(default=None, max_length=256)
    openai_model: str | None = None
    anthropic_api_key: str | None = Field(default=None, max_length=256)
    anthropic_model: str | None = None
    # Embedding
    embedding_provider: str | None = None
    embedding_custom_base_url: str | None = Field(default=None, max_length=512)
    embedding_custom_api_key: str | None = Field(default=None, max_length=256)
    embedding_custom_model: str | None = Field(default=None, max_length=256)
    openai_embedding_model: str | None = None
    # Behaviour
    use_mock_ai: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=500)


# ── Helpers ──────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    if not key: return ""
    if len(key) <= 4: return "*" * len(key)
    return "*" * (len(key) - 4) + key[-4:]


def _read_env_file() -> dict[str, str]:
    env_vars: dict[str, str] = {}
    if not DOTENV_PATH.exists(): return env_vars
    for line in DOTENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"): continue
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

    # Remove the old AI_PROVIDER key (migrated to LLM_PROVIDER)
    old_keys = {"AI_PROVIDER", "CUSTOM_API_BASE", "CUSTOM_API_KEY", "CUSTOM_MODEL"}

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue
        if "=" in stripped:
            key = stripped.partition("=")[0].strip()
            if key in old_keys:
                continue  # drop old keys
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
        llm_provider=cfg.llm_provider,
        llm_custom_protocol=cfg.llm_custom_protocol,
        llm_custom_base_url=cfg.llm_custom_base_url,
        llm_custom_api_key=_mask_key(cfg.llm_custom_api_key),
        llm_custom_model=cfg.llm_custom_model,
        openai_api_key=_mask_key(cfg.openai_api_key),
        openai_model=cfg.openai_model,
        anthropic_api_key=_mask_key(cfg.anthropic_api_key),
        anthropic_model=cfg.anthropic_model,
        embedding_provider=cfg.embedding_provider,
        embedding_custom_base_url=cfg.embedding_custom_base_url,
        embedding_custom_api_key=_mask_key(cfg.embedding_custom_api_key),
        embedding_custom_model=cfg.embedding_custom_model,
        openai_embedding_model=cfg.openai_embedding_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        host=cfg.host, port=cfg.port,
        env_path=str(DOTENV_PATH),
    )


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=SettingsResponse)
def get_settings():
    return _build_response(_fresh_settings())


@router.put("", response_model=SettingsResponse)
def update_settings(update: SettingsUpdate):
    env_vars = _read_env_file()

    # ── LLM ──────────────────────────────────────────────────────────
    if update.llm_provider is not None:
        if update.llm_provider not in LLM_PROVIDERS:
            raise HTTPException(400, f"Unknown LLM provider: {update.llm_provider}")
        env_vars["LLM_PROVIDER"] = update.llm_provider

    if update.llm_custom_protocol is not None:
        if update.llm_custom_protocol not in LLM_CUSTOM_PROTOCOLS:
            raise HTTPException(400, f"Unknown protocol: {update.llm_custom_protocol}")
        env_vars["LLM_CUSTOM_PROTOCOL"] = update.llm_custom_protocol

    if update.llm_custom_base_url is not None:
        env_vars["LLM_CUSTOM_BASE_URL"] = update.llm_custom_base_url

    if update.llm_custom_api_key is not None and not all(c == "*" for c in update.llm_custom_api_key):
        env_vars["LLM_CUSTOM_API_KEY"] = update.llm_custom_api_key

    if update.llm_custom_model is not None:
        env_vars["LLM_CUSTOM_MODEL"] = update.llm_custom_model

    if update.openai_api_key is not None and not all(c == "*" for c in update.openai_api_key):
        env_vars["OPENAI_API_KEY"] = update.openai_api_key

    if update.openai_model is not None:
        env_vars["OPENAI_MODEL"] = update.openai_model

    if update.anthropic_api_key is not None and not all(c == "*" for c in update.anthropic_api_key):
        env_vars["ANTHROPIC_API_KEY"] = update.anthropic_api_key

    if update.anthropic_model is not None:
        env_vars["ANTHROPIC_MODEL"] = update.anthropic_model

    # ── Embedding ─────────────────────────────────────────────────────
    if update.embedding_provider is not None:
        if update.embedding_provider not in EMBEDDING_PROVIDERS:
            raise HTTPException(400, f"Unknown embedding provider: {update.embedding_provider}")
        env_vars["EMBEDDING_PROVIDER"] = update.embedding_provider

    if update.embedding_custom_base_url is not None:
        env_vars["EMBEDDING_CUSTOM_BASE_URL"] = update.embedding_custom_base_url

    if update.embedding_custom_api_key is not None and not all(c == "*" for c in update.embedding_custom_api_key):
        env_vars["EMBEDDING_CUSTOM_API_KEY"] = update.embedding_custom_api_key

    if update.embedding_custom_model is not None:
        env_vars["EMBEDDING_CUSTOM_MODEL"] = update.embedding_custom_model

    if update.openai_embedding_model is not None:
        env_vars["OPENAI_EMBEDDING_MODEL"] = update.openai_embedding_model

    # ── Behaviour ─────────────────────────────────────────────────────
    if update.use_mock_ai is not None:
        env_vars["USE_MOCK_AI"] = str(update.use_mock_ai).lower()

    if update.max_upload_mb is not None:
        env_vars["MAX_UPLOAD_MB"] = str(update.max_upload_mb)

    try:
        _write_env_file(env_vars)
    except OSError as e:
        raise HTTPException(500, f"Failed to write .env: {e}")

    try:
        reload_settings()
    except Exception as e:
        logger.error(f"Settings reload failed: {e}")

    return get_settings()
