"""Settings router — read / write application configuration via .env file."""

import json
import logging
import shutil
import subprocess
import sys
import threading
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from app.db.session import SessionLocal
from pydantic import BaseModel, Field, field_validator

from app.core.config import reload_settings, DOTENV_PATH, settings
from app.core.config import Settings as SettingsClass
from app.services.pipeline.processor import reset_docling_runtime

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────

LLM_PROVIDERS = [
    "openai", "anthropic", "custom",
    "deepseek", "openrouter", "glm", "minimax", "mimo", "kimi",
]
LLM_CUSTOM_PROTOCOLS = ["openai", "anthropic"]
PARSER_PRIORITIES = ["mineru_only", "mineru_first", "docling", "pypdf", "ocr"]

# Serialize in-app parser install/uninstall so concurrent requests (e.g. from
# multiple tabs) cannot race on the same pip invocation and the shared Docling
# availability cache.
_PARSER_INSTALL_LOCK = threading.Lock()

OPENAI_MODELS = ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
ANTHROPIC_MODELS = [
    "claude-sonnet-4-20250514", "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest", "claude-3-opus-latest", "claude-opus-4-20250514",
]
DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"]
OPENROUTER_MODELS = [
    "openai/gpt-4.1-mini", "openai/gpt-4o", "anthropic/claude-sonnet-4-20250514",
    "google/gemini-2.5-pro-preview", "deepseek/deepseek-chat", "meta-llama/llama-4-maverick",
]
GLM_MODELS = ["glm-4-plus", "glm-4-flash", "glm-4-long", "glm-4-air"]
MINIMAX_MODELS = ["MiniMax-Text-01", "abab6.5s-chat"]
MIMO_MODELS = ["MiniMax-M1", "MiniMax-M1-8k"]
KIMI_MODELS = ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"]


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
    # Additional providers
    deepseek_api_key: str = ""     # masked
    deepseek_model: str = "deepseek-chat"
    deepseek_coding_model: str = ""
    openrouter_api_key: str = ""   # masked
    openrouter_model: str = "openai/gpt-4.1-mini"
    openrouter_coding_model: str = ""
    glm_api_key: str = ""          # masked
    glm_model: str = "glm-4-plus"
    glm_coding_model: str = ""
    minimax_api_key: str = ""      # masked
    minimax_model: str = "MiniMax-Text-01"
    minimax_coding_model: str = ""
    mimo_api_key: str = ""         # masked
    mimo_model: str = "MiniMax-M1"
    mimo_coding_model: str = ""
    kimi_api_key: str = ""         # masked
    kimi_model: str = "moonshot-v1-8k"
    kimi_coding_model: str = ""
    # Behaviour
    use_mock_ai: bool
    max_upload_mb: int
    parser_priority: str
    # MinerU API
    mineru_api_enabled: bool = False
    mineru_api_mode: str = "cloud"
    mineru_api_key: str = ""       # masked
    mineru_api_base_url: str = "https://mineru.net"
    mineru_api_model: str = "pipeline"
    mineru_api_enable_formula: bool = True
    mineru_api_is_ocr: bool = False
    mineru_api_language: str = "en"
    mineru_api_timeout_seconds: int = 600
    mineru_api_poll_interval: int = 3
    # Public base URL used for absolute image URLs in parsed markdown
    api_base_url: str = ""
    # Scholarly sources. Secrets are never returned by the normal settings API.
    openreview_username: str = ""
    openreview_password_configured: bool = False
    openreview_access_token_configured: bool = False
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
    # Additional providers
    deepseek_api_key: str | None = Field(default=None, max_length=256)
    deepseek_model: str | None = None
    deepseek_coding_model: str | None = None
    openrouter_api_key: str | None = Field(default=None, max_length=256)
    openrouter_model: str | None = None
    openrouter_coding_model: str | None = None
    glm_api_key: str | None = Field(default=None, max_length=256)
    glm_model: str | None = None
    glm_coding_model: str | None = None
    minimax_api_key: str | None = Field(default=None, max_length=256)
    minimax_model: str | None = None
    minimax_coding_model: str | None = None
    mimo_api_key: str | None = Field(default=None, max_length=256)
    mimo_model: str | None = None
    mimo_coding_model: str | None = None
    kimi_api_key: str | None = Field(default=None, max_length=256)
    kimi_model: str | None = None
    kimi_coding_model: str | None = None
    # Behaviour
    use_mock_ai: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=500)
    parser_priority: str | None = None
    # MinerU API
    mineru_api_enabled: bool | None = None
    mineru_api_mode: str | None = None
    mineru_api_key: str | None = Field(default=None, max_length=256)
    mineru_api_base_url: str | None = Field(default=None, max_length=512)
    mineru_api_model: str | None = None
    mineru_api_enable_formula: bool | None = None
    mineru_api_is_ocr: bool | None = None
    mineru_api_language: str | None = None
    mineru_api_timeout_seconds: int | None = Field(default=None, ge=30, le=3600)
    mineru_api_poll_interval: int | None = Field(default=None, ge=1, le=60)
    api_base_url: str | None = Field(default=None, max_length=512)
    # Scholarly sources. Empty secret values intentionally clear saved values.
    openreview_username: str | None = Field(default=None, max_length=320)
    openreview_password: str | None = Field(default=None, max_length=1024)
    openreview_access_token: str | None = Field(default=None, max_length=4096)

    @field_validator(
        "openreview_username",
        "openreview_password",
        "openreview_access_token",
    )
    @classmethod
    def reject_multiline_openreview_credentials(cls, value: str | None) -> str | None:
        if value is not None and ("\n" in value or "\r" in value):
            raise ValueError("OpenReview credentials must be single-line values")
        return value


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
        deepseek_api_key=_mask_key(cfg.deepseek_api_key),
        deepseek_model=cfg.deepseek_model,
        deepseek_coding_model=cfg.deepseek_coding_model,
        openrouter_api_key=_mask_key(cfg.openrouter_api_key),
        openrouter_model=cfg.openrouter_model,
        openrouter_coding_model=cfg.openrouter_coding_model,
        glm_api_key=_mask_key(cfg.glm_api_key),
        glm_model=cfg.glm_model,
        glm_coding_model=cfg.glm_coding_model,
        minimax_api_key=_mask_key(cfg.minimax_api_key),
        minimax_model=cfg.minimax_model,
        minimax_coding_model=cfg.minimax_coding_model,
        mimo_api_key=_mask_key(cfg.mimo_api_key),
        mimo_model=cfg.mimo_model,
        mimo_coding_model=cfg.mimo_coding_model,
        kimi_api_key=_mask_key(cfg.kimi_api_key),
        kimi_model=cfg.kimi_model,
        kimi_coding_model=cfg.kimi_coding_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        parser_priority=cfg.parser_priority,
        mineru_api_enabled=cfg.mineru_api_enabled,
        mineru_api_mode=cfg.mineru_api_mode,
        mineru_api_key=_mask_key(cfg.mineru_api_key),
        mineru_api_base_url=cfg.mineru_api_base_url,
        mineru_api_model=cfg.mineru_api_model,
        mineru_api_enable_formula=cfg.mineru_api_enable_formula,
        mineru_api_is_ocr=cfg.mineru_api_is_ocr,
        mineru_api_language=cfg.mineru_api_language,
        mineru_api_timeout_seconds=cfg.mineru_api_timeout_seconds,
        mineru_api_poll_interval=cfg.mineru_api_poll_interval,
        api_base_url=cfg.api_base_url,
        openreview_username=cfg.openreview_username,
        openreview_password_configured=bool(cfg.openreview_password),
        openreview_access_token_configured=bool(cfg.openreview_access_token),
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

    if update.deepseek_api_key is not None and not all(c == "*" for c in update.deepseek_api_key):
        env_vars["DEEPSEEK_API_KEY"] = update.deepseek_api_key
    if update.deepseek_model is not None:
        env_vars["DEEPSEEK_MODEL"] = update.deepseek_model
    if update.deepseek_coding_model is not None:
        env_vars["DEEPSEEK_CODING_MODEL"] = update.deepseek_coding_model

    if update.openrouter_api_key is not None and not all(c == "*" for c in update.openrouter_api_key):
        env_vars["OPENROUTER_API_KEY"] = update.openrouter_api_key
    if update.openrouter_model is not None:
        env_vars["OPENROUTER_MODEL"] = update.openrouter_model
    if update.openrouter_coding_model is not None:
        env_vars["OPENROUTER_CODING_MODEL"] = update.openrouter_coding_model

    if update.glm_api_key is not None and not all(c == "*" for c in update.glm_api_key):
        env_vars["GLM_API_KEY"] = update.glm_api_key
    if update.glm_model is not None:
        env_vars["GLM_MODEL"] = update.glm_model
    if update.glm_coding_model is not None:
        env_vars["GLM_CODING_MODEL"] = update.glm_coding_model

    if update.minimax_api_key is not None and not all(c == "*" for c in update.minimax_api_key):
        env_vars["MINIMAX_API_KEY"] = update.minimax_api_key
    if update.minimax_model is not None:
        env_vars["MINIMAX_MODEL"] = update.minimax_model
    if update.minimax_coding_model is not None:
        env_vars["MINIMAX_CODING_MODEL"] = update.minimax_coding_model

    if update.mimo_api_key is not None and not all(c == "*" for c in update.mimo_api_key):
        env_vars["MIMO_API_KEY"] = update.mimo_api_key
    if update.mimo_model is not None:
        env_vars["MIMO_MODEL"] = update.mimo_model
    if update.mimo_coding_model is not None:
        env_vars["MIMO_CODING_MODEL"] = update.mimo_coding_model

    if update.kimi_api_key is not None and not all(c == "*" for c in update.kimi_api_key):
        env_vars["KIMI_API_KEY"] = update.kimi_api_key
    if update.kimi_model is not None:
        env_vars["KIMI_MODEL"] = update.kimi_model
    if update.kimi_coding_model is not None:
        env_vars["KIMI_CODING_MODEL"] = update.kimi_coding_model

    # ── Behaviour ─────────────────────────────────────────────────────
    if update.use_mock_ai is not None:
        env_vars["USE_MOCK_AI"] = str(update.use_mock_ai).lower()

    if update.max_upload_mb is not None:
        env_vars["MAX_UPLOAD_MB"] = str(update.max_upload_mb)

    if update.parser_priority is not None:
        if update.parser_priority not in PARSER_PRIORITIES:
            raise HTTPException(400, f"Unknown parser priority: {update.parser_priority}")
        env_vars["PARSER_PRIORITY"] = update.parser_priority

    # ── MinerU API ──────────────────────────────────────────────────────
    if update.mineru_api_enabled is not None:
        env_vars["MINERU_API_ENABLED"] = str(update.mineru_api_enabled).lower()

    if update.mineru_api_mode is not None:
        if update.mineru_api_mode not in ("cloud", "selfhosted"):
            raise HTTPException(400, f"Unknown MinerU API mode: {update.mineru_api_mode}")
        env_vars["MINERU_API_MODE"] = update.mineru_api_mode

    if update.mineru_api_key is not None and not all(c == "*" for c in update.mineru_api_key):
        env_vars["MINERU_API_KEY"] = update.mineru_api_key

    if update.mineru_api_base_url is not None:
        env_vars["MINERU_API_BASE_URL"] = update.mineru_api_base_url

    if update.mineru_api_model is not None:
        if update.mineru_api_model not in ("pipeline", "vlm", "MinerU-HTML"):
            raise HTTPException(400, f"Unknown MinerU API model: {update.mineru_api_model}")
        env_vars["MINERU_API_MODEL"] = update.mineru_api_model

    if update.mineru_api_enable_formula is not None:
        env_vars["MINERU_API_ENABLE_FORMULA"] = str(update.mineru_api_enable_formula).lower()

    if update.mineru_api_is_ocr is not None:
        env_vars["MINERU_API_IS_OCR"] = str(update.mineru_api_is_ocr).lower()

    if update.mineru_api_language is not None:
        env_vars["MINERU_API_LANGUAGE"] = update.mineru_api_language

    if update.mineru_api_timeout_seconds is not None:
        env_vars["MINERU_API_TIMEOUT_SECONDS"] = str(update.mineru_api_timeout_seconds)

    if update.mineru_api_poll_interval is not None:
        env_vars["MINERU_API_POLL_INTERVAL"] = str(update.mineru_api_poll_interval)

    if update.api_base_url is not None:
        env_vars["API_BASE_URL"] = update.api_base_url

    # ── Scholarly sources ─────────────────────────────────────────────
    if update.openreview_username is not None:
        env_vars["OPENREVIEW_USERNAME"] = update.openreview_username.strip()
    if update.openreview_password is not None:
        env_vars["OPENREVIEW_PASSWORD"] = update.openreview_password
    if update.openreview_access_token is not None:
        env_vars["OPENREVIEW_ACCESS_TOKEN"] = update.openreview_access_token.strip()

    try:
        _write_env_file(env_vars)
    except OSError as e:
        raise HTTPException(500, f"Failed to write .env: {e}")

    try:
        reload_settings()
    except Exception as e:
        logger.error(f"Settings reload failed: {e}")

    return get_settings()


# ── Export / Import ───────────────────────────────────────────────────────

class SettingsExportResponse(SettingsResponse):
    """Same as SettingsResponse but all keys are unmasked for export."""
    openai_api_key: str          # unmasked
    anthropic_api_key: str       # unmasked
    llm_custom_api_key: str      # unmasked
    deepseek_api_key: str = ""   # unmasked
    openrouter_api_key: str = "" # unmasked
    glm_api_key: str = ""        # unmasked
    minimax_api_key: str = ""    # unmasked
    mimo_api_key: str = ""       # unmasked
    kimi_api_key: str = ""       # unmasked
    mineru_api_key: str = ""     # unmasked


@router.get("/export")
def export_settings():
    """Export all settings + articles as JSON for cross-platform transfer."""
    from app.routers.exports import _build_export_data

    cfg = _fresh_settings()
    settings_data = SettingsExportResponse(
        llm_provider=cfg.llm_provider,
        llm_custom_protocol=cfg.llm_custom_protocol,
        llm_custom_base_url=cfg.llm_custom_base_url,
        llm_custom_api_key=cfg.llm_custom_api_key,
        llm_custom_model=cfg.llm_custom_model,
        openai_api_key=cfg.openai_api_key,
        openai_model=cfg.openai_model,
        anthropic_api_key=cfg.anthropic_api_key,
        anthropic_model=cfg.anthropic_model,
        deepseek_api_key=cfg.deepseek_api_key,
        deepseek_model=cfg.deepseek_model,
        deepseek_coding_model=cfg.deepseek_coding_model,
        openrouter_api_key=cfg.openrouter_api_key,
        openrouter_model=cfg.openrouter_model,
        openrouter_coding_model=cfg.openrouter_coding_model,
        glm_api_key=cfg.glm_api_key,
        glm_model=cfg.glm_model,
        glm_coding_model=cfg.glm_coding_model,
        minimax_api_key=cfg.minimax_api_key,
        minimax_model=cfg.minimax_model,
        minimax_coding_model=cfg.minimax_coding_model,
        mimo_api_key=cfg.mimo_api_key,
        mimo_model=cfg.mimo_model,
        mimo_coding_model=cfg.mimo_coding_model,
        kimi_api_key=cfg.kimi_api_key,
        kimi_model=cfg.kimi_model,
        kimi_coding_model=cfg.kimi_coding_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        parser_priority=cfg.parser_priority,
        mineru_api_enabled=cfg.mineru_api_enabled,
        mineru_api_mode=cfg.mineru_api_mode,
        mineru_api_key=cfg.mineru_api_key,
        mineru_api_base_url=cfg.mineru_api_base_url,
        mineru_api_model=cfg.mineru_api_model,
        mineru_api_enable_formula=cfg.mineru_api_enable_formula,
        mineru_api_is_ocr=cfg.mineru_api_is_ocr,
        mineru_api_language=cfg.mineru_api_language,
        mineru_api_timeout_seconds=cfg.mineru_api_timeout_seconds,
        mineru_api_poll_interval=cfg.mineru_api_poll_interval,
        api_base_url=cfg.api_base_url,
        host=cfg.host, port=cfg.port,
        env_path=str(DOTENV_PATH),
    )

    # Include full articles data
    db = SessionLocal()
    try:
        from app.db.models import Article
        articles = db.query(Article).all()
        articles_data = [_build_export_data(a, db) for a in articles]
    finally:
        db.close()

    # Include skills
    try:
        from app.services.skills.registry import SkillRegistry
        from app.services.skills.default_skills import DEFAULT_SKILLS
        skills_reg = SkillRegistry()
        for skill in DEFAULT_SKILLS:
            skills_reg.register(skill, persist=False)
        skills_reg.load_persisted()
        skills_data = skills_reg.export_all()
    except Exception:
        skills_data = []

    return JSONResponse(content={
        "settings": settings_data.model_dump(),
        "articles": articles_data,
        "skills": skills_data,
    })


# ── Parser Detection ──────────────────────────────────────────────────────

class ParserInfo(BaseModel):
    key: str
    name: str
    installed: bool
    version: str | None = None
    description: str
    install_cmd: str | None = None


@router.get("/parsers", response_model=list[ParserInfo])
def list_parsers():
    """Return available PDF parsers with installation status."""
    parsers: list[ParserInfo] = []

    # MinerU (v3.x package: "mineru", formerly "magic-pdf") + remote API mode
    mineru_installed = False
    mineru_ver = None
    try:
        import mineru
        mineru_ver = getattr(mineru, "__version__", None)
        mineru_installed = True
    except ImportError:
        # Try legacy package name
        try:
            import magic_pdf
            mineru_ver = getattr(magic_pdf, "__version__", None)
            mineru_installed = True
        except ImportError:
            pass

    # Also check CLI availability
    cli_available = shutil.which("mineru") is not None

    # Remote API mode (cloud mineru.net or self-hosted mineru-api) — read the
    # settings live so the status reflects a save made through the web UI.
    api_configured = bool(
        settings.mineru_api_enabled
        and (
            settings.mineru_api_key.strip()
            or settings.mineru_api_mode == "selfhosted"
        )
    )

    name = "MinerU"
    if cli_available and not mineru_installed:
        name += " (CLI)"
    if api_configured and not (mineru_installed or cli_available):
        name += " (API)"
    description = (
        "State-of-the-art PDF parsing with layout preservation, image extraction, "
        "table detection, and formula recognition (v3.x+)."
    )
    if api_configured:
        description += (
            f" Remote API configured "
            f"({settings.mineru_api_mode}, model {settings.mineru_api_model})."
        )

    parsers.append(ParserInfo(
        key="mineru",
        name=name,
        installed=mineru_installed or cli_available or api_configured,
        version=mineru_ver,
        description=description,
        install_cmd=None if (mineru_installed or api_configured) else 'pip install -U "mineru[all]"',
    ))

    # Docling
    try:
        from docling.document_converter import DocumentConverter
        import docling
        docling_ver = getattr(docling, "__version__", None)
        parsers.append(ParserInfo(
            key="docling", name="Docling", installed=True, version=docling_ver,
            description="High-quality layout-aware PDF parsing with table extraction and figure detection.",
            install_cmd=None,
        ))
    except ImportError:
        parsers.append(ParserInfo(
            key="docling", name="Docling", installed=False,
            description="High-quality layout-aware PDF parsing with table extraction and figure detection.",
            install_cmd="pip install docling",
        ))

    # pypdf (built-in)
    try:
        import pypdf
        pypdf_ver = getattr(pypdf, "__version__", None)
    except Exception:
        pypdf_ver = None
    parsers.append(ParserInfo(
        key="pypdf", name="pypdf (built-in)", installed=True, version=pypdf_ver or "bundled",
        description="Text extraction from PDFs. Always available, no extra install needed.",
        install_cmd=None,
    ))

    # OCR (Tesseract)
    ocr_available = False
    try:
        import pytesseract
        from PIL import Image
        pytesseract.get_tesseract_version()
        ocr_available = True
    except Exception:
        pass
    parsers.append(ParserInfo(
        key="ocr", name="OCR (Tesseract)", installed=ocr_available,
        description="Optical character recognition for scanned/image-based PDFs. Used as fallback by pypdf.",
        install_cmd="pip install pytesseract Pillow pdf2image\n# Then install tesseract: brew install tesseract (macOS) or apt install tesseract-ocr (Ubuntu)",
    ))

    return parsers


class ParserInstallResult(BaseModel):
    key: str
    installed: bool
    version: str | None = None
    error: str | None = None


def _probe_docling_version() -> str | None:
    """Return the installed Docling version, or None if not importable."""
    try:
        import docling
        return getattr(docling, "__version__", None)
    except Exception:
        return None


@router.post("/parsers/docling/install", response_model=ParserInstallResult)
def install_docling():
    """Install Docling (and CPU-only torch) in-process via pip.

    Mirrors the Dockerfile ordering: install the CPU torch wheel first so the
    default CUDA/triton torch stack a naive .[all] install would pull is not
    fetched. Works in a normal Python environment where the interpreter can
    pip-install into its site-packages (local dev, desktop source runs). It does
    not work in the frozen PyInstaller desktop build (no python -m pip) or as the
    non-root runtime user in the Docker image (root-owned site-packages) - in
    those environments Docling must be baked in at build time or provided another
    way. See docs/docker.md.
    """
    if getattr(sys, "frozen", False):
        return ParserInstallResult(
            key="docling", installed=_probe_docling_version() is not None,
            version=_probe_docling_version(),
            error="In-app package install is not available in the packaged build.",
        )
    commands = [
        [sys.executable, "-m", "pip", "install", "--quiet", "--timeout=60", "--retries=5",
         "torch>=2.2", "--index-url", "https://download.pytorch.org/whl/cpu"],
        [sys.executable, "-m", "pip", "install", "--quiet", "--timeout=60", "--retries=5",
         "docling>=2.0.0"],
    ]
    with _PARSER_INSTALL_LOCK:
        for cmd in commands:
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1200)
            except subprocess.TimeoutExpired:
                return ParserInstallResult(key="docling", installed=False,
                                           error="pip install timed out after 1200s")
            if proc.returncode != 0:
                tail = (proc.stderr or proc.stdout or "")[-500:]
                return ParserInstallResult(key="docling", installed=False, error=tail)
        reset_docling_runtime()
        return ParserInstallResult(
            key="docling", installed=True, version=_probe_docling_version()
        )


@router.post("/parsers/docling/uninstall", response_model=ParserInstallResult)
def uninstall_docling():
    """Remove the Docling packages installed via the in-app installer."""
    if getattr(sys, "frozen", False):
        return ParserInstallResult(
            key="docling", installed=_probe_docling_version() is not None,
            version=_probe_docling_version(),
            error="In-app package uninstall is not available in the packaged build.",
        )
    packages = [
        "docling", "docling-core", "docling-ibm-models", "docling-parse",
        "docling-parse-backend-docling-parse", "docling-parse-backend-pypdfium2",
    ]
    cmd = [sys.executable, "-m", "pip", "uninstall", "-y", "-q"] + packages
    with _PARSER_INSTALL_LOCK:
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            # Re-probe the real state and invalidate the cached availability so the
            # next has_docling() reflects reality instead of a stale True.
            reset_docling_runtime()
            return ParserInstallResult(
                key="docling", installed=_probe_docling_version() is not None,
                version=_probe_docling_version(), error="pip uninstall timed out"
            )
        reset_docling_runtime()
        still_installed = _probe_docling_version() is not None
        return ParserInstallResult(
            key="docling", installed=still_installed, version=_probe_docling_version()
        )


# ── Test Connection ────────────────────────────────────────────────────────

class TestConnectionBody(BaseModel):
    llm_provider: str = "openai"
    llm_custom_protocol: str = "openai"
    llm_custom_base_url: str = ""
    llm_custom_api_key: str = ""
    llm_custom_model: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4.1-mini"
    glm_api_key: str = ""
    glm_model: str = "glm-4-plus"
    minimax_api_key: str = ""
    minimax_model: str = "MiniMax-Text-01"
    mimo_api_key: str = ""
    mimo_model: str = "MiniMax-M1"
    kimi_api_key: str = ""
    kimi_model: str = "moonshot-v1-8k"
    use_mock_ai: bool = True


@router.post("/test")
async def test_connection(body: TestConnectionBody):
    """Test LLM and embedding provider connectivity with a minimal API call.

    Accepts current form state — does NOT save to .env. Returns per-provider
    status so the user can fix issues before saving.
    """
    results: dict[str, dict] = {}

    # ── LLM test ──────────────────────────────────────────────────────
    try:
        if body.use_mock_ai:
            results["llm"] = {"ok": True, "message": "Mock AI mode — no connection needed"}
        elif body.llm_provider == "openai":
            key = body.openai_api_key or settings.openai_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "OpenAI API key is required"}
            else:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=key)
                # Minimal call: list models (1 result) to verify key
                await client.models.list()
                results["llm"] = {"ok": True, "message": f"Connected to OpenAI (model: {body.openai_model})"}
        elif body.llm_provider == "anthropic":
            key = body.anthropic_api_key or settings.anthropic_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "Anthropic API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.anthropic.com/v1/models",
                        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                        timeout=15,
                    )
                    if resp.status_code == 200:
                        results["llm"] = {"ok": True, "message": f"Connected to Anthropic (model: {body.anthropic_model})"}
                    else:
                        results["llm"] = {"ok": False, "message": f"Anthropic returned {resp.status_code}: {resp.text[:200]}"}
        elif body.llm_provider == "deepseek":
            key = body.deepseek_api_key or settings.deepseek_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "DeepSeek API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.deepseek.com/v1/models",
                        headers={"Authorization": f"Bearer {key}"},
                        timeout=15,
                    )
                    results["llm"] = {"ok": resp.status_code < 500, "message": f"DeepSeek: {resp.status_code}"}
        elif body.llm_provider == "openrouter":
            key = body.openrouter_api_key or settings.openrouter_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "OpenRouter API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://openrouter.ai/api/v1/models",
                        headers={"Authorization": f"Bearer {key}"},
                        timeout=15,
                    )
                    results["llm"] = {"ok": resp.status_code < 500, "message": f"OpenRouter: {resp.status_code}"}
        elif body.llm_provider == "glm":
            key = body.glm_api_key or settings.glm_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "GLM API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://open.bigmodel.cn/api/paas/v4/models",
                        headers={"Authorization": f"Bearer {key}"},
                        timeout=15,
                    )
                    results["llm"] = {"ok": resp.status_code < 500, "message": f"GLM: {resp.status_code}"}
        elif body.llm_provider == "minimax":
            key = body.minimax_api_key or settings.minimax_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "MiniMax API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.minimax.chat/v1/models",
                        headers={"Authorization": f"Bearer {key}"},
                        timeout=15,
                    )
                    results["llm"] = {"ok": resp.status_code < 500, "message": f"MiniMax: {resp.status_code}"}
        elif body.llm_provider == "mimo":
            key = body.mimo_api_key or settings.mimo_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "Mimo API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.minimax.chat/v1/models",
                        headers={"Authorization": f"Bearer {key}"},
                        timeout=15,
                    )
                    results["llm"] = {"ok": resp.status_code < 500, "message": f"Mimo: {resp.status_code}"}
        elif body.llm_provider == "kimi":
            key = body.kimi_api_key or settings.kimi_api_key
            if not key:
                results["llm"] = {"ok": False, "message": "Kimi API key is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        "https://api.moonshot.cn/v1/models",
                        headers={"Authorization": f"Bearer {key}"},
                        timeout=15,
                    )
                    results["llm"] = {"ok": resp.status_code < 500, "message": f"Kimi: {resp.status_code}"}
        elif body.llm_provider == "custom":
            if not body.llm_custom_base_url:
                results["llm"] = {"ok": False, "message": "Custom base URL is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{body.llm_custom_base_url.rstrip('/')}/models",
                        headers={"Authorization": f"Bearer {body.llm_custom_api_key or 'not-needed'}"},
                        timeout=15,
                    )
                    if resp.status_code < 500:
                        results["llm"] = {"ok": True, "message": f"Connected to {body.llm_custom_base_url} (model: {body.llm_custom_model})"}
                    else:
                        results["llm"] = {"ok": False, "message": f"Server error {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        results["llm"] = {"ok": False, "message": str(e)}

    all_ok = all(v.get("ok") for v in results.values()) if results else False
    return {"all_ok": all_ok, "results": results}


@router.post("/import")
async def import_settings(file: UploadFile = File(...)):
    """Import settings + articles from a previously exported JSON file."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(400, "Please upload a .json settings file")

    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid JSON file")

    # Support both flat (old) and nested (new) formats
    settings_data = data.get("settings", data)

    # Validate by running through SettingsUpdate schema
    try:
        update = SettingsUpdate(
            llm_provider=settings_data.get("llm_provider"),
            llm_custom_protocol=settings_data.get("llm_custom_protocol"),
            llm_custom_base_url=settings_data.get("llm_custom_base_url"),
            llm_custom_api_key=settings_data.get("llm_custom_api_key"),
            llm_custom_model=settings_data.get("llm_custom_model"),
            openai_api_key=settings_data.get("openai_api_key"),
            openai_model=settings_data.get("openai_model"),
            anthropic_api_key=settings_data.get("anthropic_api_key"),
            anthropic_model=settings_data.get("anthropic_model"),
            use_mock_ai=settings_data.get("use_mock_ai"),
            max_upload_mb=settings_data.get("max_upload_mb"),
            parser_priority=settings_data.get("parser_priority"),
            mineru_api_enabled=settings_data.get("mineru_api_enabled"),
            mineru_api_mode=settings_data.get("mineru_api_mode"),
            mineru_api_key=settings_data.get("mineru_api_key"),
            mineru_api_base_url=settings_data.get("mineru_api_base_url"),
            mineru_api_model=settings_data.get("mineru_api_model"),
            mineru_api_enable_formula=settings_data.get("mineru_api_enable_formula"),
            mineru_api_is_ocr=settings_data.get("mineru_api_is_ocr"),
            mineru_api_language=settings_data.get("mineru_api_language"),
            mineru_api_timeout_seconds=settings_data.get("mineru_api_timeout_seconds"),
            mineru_api_poll_interval=settings_data.get("mineru_api_poll_interval"),
            api_base_url=settings_data.get("api_base_url"),
        )
    except Exception as e:
        raise HTTPException(400, f"Invalid settings data: {e}")

    # Apply settings
    result = update_settings(update)

    # Restore articles if present
    articles_data = data.get("articles")
    if articles_data and isinstance(articles_data, list):
        from app.db.session import SessionLocal
        from app.db.models import Article, ArticleExtraction, GraphEntity, GraphRelationship, ProcessingJob, ArticleStatus, JobStatus
        from app.core.security import compute_file_hash
        from app.services.article_duplicates import find_active_article_by_hash
        import datetime as dt

        db = SessionLocal()
        try:
            for item in articles_data:
                article_meta = item.get("article", {})
                title = article_meta.get("title", "Imported Article")
                original_filename = article_meta.get("original_filename", "imported.json")
                source_type = article_meta.get("source_type", "md")
                file_hash = compute_file_hash(title.encode() + original_filename.encode())

                existing = find_active_article_by_hash(db, file_hash)
                if existing:
                    continue

                markdown_text = item.get("markdown", "") or ""
                article = Article(
                    title=title, status=ArticleStatus.COMPLETED.value,
                    original_filename=original_filename, file_hash=file_hash,
                    source_type=source_type, storage_path="import://json",
                    markdown_text=markdown_text,
                )
                db.add(article)
                db.flush()

                extraction_data = item.get("extraction")
                if extraction_data:
                    db.add(ArticleExtraction(
                        article_id=article.id, schema_version="1.0",
                        extraction_json=json.dumps(extraction_data), confidence=0.85,
                    ))

                graph = item.get("graph", {})
                entity_map: dict[str, int] = {}
                for ent in graph.get("entities", []):
                    ge = GraphEntity(
                        article_id=article.id, type=ent.get("type", "Keyword"),
                        name=ent.get("name", ""), canonical_name=ent.get("canonical_name"),
                        properties_json=json.dumps(ent.get("properties") or {}),
                        confidence=ent.get("confidence", 0.5),
                    )
                    db.add(ge)
                    db.flush()
                    entity_map[ent.get("name", "")] = ge.id

                for rel in graph.get("relationships", []):
                    sid = entity_map.get(rel.get("source_name", ""))
                    tid = entity_map.get(rel.get("target_name", ""))
                    if sid and tid:
                        db.add(GraphRelationship(
                            article_id=article.id, source_entity_id=sid,
                            target_entity_id=tid, type=rel.get("type", "RELATES_TO"),
                            confidence=rel.get("confidence", 0.5),
                        ))

                db.add(ProcessingJob(
                    article_id=article.id, status=JobStatus.COMPLETED.value,
                    current_step="imported",
                    logs_json=json.dumps([{"step": "imported", "timestamp": dt.datetime.utcnow().isoformat(), "message": "Imported from settings backup"}]),
                    completed_at=dt.datetime.utcnow(),
                ))

            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Article import during settings restore failed: {e}")
        finally:
            db.close()

    # Restore skills if present
    skills_data = data.get("skills")
    if skills_data and isinstance(skills_data, list):
        try:
            from app.services.skills.registry import SkillRegistry
            from app.services.skills.default_skills import DEFAULT_SKILLS
            skills_reg = SkillRegistry()
            for skill in DEFAULT_SKILLS:
                skills_reg.register(skill, persist=False)
            skills_reg.load_persisted()
            skills_reg.import_skills(skills_data, overwrite=True)
        except Exception as e:
            logger.error(f"Skills import during settings restore failed: {e}")

    return result
