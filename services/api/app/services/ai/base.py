"""Abstract LLM provider interface with factory function."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
from app.core.config import settings


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
        self, question: str, article_title: str, chunks: list[Any],
    ) -> tuple[str, list[dict]]:
        ...

    @abstractmethod
    async def run_skill(self, skill: Any, article_markdown: str) -> dict:
        ...


class BaseEmbeddingProvider(ABC):
    """Abstract interface for embedding providers.

    Subclasses should set ``self.last_usage`` after each API call.
    """

    def __init__(self) -> None:
        self.last_usage = TokenUsage()

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        ...

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...


# ── LLM Factory ───────────────────────────────────────────────────────────

def get_llm_provider() -> BaseLLMProvider:
    """Factory: return the configured LLM provider."""
    if settings.use_mock_ai:
        from app.services.ai.mock_provider import MockLLMProvider
        return MockLLMProvider()

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
            # Default: OpenAI-compatible protocol
            from app.services.ai.openai_provider import CustomOpenAIProvider
            return CustomOpenAIProvider()

    elif provider == "deepseek":
        if not settings.deepseek_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url="https://api.deepseek.com/v1",
            api_key=settings.deepseek_api_key,
            model=settings.deepseek_model,
        )

    elif provider == "openrouter":
        if not settings.openrouter_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
        )

    elif provider == "glm":
        if not settings.glm_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url="https://open.bigmodel.cn/api/paas/v4",
            api_key=settings.glm_api_key,
            model=settings.glm_model,
        )

    elif provider == "minimax":
        if not settings.minimax_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url="https://api.minimax.chat/v1",
            api_key=settings.minimax_api_key,
            model=settings.minimax_model,
        )

    elif provider == "mimo":
        if not settings.mimo_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url="https://api.minimax.chat/v1",
            api_key=settings.mimo_api_key,
            model=settings.mimo_model,
        )

    elif provider == "kimi":
        if not settings.kimi_api_key:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider(
            base_url="https://api.moonshot.cn/v1",
            api_key=settings.kimi_api_key,
            model=settings.kimi_model,
        )

    # Fallback
    from app.services.ai.mock_provider import MockLLMProvider
    return MockLLMProvider()


# ── Embedding Factory ─────────────────────────────────────────────────────

def get_embedding_provider() -> BaseEmbeddingProvider:
    """Factory: return the configured embedding provider."""
    if settings.use_mock_ai:
        from app.services.ai.mock_provider import MockEmbeddingProvider
        return MockEmbeddingProvider()

    provider = settings.embedding_provider

    if provider == "openai":
        if settings.openai_api_key:
            from app.services.ai.openai_provider import OpenAIEmbeddingProvider
            return OpenAIEmbeddingProvider()

    elif provider == "custom":
        if settings.embedding_custom_base_url and settings.embedding_custom_model:
            # Use OpenAIEmbeddingProvider pointed at custom endpoint
            from app.services.ai.openai_provider import CustomEmbeddingProvider
            return CustomEmbeddingProvider()

    # Fallback to mock
    from app.services.ai.mock_provider import MockEmbeddingProvider
    return MockEmbeddingProvider()
