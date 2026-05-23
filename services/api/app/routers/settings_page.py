"""Settings router — read / write application configuration via .env file."""

import json
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import reload_settings, DOTENV_PATH, settings
from app.core.config import Settings as SettingsClass

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────

LLM_PROVIDERS = [
    "openai", "anthropic", "custom",
    "deepseek", "openrouter", "glm", "minimax", "mimo", "kimi",
]
LLM_CUSTOM_PROTOCOLS = ["openai", "anthropic"]
EMBEDDING_PROVIDERS = ["openai", "custom"]
PARSER_PRIORITIES = ["mineru_first", "docling", "pypdf", "ocr"]

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
    # Embedding
    embedding_provider: str
    embedding_custom_base_url: str
    embedding_custom_api_key: str  # masked
    embedding_custom_model: str
    openai_embedding_model: str
    # Behaviour
    use_mock_ai: bool
    max_upload_mb: int
    parser_priority: str
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
    # Embedding
    embedding_provider: str | None = None
    embedding_custom_base_url: str | None = Field(default=None, max_length=512)
    embedding_custom_api_key: str | None = Field(default=None, max_length=256)
    embedding_custom_model: str | None = Field(default=None, max_length=256)
    openai_embedding_model: str | None = None
    # Behaviour
    use_mock_ai: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=500)
    parser_priority: str | None = None


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
        embedding_provider=cfg.embedding_provider,
        embedding_custom_base_url=cfg.embedding_custom_base_url,
        embedding_custom_api_key=_mask_key(cfg.embedding_custom_api_key),
        embedding_custom_model=cfg.embedding_custom_model,
        openai_embedding_model=cfg.openai_embedding_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        parser_priority=cfg.parser_priority,
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

    if update.parser_priority is not None:
        if update.parser_priority not in PARSER_PRIORITIES:
            raise HTTPException(400, f"Unknown parser priority: {update.parser_priority}")
        env_vars["PARSER_PRIORITY"] = update.parser_priority

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
    embedding_custom_api_key: str  # unmasked
    deepseek_api_key: str = ""   # unmasked
    openrouter_api_key: str = "" # unmasked
    glm_api_key: str = ""        # unmasked
    minimax_api_key: str = ""    # unmasked
    mimo_api_key: str = ""       # unmasked
    kimi_api_key: str = ""       # unmasked


@router.get("/export", response_model=SettingsExportResponse)
def export_settings():
    """Export all settings as JSON — keys unmasked for cross-platform transfer."""
    cfg = _fresh_settings()
    return SettingsExportResponse(
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
        embedding_provider=cfg.embedding_provider,
        embedding_custom_base_url=cfg.embedding_custom_base_url,
        embedding_custom_api_key=cfg.embedding_custom_api_key,
        embedding_custom_model=cfg.embedding_custom_model,
        openai_embedding_model=cfg.openai_embedding_model,
        use_mock_ai=cfg.use_mock_ai,
        max_upload_mb=cfg.max_upload_mb,
        parser_priority=cfg.parser_priority,
        host=cfg.host, port=cfg.port,
        env_path=str(DOTENV_PATH),
    )


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

    # MinerU
    try:
        import magic_pdf.model as model_config
        model_config.__use_inside__ = True
        import magic_pdf
        mineru_ver = getattr(magic_pdf, "__version__", None)
        parsers.append(ParserInfo(
            key="mineru", name="MinerU (magic-pdf)", installed=True, version=mineru_ver,
            description="State-of-the-art PDF parsing with layout preservation, image extraction, table detection, and formula recognition.",
            install_cmd=None,
        ))
    except ImportError:
        parsers.append(ParserInfo(
            key="mineru", name="MinerU (magic-pdf)", installed=False,
            description="State-of-the-art PDF parsing with layout preservation, image extraction, table detection, and formula recognition.",
            install_cmd="pip install magic-pdf",
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

    # Marker
    try:
        import marker
        marker_ver = getattr(marker, "__version__", None)
        parsers.append(ParserInfo(
            key="marker", name="Marker", installed=True, version=marker_ver,
            description="High-accuracy PDF to Markdown conversion with math/formula support.",
            install_cmd=None,
        ))
    except ImportError:
        parsers.append(ParserInfo(
            key="marker", name="Marker", installed=False,
            description="High-accuracy PDF to Markdown conversion with math/formula support.",
            install_cmd="pip install marker-pdf",
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

    # GROBID (placeholder)
    parsers.append(ParserInfo(
        key="grobid", name="GROBID", installed=False,
        description="Extracts structured metadata from academic PDFs. Requires a running GROBID server.",
        install_cmd="docker run -p 8070:8070 lfoppiano/grobid:latest",
    ))

    return parsers


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
    embedding_provider: str = "openai"
    embedding_custom_base_url: str = ""
    embedding_custom_api_key: str = ""
    embedding_custom_model: str = ""
    openai_embedding_model: str = "text-embedding-3-small"
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

    # ── Embedding test ───────────────────────────────────────────────
    try:
        if body.use_mock_ai:
            results["embedding"] = {"ok": True, "message": "Mock AI mode — no connection needed"}
        elif body.embedding_provider == "openai":
            key = body.openai_api_key or settings.openai_api_key
            if not key:
                results["embedding"] = {"ok": False, "message": "OpenAI API key is required"}
            else:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=key)
                # Tiny embedding call
                await client.embeddings.create(model=body.openai_embedding_model, input="test")
                results["embedding"] = {"ok": True, "message": f"Embedding model OK ({body.openai_embedding_model})"}
        elif body.embedding_provider == "custom":
            if not body.embedding_custom_base_url:
                results["embedding"] = {"ok": False, "message": "Custom base URL is required"}
            else:
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{body.embedding_custom_base_url.rstrip('/')}/embeddings",
                        json={"model": body.embedding_custom_model, "input": "test"},
                        headers={"Authorization": f"Bearer {body.embedding_custom_api_key or 'not-needed'}"},
                        timeout=15,
                    )
                    if resp.status_code < 500:
                        results["embedding"] = {"ok": True, "message": f"Embedding endpoint OK ({body.embedding_custom_model})"}
                    else:
                        results["embedding"] = {"ok": False, "message": f"Server error {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        results["embedding"] = {"ok": False, "message": str(e)}

    all_ok = all(v.get("ok") for v in results.values()) if results else False
    return {"all_ok": all_ok, "results": results}


@router.post("/import")
async def import_settings(file: UploadFile = File(...)):
    """Import settings from a previously exported JSON file."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(400, "Please upload a .json settings file")

    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid JSON file")

    # Validate by running through SettingsUpdate schema
    try:
        update = SettingsUpdate(
            llm_provider=data.get("llm_provider"),
            llm_custom_protocol=data.get("llm_custom_protocol"),
            llm_custom_base_url=data.get("llm_custom_base_url"),
            llm_custom_api_key=data.get("llm_custom_api_key"),
            llm_custom_model=data.get("llm_custom_model"),
            openai_api_key=data.get("openai_api_key"),
            openai_model=data.get("openai_model"),
            anthropic_api_key=data.get("anthropic_api_key"),
            anthropic_model=data.get("anthropic_model"),
            embedding_provider=data.get("embedding_provider"),
            embedding_custom_base_url=data.get("embedding_custom_base_url"),
            embedding_custom_api_key=data.get("embedding_custom_api_key"),
            embedding_custom_model=data.get("embedding_custom_model"),
            openai_embedding_model=data.get("openai_embedding_model"),
            use_mock_ai=data.get("use_mock_ai"),
            max_upload_mb=data.get("max_upload_mb"),
            parser_priority=data.get("parser_priority"),
        )
    except Exception as e:
        raise HTTPException(400, f"Invalid settings data: {e}")

    # Apply — same logic as PUT
    return update_settings(update)
