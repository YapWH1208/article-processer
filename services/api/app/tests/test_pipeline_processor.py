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
