"""Tests for pipeline terminal states."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import (
    Article,
    ArticleExtraction,
    ArticleStatus,
    JobStatus,
    ProcessingJob,
)
from app.db.session import Base
from app.services.ai.base import TokenUsage
from app.services.pipeline import processor


class EmptyExtractionProvider:
    """LLM provider stub that returns no usable extraction JSON."""

    def __init__(self):
        self.last_usage = TokenUsage()

    async def extract_structured(self, markdown: str, article_title: str):
        return None, ["model returned empty response"], 0.0


class FlakyExtractionProvider:
    """LLM provider stub that fails N times, then succeeds."""

    def __init__(self, fail_times: int):
        self.fail_times = fail_times
        self.calls = 0
        self.last_usage = TokenUsage()

    async def extract_structured(self, markdown: str, article_title: str):
        self.calls += 1
        if self.calls <= self.fail_times:
            return None, [f"transient failure #{self.calls}"], 0.0
        return {"title": article_title, "graph_entities": [], "graph_relationships": []}, None, 0.9


@pytest.mark.asyncio
async def test_pipeline_fails_when_extraction_returns_no_json(tmp_path, monkeypatch):
    db_path = tmp_path / "pipeline.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(processor, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(processor, "get_llm_provider", lambda: EmptyExtractionProvider())

    db = TestingSessionLocal()
    article = Article(
        title="Empty extraction paper",
        status=ArticleStatus.COMPLETED.value,
        original_filename="paper.md",
        source_type="md",
        storage_path=str(tmp_path / "paper.md"),
        markdown_text="# Paper\n\nThis document has text.",
    )
    db.add(article)
    db.commit()
    article_id = article.id
    db.close()

    await processor.run_pipeline(article_id, run_ai=True, start_step="extract")

    db = TestingSessionLocal()
    article = db.query(Article).filter(Article.id == article_id).one()
    job = db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).one()
    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article_id)
        .one()
    )

    assert article.status == ArticleStatus.FAILED.value
    assert article.processing_error == "model returned empty response"
    assert article.needs_review == 1
    assert job.status == JobStatus.FAILED.value
    assert job.current_step == "extracting"
    assert job.error == "model returned empty response"
    assert extraction.extraction_json is None
    assert json.loads(extraction.validation_errors) == ["model returned empty response"]
    db.close()


@pytest.mark.asyncio
async def test_pipeline_retries_extraction_then_succeeds(tmp_path, monkeypatch):
    db_path = tmp_path / "pipeline_retry.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(processor, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(processor, "GraphBuilder", lambda: type("B", (), {"build_from_extraction": lambda self, **kwargs: ([], [])})())
    monkeypatch.setattr(processor, "_retry_delay", lambda attempt: 0.0)

    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr("asyncio.sleep", _no_sleep)

    provider = FlakyExtractionProvider(fail_times=2)
    monkeypatch.setattr(processor, "get_llm_provider", lambda: provider)

    db = TestingSessionLocal()
    article = Article(
        title="Retry extraction paper",
        status=ArticleStatus.COMPLETED.value,
        original_filename="retry.md",
        source_type="md",
        storage_path=str(tmp_path / "retry.md"),
        markdown_text="# Retry\n\nThis document has text.",
    )
    db.add(article)
    db.commit()
    article_id = article.id
    db.close()

    await processor.run_pipeline(article_id, run_ai=True, start_step="extract")

    db = TestingSessionLocal()
    article = db.query(Article).filter(Article.id == article_id).one()
    job = db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).one()
    extraction = db.query(ArticleExtraction).filter(ArticleExtraction.article_id == article_id).one()

    assert article.status in {ArticleStatus.COMPLETED.value, ArticleStatus.NEEDS_REVIEW.value}
    assert job.status == JobStatus.COMPLETED.value
    assert job.retry_count == 2
    assert provider.calls == 3
    assert extraction.extraction_json is not None
    logs = json.loads(job.logs_json or "[]")
    extracting_logs = [entry for entry in logs if entry.get("step") == "extracting"]
    assert len(extracting_logs) >= 3
    db.close()
