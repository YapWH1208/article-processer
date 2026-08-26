"""Tests for streamed-chat citation derivation and provider transparency labels."""

import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.models import Article, ArticleChunk, ArticleStatus, ChatMessage
from app.db.session import Base
from app.routers import chat as chat_router
from app.schemas.chat import ChatRequest, MultiArticleChatRequest
from app.services.ai.mock_provider import MockLLMProvider


def _session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'chat_stream.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


def _add_article_with_chunks(db) -> Article:
    article = Article(
        title="Cited Paper",
        status=ArticleStatus.COMPLETED.value,
        original_filename="cited.md",
        source_type="md",
        storage_path="cited.md",
        markdown_text="# Cited Paper\n\nSome body text.",
    )
    db.add(article)
    db.flush()
    db.add(ArticleChunk(
        article_id=article.id,
        chunk_index=0,
        section_title="Introduction",
        page_start=1,
        page_end=2,
        text="First chunk body.",
    ))
    db.add(ArticleChunk(
        article_id=article.id,
        chunk_index=1,
        section_title="Results",
        page_start=None,
        page_end=None,
        text="Second chunk body with findings.",
    ))
    db.commit()
    db.refresh(article)
    return article


class _CounterLlm:
    """Streaming fake whose answer_question must never be called."""

    def __init__(self):
        self.last_usage = None
        self.answer_calls = 0

    async def answer_question(self, **_kwargs):
        self.answer_calls += 1
        raise AssertionError("streamed chat must not run a second LLM generation")

    async def stream_answer(self, **_kwargs):
        for token in ["Answer part one. ", "[Chunk 0] ", "[Chunk 99]"]:
            yield token


class _NamedLlm:
    """Non-mock fake exposing a provider name like the real providers do."""

    _provider_name = "deepseek"
    last_usage = None

    async def answer_question(self, **_kwargs):
        return "Compared answer", []


async def _collect_sse_events(response) -> list[dict]:
    events = []
    async for raw in response.body_iterator:
        chunk = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
        for line in chunk.split("\n"):
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


# -- B1: citation derivation -------------------------------------------------

def test_derive_citations_enriches_valid_and_skips_missing_markers(tmp_path):
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)

    answer = (
        "Point one [Chunk 0]. "
        "Point two [Chunk 1, Section: \"Results\" (Pages 5-6)]. "
        "Dangling [Chunk 99]."
    )

    citations = chat_router.derive_citations_from_answer(db, article.id, answer)

    # Missing chunk 99 is skipped; valid markers are enriched from stored chunks.
    assert [c["chunk_id"] for c in citations] == [0, 1]
    assert citations[0] == {
        "article_id": article.id,
        "article_title": "Cited Paper",
        "chunk_id": 0,
        "section_title": "Introduction",
        "page_start": 1,
        "page_end": 2,
        "snippet": "First chunk body.",
    }
    # Stored metadata wins when present; inline marker pages fill gaps.
    assert citations[1]["section_title"] == "Results"
    assert citations[1]["page_start"] == 5
    assert citations[1]["page_end"] == 6
    assert citations[1]["snippet"] == "Second chunk body with findings."
    db.close()


def test_derive_citations_handles_empty_and_markerless_answers(tmp_path):
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)

    assert chat_router.derive_citations_from_answer(db, article.id, "") == []
    assert chat_router.derive_citations_from_answer(db, article.id, None) == []
    assert chat_router.derive_citations_from_answer(db, article.id, "No markers here.") == []
    db.close()


async def test_streamed_chat_emits_done_without_second_llm_call(tmp_path, monkeypatch):
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)
    llm = _CounterLlm()

    monkeypatch.setattr(chat_router, "get_llm_provider", lambda: llm)
    monkeypatch.setattr(chat_router, "retrieve_relevant_chunks", lambda *_a, **_k: [])

    response = await chat_router.chat_with_article_stream(
        article.id,
        ChatRequest(message="What is this about?"),
        db=db,
    )
    events = await _collect_sse_events(response)

    assert llm.answer_calls == 0  # only stream_answer ran
    assert not any("error" in e for e in events)

    done_events = [e for e in events if e.get("done")]
    assert len(done_events) == 1
    done = done_events[0]
    assert done["answer"] == "Answer part one. [Chunk 0] [Chunk 99]"
    assert [c["chunk_id"] for c in done["citations"]] == [0]

    # Messages persisted exactly once, with the derived citations attached.
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.article_id == article.id)
        .order_by(ChatMessage.id)
        .all()
    )
    assert [(m.role, m.content) for m in messages] == [
        ("user", "What is this about?"),
        ("assistant", "Answer part one. [Chunk 0] [Chunk 99]"),
    ]
    assert json.loads(messages[1].citations_json)[0]["chunk_id"] == 0
    db.close()


# -- B2: provider / mock transparency labels ---------------------------------

async def test_blocking_chat_reports_mock_provider(tmp_path, monkeypatch):
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)
    monkeypatch.setattr(chat_router, "get_llm_provider", lambda: MockLLMProvider())
    monkeypatch.setattr(chat_router, "retrieve_relevant_chunks", lambda *_a, **_k: [])

    response = await chat_router.chat_with_article(
        article.id,
        ChatRequest(message="What is this about?"),
        db=db,
    )

    assert response.mock is True
    assert response.provider == "mock"
    db.close()


async def test_multi_article_chat_reports_named_provider(tmp_path, monkeypatch):
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)
    monkeypatch.setattr(chat_router, "get_llm_provider", lambda: _NamedLlm())
    monkeypatch.setattr(chat_router, "retrieve_relevant_chunks", lambda *_a, **_k: [])

    response = await chat_router.multi_article_chat(
        MultiArticleChatRequest(message="Compare", article_ids=[article.id]),
        db=db,
    )

    assert response.provider == "deepseek"
    assert response.mock is False
    db.close()


def test_provider_metadata_falls_back_to_settings_for_unknown_providers():
    class _AnonymousLlm:
        pass

    provider, mock = chat_router._provider_metadata(_AnonymousLlm())
    assert provider == settings.llm_provider
    assert mock is False


# -- security review follow-ups: marker cap + derivation-failure fallback -----

def test_derive_citations_caps_unique_markers(tmp_path):
    """Document-steered answers can contain hundreds of markers; the IN clause must stay bounded."""
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)
    for i in range(2, chat_router.MAX_DERIVED_CITATIONS + 5):
        db.add(ArticleChunk(
            article_id=article.id,
            chunk_index=i,
            section_title=f"Section {i}",
            page_start=None,
            page_end=None,
            text=f"Body {i}.",
        ))
    db.commit()

    answer = " ".join(f"[Chunk {i}]" for i in range(chat_router.MAX_DERIVED_CITATIONS + 5))
    citations = chat_router.derive_citations_from_answer(db, article.id, answer)

    assert len(citations) == chat_router.MAX_DERIVED_CITATIONS
    assert [c["chunk_id"] for c in citations] == list(range(chat_router.MAX_DERIVED_CITATIONS))
    db.close()


async def test_stream_survives_derivation_failure_and_still_persists(tmp_path, monkeypatch):
    """A citation-derivation error must not sink a fully-streamed answer (security LOW-1)."""
    db = _session(tmp_path)
    article = _add_article_with_chunks(db)
    llm = _CounterLlm()
    monkeypatch.setattr(chat_router, "get_llm_provider", lambda: llm)
    monkeypatch.setattr(chat_router, "retrieve_relevant_chunks", lambda *_a, **_k: [])

    def _boom(*_args, **_kwargs):
        raise RuntimeError("simulated DB hiccup")

    monkeypatch.setattr(chat_router, "derive_citations_from_answer", _boom)

    response = await chat_router.chat_with_article_stream(
        article.id,
        ChatRequest(message="What is this about?"),
        db=db,
    )
    events = await _collect_sse_events(response)

    done_events = [e for e in events if e.get("done")]
    assert len(done_events) == 1
    assert done_events[0]["citations"] == []
    assert not any("error" in e for e in events)

    # The streamed turn is still persisted exactly once, with empty citations.
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.article_id == article.id)
        .order_by(ChatMessage.id)
        .all()
    )
    assert [(m.role) for m in messages] == ["user", "assistant"]
    assert json.loads(messages[1].citations_json) == []
    db.close()
