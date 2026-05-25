"""Tests for OpenAI-compatible provider behavior."""

from types import SimpleNamespace

import pytest

from app.services.ai.base import BaseLLMProvider
from app.services.ai.openai_provider import OpenAIProvider


class _FakeCompletions:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


class _FakeClient:
    def __init__(self, responses):
        self.chat = SimpleNamespace(completions=_FakeCompletions(responses))


def _chat_response(content: str, finish_reason: str = "stop"):
    return SimpleNamespace(
        model="deepseek-v4-pro",
        choices=[
            SimpleNamespace(
                finish_reason=finish_reason,
                message=SimpleNamespace(content=content),
            )
        ],
        usage=SimpleNamespace(
            prompt_tokens=10,
            completion_tokens=5 if content else 0,
            total_tokens=15 if content else 10,
        ),
    )


def _provider_with_responses(responses):
    provider = OpenAIProvider.__new__(OpenAIProvider)
    BaseLLMProvider.__init__(provider)
    provider.client = _FakeClient(responses)
    provider.model = "deepseek-v4-pro"
    provider._provider_name = "custom"
    return provider


@pytest.mark.asyncio
async def test_extract_structured_retries_without_json_mode_after_empty_json_response():
    provider = _provider_with_responses([
        _chat_response(""),
        _chat_response(
            '{"title": "Paper", "authors": [], "year": null, "venue": null, '
            '"doi": null, "arxiv_id": null, "url": null, "abstract": null, '
            '"background": null, "research_problem": null, "methodology": null, '
            '"datasets": [], "experiments": [], "metrics": [], "results": null, '
            '"limitations": null, "future_work": null, "key_claims": [], '
            '"references": [], "tags": [], "graph_entities": [], '
            '"graph_relationships": []}'
        ),
    ])

    result, errors, confidence = await provider.extract_structured(
        markdown="# Paper\n\nBody",
        article_title="Paper",
    )

    calls = provider.client.chat.completions.calls
    assert len(calls) == 2
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert "response_format" not in calls[1]
    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Paper"


@pytest.mark.asyncio
async def test_extract_structured_normalizes_partial_provider_response_without_retry():
    provider = _provider_with_responses([
        _chat_response(
            '{"paper_title": "Partial Paper", "authors": "Alice, Bob", '
            '"year": "2024", "datasets": {"name": "ImageNet"}, '
            '"graph_entities": [{"type": "method", "name": "FastLearn"}]}'
        ),
    ])

    result, errors, confidence = await provider.extract_structured(
        markdown="# Partial Paper\n\nBody",
        article_title="Fallback",
    )

    calls = provider.client.chat.completions.calls
    assert len(calls) == 1
    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Partial Paper"
    assert result["authors"] == ["Alice", "Bob"]
    assert result["datasets"] == ["ImageNet"]
    assert result["abstract"] is None
    assert result["graph_entities"][0]["type"] == "Method"


def test_extract_citations_matches_chunk_header_format_with_page_range():
    provider = _provider_with_responses([])
    chunk = SimpleNamespace(
        chunk_index=3,
        section_title="Results",
        page_start=10,
        page_end=12,
        text="Model outperformed baseline by 4 points.",
    )

    header = provider._format_chunk_for_context(chunk).splitlines()[0]
    answer = f"Evidence comes from {header}."
    citations = provider._extract_citations(answer, [chunk])

    assert len(citations) == 1
    assert citations[0]["chunk_id"] == 3
    assert citations[0]["page_start"] == 10
    assert citations[0]["page_end"] == 12
