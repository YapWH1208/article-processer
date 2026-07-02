"""Tests for chat persistence contracts."""

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleStatus, ChatMessage
from app.db.session import Base
from app.routers import chat as chat_router
from app.schemas.chat import MultiArticleChatRequest


class _FakeLlm:
    last_usage = None

    async def answer_question(self, **_kwargs):
        return "Compared answer", []


class _FailingLlm:
    last_usage = None

    async def answer_question(self, **_kwargs):
        raise AssertionError("LLM should not run when persistence target is invalid")


def _session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'chat.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


async def test_multi_article_chat_can_persist_to_current_article_history(tmp_path, monkeypatch):
    db = _session(tmp_path)
    primary = Article(
        title="Primary",
        status=ArticleStatus.COMPLETED.value,
        original_filename="primary.md",
        source_type="md",
        storage_path="primary.md",
        markdown_text="# Primary",
    )
    related = Article(
        title="Related",
        status=ArticleStatus.COMPLETED.value,
        original_filename="related.md",
        source_type="md",
        storage_path="related.md",
        markdown_text="# Related",
    )
    db.add_all([primary, related])
    db.commit()

    monkeypatch.setattr(chat_router, "get_llm_provider", lambda: _FakeLlm())
    monkeypatch.setattr(chat_router, "retrieve_relevant_chunks", lambda *_args, **_kwargs: [])

    await chat_router.multi_article_chat(
        MultiArticleChatRequest(
            message="Compare them",
            article_ids=[primary.id, related.id],
            persist_to_article_id=primary.id,
        ),
        db=db,
    )

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.article_id == primary.id)
        .order_by(ChatMessage.id)
        .all()
    )
    assert [(message.role, message.content) for message in messages] == [
        ("user", "Compare them"),
        ("assistant", "Compared answer"),
    ]
    assert messages[1].citations_json == "[]"
    db.close()


async def test_multi_article_chat_rejects_invalid_persistence_target_before_llm_work(tmp_path, monkeypatch):
    db = _session(tmp_path)
    primary = Article(
        title="Primary",
        status=ArticleStatus.COMPLETED.value,
        original_filename="primary.md",
        source_type="md",
        storage_path="primary.md",
        markdown_text="# Primary",
    )
    unrelated = Article(
        title="Unrelated",
        status=ArticleStatus.COMPLETED.value,
        original_filename="unrelated.md",
        source_type="md",
        storage_path="unrelated.md",
        markdown_text="# Unrelated",
    )
    db.add_all([primary, unrelated])
    db.commit()

    def fail_retrieval(*_args, **_kwargs):
        raise AssertionError("retrieval should not run when persistence target is invalid")

    monkeypatch.setattr(chat_router, "get_llm_provider", lambda: _FailingLlm())
    monkeypatch.setattr(chat_router, "retrieve_relevant_chunks", fail_retrieval)

    with pytest.raises(HTTPException) as exc:
        await chat_router.multi_article_chat(
            MultiArticleChatRequest(
                message="Compare them",
                article_ids=[primary.id],
                persist_to_article_id=unrelated.id,
            ),
            db=db,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "persist_to_article_id must be included in article_ids"
    db.close()
