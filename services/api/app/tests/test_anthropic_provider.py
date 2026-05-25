"""Tests for Anthropic-compatible provider behavior."""

from types import SimpleNamespace

import pytest

from app.services.ai.base import BaseLLMProvider
from app.services.ai.anthropic_provider import AnthropicProvider


class _FakeMessages:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _message_response(text: str):
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


def _provider_with_responses(responses):
    provider = AnthropicProvider.__new__(AnthropicProvider)
    BaseLLMProvider.__init__(provider)
    provider.client = _FakeClient(responses)
    provider.model = "claude-test"
    return provider


@pytest.mark.asyncio
async def test_anthropic_extract_structured_returns_normalized_provider_tuple():
    provider = _provider_with_responses([
        _message_response(
            '{"paper_title": "Claude Paper", "authors": "Alice, Bob", '
            '"year": "2024", "metrics": "accuracy"}'
        )
    ])

    result, errors, confidence = await provider.extract_structured(
        markdown="# Claude Paper\n\nBody",
        article_title="Fallback",
    )

    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Claude Paper"
    assert result["authors"] == ["Alice", "Bob"]
    assert result["metrics"] == ["accuracy"]
    assert result["graph_entities"] == []


@pytest.mark.asyncio
async def test_anthropic_answer_question_accepts_full_article_text():
    provider = _provider_with_responses([
        _message_response("TDD improved code quality according to the document.")
    ])

    answer, citations = await provider.answer_question(
        question="What improved?",
        article_title="TDD Study",
        article_text="TDD improved code quality.",
    )

    assert "TDD" in answer
    assert citations == []
