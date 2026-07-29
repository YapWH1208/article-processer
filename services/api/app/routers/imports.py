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
from pathlib import Path
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import (
    Article,
    ArticleExtraction,
    ArticleMetadata,
    ConferenceCatalogPaper,
    GraphEntity,
    GraphRelationship,
    ProcessingJob,
    ArticleStatus,
    JobStatus,
)
from app.core.security import compute_file_hash
from app.core.config import settings
from app.schemas.discover import ArxivProvenanceRequest
from app.services.article_duplicates import find_active_article_by_hash

logger = logging.getLogger(__name__)
router = APIRouter()


# ── URL Import Request ────────────────────────────────────────────────────

class UrlImportRequest(BaseModel):
    url: str | None = Field(default=None, min_length=5, max_length=2048, description="URL to an arXiv abstract, DOI, or direct PDF")
    catalog_paper_id: int | None = Field(default=None, ge=1, description="Local conference catalogue record selected for import")
    provenance: ArxivProvenanceRequest | None = None
    run_ai: bool = Field(default=True, description="Whether to run AI extraction after import")
    language: str = Field(default="en", max_length=16, description="UI language for AI output")

    @model_validator(mode="after")
    def _require_one_import_source(self):
        if bool(self.url) == bool(self.catalog_paper_id):
            raise ValueError("Provide exactly one of url or catalog_paper_id")
        if self.catalog_paper_id and self.provenance:
            raise ValueError("Catalogue imports resolve provenance from the local catalogue")
        if self.provenance and not self.url:
            raise ValueError("arXiv provenance requires a URL")
        return self


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


class UnsafeUrlError(ValueError):
    """Raised when a URL is not safe for server-side fetching."""


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
    """Validate every redirect target before urllib follows it."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_public_http_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _detect_url_type(url: str) -> tuple[str, str | None]:
    """Detect the type of URL and extract an identifier.

    Returns (type, identifier) where type is one of 'arxiv', 'doi', 'direct-pdf', 'unknown'.
    """
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""

    if host.endswith("arxiv.org"):
        m = re.search(r"^/abs/(\d{4}\.\d{4,}(?:v\d+)?)$", path) or re.search(r"^/pdf/(\d{4}\.\d{4,}(?:v\d+)?)(?:\.pdf)?$", path)
        if m:
            return ("arxiv", m.group(1))

    if host == "doi.org":
        m = re.search(r"^/(10\.\d{4,}/[^\s?#]+)$", path)
        if m:
            return ("doi", m.group(1))

    if host.endswith("openreview.net") and path.rstrip("/").lower() == "/pdf":
        paper_id = urllib.parse.parse_qs(parsed.query).get("id", [None])[0]
        if paper_id:
            return ("direct-pdf", url)

    if path.lower().endswith(".pdf") or _PDF_URL_RE.search(url):
        return ("direct-pdf", url)

    return ("unknown", None)


def _metadata_from_catalog_paper(paper: ConferenceCatalogPaper) -> dict[str, Any]:
    return {
        "title": paper.title,
        "authors": json.loads(paper.authors_json or "[]"),
        "abstract": paper.abstract,
        "venue": paper.venue,
        "source_provider": "conference_catalog",
        "source_external_id": paper.source_external_id,
        "source_landing_url": paper.landing_url,
        "source_pdf_url": paper.pdf_url,
        "source_collection": paper.conference_key,
        "source_retrieved_at": paper.imported_at,
        "source_payload_json": paper.raw_payload_json,
    }


def _metadata_from_arxiv_provenance(provenance: ArxivProvenanceRequest, identifier: str | None) -> dict[str, Any]:
    if identifier is None or provenance.source_external_id != identifier:
        raise UnsafeUrlError("arXiv provenance identifier must match the selected arXiv URL")
    landing_type, landing_identifier = _detect_url_type(provenance.source_landing_url)
    if landing_type != "arxiv" or landing_identifier != identifier:
        raise UnsafeUrlError("arXiv provenance landing URL must match the selected arXiv URL")
    return {
        "title": provenance.title,
        "authors": provenance.authors,
        "abstract": provenance.abstract,
        "venue": provenance.venue,
        "source_provider": "arxiv",
        "source_external_id": provenance.source_external_id,
        "source_landing_url": provenance.source_landing_url,
        "source_pdf_url": provenance.source_pdf_url,
        "source_collection": None,
        "source_retrieved_at": provenance.source_retrieved_at,
        "source_payload_json": json.dumps(provenance.source_payload, ensure_ascii=False) if provenance.source_payload else None,
    }


def _download_file(url: str, dest_path: Path, max_bytes: int, timeout: int = 60) -> None:
    """Download a file from a URL with progress tracking."""
    _validate_public_http_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": "ArticleProcessor/1.0"})
    opener = urllib.request.build_opener(SafeRedirectHandler)
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

    Supports arXiv (abs/pdf), DOI redirects, and direct PDF links.
    Downloads the PDF to local storage, creates an article record,
    and starts the processing pipeline.
    """
    source_metadata: dict[str, Any] | None = None
    if body.catalog_paper_id is not None:
        catalog_paper = db.query(ConferenceCatalogPaper).filter(ConferenceCatalogPaper.id == body.catalog_paper_id).first()
        if not catalog_paper:
            raise HTTPException(status_code=404, detail="Conference catalogue paper not found")
        if not catalog_paper.pdf_url:
            raise HTTPException(status_code=422, detail="Selected conference paper has no PDF URL")
        url = catalog_paper.pdf_url.strip()
        source_metadata = _metadata_from_catalog_paper(catalog_paper)
    else:
        url = (body.url or "").strip()
    try:
        _validate_public_http_url(url)
    except UnsafeUrlError as e:
        raise HTTPException(status_code=400, detail=str(e))

    url_type, identifier = _detect_url_type(url)

    if body.provenance:
        try:
            source_metadata = _metadata_from_arxiv_provenance(body.provenance, identifier)
        except UnsafeUrlError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    if url_type == "unknown":
        raise HTTPException(
            status_code=400,
            detail="Could not detect URL type. Please provide an arXiv (arxiv.org/abs/...), DOI (doi.org/...), or direct PDF link.",
        )

    # Resolve the download URL
    if url_type == "arxiv":
        download_url = f"{_ARXIV_PDF_BASE}{identifier}.pdf"
        filename = f"{identifier}.pdf"
    elif url_type == "doi":
        download_url = f"https://doi.org/{identifier}"
        filename = identifier.replace("/", "_") + ".pdf"
    else:  # direct-pdf
        download_url = url
        # Derive filename from URL path
        path_part = url.split("?")[0].split("#")[0]
        filename = path_part.rsplit("/", 1)[-1] or "downloaded.pdf"

    # Ensure filename ends with .pdf
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"

    # Download to temp location first
    temp_dir = Path(tempfile.gettempdir()) / "article_processor_imports"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_file = temp_dir / f"{datetime.datetime.utcnow().timestamp()}_{filename}"

    try:
        _download_file(download_url, temp_file, max_bytes=settings.max_upload_bytes, timeout=120)
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to download from {url_type} URL: HTTP {e.code}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach {url_type} URL: {e.reason}")
    except UnsafeUrlError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
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
        title=(source_metadata or {}).get("title") or filename.rsplit(".", 1)[0],
        status=ArticleStatus.UPLOADED.value,
        original_filename=filename,
        file_hash=file_hash,
        source_type="pdf",
        storage_path=str(dest_path),
    )
    db.add(article)
    db.flush()

    if source_metadata:
        authors = source_metadata.get("authors")
        source_payload_json = source_metadata.get("source_payload_json")
        db.add(ArticleMetadata(
            article_id=article.id,
            authors=json.dumps(authors, ensure_ascii=False) if authors else None,
            venue=source_metadata.get("venue"),
            arxiv_id=source_metadata.get("source_external_id") if source_metadata.get("source_provider") == "arxiv" else None,
            url=source_metadata.get("source_landing_url"),
            abstract=source_metadata.get("abstract"),
            raw_metadata_json=source_payload_json,
            source_provider=source_metadata.get("source_provider"),
            source_external_id=source_metadata.get("source_external_id"),
            source_landing_url=source_metadata.get("source_landing_url"),
            source_pdf_url=source_metadata.get("source_pdf_url"),
            source_collection=source_metadata.get("source_collection"),
            source_retrieved_at=source_metadata.get("source_retrieved_at"),
            source_payload_json=source_payload_json,
        ))

    # Create processing job
    job = ProcessingJob(
        article_id=article.id,
        status=JobStatus.PENDING.value,
        current_step="url_import_queued",
        run_ai=1 if body.run_ai else 0,
        start_step="parse",
        output_language=body.language,
        logs_json=json.dumps([{
            "step": "url_import_queued",
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "message": f"Imported from URL: {url}",
        }]),
    )
    db.add(job)
    db.commit()
    db.refresh(article)
    db.refresh(job)

    # Start background processing
    from app.services.pipeline.processor import run_pipeline_background
    run_pipeline_background(article.id, run_ai=body.run_ai, job_id=job.id, output_language=body.language)

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
