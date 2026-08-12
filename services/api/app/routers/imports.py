"""Import router — article JSON import, URL import."""

import json
import logging
import datetime
import os
import re
import tempfile
import urllib.request
import urllib.error
import urllib.parse
import shutil
import socket
import ipaddress
import ssl
from pathlib import Path
import certifi
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ArticleExtraction, GraphEntity, GraphRelationship, ProcessingJob, ArticleStatus, JobStatus
from app.core.security import compute_file_hash
from app.core.config import settings
from app.services.article_duplicates import find_active_article_by_hash

logger = logging.getLogger(__name__)
router = APIRouter()


# ── URL Import Request ────────────────────────────────────────────────────

class UrlImportRequest(BaseModel):
    url: str = Field(
        ...,
        min_length=5,
        max_length=2048,
        description="URL to arXiv, OpenReview, a DOI, a scholarly landing page, or a direct PDF",
    )
    run_ai: bool = Field(default=True, description="Whether to run AI extraction after import")
    mode: str = Field(default="quick", max_length=16, description="Processing mode: quick, deep, or parse_only")
    language: str = Field(default="en", max_length=16, description="UI language for AI output")


class UrlImportResponse(BaseModel):
    article_id: int
    job_id: int
    filename: str
    source_type: str
    url: str


# ── URL Import ─────────────────────────────────────────────────────────────

# File extension patterns for direct URLs
_PDF_URL_RE = re.compile(r'\.pdf(\?|#|$)', re.IGNORECASE)

# arXiv mirror for PDF downloads (more reliable than main site for programmatic access)
_ARXIV_PDF_BASE = "https://export.arxiv.org/pdf/"

# Scholarly citation metadata is normally near the top of a page. Keep landing
# page discovery much smaller and faster than the configured PDF upload limit.
_LANDING_PAGE_MAX_BYTES = 2 * 1024 * 1024
_LANDING_PAGE_TIMEOUT_SECONDS = 30
_DOWNLOAD_USER_AGENT = "ArticleProcessor/1.0"
_OPENREVIEW_API_ORIGIN = "https://api2.openreview.net"
_OPENREVIEW_LOGIN_URL = f"{_OPENREVIEW_API_ORIGIN}/login"
_OPENREVIEW_AUTH_TIMEOUT_SECONDS = 30
_OPENREVIEW_AUTH_RESPONSE_MAX_BYTES = 256 * 1024
_SENSITIVE_REQUEST_HEADERS = {"authorization", "cookie", "proxy-authorization"}


class UnsafeUrlError(ValueError):
    """Raised when a URL is not safe for server-side fetching."""


class UrlResolutionError(ValueError):
    """Raised when a public landing page does not expose a supported PDF."""


class OpenReviewAuthenticationError(ValueError):
    """Raised when OpenReview authentication cannot authorize a PDF request."""


_OPENREVIEW_AUTH_REQUIRED_DETAIL = (
    "OpenReview requires authenticated PDF downloads. Configure an OpenReview "
    "access token or username and password in Settings, then retry. You can also "
    "download the PDF in your browser and upload it here."
)
_OPENREVIEW_AUTH_FAILED_DETAIL = (
    "OpenReview authentication was not accepted. Update the OpenReview credentials "
    "or access token in Settings, then retry. Accounts using MFA should use an "
    "access token; otherwise download the PDF in your browser and upload it here."
)


def _validate_public_http_url(url: str) -> urllib.parse.ParseResult:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise UnsafeUrlError("Only http/https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeUrlError("URL must include a hostname")

    hostname = parsed.hostname.lower()
    if hostname in {"localhost"} or hostname.endswith(".localhost"):
        raise UnsafeUrlError("Localhost URLs are not allowed")

    try:
        host_as_ip = ipaddress.ip_address(hostname)
        addresses = [host_as_ip]
    except ValueError:
        try:
            infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        except socket.gaierror:
            raise UnsafeUrlError("Could not resolve URL hostname")
        addresses = []
        for info in infos:
            addr = info[4][0]
            try:
                addresses.append(ipaddress.ip_address(addr))
            except ValueError:
                continue

    for addr in addresses:
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        ):
            raise UnsafeUrlError("URL resolves to a non-public address")

    return parsed


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Validate redirects and prevent sensitive cross-origin header forwarding."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_public_http_url(newurl)
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is None:
            return None

        if _url_origin(req.full_url) != _url_origin(newurl):
            if req.data is not None:
                raise UnsafeUrlError(
                    "Cross-origin redirects for requests containing credentials are not allowed"
                )
            for header_name, _ in tuple(redirected.header_items()):
                if header_name.lower() in _SENSITIVE_REQUEST_HEADERS:
                    redirected.remove_header(header_name)
        return redirected


def _url_origin(url: str) -> tuple[str, str, int | None]:
    parsed = urllib.parse.urlparse(url)
    default_port = 443 if parsed.scheme.lower() == "https" else 80
    return parsed.scheme.lower(), (parsed.hostname or "").lower(), parsed.port or default_port


def _require_exact_openreview_api_url(url: str) -> None:
    """Reject credentialed targets outside OpenReview's exact API v2 origin."""
    parsed = _validate_public_http_url(url)
    if (
        parsed.username is not None
        or parsed.password is not None
        or _url_origin(url) != ("https", "api2.openreview.net", 443)
    ):
        raise UnsafeUrlError("OpenReview credentials can only be sent to its API v2 host")


def _create_download_tls_context() -> ssl.SSLContext:
    """Build a verified TLS context using the packaged Mozilla CA bundle."""
    return ssl.create_default_context(cafile=certifi.where())


def _build_safe_opener() -> urllib.request.OpenerDirector:
    """Build an opener that validates redirects and verifies HTTPS."""
    return urllib.request.build_opener(
        SafeRedirectHandler,
        urllib.request.HTTPSHandler(context=_create_download_tls_context()),
    )


def _detect_url_type(url: str) -> tuple[str, str | None]:
    """Detect the type of URL and extract an identifier.

    Returns (type, identifier) where type is one of 'arxiv', 'doi',
    'openreview', 'direct-pdf', or 'unknown'.
    """
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""

    if host == "arxiv.org" or host.endswith(".arxiv.org"):
        m = re.search(r"^/abs/(\d{4}\.\d{4,}(?:v\d+)?)$", path) or re.search(r"^/pdf/(\d{4}\.\d{4,}(?:v\d+)?)(?:\.pdf)?$", path)
        if m:
            return ("arxiv", m.group(1))

    if host == "doi.org":
        m = re.search(r"^/(10\.\d{4,}/[^\s?#]+)$", path)
        if m:
            return ("doi", m.group(1))

    if (host == "openreview.net" or host.endswith(".openreview.net")) and path.rstrip("/").lower() in {"/forum", "/pdf"}:
        paper_id = urllib.parse.parse_qs(parsed.query).get("id", [""])[0].strip()
        if paper_id:
            return ("openreview", paper_id)

    if path.lower().endswith(".pdf") or _PDF_URL_RE.search(url):
        return ("direct-pdf", url)

    return ("unknown", None)


def _response_content_type(response) -> str:
    """Return a normalized response media type for urllib and test doubles."""
    content_type = response.headers.get("Content-Type", "")
    return content_type.split(";", 1)[0].strip().lower()


def _read_bounded_response(response, max_bytes: int) -> bytes:
    """Read a response body without allowing it to exceed max_bytes."""
    content_length = response.headers.get("Content-Length")
    if content_length:
        try:
            declared_length = int(content_length)
        except ValueError:
            declared_length = None
        if declared_length is not None and declared_length > max_bytes:
            raise UrlResolutionError(
                "The scholarly landing page is too large to inspect safely. "
                "Please provide a direct PDF link or upload the PDF manually."
            )

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise UrlResolutionError(
                "The scholarly landing page is too large to inspect safely. "
                "Please provide a direct PDF link or upload the PDF manually."
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _discover_citation_pdf_url(html: bytes, base_url: str) -> str:
    """Extract one explicit citation_pdf_url from untrusted landing-page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[str] = []
    for meta in soup.find_all("meta"):
        name = meta.get("name")
        if not isinstance(name, str) or name.strip().lower() != "citation_pdf_url":
            continue
        content = meta.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        candidate = urllib.parse.urljoin(base_url, content.strip())
        if candidate not in candidates:
            candidates.append(candidate)

    if not candidates:
        raise UrlResolutionError(
            "This scholarly page does not advertise a PDF URL that can be imported. "
            "Please provide a direct PDF link or upload the PDF manually."
        )
    if len(candidates) > 1:
        raise UrlResolutionError(
            "This scholarly page advertises multiple PDF URLs, so the correct file "
            "cannot be selected safely. Please provide a direct PDF link."
        )

    _validate_public_http_url(candidates[0])
    return candidates[0]


def _resolve_landing_page_pdf_url(
    url: str,
    max_bytes: int = _LANDING_PAGE_MAX_BYTES,
    timeout: int = _LANDING_PAGE_TIMEOUT_SECONDS,
) -> str:
    """Resolve a public scholarly landing page to its declared PDF URL."""
    _validate_public_http_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": _DOWNLOAD_USER_AGENT})
    with _build_safe_opener().open(req, timeout=timeout) as response:
        final_url = response.geturl()
        _validate_public_http_url(final_url)
        content_type = _response_content_type(response)
        if content_type == "application/pdf":
            return final_url
        if content_type not in {"text/html", "application/xhtml+xml"}:
            raise UrlResolutionError(
                "The URL did not return an HTML scholarly page or a PDF. "
                "Please provide a direct PDF link or upload the PDF manually."
            )
        html = _read_bounded_response(response, max_bytes=max_bytes)

    return _discover_citation_pdf_url(html, base_url=final_url)


def _resolve_download_target(
    url: str,
    url_type: str,
    identifier: str | None,
) -> tuple[str, str]:
    """Resolve an accepted source URL to a PDF URL and local filename."""
    if url_type == "arxiv":
        download_url = f"{_ARXIV_PDF_BASE}{identifier}.pdf"
        filename = f"{identifier}.pdf"
    elif url_type == "openreview":
        query = urllib.parse.urlencode({"id": identifier or ""})
        download_url = f"{_OPENREVIEW_API_ORIGIN}/pdf?{query}"
        safe_identifier = re.sub(r"[^A-Za-z0-9._-]+", "_", identifier or "").strip("._")
        filename = f"{safe_identifier or 'openreview'}.pdf"
    elif url_type == "doi":
        download_url = _resolve_landing_page_pdf_url(url)
        filename = (identifier or "downloaded").replace("/", "_") + ".pdf"
    elif url_type == "direct-pdf":
        download_url = url
        path_part = url.split("?", 1)[0].split("#", 1)[0]
        filename = path_part.rsplit("/", 1)[-1] or "downloaded.pdf"
    else:
        download_url = _resolve_landing_page_pdf_url(url)
        path_part = download_url.split("?", 1)[0].split("#", 1)[0]
        filename = path_part.rsplit("/", 1)[-1] or "downloaded.pdf"

    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    return download_url, filename


def _download_file(
    url: str,
    dest_path: Path,
    max_bytes: int,
    timeout: int = 60,
    headers: dict[str, str] | None = None,
) -> None:
    """Download a file from a URL with progress tracking."""
    _validate_public_http_url(url)
    request_headers = {"User-Agent": _DOWNLOAD_USER_AGENT}
    request_headers.update(headers or {})
    if any(name.lower() in _SENSITIVE_REQUEST_HEADERS for name in request_headers):
        _require_exact_openreview_api_url(url)
    req = urllib.request.Request(url, headers=request_headers)
    opener = _build_safe_opener()
    with opener.open(req, timeout=timeout) as response:
        final_url = response.geturl()
        _validate_public_http_url(final_url)
        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    raise ValueError(f"Downloaded file exceeds max size ({settings.max_upload_mb}MB)")
            except ValueError as e:
                if "max size" in str(e):
                    raise
        with open(dest_path, "wb") as f:
            total = 0
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError(f"Downloaded file exceeds max size ({settings.max_upload_mb}MB)")
                f.write(chunk)


def _normalize_openreview_access_token(token: str) -> str:
    normalized = token.strip()
    if normalized.lower().startswith("bearer "):
        normalized = normalized[7:].strip()
    return normalized


def _login_to_openreview(
    username: str,
    password: str,
    timeout: int = _OPENREVIEW_AUTH_TIMEOUT_SECONDS,
) -> str:
    """Authenticate with OpenReview API v2 and return its short-lived token."""
    _require_exact_openreview_api_url(_OPENREVIEW_LOGIN_URL)
    payload = json.dumps({"id": username, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        _OPENREVIEW_LOGIN_URL,
        data=payload,
        headers={
            "User-Agent": _DOWNLOAD_USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with _build_safe_opener().open(request, timeout=timeout) as response:
            _require_exact_openreview_api_url(response.geturl())
            raw_response = response.read(_OPENREVIEW_AUTH_RESPONSE_MAX_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if exc.code in {400, 401, 403}:
            raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_FAILED_DETAIL) from None
        raise
    except UnsafeUrlError:
        raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_FAILED_DETAIL) from None

    if len(raw_response) > _OPENREVIEW_AUTH_RESPONSE_MAX_BYTES:
        raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_FAILED_DETAIL)
    try:
        login_response = json.loads(raw_response.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_FAILED_DETAIL) from None
    if not isinstance(login_response, dict) or login_response.get("mfaPending"):
        raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_FAILED_DETAIL)
    token = login_response.get("token")
    if not isinstance(token, str) or not _normalize_openreview_access_token(token):
        raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_FAILED_DETAIL)
    return _normalize_openreview_access_token(token)


def _get_openreview_access_token() -> str:
    configured_token = _normalize_openreview_access_token(settings.openreview_access_token)
    if configured_token:
        return configured_token

    username = settings.openreview_username.strip()
    password = settings.openreview_password
    if not username or not password:
        raise OpenReviewAuthenticationError(_OPENREVIEW_AUTH_REQUIRED_DETAIL)
    return _login_to_openreview(username, password)


def _download_openreview_pdf(
    download_url: str,
    dest_path: Path,
    max_bytes: int,
    timeout: int = 120,
) -> None:
    """Download an OpenReview PDF with a bearer token scoped to API v2."""
    _require_exact_openreview_api_url(download_url)
    token = _get_openreview_access_token()
    _download_file(
        download_url,
        dest_path,
        max_bytes=max_bytes,
        timeout=timeout,
        headers={
            "Accept": "application/pdf",
            "Content-Type": "application/pdf",
            "Authorization": f"Bearer {token}",
        },
    )


def _is_pdf_file(path: Path) -> bool:
    with open(path, "rb") as f:
        head = f.read(1024).lstrip()
    return head.startswith(b"%PDF-")


@router.post("/url", response_model=UrlImportResponse)
async def import_from_url(
    body: UrlImportRequest,
    db: Session = Depends(get_db),
):
    """Import an article from a URL.

    Supports arXiv, OpenReview, DOI and standards-based scholarly landing pages,
    and direct PDF links.
    Downloads the PDF to local storage, creates an article record,
    and starts the processing pipeline.
    """
    url = body.url.strip()
    try:
        _validate_public_http_url(url)
    except UnsafeUrlError as e:
        raise HTTPException(status_code=400, detail=str(e))

    url_type, identifier = _detect_url_type(url)
    temp_file: Path | None = None

    try:
        download_url, filename = _resolve_download_target(url, url_type, identifier)

        # Download to temp location first
        temp_dir = Path(tempfile.gettempdir()) / "article_processor_imports"
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file = temp_dir / f"{datetime.datetime.utcnow().timestamp()}_{filename}"
        if url_type == "openreview":
            _download_openreview_pdf(
                download_url,
                temp_file,
                max_bytes=settings.max_upload_bytes,
                timeout=120,
            )
        else:
            _download_file(download_url, temp_file, max_bytes=settings.max_upload_bytes, timeout=120)
    except OpenReviewAuthenticationError as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail=str(e))
    except urllib.error.HTTPError as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        if url_type == "openreview" and e.code in {401, 403}:
            raise HTTPException(status_code=409, detail=_OPENREVIEW_AUTH_FAILED_DETAIL)
        if e.code in {401, 403, 429}:
            raise HTTPException(
                status_code=409,
                detail=(
                    "The source blocked automatic PDF download. Download the PDF in your "
                    "browser, then upload it here to continue processing."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Failed to download from {url_type} URL: HTTP {e.code}")
    except urllib.error.URLError as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach {url_type} URL: {e.reason}")
    except UnsafeUrlError as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))
    except UrlResolutionError as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        if temp_file is not None:
            temp_file.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")

    if not _is_pdf_file(temp_file):
        try:
            os.remove(temp_file)
        except OSError:
            pass
        raise HTTPException(status_code=400, detail="Downloaded file is not a valid PDF")

    # Move to permanent storage
    storage_dir = settings.uploads_path / datetime.datetime.utcnow().strftime("%y%m%d%H%M%S")
    storage_dir.mkdir(parents=True, exist_ok=True)
    dest_path = storage_dir / filename

    # Avoid overwrites
    counter = 1
    while dest_path.exists():
        stem, ext = os.path.splitext(filename)
        dest_path = storage_dir / f"{stem}_{counter}{ext}"
        counter += 1

    shutil.move(str(temp_file), str(dest_path))

    # Compute file hash
    with open(dest_path, "rb") as f:
        file_hash = compute_file_hash(f.read())

    # Check for duplicates
    existing = find_active_article_by_hash(db, file_hash)
    if existing:
        # Clean up the downloaded file
        try:
            os.remove(dest_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=409,
            detail=f"Article already exists (ID: {existing.id}, title: {existing.title or existing.original_filename})",
        )

    # Create article record
    article = Article(
        title=filename.rsplit(".", 1)[0],
        status=ArticleStatus.UPLOADED.value,
        original_filename=filename,
        file_hash=file_hash,
        source_type="pdf",
        storage_path=str(dest_path),
    )
    db.add(article)
    db.flush()

    mode = (body.mode or "quick").lower()
    valid_modes = {"quick", "deep", "parse_only"}
    if mode not in valid_modes:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid mode '{mode}'. Valid: {', '.join(sorted(valid_modes))}",
        )
    run_ai_bool = body.run_ai and mode != "parse_only"
    analysis_mode = "deep" if mode == "deep" else "quick"

    # Create processing job
    job = ProcessingJob(
        article_id=article.id,
        status=JobStatus.PENDING.value,
        current_step="url_import_queued",
        run_ai=1 if run_ai_bool else 0,
        start_step="parse",
        analysis_mode=analysis_mode,
        output_language=body.language,
        logs_json=json.dumps([{
            "step": "url_import_queued",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "message": f"Imported from URL: {url} (mode={mode})",
        }]),
    )
    db.add(job)
    db.commit()
    db.refresh(article)
    db.refresh(job)

    # Start background processing
    from app.services.pipeline.processor import run_pipeline_background
    run_pipeline_background(
        article.id,
        run_ai=run_ai_bool,
        job_id=job.id,
        output_language=body.language,
        analysis_mode=analysis_mode,
    )

    logger.info(f"URL import created article {article.id} from {url_type}: {url}")

    return UrlImportResponse(
        article_id=article.id,
        job_id=job.id,
        filename=filename,
        source_type="pdf",
        url=url,
    )


# ── Article JSON Import ─────────────────────────────────────────────────

@router.post("/articles")
async def import_articles(body: dict, db: Session = Depends(get_db)):
    """Import previously exported articles from a JSON array.

    Body: {"articles": [{...article data...}, ...]}
    Each article object should contain: article, extraction, graph, markdown.
    """
    articles_data = body.get("articles")
    if not articles_data or not isinstance(articles_data, list):
        raise HTTPException(status_code=400, detail="Provide 'articles' as a JSON array")

    imported = 0
    skipped = 0
    errors: list[str] = []

    for item in articles_data:
        try:
            article_meta = item.get("article", {})
            title = article_meta.get("title", "Imported Article")
            original_filename = article_meta.get("original_filename", "imported.json")
            source_type = article_meta.get("source_type", "md")

            # Compute hash for dedup
            file_hash = compute_file_hash(
                title.encode() + original_filename.encode()
            )

            existing = find_active_article_by_hash(db, file_hash)
            if existing:
                skipped += 1
                continue

            markdown_text = item.get("markdown", "") or ""

            article = Article(
                title=title,
                status=ArticleStatus.COMPLETED.value,
                original_filename=original_filename,
                file_hash=file_hash,
                source_type=source_type,
                storage_path="import://json",
                markdown_text=markdown_text,
            )
            db.add(article)
            db.flush()

            # Restore extraction
            extraction_data = item.get("extraction")
            if extraction_data:
                extraction = ArticleExtraction(
                    article_id=article.id,
                    schema_version="1.0",
                    extraction_json=json.dumps(extraction_data),
                    confidence=0.85,
                )
                db.add(extraction)

            # Restore graph entities
            graph = item.get("graph", {})
            entity_map: dict[str, int] = {}
            for ent in graph.get("entities", []):
                ge = GraphEntity(
                    article_id=article.id,
                    type=ent.get("type", "Keyword"),
                    name=ent.get("name", ""),
                    canonical_name=ent.get("canonical_name"),
                    properties_json=json.dumps(ent.get("properties") or {}),
                    confidence=ent.get("confidence", 0.5),
                )
                db.add(ge)
                db.flush()
                entity_map[ent.get("name", "")] = ge.id

            # Restore graph relationships
            for rel in graph.get("relationships", []):
                source_name = rel.get("source_name", "")
                target_name = rel.get("target_name", "")
                source_id = entity_map.get(source_name)
                target_id = entity_map.get(target_name)
                if source_id and target_id:
                    gr = GraphRelationship(
                        article_id=article.id,
                        source_entity_id=source_id,
                        target_entity_id=target_id,
                        type=rel.get("type", "RELATES_TO"),
                        properties_json=json.dumps(rel.get("properties") or {}),
                        confidence=rel.get("confidence", 0.5),
                    )
                    db.add(gr)

            # Create processing job
            job = ProcessingJob(
                article_id=article.id,
                status=JobStatus.COMPLETED.value,
                current_step="imported",
                logs_json=json.dumps([{
                    "step": "imported",
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                    "message": f"Imported from JSON export",
                }]),
                completed_at=datetime.datetime.utcnow(),
            )
            db.add(job)

            imported += 1

        except Exception as e:
            errors.append(f"{item.get('article', {}).get('title', 'unknown')}: {e}")
            db.rollback()

    db.commit()

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
    }
