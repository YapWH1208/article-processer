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

    async def extract_structured(self, markdown: str, article_title: str, output_language: str = "en"):
        return None, ["model returned empty response"], 0.0


class FlakyExtractionProvider:
    """LLM provider stub that fails N times, then succeeds."""

    def __init__(self, fail_times: int):
        self.fail_times = fail_times
        self.calls = 0
        self.last_usage = TokenUsage()

    async def extract_structured(self, markdown: str, article_title: str, output_language: str = "en"):
        self.calls += 1
        if self.calls <= self.fail_times:
            return None, [f"transient failure #{self.calls}"], 0.0
        return {"title": article_title, "graph_entities": [], "graph_relationships": []}, None, 0.9


class CapturingLanguageProvider:
    def __init__(self):
        self.last_usage = TokenUsage()
        self.output_language = None

    async def extract_structured(self, markdown: str, article_title: str, output_language: str = "en"):
        self.output_language = output_language
        return {"title": article_title, "graph_entities": [], "graph_relationships": []}, None, 0.9


def test_pdf_parser_notice_logs_each_unique_message_once(monkeypatch):
    info_messages = []
    warning_messages = []
    processor._pdf_parser_notice_logged_messages.clear()
    monkeypatch.setattr(processor.logger, "info", lambda message: info_messages.append(message))
    monkeypatch.setattr(processor.logger, "warning", lambda message: warning_messages.append(message))

    processor._log_pdf_parser_notice("docling requested but not installed, falling back", warning=True)
    processor._log_pdf_parser_notice("docling requested but not installed, falling back", warning=True)
    processor._log_pdf_parser_notice("Neither MinerU nor Docling installed - pypdf will be used")
    processor._log_pdf_parser_notice("Neither MinerU nor Docling installed - pypdf will be used")

    assert warning_messages == ["docling requested but not installed, falling back"]
    assert info_messages == ["Neither MinerU nor Docling installed - pypdf will be used"]


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
        processing_error="previous parser failure",
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
    assert article.processing_error is None
    assert job.status == JobStatus.COMPLETED.value
    assert job.retry_count == 2
    assert provider.calls == 3
    assert extraction.extraction_json is not None
    logs = json.loads(job.logs_json or "[]")
    extracting_logs = [entry for entry in logs if entry.get("step") == "extracting"]
    assert len(extracting_logs) >= 3
    db.close()


@pytest.mark.asyncio
async def test_pipeline_passes_output_language_to_extraction(tmp_path, monkeypatch):
    db_path = tmp_path / "pipeline_language.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(processor, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(processor, "GraphBuilder", lambda: type("B", (), {"build_from_extraction": lambda self, **kwargs: ([], [])})())

    provider = CapturingLanguageProvider()
    monkeypatch.setattr(processor, "get_llm_provider", lambda: provider)

    db = TestingSessionLocal()
    article = Article(
        title="French paper",
        status=ArticleStatus.COMPLETED.value,
        original_filename="french.md",
        source_type="md",
        storage_path=str(tmp_path / "french.md"),
        markdown_text="# Papier\n\nCeci est un article en français.",
    )
    db.add(article)
    db.commit()
    article_id = article.id
    db.close()

    await processor.run_pipeline(article_id, run_ai=True, start_step="extract", output_language="zh")

    assert provider.output_language == "zh"
