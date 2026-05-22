"""Abstract LLM provider interface with factory function."""

from abc import ABC, abstractmethod
from typing import Any
from app.core.config import settings


class BaseLLMProvider(ABC):
    """Abstract interface for LLM providers."""

    @abstractmethod
    async def extract_structured(
        self,
        markdown: str,
        article_title: str,
    ) -> tuple[dict | None, list[str] | None, float]:
        """Extract structured information from article Markdown.

        Returns:
            (extraction_dict, validation_errors, confidence)
        """
        ...

    @abstractmethod
    async def answer_question(
        self,
        question: str,
        article_title: str,
        chunks: list[Any],
    ) -> tuple[str, list[dict]]:
        """Answer a question using retrieved chunks.

        Returns:
            (answer_text, citations_list)
        """
        ...

    @abstractmethod
    async def run_skill(self, skill: Any, article_markdown: str) -> dict:
        """Run a skill/extraction workflow on article Markdown.

        Returns:
            result dict
        """
        ...


class BaseEmbeddingProvider(ABC):
    """Abstract interface for embedding providers."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for the given text."""
        ...

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        ...


def get_llm_provider() -> BaseLLMProvider:
    """Factory: return the configured LLM provider based on ai_provider setting."""
    provider = settings.ai_provider

    # Mock mode always wins
    if settings.use_mock_ai:
        from app.services.ai.mock_provider import MockLLMProvider
        return MockLLMProvider()

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

    elif provider == "custom_openai":
        if not settings.custom_api_base or not settings.custom_model:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.openai_provider import CustomOpenAIProvider
        return CustomOpenAIProvider()

    elif provider == "custom_anthropic":
        if not settings.custom_api_base or not settings.custom_model:
            from app.services.ai.mock_provider import MockLLMProvider
            return MockLLMProvider()
        from app.services.ai.anthropic_provider import CustomAnthropicProvider
        return CustomAnthropicProvider()

    # Fallback
    from app.services.ai.mock_provider import MockLLMProvider
    return MockLLMProvider()


def get_embedding_provider() -> BaseEmbeddingProvider:
    """Factory: return the configured embedding provider."""
    provider = settings.ai_provider

    if settings.use_mock_ai:
        from app.services.ai.mock_provider import MockEmbeddingProvider
        return MockEmbeddingProvider()

    # For custom providers, still try OpenAI embeddings if key is set,
    # otherwise fall back to mock
    if provider in ("openai", "custom_openai"):
        if settings.openai_api_key:
            from app.services.ai.openai_provider import OpenAIEmbeddingProvider
            return OpenAIEmbeddingProvider()
    elif provider in ("anthropic", "custom_anthropic"):
        # Anthropic doesn't have embeddings — use OpenAI if key set, else mock
        if settings.openai_api_key:
            from app.services.ai.openai_provider import OpenAIEmbeddingProvider
            return OpenAIEmbeddingProvider()

    from app.services.ai.mock_provider import MockEmbeddingProvider
    return MockEmbeddingProvider()
