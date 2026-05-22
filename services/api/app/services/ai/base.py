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
    """Factory: return the configured LLM provider."""
    if settings.use_mock_ai or not settings.openai_api_key:
        from app.services.ai.mock_provider import MockLLMProvider
        return MockLLMProvider()
    else:
        from app.services.ai.openai_provider import OpenAIProvider
        return OpenAIProvider()


def get_embedding_provider() -> BaseEmbeddingProvider:
    """Factory: return the configured embedding provider."""
    if settings.use_mock_ai or not settings.openai_api_key:
        from app.services.ai.mock_provider import MockEmbeddingProvider
        return MockEmbeddingProvider()
    else:
        from app.services.ai.openai_provider import OpenAIEmbeddingProvider
        return OpenAIEmbeddingProvider()
