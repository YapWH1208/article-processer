"""Tests for global job queue visibility."""

import datetime
import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleStatus, JobStatus, ProcessingJob
from app.db.session import Base
from app.routers.dashboard import get_job_queue


def test_job_queue_summarizes_jobs_by_queue_state(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    article = Article(
        title="Queue Article",
        status=ArticleStatus.EXTRACTING.value,
        original_filename="queue.md",
        source_type="md",
        storage_path="queue.md",
    )
    db.add(article)
    db.flush()

    now = datetime.datetime.utcnow()
    jobs = [
        ProcessingJob(
            article_id=article.id,
            status=JobStatus.COMPLETED.value,
            current_step="complete",
            logs_json=json.dumps([]),
            created_at=now - datetime.timedelta(minutes=8),
            completed_at=now - datetime.timedelta(minutes=7),
        ),
        ProcessingJob(
            article_id=article.id,
            status=JobStatus.FAILED.value,
            current_step="extracting",
            logs_json=json.dumps([]),
            error="model timeout",
            created_at=now - datetime.timedelta(minutes=5),
        ),
        ProcessingJob(
            article_id=article.id,
            status=JobStatus.PENDING.value,
            current_step="queued",
            logs_json=json.dumps([]),
            created_at=now - datetime.timedelta(minutes=2),
        ),
        ProcessingJob(
            article_id=article.id,
            status=JobStatus.RUNNING.value,
            current_step="parsing",
            logs_json=json.dumps([]),
            created_at=now - datetime.timedelta(minutes=1),
            locked_at=now - datetime.timedelta(seconds=30),
            worker_id="worker-1",
        ),
    ]
    db.add_all(jobs)
    db.commit()

    response = get_job_queue(limit=10, db=db)

    assert response["counts"] == {
        "active": 1,
        "queued": 1,
        "failed": 1,
        "completed": 1,
    }
    assert [job["queue_state"] for job in response["jobs"]] == [
        "active",
        "queued",
        "failed",
        "completed",
    ]
    active = response["jobs"][0]
    assert active["article_title"] == "Queue Article"
    assert active["worker_id"] == "worker-1"
    assert active["can_retry"] is False
    failed = response["jobs"][2]
    assert failed["error"] == "model timeout"
    assert failed["can_retry"] is True
