"""Tests for Deep Analysis mode (quick vs deep processing modes)."""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import (
    Article,
    ArticleExtraction,
    ArticleStatus,
    JobStatus,
    ProcessingJob,
    TokenUsage,
)
from app.db.session import Base
from app.services.ai.base import TokenUsage as ProviderUsage
from app.services.ai.mock_provider import MockLLMProvider
from app.services.pipeline import processor
from app.routers.articles import get_article_deep_report, reprocess_article


def _make_db(tmp_path, name="deep.sqlite3"):
    db_path = tmp_path / name
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _make_article(session_factory, title="Deep Paper"):
    session = session_factory()
    article = Article(
        title=title,
        status=ArticleStatus.COMPLETED.value,
        original_filename=f"{title.lower().replace(' ', '-')}.md",
        source_type="md",
        storage_path=f"{title.lower().replace(' ', '-')}.md",
        markdown_text=(
            f"# {title}\n\n"
            "## Introduction\n"
            "Background context for the paper.\n\n"
            "## Methodology\n"
            "We propose a new method.\n\n"
            "## Results\n"
            "Accuracy improved by 5%."
        ),
    )
    session.add(article)
    session.commit()
    article_id = article.id
    session.close()
    return article_id


class ReportCapProvider(MockLLMProvider):
    """Mock provider that records deep report calls and can fail them."""

    def __init__(self, fail_report=False):
        super().__init__()
        self.report_calls = 0
        self.fail_report = fail_report
        self.last_usage = ProviderUsage(total_tokens=100, model="mock", provider="mock")

    async def generate_deep_report(self, markdown, article_title, extraction, output_language="en"):
        self.report_calls += 1
        if self.fail_report:
            return None, ["report generation failed"], 0.0
        return await super().generate_deep_report(markdown, article_title, extraction, output_language)


@pytest.fixture
def run_pipeline_env(tmp_path, monkeypatch):
    TestingSessionLocal = _make_db(tmp_path)
    monkeypatch.setattr(processor, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(processor, "_retry_delay", lambda attempt: 0.0)

    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr("asyncio.sleep", _no_sleep)
    return TestingSessionLocal


@pytest.mark.asyncio
async def test_quick_mode_runs_full_pipeline_without_report(run_pipeline_env, tmp_path, monkeypatch):
    provider = ReportCapProvider()
    monkeypatch.setattr(processor, "get_llm_provider", lambda: provider)

    article_id = _make_article(run_pipeline_env)
    await processor.run_pipeline(article_id, run_ai=True, start_step="extract", analysis_mode="quick")

    db = run_pipeline_env()
    article = db.query(Article).filter(Article.id == article_id).one()
    extraction = db.query(ArticleExtraction).filter(ArticleExtraction.article_id == article_id).one()
    job = db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).one()

    assert article.status == ArticleStatus.COMPLETED.value
    assert extraction.extraction_json is not None
    assert extraction.report_json is None
    assert extraction.report_confidence is None
    assert job.analysis_mode == "quick"
    assert provider.report_calls == 0
    logs = json.loads(job.logs_json or "[]")
    assert all(entry.get("step") != "deep_report" for entry in logs)
    db.close()


@pytest.mark.asyncio
async def test_deep_mode_generates_and_persists_report(run_pipeline_env, tmp_path, monkeypatch):
    provider = ReportCapProvider()
    monkeypatch.setattr(processor, "get_llm_provider", lambda: provider)

    article_id = _make_article(run_pipeline_env)
    await processor.run_pipeline(article_id, run_ai=True, start_step="extract", analysis_mode="deep")

    db = run_pipeline_env()
    article = db.query(Article).filter(Article.id == article_id).one()
    extraction = db.query(ArticleExtraction).filter(ArticleExtraction.article_id == article_id).one()
    job = db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).one()
    token_usage = db.query(TokenUsage).filter(
        TokenUsage.article_id == article_id, TokenUsage.step == "deep_report"
    ).first()

    assert article.status == ArticleStatus.COMPLETED.value
    assert provider.report_calls == 1
    assert extraction.report_json is not None
    assert extraction.report_confidence == 0.6
    report = json.loads(extraction.report_json)
    assert report["title"] == "Deep Paper"
    assert report["summary"]
    assert all("heading" in s and "content" in s for s in report["sections"])
    assert token_usage is not None and token_usage.total_tokens == 100
    logs = json.loads(job.logs_json or "[]")
    assert any(entry.get("step") == "deep_report" for entry in logs)
    db.close()


@pytest.mark.asyncio
async def test_deep_report_failure_marks_review_but_completes(run_pipeline_env, tmp_path, monkeypatch):
    provider = ReportCapProvider(fail_report=True)
    monkeypatch.setattr(processor, "get_llm_provider", lambda: provider)

    article_id = _make_article(run_pipeline_env)
    await processor.run_pipeline(article_id, run_ai=True, start_step="extract", analysis_mode="deep")

    db = run_pipeline_env()
    article = db.query(Article).filter(Article.id == article_id).one()
    extraction = db.query(ArticleExtraction).filter(ArticleExtraction.article_id == article_id).one()
    job = db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).one()

    assert article.status == ArticleStatus.NEEDS_REVIEW.value
    assert article.needs_review == 1
    assert job.status == JobStatus.COMPLETED.value
    assert extraction.report_json is None
    assert extraction.extraction_json is not None
    logs = json.loads(job.logs_json or "[]")
    error_log = next((e for e in logs if e.get("step") == "deep_report" and e.get("error")), None)
    assert error_log is not None
    db.close()


def test_reprocess_accepts_deep_and_quick_modes(tmp_path, monkeypatch):
    TestingSessionLocal = _make_db(tmp_path, "reprocess.sqlite3")
    captured = {}

    def fake_background(article_id, run_ai=True, start_step="parse", job_id=None, output_language="en", analysis_mode="quick"):
        captured["analysis_mode"] = analysis_mode
        captured["run_ai"] = run_ai

    monkeypatch.setattr("app.routers.articles.run_pipeline_background", fake_background)

    article_id = _make_article(TestingSessionLocal)
    db = TestingSessionLocal()

    response = reprocess_article(article_id, mode="deep", language="en", db=db)
    assert response.status == "reprocessing"
    assert captured["analysis_mode"] == "deep"
    assert captured["run_ai"] is True
    job = db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).one()
    assert job.analysis_mode == "deep"

    response = reprocess_article(article_id, mode="quick", language="en", db=db)
    assert captured["analysis_mode"] == "quick"

    response = reprocess_article(article_id, mode="full", language="en", db=db)
    assert captured["analysis_mode"] == "quick"

    response = reprocess_article(article_id, mode="parse_only", language="en", db=db)
    assert captured["analysis_mode"] == "quick"
    assert captured["run_ai"] is False

    with pytest.raises(HTTPException) as exc:
        reprocess_article(article_id, mode="bogus", language="en", db=db)
    assert exc.value.status_code == 422
    db.close()


def test_deep_report_endpoint_returns_404_without_report(tmp_path):
    TestingSessionLocal = _make_db(tmp_path, "endpoint.sqlite3")
    article_id = _make_article(TestingSessionLocal)
    db = TestingSessionLocal()

    with pytest.raises(HTTPException) as exc:
        get_article_deep_report(article_id, db=db)
    assert exc.value.status_code == 404

    extraction = ArticleExtraction(
        article_id=article_id,
        schema_version="1.0",
        extraction_json=json.dumps({"title": "Deep Paper"}),
        report_json=json.dumps({"title": "Deep Paper", "summary": "Sum", "sections": []}),
        report_confidence=0.6,
    )
    db.add(extraction)
    db.commit()

    response = get_article_deep_report(article_id, db=db)
    assert response.report.summary == "Sum"
    assert response.confidence == 0.6
    db.close()
