"""Tests for URL import safety, source recognition, and recovery."""

import socket
import urllib.error

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ProcessingJob
from app.db.session import Base
from app.routers import imports


class FakeResponse:
    def __init__(
        self,
        body: bytes,
        *,
        final_url: str = "https://8.8.8.8/article",
        content_type: str = "text/html; charset=utf-8",
        content_length: str | None = None,
    ):
        self._body = body
        self._offset = 0
        self._final_url = final_url
        self.headers = {"Content-Type": content_type}
        if content_length is not None:
            self.headers["Content-Length"] = content_length

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def geturl(self):
        return self._final_url

    def read(self, size: int = -1):
        if size < 0:
            size = len(self._body) - self._offset
        start = self._offset
        self._offset = min(len(self._body), self._offset + size)
        return self._body[start:self._offset]


class FakeOpener:
    def __init__(self, response: FakeResponse):
        self.response = response
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        return self.response


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


def test_safe_redirect_handler_strips_authorization_on_cross_origin_redirect():
    request = imports.urllib.request.Request(
        "https://api2.openreview.net/pdf?id=paper-1",
        headers={"Authorization": "Bearer test-token", "Accept": "application/pdf"},
    )

    redirected = imports.SafeRedirectHandler().redirect_request(
        req=request,
        fp=None,
        code=302,
        msg="Found",
        headers={},
        newurl="https://8.8.8.8/paper.pdf",
    )

    assert redirected is not None
    assert redirected.get_header("Authorization") is None
    assert redirected.get_header("Accept") == "application/pdf"


def test_download_tls_context_uses_certifi_ca_bundle(monkeypatch):
    captured: dict[str, str] = {}
    sentinel = object()

    def create_default_context(*, cafile):
        captured["cafile"] = cafile
        return sentinel

    monkeypatch.setattr(imports.certifi, "where", lambda: "/tmp/ca-bundle.pem")
    monkeypatch.setattr(imports.ssl, "create_default_context", create_default_context)

    assert imports._create_download_tls_context() is sentinel
    assert captured == {"cafile": "/tmp/ca-bundle.pem"}


def test_url_type_detection_accepts_existing_and_openreview_endpoints():
    assert imports._detect_url_type("https://arxiv.org/abs/1706.03762") == (
        "arxiv",
        "1706.03762",
    )
    assert imports._detect_url_type("https://arxiv.org/pdf/1706.03762.pdf") == (
        "arxiv",
        "1706.03762",
    )
    assert imports._detect_url_type("https://openreview.net/pdf?id=paper-1") == (
        "openreview",
        "paper-1",
    )
    assert imports._detect_url_type("https://openreview.net/forum?id=paper-1") == (
        "openreview",
        "paper-1",
    )
    assert imports._detect_url_type("https://openreview.net/forum") == ("unknown", None)
    assert imports._detect_url_type("https://evil-openreview.net/forum?id=paper-1") == (
        "unknown",
        None,
    )
    assert imports._detect_url_type("https://evil-arxiv.org/abs/1706.03762") == (
        "unknown",
        None,
    )


def test_openreview_forum_resolution_preserves_encoded_note_id_safely():
    url = "https://openreview.net/forum?id=venue%2Fpaper%20one"
    url_type, identifier = imports._detect_url_type(url)

    download_url, filename = imports._resolve_download_target(url, url_type, identifier)

    assert download_url == "https://api2.openreview.net/pdf?id=venue%2Fpaper+one"
    assert filename == "venue_paper_one.pdf"


def test_openreview_access_token_is_preferred_over_password_login(monkeypatch):
    monkeypatch.setattr(imports.settings, "openreview_access_token", "Bearer saved-token")
    monkeypatch.setattr(imports.settings, "openreview_username", "user@example.com")
    monkeypatch.setattr(imports.settings, "openreview_password", "saved-password")
    monkeypatch.setattr(
        imports,
        "_login_to_openreview",
        lambda *args, **kwargs: pytest.fail("password login should not run"),
    )

    assert imports._get_openreview_access_token() == "saved-token"


def test_openreview_login_uses_official_api_v2_payload(monkeypatch):
    response = FakeResponse(
        b'{"token":"login-token","user":{"profile":{"id":"~Tester1"}}}',
        final_url=imports._OPENREVIEW_LOGIN_URL,
        content_type="application/json",
    )
    opener = FakeOpener(response)
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: opener)
    monkeypatch.setattr(
        imports.socket,
        "getaddrinfo",
        lambda host, port, *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))
        ],
    )

    token = imports._login_to_openreview("user@example.com", "test-password")

    request, timeout = opener.requests[0]
    assert token == "login-token"
    assert timeout == imports._OPENREVIEW_AUTH_TIMEOUT_SECONDS
    assert request.full_url == "https://api2.openreview.net/login"
    assert request.method == "POST"
    assert imports.json.loads(request.data.decode("utf-8")) == {
        "id": "user@example.com",
        "password": "test-password",
    }
    assert request.get_header("Content-type") == "application/json"


def test_openreview_login_dns_failure_raises_auth_error(monkeypatch):
    def unresolvable(host, port, *args, **kwargs):
        raise socket.gaierror(-2, "Name or service not known")

    monkeypatch.setattr(imports.socket, "getaddrinfo", unresolvable)
    monkeypatch.setattr(
        imports,
        "_build_safe_opener",
        lambda: pytest.fail("network open should not run before host resolution"),
    )

    with pytest.raises(imports.OpenReviewAuthenticationError) as exc_info:
        imports._login_to_openreview("user@example.com", "test-password")

    assert str(exc_info.value) == imports._OPENREVIEW_AUTH_FAILED_DETAIL


def test_openreview_login_rejects_mfa_without_exposing_response(monkeypatch):
    upstream_secret = "mfa-secret-that-must-not-leak"
    response = FakeResponse(
        imports.json.dumps(
            {
                "mfaPending": True,
                "mfaPendingToken": upstream_secret,
                "mfaMethods": ["totp"],
            }
        ).encode(),
        final_url=imports._OPENREVIEW_LOGIN_URL,
        content_type="application/json",
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))
    monkeypatch.setattr(
        imports.socket,
        "getaddrinfo",
        lambda host, port, *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))
        ],
    )

    with pytest.raises(imports.OpenReviewAuthenticationError) as exc_info:
        imports._login_to_openreview("user@example.com", "test-password")

    assert "MFA" in str(exc_info.value)
    assert upstream_secret not in str(exc_info.value)


def test_openreview_pdf_download_scopes_bearer_to_api_v2(monkeypatch, tmp_path):
    captured = {}
    monkeypatch.setattr(imports, "_get_openreview_access_token", lambda: "test-token")
    monkeypatch.setattr(imports, "_require_exact_openreview_api_url", lambda url: None)

    def fake_download(url, dest_path, max_bytes, timeout=60, headers=None):
        captured.update(
            url=url,
            dest_path=dest_path,
            max_bytes=max_bytes,
            timeout=timeout,
            headers=headers,
        )

    monkeypatch.setattr(imports, "_download_file", fake_download)
    destination = tmp_path / "paper.pdf"

    imports._download_openreview_pdf(
        "https://api2.openreview.net/pdf?id=paper-1",
        destination,
        max_bytes=1024,
    )

    assert captured == {
        "url": "https://api2.openreview.net/pdf?id=paper-1",
        "dest_path": destination,
        "max_bytes": 1024,
        "timeout": 120,
        "headers": {
            "Accept": "application/pdf",
            "Content-Type": "application/pdf",
            "Authorization": "Bearer test-token",
        },
    }


@pytest.mark.parametrize(
    "url",
    [
        "https://openreview.net/pdf?id=paper-1",
        "https://api2.openreview.net.evil.example/pdf?id=paper-1",
        "http://api2.openreview.net/pdf?id=paper-1",
        "https://embedded:password@api2.openreview.net/pdf?id=paper-1",
    ],
)
def test_openreview_credentials_reject_non_exact_api_targets(monkeypatch, url):
    monkeypatch.setattr(
        imports.socket,
        "getaddrinfo",
        lambda host, port, *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))
        ],
    )

    with pytest.raises(imports.UnsafeUrlError, match="only be sent"):
        imports._require_exact_openreview_api_url(url)


@pytest.mark.parametrize(
    ("metadata_url", "expected"),
    [
        ("https://1.1.1.1/files/paper.pdf", "https://1.1.1.1/files/paper.pdf"),
        ("../files/paper.pdf", "https://8.8.8.8/files/paper.pdf"),
    ],
)
def test_landing_page_resolves_absolute_and_relative_citation_metadata(
    monkeypatch,
    metadata_url,
    expected,
):
    response = FakeResponse(
        f'<html><head><meta name="citation_pdf_url" content="{metadata_url}"></head></html>'.encode(),
        final_url="https://8.8.8.8/papers/article",
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    assert imports._resolve_landing_page_pdf_url("https://8.8.8.8/start") == expected


def test_landing_page_accepts_a_direct_pdf_response(monkeypatch):
    response = FakeResponse(
        b"",
        final_url="https://8.8.8.8/download?id=paper-1",
        content_type="application/pdf",
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    assert imports._resolve_landing_page_pdf_url("https://8.8.8.8/start") == response.geturl()


@pytest.mark.parametrize(
    ("body", "content_type", "detail"),
    [
        (b"<html><head></head></html>", "text/html", "does not advertise a PDF URL"),
        (b"plain text", "text/plain", "did not return an HTML scholarly page or a PDF"),
    ],
)
def test_landing_page_rejects_unsupported_content(monkeypatch, body, content_type, detail):
    response = FakeResponse(body, content_type=content_type)
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    with pytest.raises(imports.UrlResolutionError, match=detail):
        imports._resolve_landing_page_pdf_url("https://8.8.8.8/article")


def test_landing_page_rejects_oversized_html(monkeypatch):
    response = FakeResponse(
        b"<html></html>",
        content_length=str(imports._LANDING_PAGE_MAX_BYTES + 1),
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    with pytest.raises(imports.UrlResolutionError, match="too large"):
        imports._resolve_landing_page_pdf_url("https://8.8.8.8/article")


def test_landing_page_enforces_streamed_html_limit_without_content_length(monkeypatch):
    response = FakeResponse(b"<html>more than ten bytes</html>")
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    with pytest.raises(imports.UrlResolutionError, match="too large"):
        imports._resolve_landing_page_pdf_url("https://8.8.8.8/article", max_bytes=10)


def test_landing_page_rejects_private_metadata_target(monkeypatch):
    response = FakeResponse(
        b'<meta name="citation_pdf_url" content="http://127.0.0.1/internal.pdf">',
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    with pytest.raises(imports.UnsafeUrlError, match="non-public"):
        imports._resolve_landing_page_pdf_url("https://8.8.8.8/article")


def test_landing_page_rejects_non_http_metadata_target(monkeypatch):
    response = FakeResponse(
        b'<meta name="citation_pdf_url" content="javascript:alert(1)">',
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    with pytest.raises(imports.UnsafeUrlError, match="Only http/https"):
        imports._resolve_landing_page_pdf_url("https://8.8.8.8/article")


def test_landing_page_rejects_ambiguous_pdf_metadata(monkeypatch):
    response = FakeResponse(
        b"""
        <meta name="citation_pdf_url" content="https://1.1.1.1/one.pdf">
        <meta name="citation_pdf_url" content="https://1.1.1.1/two.pdf">
        """,
    )
    monkeypatch.setattr(imports, "_build_safe_opener", lambda: FakeOpener(response))

    with pytest.raises(imports.UrlResolutionError, match="multiple PDF URLs"):
        imports._resolve_landing_page_pdf_url("https://8.8.8.8/article")


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
async def test_openreview_forum_import_resolves_pdf_and_creates_article(
    db_session,
    tmp_path,
    monkeypatch,
):
    downloaded_urls: list[str] = []

    monkeypatch.setattr(
        imports.socket,
        "getaddrinfo",
        lambda host, port, *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))
        ],
    )
    monkeypatch.setattr(imports.settings, "storage_dir", str(tmp_path / "storage"))

    def fake_download(url, dest_path, max_bytes, timeout=60):
        downloaded_urls.append(url)
        dest_path.write_bytes(b"%PDF-1.4\nOpenReview test paper\n")

    monkeypatch.setattr(imports, "_download_openreview_pdf", fake_download)

    from app.services.pipeline import processor

    monkeypatch.setattr(processor, "run_pipeline_background", lambda *args, **kwargs: None)

    original_url = "https://openreview.net/forum?id=paper-1"
    response = await imports.import_from_url(
        imports.UrlImportRequest(url=original_url, run_ai=False),
        db=db_session,
    )

    assert downloaded_urls == ["https://api2.openreview.net/pdf?id=paper-1"]
    assert response.url == original_url
    assert response.filename == "paper-1.pdf"
    assert db_session.query(Article).count() == 1
    assert db_session.query(ProcessingJob).count() == 1


@pytest.mark.asyncio
async def test_openreview_import_without_auth_returns_settings_recovery(
    db_session,
    monkeypatch,
):
    monkeypatch.setattr(
        imports.socket,
        "getaddrinfo",
        lambda host, port, *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", port))
        ],
    )
    monkeypatch.setattr(imports.settings, "openreview_access_token", "")
    monkeypatch.setattr(imports.settings, "openreview_username", "")
    monkeypatch.setattr(imports.settings, "openreview_password", "")

    with pytest.raises(imports.HTTPException) as exc_info:
        await imports.import_from_url(
            imports.UrlImportRequest(
                url="https://openreview.net/forum?id=3bfseFWNUH",
                run_ai=False,
            ),
            db=db_session,
        )

    assert exc_info.value.status_code == 409
    assert "Configure an OpenReview access token" in exc_info.value.detail
    assert db_session.query(Article).count() == 0
    assert db_session.query(ProcessingJob).count() == 0


@pytest.mark.asyncio
async def test_scholarly_landing_page_import_preserves_original_url(
    db_session,
    tmp_path,
    monkeypatch,
):
    original_url = "https://8.8.8.8/papers/article"
    resolved_url = "https://1.1.1.1/files/article.pdf"
    monkeypatch.setattr(imports.settings, "storage_dir", str(tmp_path / "storage"))
    monkeypatch.setattr(imports, "_resolve_landing_page_pdf_url", lambda url: resolved_url)

    def fake_download(url, dest_path, max_bytes, timeout=60):
        assert url == resolved_url
        dest_path.write_bytes(b"%PDF-1.4\nGeneric scholarly paper\n")

    monkeypatch.setattr(imports, "_download_file", fake_download)

    from app.services.pipeline import processor

    monkeypatch.setattr(processor, "run_pipeline_background", lambda *args, **kwargs: None)

    response = await imports.import_from_url(
        imports.UrlImportRequest(url=original_url, run_ai=False),
        db=db_session,
    )

    assert response.url == original_url
    assert response.filename == "article.pdf"
    assert db_session.query(Article).count() == 1
    assert db_session.query(ProcessingJob).count() == 1


@pytest.mark.asyncio
async def test_landing_page_resolution_failure_creates_no_records(db_session, monkeypatch):
    def unsupported_page(url):
        raise imports.UrlResolutionError(
            "This scholarly page does not advertise a PDF URL that can be imported."
        )

    monkeypatch.setattr(imports, "_resolve_landing_page_pdf_url", unsupported_page)

    with pytest.raises(imports.HTTPException) as exc_info:
        await imports.import_from_url(
            imports.UrlImportRequest(url="https://8.8.8.8/article", run_ai=False),
            db=db_session,
        )

    assert exc_info.value.status_code == 400
    assert "does not advertise a PDF URL" in exc_info.value.detail
    assert db_session.query(Article).count() == 0
    assert db_session.query(ProcessingJob).count() == 0


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
