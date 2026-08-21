"""Tests for the OpenAI Responses API provider."""

import json
from types import SimpleNamespace

import pytest

from app.routers import settings_page
from app.services.ai.base import BaseLLMProvider
from app.services.ai.responses_provider import ResponsesAPIProvider


VALID_EXTRACTION_JSON = (
    '{"title": "Paper", "authors": [], "year": null, "venue": null, '
    '"doi": null, "arxiv_id": null, "url": null, "abstract": null, '
    '"background": null, "research_problem": null, "methodology": null, '
    '"datasets": [], "experiments": [], "metrics": [], "results": null, '
    '"limitations": null, "future_work": null, "key_claims": [], '
    '"references": [], "tags": [], "graph_entities": [], '
    '"graph_relationships": []}'
)


class _FakeResponses:
    """Records create() kwargs and pops the next prepared result or exception."""

    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class _FakeClient:
    def __init__(self, results):
        self.responses = _FakeResponses(results)


class _FakeStream:
    """Async iterator over prepared streaming events."""

    def __init__(self, events):
        self.events = list(events)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self.events:
            raise StopAsyncIteration
        return self.events.pop(0)


def _response_result(output_text, input_tokens=10, output_tokens=5, total_tokens=15):
    return SimpleNamespace(
        model="resp-model",
        output_text=output_text,
        usage=SimpleNamespace(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        ),
    )


def _provider_with_results(results):
    provider = ResponsesAPIProvider.__new__(ResponsesAPIProvider)
    BaseLLMProvider.__init__(provider)
    provider.client = _FakeClient(results)
    provider.model = "resp-model"
    provider._provider_name = "custom"
    return provider


@pytest.mark.asyncio
async def test_extract_structured_json_mode_happy_path():
    provider = _provider_with_results([
        _response_result(VALID_EXTRACTION_JSON),
    ])

    result, errors, confidence = await provider.extract_structured(
        markdown="# Paper\n\nBody",
        article_title="Paper",
    )

    calls = provider.client.responses.calls
    assert len(calls) == 1
    call = calls[0]
    assert call["model"] == "resp-model"
    assert call["temperature"] == 0.1
    assert call["max_output_tokens"] == 8000
    assert call["text"] == {"format": {"type": "json_object"}}
    input_messages = call["input"]
    assert len(input_messages) == 2
    assert input_messages[0]["role"] == "system"
    assert input_messages[1]["role"] == "user"
    assert "Title: Paper" in input_messages[1]["content"]
    assert "# Paper" in input_messages[1]["content"]

    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Paper"
    assert result["authors"] == []

    assert provider.last_usage.prompt_tokens == 10
    assert provider.last_usage.completion_tokens == 5
    assert provider.last_usage.total_tokens == 15
    assert provider.last_usage.model == "resp-model"
    assert provider.last_usage.provider == "custom"


@pytest.mark.asyncio
async def test_extract_structured_falls_back_when_json_mode_rejected():
    provider = _provider_with_results([
        Exception("Unknown parameter: 'text.format'"),
        _response_result(VALID_EXTRACTION_JSON),
    ])

    result, errors, confidence = await provider.extract_structured(
        markdown="# Paper\n\nBody",
        article_title="Paper",
    )

    calls = provider.client.responses.calls
    assert len(calls) == 2
    assert calls[0]["text"] == {"format": {"type": "json_object"}}
    assert "text" not in calls[1]
    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Paper"


@pytest.mark.asyncio
async def test_extract_structured_retries_after_empty_output():
    provider = _provider_with_results([
        _response_result(""),
        _response_result(VALID_EXTRACTION_JSON),
    ])

    result, errors, confidence = await provider.extract_structured(
        markdown="# Paper\n\nBody",
        article_title="Paper",
    )

    calls = provider.client.responses.calls
    assert len(calls) == 2
    assert calls[0]["text"] == {"format": {"type": "json_object"}}
    assert "text" not in calls[1]
    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Paper"
    # Usage accumulates across both calls.
    assert provider.last_usage.prompt_tokens == 20
    assert provider.last_usage.completion_tokens == 10
    assert provider.last_usage.total_tokens == 30


@pytest.mark.asyncio
async def test_generate_deep_report_returns_normalized_report():
    report_json = json.dumps({
        "title": "Paper",
        "summary": "A summary of the paper.",
        "sections": [{"heading": "Overview", "content": "Details here."}],
    })
    provider = _provider_with_results([
        _response_result(report_json),
    ])

    result, errors, confidence = await provider.generate_deep_report(
        markdown="# Paper\n\nBody",
        article_title="Paper",
        extraction=None,
    )

    calls = provider.client.responses.calls
    assert len(calls) == 1
    call = calls[0]
    assert call["model"] == "resp-model"
    assert call["temperature"] == 0.2
    assert call["max_output_tokens"] == 12000
    assert call["text"] == {"format": {"type": "json_object"}}
    assert len(call["input"]) == 2

    assert errors is None
    assert confidence == 0.85
    assert result["title"] == "Paper"
    assert result["summary"] == "A summary of the paper."
    assert result["sections"] == [
        {"heading": "Overview", "content": "Details here.", "evidence": None}
    ]
    assert provider.last_usage.total_tokens == 15


@pytest.mark.asyncio
async def test_answer_question_injects_history_and_extracts_citations():
    chunk = SimpleNamespace(
        chunk_index=3,
        section_title="Results",
        page_start=10,
        page_end=12,
        text="Model outperformed baseline by 4 points.",
    )
    provider = _provider_with_results([
        _response_result('Evidence comes from [Chunk 3, Section: "Results"].'),
    ])

    answer, citations = await provider.answer_question(
        question="What were the results?",
        article_title="Paper",
        chunks=[chunk],
        history=[
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
        ],
    )

    calls = provider.client.responses.calls
    assert len(calls) == 1
    call = calls[0]
    assert call["model"] == "resp-model"
    assert call["temperature"] == 0.3
    assert call["max_output_tokens"] == 1500
    assert "text" not in call

    messages = call["input"]
    assert messages[0]["role"] == "system"
    assert messages[1] == {"role": "user", "content": "Earlier question"}
    assert messages[2] == {"role": "assistant", "content": "Earlier answer"}
    assert messages[3]["role"] == "user"
    assert "What were the results?" in messages[3]["content"]
    assert '[Chunk 3, Section: "Results"' in messages[3]["content"]

    assert answer == 'Evidence comes from [Chunk 3, Section: "Results"].'
    assert len(citations) == 1
    assert citations[0]["chunk_id"] == 3
    assert citations[0]["section_title"] == "Results"
    assert citations[0]["page_start"] == 10
    assert citations[0]["page_end"] == 12
    assert citations[0]["snippet"] == "Model outperformed baseline by 4 points."


@pytest.mark.asyncio
async def test_stream_answer_yields_deltas_and_ignores_other_events():
    provider = _provider_with_results([
        _FakeStream([
            SimpleNamespace(type="response.created"),
            SimpleNamespace(type="response.output_text.delta", delta="Hello "),
            SimpleNamespace(type="response.output_text.delta", delta="world"),
            SimpleNamespace(type="response.output_text.done"),
        ]),
    ])

    chunks = []
    async for delta in provider.stream_answer(
        question="Summarize the paper",
        article_title="Paper",
        article_text="Body text of the paper",
    ):
        chunks.append(delta)

    assert chunks == ["Hello ", "world"]

    calls = provider.client.responses.calls
    assert len(calls) == 1
    call = calls[0]
    assert call["model"] == "resp-model"
    assert call["temperature"] == 0.3
    assert call["max_output_tokens"] == 1500
    assert call["stream"] is True
    assert len(call["input"]) == 2


@pytest.mark.asyncio
async def test_run_skill_parses_json_and_captures_usage():
    provider = _provider_with_results([
        _response_result('{"summary": "skill output"}'),
    ])
    skill = SimpleNamespace(
        name="test-skill",
        purpose="Test the skill runner",
        prompt_instructions="Extract the summary",
        output_schema='{"summary": "string"}',
    )

    result = await provider.run_skill(skill, article_markdown="# Paper\n\nBody")

    calls = provider.client.responses.calls
    assert len(calls) == 1
    call = calls[0]
    assert call["model"] == "resp-model"
    assert call["temperature"] == 0.2
    assert call["max_output_tokens"] == 2000
    assert call["text"] == {"format": {"type": "json_object"}}
    assert len(call["input"]) == 2
    assert call["input"][0]["role"] == "system"
    assert call["input"][1]["role"] == "user"
    assert "# Paper" in call["input"][1]["content"]

    assert result == {"summary": "skill output"}
    assert provider.last_usage.prompt_tokens == 10
    assert provider.last_usage.completion_tokens == 5
    assert provider.last_usage.total_tokens == 15


def test_settings_update_accepts_responses_protocol(monkeypatch, tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text("USE_MOCK_AI=true\n", encoding="utf-8")
    sentinel = object()
    monkeypatch.setattr(settings_page, "DOTENV_PATH", env_path)
    monkeypatch.setattr(settings_page, "reload_settings", lambda: None)
    monkeypatch.setattr(settings_page, "get_settings", lambda: sentinel)

    result = settings_page.update_settings(
        settings_page.SettingsUpdate(llm_custom_protocol="responses")
    )

    assert result is sentinel
    assert settings_page._read_env_file()["LLM_CUSTOM_PROTOCOL"] == "responses"
