"""Developer router — system message, model parameters, and prompt templates."""

import json
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings, DOTENV_PATH, reload_settings

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Dev config file (for prompts and non-env settings) ────────────────────

DEV_CONFIG_PATH = settings.project_root / "data" / "dev_config.json"

DEFAULT_DEV_CONFIG = {
    "system_message": "You are a helpful research assistant. Answer questions based on the provided article excerpts. Always cite specific sections when possible. Be concise but thorough.",
    "temperature": 0.7,
    "top_p": 0.95,
    "max_tokens": 2048,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0,
    "prompts": {
        "extraction": {
            "description": "Used when extracting structured data from articles",
            "template": "You are an expert research analyst. Extract the following structured information from the provided document. Be precise and only include information explicitly stated in the text.\n\n{document}\n\nExtract: title, authors, year, venue, doi, abstract, background, research_problem, methodology, datasets, experiments, metrics, results, limitations, future_work, key_claims, references, tags, graph_entities, graph_relationships.",
        },
        "chat": {
            "description": "System prompt prefix for RAG chat responses",
            "template": "You are a helpful research assistant. Answer the user's question based on the provided article excerpts. When citing information, reference the specific section or chunk. If the information isn't present in the provided context, say so clearly.",
        },
        "skill_default": {
            "description": "Default system prompt used for AI skill execution",
            "template": "You are an expert research analyst. Perform the requested analysis on the provided document content. Be thorough, precise, and well-structured in your response.",
        },
    },
}


def _load_dev_config() -> dict:
    """Load dev config from JSON file, creating with defaults if missing."""
    if DEV_CONFIG_PATH.exists():
        try:
            with open(DEV_CONFIG_PATH, "r") as f:
                config = json.load(f)
            # Merge with defaults to fill any missing keys
            merged = {**DEFAULT_DEV_CONFIG, **config}
            # Deep-merge prompts
            if "prompts" in config and "prompts" in merged:
                for key, val in DEFAULT_DEV_CONFIG["prompts"].items():
                    if key not in merged["prompts"]:
                        merged["prompts"][key] = val
            return merged
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load dev config, using defaults: {e}")
    return DEFAULT_DEV_CONFIG


def _save_dev_config(config: dict) -> None:
    """Save dev config to JSON file."""
    DEV_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DEV_CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


# ── Schemas ──────────────────────────────────────────────────────────────

class SystemMessageResponse(BaseModel):
    system_message: str


class SystemMessageUpdate(BaseModel):
    system_message: str = Field(..., min_length=1, max_length=10000)


class ModelParamsResponse(BaseModel):
    temperature: float
    top_p: float
    max_tokens: int
    frequency_penalty: float
    presence_penalty: float


class ModelParamsUpdate(BaseModel):
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, ge=0.0, le=1.0)
    max_tokens: int | None = Field(default=None, ge=1, le=32768)
    frequency_penalty: float | None = Field(default=None, ge=-2.0, le=2.0)
    presence_penalty: float | None = Field(default=None, ge=-2.0, le=2.0)


class PromptTemplate(BaseModel):
    description: str
    template: str


class PromptsResponse(BaseModel):
    prompts: dict[str, PromptTemplate]


class PromptUpdate(BaseModel):
    description: str | None = None
    template: str = Field(..., min_length=1, max_length=20000)


class DevConfigResponse(BaseModel):
    system_message: str
    temperature: float
    top_p: float
    max_tokens: int
    frequency_penalty: float
    presence_penalty: float
    prompts: dict[str, PromptTemplate]


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("", response_model=DevConfigResponse)
def get_dev_config():
    """Get the full developer configuration."""
    config = _load_dev_config()
    prompts = {
        key: PromptTemplate(description=v["description"], template=v["template"])
        for key, v in config.get("prompts", {}).items()
    }
    return DevConfigResponse(
        system_message=config["system_message"],
        temperature=config["temperature"],
        top_p=config["top_p"],
        max_tokens=config["max_tokens"],
        frequency_penalty=config.get("frequency_penalty", 0.0),
        presence_penalty=config.get("presence_penalty", 0.0),
        prompts=prompts,
    )


@router.get("/system-message", response_model=SystemMessageResponse)
def get_system_message():
    """Get the current system message."""
    config = _load_dev_config()
    return SystemMessageResponse(system_message=config["system_message"])


@router.put("/system-message", response_model=SystemMessageResponse)
def update_system_message(update: SystemMessageUpdate):
    """Update the system message used for AI interactions."""
    config = _load_dev_config()
    config["system_message"] = update.system_message
    _save_dev_config(config)
    return SystemMessageResponse(system_message=config["system_message"])


@router.get("/model-params", response_model=ModelParamsResponse)
def get_model_params():
    """Get the current model parameters."""
    config = _load_dev_config()
    return ModelParamsResponse(
        temperature=config["temperature"],
        top_p=config["top_p"],
        max_tokens=config["max_tokens"],
        frequency_penalty=config.get("frequency_penalty", 0.0),
        presence_penalty=config.get("presence_penalty", 0.0),
    )


@router.put("/model-params", response_model=ModelParamsResponse)
def update_model_params(update: ModelParamsUpdate):
    """Update model parameters (temperature, top_p, max_tokens, etc.)."""
    config = _load_dev_config()
    if update.temperature is not None:
        config["temperature"] = update.temperature
    if update.top_p is not None:
        config["top_p"] = update.top_p
    if update.max_tokens is not None:
        config["max_tokens"] = update.max_tokens
    if update.frequency_penalty is not None:
        config["frequency_penalty"] = update.frequency_penalty
    if update.presence_penalty is not None:
        config["presence_penalty"] = update.presence_penalty
    _save_dev_config(config)
    return ModelParamsResponse(
        temperature=config["temperature"],
        top_p=config["top_p"],
        max_tokens=config["max_tokens"],
        frequency_penalty=config.get("frequency_penalty", 0.0),
        presence_penalty=config.get("presence_penalty", 0.0),
    )


@router.get("/prompts", response_model=PromptsResponse)
def get_prompts():
    """Get all prompt templates."""
    config = _load_dev_config()
    prompts = {
        key: PromptTemplate(description=v["description"], template=v["template"])
        for key, v in config.get("prompts", {}).items()
    }
    return PromptsResponse(prompts=prompts)


@router.put("/prompts/{name}", response_model=PromptTemplate)
def update_prompt(name: str, update: PromptUpdate):
    """Update a specific prompt template by name."""
    config = _load_dev_config()
    if "prompts" not in config:
        config["prompts"] = {}

    if name not in config["prompts"]:
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' not found")

    config["prompts"][name]["template"] = update.template
    if update.description is not None:
        config["prompts"][name]["description"] = update.description

    _save_dev_config(config)
    return PromptTemplate(
        description=config["prompts"][name]["description"],
        template=config["prompts"][name]["template"],
    )
