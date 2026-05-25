"""Abstract LLM provider interface with factory function."""

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class TokenUsage:
    """Token usage snapshot from an AI provider call."""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    model: str = ""
    provider: str = ""


class BaseLLMProvider(ABC):
    """Abstract interface for LLM providers.

    Subclasses should set ``self.last_usage`` after each API call so callers
    can record token consumption without changing every return signature.
    """

    def __init__(self) -> None:
        self.last_usage = TokenUsage()

    @abstractmethod
    async def extract_structured(
        self, markdown: str, article_title: str,
    ) -> tuple[dict | None, list[str] | None, float]:
        ...

    @abstractmethod
    async def answer_question(
        self, question: str, article_title: str, article_text: str,
    ) -> tuple[str, list[dict]]:
        ...

    @abstractmethod
    async def run_skill(self, skill: Any, article_markdown: str) -> dict:
        ...


# ── LLM Factory ───────────────────────────────────────────────────────────

DEV_CONFIG_PATH = settings.project_root / "data" / "dev_config.json"

# Known provider presets (base URL + default model for common providers)
KNOWN_PROVIDER_PRESETS: dict[str, dict] = {
    "openai": {"base_url": "https://api.openai.com/v1", "default_model": "gpt-4.1-mini"},
    "anthropic": {"base_url": "https://api.anthropic.com", "default_model": "claude-sonnet-4-20250514"},
    "deepseek": {"base_url": "https://api.deepseek.com/v1", "default_model": "deepseek-chat"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "default_model": "openai/gpt-4.1-mini"},
    "glm": {"base_url": "https://open.bigmodel.cn/api/paas/v4", "default_model": "glm-4-plus"},
    "minimax": {"base_url": "https://api.minimax.chat/v1", "default_model": "MiniMax-Text-01"},
    "mimo": {"base_url": "https://api.minimax.chat/v1", "default_model": "MiniMax-M1"},
    "kimi": {"base_url": "https://api.moonshot.cn/v1", "default_model": "moonshot-v1-8k"},
}


def _load_providers() -> list[dict]:
    """Load provider configs from dev_config.json."""
    if DEV_CONFIG_PATH.exists():
        try:
            with open(DEV_CONFIG_PATH, "r") as f:
                config = json.load(f)
            return config.get("providers", [])
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _get_active_provider_id() -> str | None:
    """Get the active provider id from dev_config."""
    if DEV_CONFIG_PATH.exists():
        try:
            with open(DEV_CONFIG_PATH, "r") as f:
                config = json.load(f)
            return config.get("active_provider_id")
        except (json.JSONDecodeError, OSError):
            pass
    return None


def _build_provider_from_entry(entry: dict) -> BaseLLMProvider:
    """Build a provider instance from a dev_config provider entry."""
    provider_type = entry.get("type", "custom")
    api_key = entry.get("api_key", "")
    base_url = entry.get("base_url", "")
    model = entry.get("model", "")
    protocol = entry.get("protocol", "openai")

    # If type is a known preset and base_url is empty, fill from preset
    if provider_type in KNOWN_PROVIDER_PRESETS and not base_url:
        preset = KNOWN_PROVIDER_PRESETS[provider_type]
        base_url = preset["base_url"]
        if not model:
            model = preset["default_model"]

    if protocol == "anthropic" or provider_type == "anthropic":
        from app.services.ai.anthropic_provider import AnthropicProvider, CustomAnthropicProvider
        if provider_type == "anthropic" and not base_url.startswith("http"):
            # Native Anthropic — use env key if provider key is empty
            key = api_key or settings.anthropic_api_key
            if not key:
                from app.services.ai.mock_provider import MockLLMProvider
                return MockLLMProvider()
            return AnthropicProvider()
        else:
            from app.services.ai.anthropic_provider import CustomAnthropicProvider
            return CustomAnthropicProvider()
    else:
        # OpenAI-compatible (covers openai, deepseek, openrouter, glm, minimax, mimo, kimi, custom)
        from app.services.ai.openai_provider import CustomOpenAIProvider, OpenAIProvider
        if provider_type == "openai" and api_key:
            # Use native OpenAI only when explicitly configured with a key
            return OpenAIProvider()
        # Everything else goes through CustomOpenAIProvider
        if not base_url:
            # Fall back to env settings for backward compat
            if provider_type in KNOWN_PROVIDER_PRESETS:
                base_url = KNOWN_PROVIDER_PRESETS[provider_type]["base_url"]
            else:
                base_url = settings.llm_custom_base_url or "http://localhost:11434/v1"

        effective_key = api_key or getattr(settings, f"{provider_type}_api_key", None) or ""
        if not effective_key and provider_type not in ("custom",):
            effective_key = "not-needed"  # local models like Ollama don't need keys

        effective_model = model or getattr(settings, f"{provider_type}_model", "") or "gpt-4.1-mini"

        return CustomOpenAIProvider(
            base_url=base_url,
            api_key=effective_key,
            model=effective_model,
        )


def get_llm_provider() -> BaseLLMProvider:
    """Factory: return the configured LLM provider.

    Priority:
    1. dev_config.json providers list (active_provider_id) — multi-provider mode
    2. Environment variable settings (llm_provider) — legacy single-provider mode
    3. Mock provider fallback
    """
    # Mock mode
    if settings.use_mock_ai:
        from app.services.ai.mock_provider import MockLLMProvider
        return MockLLMProvider()

    # Try dev_config providers first
    providers = _load_providers()
    active_id = _get_active_provider_id()

    if providers and active_id:
        active_entry = next((p for p in providers if p.get("id") == active_id), None)
        if active_entry:
            try:
                return _build_provider_from_entry(active_entry)
            except Exception as e:
                logger.warning(f"Failed to build provider '{active_id}': {e}")
                # Fall through to legacy

    # Legacy: env-based single provider
    provider = settings.llm_provider

    if provider == "openai":
        if not settings.openai_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import OpenAIProvider
        return OpenAIProvider()

    elif provider == "anthropic":
        if not settings.anthropic_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.anthropic_provider import AnthropicProvider
        return AnthropicProvider()

    elif provider == "custom":
        if not settings.llm_custom_base_url or not settings.llm_custom_model:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        if settings.llm_custom_protocol == "anthropic":
            from app.services.ai.anthropic_provider import CustomAnthropicProvider
            return CustomAnthropicProvider()
        else:
            from app.services.ai.openai_provider import CustomOpenAIProvider
            return CustomOpenAIProvider()

    elif provider in {"deepseek", "openrouter", "glm", "minimax", "mimo", "kimi"}:
        preset = KNOWN_PROVIDER_PRESETS.get(provider, {})
        api_key = getattr(settings, f"{provider}_api_key", "")
        model = getattr(settings, f"{provider}_model", "")
        if not api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url=preset.get("base_url", ""),
            api_key=api_key,
            model=model or preset.get("default_model", ""),
        )

    # Fallback
    from app.services.ai.mock_provider import MockLLMProvider
    return MockLLMProvider()
