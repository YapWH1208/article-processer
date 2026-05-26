"""Import router — article JSON import, URL import."""

import json
import logging
import datetime
import os
import re
import tempfile
import urllib.request
import urllib.error
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.core.auth_deps import require_user
from app.db.session import get_db
from app.db.models import Article, ArticleExtraction, GraphEntity, GraphRelationship, ProcessingJob, ArticleStatus, JobStatus
from app.core.security import compute_file_hash
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── URL Import Request ────────────────────────────────────────────────────

class UrlImportRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=2048, description="URL to an arXiv abstract, DOI, or direct PDF")
    run_ai: bool = Field(default=True, description="Whether to run AI extraction after import")


class UrlImportResponse(BaseModel):
    article_id: int
    job_id: int
    filename: str
    source_type: str
    url: str


# ── URL Import ─────────────────────────────────────────────────────────────

# arXiv URL patterns
_ARXIV_ABS_RE = re.compile(r'arxiv\.org/abs/(\d{4}\.\d{4,}(?:v\d+)?)')
_ARXIV_PDF_RE = re.compile(r'arxiv\.org/pdf/(\d{4}\.\d{4,}(?:v\d+)?)(?:\.pdf)?')
# DOI patterns
_DOI_RE = re.compile(r'doi\.org/(10\.\d{4,}/[^\s?#]+)')
# File extension patterns for direct URLs
_PDF_URL_RE = re.compile(r'\.pdf(\?|#|$)', re.IGNORECASE)

# arXiv mirror for PDF downloads (more reliable than main site for programmatic access)
_ARXIV_PDF_BASE = "https://export.arxiv.org/pdf/"


def _detect_url_type(url: str) -> tuple[str, str | None]:
    """Detect the type of URL and extract an identifier.

    Returns (type, identifier) where type is one of 'arxiv', 'doi', 'direct-pdf', 'unknown'.
    """
    m = _ARXIV_ABS_RE.search(url) or _ARXIV_PDF_RE.search(url)
    if m:
        return ("arxiv", m.group(1))

    m = _DOI_RE.search(url)
    if m:
        return ("doi", m.group(1))

    if url.lower().endswith(".pdf") or _PDF_URL_RE.search(url):
        return ("direct-pdf", url)

    return ("unknown", None)


def _download_file(url: str, dest_path: Path, timeout: int = 60) -> None:
    """Download a file from a URL with progress tracking."""
    req = urllib.request.Request(url, headers={"User-Agent": "ArticleProcessor/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        with open(dest_path, "wb") as f:
            shutil.copyfileobj(response, f)


@router.post("/url", response_model=UrlImportResponse)
async def import_from_url(
    body: UrlImportRequest,
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    """Import an article from a URL.

    Supports arXiv (abs/pdf), DOI redirects, and direct PDF links.
    Downloads the PDF to local storage, creates an article record,
    and starts the processing pipeline.
    """
    url = body.url.strip()

    url_type, identifier = _detect_url_type(url)

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
        _download_file(download_url, temp_file, timeout=120)
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Failed to download from {url_type} URL: HTTP {e.code}")
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach {url_type} URL: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")

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
    existing = db.query(Article).filter(Article.file_hash == file_hash).first()
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

    # Create processing job
    job = ProcessingJob(
        article_id=article.id,
        status=JobStatus.PENDING.value,
        current_step="url_import_queued",
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
    run_pipeline_background(article.id, run_ai=body.run_ai)

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
async def import_articles(body: dict, db: Session = Depends(get_db), user=Depends(require_user)):
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

            existing = db.query(Article).filter(Article.file_hash == file_hash).first()
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
