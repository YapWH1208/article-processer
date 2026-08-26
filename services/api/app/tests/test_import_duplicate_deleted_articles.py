"""Regression tests for reimporting soft-deleted articles."""

import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import compute_file_hash
from app.db.models import Article, ArticleStatus, JobStatus, ProcessingJob
from app.db.session import Base
from app.routers import imports, uploads


class MemoryUpload:
    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self._content = content

    async def read(self) -> bytes:
        return self._content


class StubStorage:
    def __init__(self, root):
        self.root = root

    def save_upload(self, safe_name: str, content: bytes):
        path = self.root / safe_name
        path.write_bytes(content)
        return path


@pytest.fixture
def db_session(tmp_path):
    db_path = tmp_path / "imports.sqlite3"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def add_deleted_article(db, *, file_hash: str, title: str = "Deleted Article") -> Article:
    article = Article(
        title=title,
        status=ArticleStatus.COMPLETED.value,
        original_filename="deleted.pdf",
        file_hash=file_hash,
        source_type="pdf",
        storage_path="deleted.pdf",
        deleted_at=datetime.datetime.utcnow(),
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@pytest.mark.asyncio
async def test_upload_creates_new_article_when_duplicate_hash_is_soft_deleted(
    db_session,
    tmp_path,
    monkeypatch,
):
    content = b"%PDF-1.4\nsame upload content\n"
    deleted = add_deleted_article(db_session, file_hash=compute_file_hash(content))

    monkeypatch.setattr(uploads, "storage", StubStorage(tmp_path))
    monkeypatch.setattr(uploads, "run_pipeline_background", lambda *args, **kwargs: None)

    response = await uploads.upload_file(
        file=MemoryUpload("paper.pdf", content),
        run_ai="false",
        db=db_session,
    )

    assert response.article_id != deleted.id
    article = db_session.query(Article).filter(Article.id == response.article_id).one()
    assert article.deleted_at is None


@pytest.mark.asyncio
async def test_url_import_creates_new_article_when_duplicate_hash_is_soft_deleted(
    db_session,
    tmp_path,
    monkeypatch,
):
    content = b"%PDF-1.4\nsame url content\n"
    deleted = add_deleted_article(db_session, file_hash=compute_file_hash(content))

    def fake_download(_url, dest_path, max_bytes, timeout=60):
        dest_path.write_bytes(content)

    monkeypatch.setattr(imports.settings, "storage_dir", str(tmp_path / "storage"))
    monkeypatch.setattr(imports, "_download_file", fake_download)

    from app.services.pipeline import processor

    monkeypatch.setattr(processor, "run_pipeline_background", lambda *args, **kwargs: None)

    response = await imports.import_from_url(
        imports.UrlImportRequest(url="https://8.8.8.8/paper.pdf", run_ai=False),
        db=db_session,
    )

    assert response.article_id != deleted.id
    article = db_session.query(Article).filter(Article.id == response.article_id).one()
    assert article.deleted_at is None


@pytest.mark.asyncio
async def test_json_import_creates_new_article_when_duplicate_hash_is_soft_deleted(db_session):
    title = "Exported Deleted Article"
    original_filename = "exported.md"
    file_hash = compute_file_hash(title.encode() + original_filename.encode())
    deleted = add_deleted_article(db_session, file_hash=file_hash, title=title)

    response = await imports.import_articles(
        {
            "articles": [
                {
                    "article": {
                        "title": title,
                        "original_filename": original_filename,
                        "source_type": "md",
                    },
                    "markdown": "# Reimported",
                }
            ]
        },
        db=db_session,
    )

    assert response["imported"] == 1
    assert response["skipped"] == 0
    articles = db_session.query(Article).filter(Article.file_hash == file_hash).all()
    assert {article.id for article in articles} != {deleted.id}
    assert sum(1 for article in articles if article.deleted_at is None) == 1


@pytest.mark.asyncio
async def test_duplicate_upload_flags_duplicate_and_returns_latest_job(db_session):
    content = b"%PDF-1.4\nduplicate flag content\n"
    existing = Article(
        title="Existing",
        status=ArticleStatus.COMPLETED.value,
        original_filename="existing.pdf",
        file_hash=compute_file_hash(content),
        source_type="pdf",
        storage_path="existing.pdf",
    )
    db_session.add(existing)
    db_session.flush()
    older_job = ProcessingJob(
        article_id=existing.id,
        status=JobStatus.COMPLETED.value,
        created_at=datetime.datetime.utcnow() - datetime.timedelta(seconds=60),
    )
    latest_job = ProcessingJob(
        article_id=existing.id,
        status=JobStatus.PENDING.value,
        created_at=datetime.datetime.utcnow(),
    )
    db_session.add_all([older_job, latest_job])
    db_session.commit()

    response = await uploads.upload_file(
        file=MemoryUpload("existing.pdf", content),
        run_ai="false",
        db=db_session,
    )

    # Dedup must be distinguishable from a fresh upload and point at the
    # existing article's latest job.
    assert response.duplicate is True
    assert response.article_id == existing.id
    assert response.job_id == latest_job.id
    assert response.filename == existing.original_filename


@pytest.mark.asyncio
async def test_fresh_upload_defaults_to_duplicate_false(db_session, tmp_path, monkeypatch):
    content = b"%PDF-1.4\nbrand new content\n"

    monkeypatch.setattr(uploads, "storage", StubStorage(tmp_path))
    monkeypatch.setattr(uploads, "run_pipeline_background", lambda *args, **kwargs: None)

    response = await uploads.upload_file(
        file=MemoryUpload("fresh.pdf", content),
        run_ai="false",
        db=db_session,
    )

    assert response.duplicate is False
    article = db_session.query(Article).filter(Article.id == response.article_id).one()
    assert response.job_id != 0
