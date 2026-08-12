"""Tests for URL import safety, source recognition, and recovery."""

import socket
import urllib.error

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ProcessingJob
from app.db.session import Base
from app.routers import imports


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'imports.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        yield session
    finally:
        session.close()


def test_safe_redirect_handler_rejects_private_redirect_targets():
    try:
        from app.routers.imports import SafeRedirectHandler, UnsafeUrlError
    except ImportError as exc:
        raise AssertionError("safe redirect handler is missing") from exc

    handler = SafeRedirectHandler()

    with pytest.raises(UnsafeUrlError):
        handler.redirect_request(
            req=None,
            fp=None,
            code=302,
            msg="Found",
            headers={},
            newurl="http://127.0.0.1/internal.pdf",
        )


def test_url_type_detection_accepts_arxiv_and_openreview_pdf_endpoints():
    assert imports._detect_url_type("https://arxiv.org/abs/1706.03762") == (
        "arxiv",
        "1706.03762",
    )
    assert imports._detect_url_type("https://arxiv.org/pdf/1706.03762.pdf") == (
        "arxiv",
        "1706.03762",
    )
    assert imports._detect_url_type("https://openreview.net/pdf?id=paper-1") == (
        "direct-pdf",
        "https://openreview.net/pdf?id=paper-1",
    )
    assert imports._detect_url_type("https://openreview.net/forum?id=paper-1") == (
        "unknown",
        None,
    )
    assert imports._detect_url_type("https://evil-arxiv.org/abs/1706.03762") == (
        "unknown",
        None,
    )


@pytest.mark.asyncio
async def test_arxiv_import_downloads_export_pdf_and_creates_article(
    db_session,
    tmp_path,
    monkeypatch,
):
    downloaded_urls: list[str] = []

    def public_arxiv_address(host, port, *args, **kwargs):
        assert host == "arxiv.org"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))]

    def fake_download(url, dest_path, max_bytes, timeout=60):
        downloaded_urls.append(url)
        dest_path.write_bytes(b"%PDF-1.4\nArXiv test paper\n")

    monkeypatch.setattr(imports.socket, "getaddrinfo", public_arxiv_address)
    monkeypatch.setattr(imports.settings, "storage_dir", str(tmp_path / "storage"))
    monkeypatch.setattr(imports, "_download_file", fake_download)

    from app.services.pipeline import processor

    monkeypatch.setattr(processor, "run_pipeline_background", lambda *args, **kwargs: None)

    response = await imports.import_from_url(
        imports.UrlImportRequest(url="https://arxiv.org/abs/1706.03762", run_ai=False),
        db=db_session,
    )

    assert downloaded_urls == ["https://export.arxiv.org/pdf/1706.03762.pdf"]
    assert response.filename == "1706.03762.pdf"
    assert db_session.query(Article).count() == 1
    assert db_session.query(ProcessingJob).count() == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("upstream_status", [401, 403, 429])
async def test_blocked_url_import_returns_manual_upload_recovery(
    db_session,
    monkeypatch,
    upstream_status,
):
    url = "https://8.8.8.8/paper.pdf"

    def blocked_download(*args, **kwargs):
        raise urllib.error.HTTPError(url, upstream_status, "Blocked", hdrs=None, fp=None)

    monkeypatch.setattr(imports, "_download_file", blocked_download)

    with pytest.raises(imports.HTTPException) as exc_info:
        await imports.import_from_url(
            imports.UrlImportRequest(url=url, run_ai=False),
            db=db_session,
        )

    assert exc_info.value.status_code == 409
    assert "Download the PDF in your browser" in exc_info.value.detail
    assert db_session.query(Article).count() == 0
    assert db_session.query(ProcessingJob).count() == 0
