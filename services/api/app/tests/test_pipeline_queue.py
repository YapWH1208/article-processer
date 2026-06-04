"""Tests for durable queued pipeline execution."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleStatus, JobStatus, ProcessingJob
from app.db.session import Base
from app.services.pipeline import processor


@pytest.mark.asyncio
async def test_run_queued_pipeline_job_uses_persisted_payload(tmp_path, monkeypatch):
    db_path = tmp_path / "queue.sqlite3"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(processor, "SessionLocal", TestingSessionLocal)

    calls = []

    async def fake_run_pipeline(
        article_id: int,
        run_ai: bool = True,
        start_step: str = "parse",
        job_id: int | None = None,
        output_language: str = "en",
    ):
        calls.append((article_id, run_ai, start_step, job_id, output_language))
        db = TestingSessionLocal()
        job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).one()
        job.status = JobStatus.COMPLETED.value
        db.commit()
        db.close()

    monkeypatch.setattr(processor, "run_pipeline", fake_run_pipeline)

    db = TestingSessionLocal()
    article = Article(
        title="Queued",
        status=ArticleStatus.UPLOADED.value,
        original_filename="queued.md",
        source_type="md",
        storage_path="queued.md",
    )
    db.add(article)
    db.flush()
    job = ProcessingJob(
        article_id=article.id,
        status=JobStatus.PENDING.value,
        current_step="queued",
        logs_json=json.dumps([]),
        run_ai=0,
        start_step="parse",
        output_language="zh",
    )
    db.add(job)
    db.commit()
    article_id = article.id
    job_id = job.id
    db.close()

    processed = await processor.run_queued_pipeline_job_once()

    assert processed is True
    assert calls == [(article_id, False, "parse", job_id, "zh")]
