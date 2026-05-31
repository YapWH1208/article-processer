"""Articles router — list, detail, markdown, extraction, graph, reprocess, archive, delete."""

import datetime
import json
import logging
import os
import shutil
import mimetypes
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import (
    Article,
    ArticleExtraction,
    GraphEntity,
    GraphRelationship,
    ProcessingJob,
    TokenUsage,
    JobStatus,
    ArticleStatus,
)
from app.schemas.article import (
    ArticleSummary,
    ArticleDetail,
    ArticleListResponse,
    ReprocessResponse,
)
from app.schemas.extraction import ExtractionResponse, ExtractionUpdateRequest
from app.schemas.graph import GraphResponse
from app.schemas.jobs import JobResponse
from app.services.search import search_article_ids, upsert_article_search_index

logger = logging.getLogger(__name__)
router = APIRouter()

# Safe sort allowlist — prevents SQL injection via dynamic column names
_SORT_COLUMNS = {
    "created_at": Article.created_at,
    "title": Article.title,
    "status": Article.status,
    "updated_at": Article.updated_at,
}


@router.get("", response_model=ArticleListResponse)
def list_articles(
    status: str | None = None,
    search: str | None = None,
    search_content: str | None = None,
    include_archived: bool = False,
    include_deleted: bool = False,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List articles with optional filtering. Archived and soft-deleted hidden by default.

    - `search`: matches title and filename (fast metadata search).
    - `search_content`: matches inside the parsed Markdown body (full-text search,
      clamped to 200 results max to keep SQLite responsive).
    - `sort_by`: column to sort by (created_at, title, status, updated_at).
    - `sort_order`: asc or desc.
    """
    q = db.query(Article)

    # Exclude soft-deleted articles by default
    if not include_deleted:
        q = q.filter(Article.deleted_at.is_(None))

    if not include_archived:
        q = q.filter(Article.is_archived == 0)

    if status:
        q = q.filter(Article.status == status)

    if search:
        q = q.filter(
            Article.title.ilike(f"%{search}%")
            | Article.original_filename.ilike(f"%{search}%")
        )

    if search_content:
        fts_ids = search_article_ids(db, search_content, limit=200)
        if fts_ids is None:
            q = q.filter(Article.markdown_text.ilike(f"%{search_content}%"))
        elif fts_ids:
            q = q.filter(Article.id.in_(fts_ids))
        else:
            q = q.filter(False)

    # Apply sort with allowlist validation
    sort_col = _SORT_COLUMNS.get(sort_by, Article.created_at)
    if sort_order == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    total = q.count()
    articles = q.offset(skip).limit(min(limit, 200)).all()

    return ArticleListResponse(
        articles=[ArticleSummary.model_validate(a) for a in articles],
        total=total,
    )


@router.get("/graph/global")
def get_global_graph(
    limit: int = 200,
    include_archived: bool = False,
    db: Session = Depends(get_db),
):
    """Return all graph entities and relationships across articles for global graph view."""
    entity_q = db.query(GraphEntity)
    rel_q = db.query(GraphRelationship)

    if not include_archived:
        entity_q = entity_q.join(Article).filter(Article.is_archived == 0)
        rel_q = rel_q.join(Article).filter(Article.is_archived == 0)

    entities = entity_q.limit(limit).all()
    relationships = rel_q.limit(limit).all()

    # Enrich entities with article title
    article_ids: set[int] = set()
    for e in entities:
        article_ids.add(e.article_id)
    for r in relationships:
        article_ids.add(r.article_id)

    articles_map: dict[int, str] = {}
    if article_ids:
        arts = db.query(Article).filter(Article.id.in_(article_ids)).all()
        articles_map = {a.id: a.title or a.original_filename for a in arts}

    return {
        "entities": [
            {
                "id": e.id,
                "article_id": e.article_id,
                "article_title": articles_map.get(e.article_id, f"Article #{e.article_id}"),
                "type": e.type,
                "name": e.name,
                "canonical_name": e.canonical_name,
                "confidence": e.confidence,
            }
            for e in entities
        ],
        "relationships": [
            {
                "id": r.id,
                "article_id": r.article_id,
                "article_title": articles_map.get(r.article_id, f"Article #{r.article_id}"),
                "source_entity_id": r.source_entity_id,
                "target_entity_id": r.target_entity_id,
                "type": r.type,
                "confidence": r.confidence,
            }
            for r in relationships
        ],
    }


@router.get("/{article_id}", response_model=ArticleDetail)
def get_article(article_id: int, db: Session = Depends(get_db)):
    """Get article detail."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return ArticleDetail.model_validate(article)


@router.get("/{article_id}/file")
def get_article_file(article_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded file (PDF, HTML, etc.) for inline viewing."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    file_path = article.storage_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Original file not found on disk")

    # Determine media type for proper browser handling
    media_type, _ = mimetypes.guess_type(article.original_filename)
    if not media_type:
        media_type = "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=media_type,
    )


def _build_toc_from_chunks(article_id: int, db: Session) -> list[dict]:
    """Build a page-indexed table of contents from article chunks."""
    from app.db.models import ArticleChunk
    chunks = (
        db.query(ArticleChunk)
        .filter(ArticleChunk.article_id == article_id)
        .order_by(ArticleChunk.chunk_index)
        .all()
    )
    toc: list[dict] = []
    seen_headings: set[str] = set()
    for c in chunks:
        title = c.section_title
        if title and title not in seen_headings:
            seen_headings.add(title)
            toc.append({
                "heading": title,
                "page": c.page_start,
                "chunk_index": c.chunk_index,
            })
    return toc


def _rewrite_markdown_image_urls(markdown: str) -> str:
    """Rewrite relative image URLs to absolute API URLs.

    Preserves the full relative path (including any timestamped subdirectory)
    and makes it absolute so the browser loads from the API server, not the
    frontend page URL.
    """
    import re
    from app.core.config import settings as _s

    api_base = getattr(_s, "api_base_url", None) or "http://localhost:8000"

    def _abs_url(match: re.Match) -> str:
        alt = match.group(1) or ""
        src = match.group(2).strip()
        if src.startswith(("http://", "https://", "data:")):
            return match.group(0)
        # Normalise: strip leading slash, ensure it's under the storage mount
        norm = src.lstrip("/")
        return f"![{alt}]({api_base.rstrip('/')}/{norm})"

    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', _abs_url, markdown)


@router.get("/{article_id}/markdown")
def get_article_markdown(article_id: int, db: Session = Depends(get_db)):
    """Get the processed Markdown for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if article.markdown_text:
        from app.services.pipeline.markdown_normalizer import normalize_markdown
        cleaned = normalize_markdown(article.markdown_text)
        toc = _build_toc_from_chunks(article_id, db)
        return {"markdown": _rewrite_markdown_image_urls(cleaned), "toc": toc}

    if article.markdown_path:
        try:
            with open(article.markdown_path, "r", encoding="utf-8") as f:
                toc = _build_toc_from_chunks(article_id, db)
                return {"markdown": _rewrite_markdown_image_urls(f.read()), "toc": toc}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Markdown file not found on disk")

    raise HTTPException(status_code=404, detail="No Markdown available for this article")


@router.get("/{article_id}/extraction", response_model=ExtractionResponse)
def get_article_extraction(article_id: int, db: Session = Depends(get_db)):
    """Get the AI extraction results for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article_id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )

    if not extraction:
        raise HTTPException(status_code=404, detail="No extraction available for this article")

    extraction_data = None
    validation_errors = None
    if extraction.extraction_json:
        try:
            extraction_data = json.loads(extraction.extraction_json)
        except json.JSONDecodeError:
            pass

    if extraction.validation_errors:
        try:
            validation_errors = json.loads(extraction.validation_errors)
        except json.JSONDecodeError:
            validation_errors = [extraction.validation_errors]

    return ExtractionResponse(
        article_id=article_id,
        schema_version=extraction.schema_version,
        extraction=extraction_data,
        validation_errors=validation_errors,
        confidence=extraction.confidence,
        created_at=extraction.created_at,
    )


@router.put("/{article_id}/extraction", response_model=ExtractionResponse)
def update_article_extraction(
    article_id: int,
    request: ExtractionUpdateRequest,
    db: Session = Depends(get_db),
):
    """Save manually reviewed extraction JSON for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article_id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )
    if extraction is None:
        extraction = ArticleExtraction(article_id=article_id)
        db.add(extraction)

    extraction_data = request.extraction.model_dump(mode="json")
    validation_errors = request.validation_errors or None
    extraction.extraction_json = json.dumps(extraction_data)
    extraction.validation_errors = json.dumps(validation_errors) if validation_errors else None
    extraction.confidence = request.confidence
    article.needs_review = 1 if validation_errors else 0
    if not validation_errors and article.status == ArticleStatus.NEEDS_REVIEW.value:
        article.status = ArticleStatus.COMPLETED.value

    upsert_article_search_index(db, article_id)
    db.commit()
    db.refresh(extraction)

    return ExtractionResponse(
        article_id=article_id,
        schema_version=extraction.schema_version,
        extraction=extraction_data,
        validation_errors=validation_errors,
        confidence=extraction.confidence,
        created_at=extraction.created_at,
    )


@router.get("/{article_id}/graph", response_model=GraphResponse)
def get_article_graph(article_id: int, db: Session = Depends(get_db)):
    """Get graph entities and relationships for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    entities = db.query(GraphEntity).filter(GraphEntity.article_id == article_id).all()
    relationships = (
        db.query(GraphRelationship)
        .filter(GraphRelationship.article_id == article_id)
        .all()
    )

    return GraphResponse(entities=entities, relationships=relationships)


@router.get("/{article_id}/jobs/active")
def get_article_active_job(article_id: int, db: Session = Depends(get_db)):
    """Get the currently active (or latest) processing job for polling."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.article_id == article_id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )

    if not job:
        return {"job": None, "article_status": article.status}

    return {
        "job": JobResponse(
            id=job.id,
            article_id=job.article_id,
            status=job.status,
            current_step=job.current_step,
            logs=json.loads(job.logs_json) if job.logs_json else None,
            error=job.error,
            created_at=job.created_at,
            updated_at=job.updated_at,
            completed_at=job.completed_at,
        ),
        "article_status": article.status,
    }


@router.get("/{article_id}/jobs")
def get_article_jobs(article_id: int, db: Session = Depends(get_db)):
    """Get processing jobs for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    jobs = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.article_id == article_id)
        .order_by(ProcessingJob.created_at.desc())
        .all()
    )

    return [
        JobResponse(
            id=j.id,
            article_id=j.article_id,
            status=j.status,
            current_step=j.current_step,
            logs=json.loads(j.logs_json) if j.logs_json else None,
            error=j.error,
            created_at=j.created_at,
            updated_at=j.updated_at,
            completed_at=j.completed_at,
        )
        for j in jobs
    ]


@router.post("/{article_id}/reprocess", response_model=ReprocessResponse)
def reprocess_article(
    article_id: int,
    mode: str = "full",
    db: Session = Depends(get_db),
):
    """Re-run processing for an article.

    mode:
      - "full"        — parse + chunk + extract + graph
      - "parse_only"  — parse + chunk only (no AI)
      - "extract_only" — skip parse/chunk, start at AI extraction (needs existing markdown)
    """
    valid_modes = {"full", "parse_only", "extract_only"}
    if mode not in valid_modes:
        raise HTTPException(status_code=422, detail=f"Invalid mode '{mode}'. Valid: {', '.join(sorted(valid_modes))}")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Create a new job
    import datetime
    job = ProcessingJob(
        article_id=article.id,
        status=JobStatus.PENDING.value,
        current_step="reprocess_queued",
        run_ai=0 if mode == "parse_only" else 1,
        start_step="extract" if mode == "extract_only" else "parse",
        logs_json=json.dumps([
            {
                "step": "reprocess_queued",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "message": f"Reprocessing queued (mode={mode})",
            }
        ]),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from app.services.pipeline.processor import run_pipeline_background

    if mode == "parse_only":
        run_pipeline_background(article.id, run_ai=False, start_step="parse", job_id=job.id)
    elif mode == "extract_only":
        run_pipeline_background(article.id, run_ai=True, start_step="extract", job_id=job.id)
    else:
        run_pipeline_background(article.id, run_ai=True, start_step="parse", job_id=job.id)

    return ReprocessResponse(
        article_id=article.id,
        job_id=job.id,
        status="reprocessing",
    )


@router.post("/{article_id}/archive")
def archive_article(article_id: int, db: Session = Depends(get_db)):
    """Soft-archive an article (hide from default list)."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.is_archived = 1
    db.commit()
    upsert_article_search_index(db, article_id)
    return {"article_id": article_id, "is_archived": True}


@router.post("/{article_id}/unarchive")
def unarchive_article(article_id: int, db: Session = Depends(get_db)):
    """Restore an archived article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.is_archived = 0
    db.commit()
    upsert_article_search_index(db, article_id)
    return {"article_id": article_id, "is_archived": False}


@router.patch("/{article_id}")
def update_article(article_id: int, body: dict, db: Session = Depends(get_db)):
    """Update article metadata (title only for now). Body: {"title": "New Title"}."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if "title" in body:
        new_title = str(body["title"]).strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        article.title = new_title

    db.commit()
    upsert_article_search_index(db, article_id)
    db.refresh(article)
    return ArticleDetail.model_validate(article)


@router.delete("/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    """Soft-delete an article — marks it as trashed without removing data."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    article.deleted_at = datetime.datetime.utcnow()
    db.commit()
    upsert_article_search_index(db, article_id)

    return {"article_id": article_id, "deleted": True}


@router.post("/{article_id}/restore")
def restore_article(article_id: int, db: Session = Depends(get_db)):
    """Restore a soft-deleted article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    if not article.deleted_at:
        raise HTTPException(status_code=400, detail="Article is not deleted")

    article.deleted_at = None
    db.commit()
    upsert_article_search_index(db, article_id)
    return {"article_id": article_id, "restored": True}


@router.get("/{article_id}/logs")
def get_article_logs(article_id: int, db: Session = Depends(get_db)):
    """Return processing logs and token usage for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    jobs = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.article_id == article_id)
        .order_by(ProcessingJob.created_at.asc())
        .all()
    )

    token_rows = (
        db.query(TokenUsage)
        .filter(TokenUsage.article_id == article_id)
        .order_by(TokenUsage.created_at.asc())
        .all()
    )

    return {
        "article_id": article_id,
        "title": article.title,
        "status": article.status.value if hasattr(article.status, 'value') else article.status,
        "jobs": [
            {
                "id": j.id,
                "status": j.status,
                "current_step": j.current_step,
                "logs": json.loads(j.logs_json) if j.logs_json else [],
                "error": j.error,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ],
        "token_usage": [
            {
                "id": t.id,
                "step": t.step,
                "model": t.model,
                "provider": t.provider,
                "prompt_tokens": t.prompt_tokens,
                "completion_tokens": t.completion_tokens,
                "total_tokens": t.total_tokens,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in token_rows
        ],
    }


# ── Citation Network ───────────────────────────────────────────────────────

@router.get("/{article_id}/cited-by")
def get_cited_by(article_id: int, db: Session = Depends(get_db)):
    """Find articles that cite this article via extraction reference matching.

    Looks for other articles whose extracted references contain a DOI or
    title that matches the current article.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Get this article's title and DOI from extraction
    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article_id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )

    article_doi = None
    article_title = article.title or article.original_filename
    if extraction and extraction.extraction_json:
        try:
            data = json.loads(extraction.extraction_json)
            article_doi = data.get("doi")
            article_title = data.get("title") or article_title
        except json.JSONDecodeError:
            pass

    # Search other articles' extractions for matching references
    other_extractions = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id != article_id)
        .all()
    )

    citing: list[dict] = []
    for oe in other_extractions:
        if not oe.extraction_json:
            continue
        try:
            data = json.loads(oe.extraction_json)
        except json.JSONDecodeError:
            continue

        refs = data.get("references") or []
        matched = False
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            ref_doi = ref.get("doi", "")
            ref_title = ref.get("title", "")
            # Match by DOI (exact) or title (fuzzy)
            if article_doi and ref_doi and article_doi.lower() == ref_doi.lower():
                matched = True
                break
            if article_title and ref_title and len(article_title) > 10 and len(ref_title) > 10:
                # Simple fuzzy: check if one contains the other or high word overlap
                a_words = set(article_title.lower().split())
                r_words = set(ref_title.lower().split())
                overlap = len(a_words & r_words)
                if overlap >= 0.7 * min(len(a_words), len(r_words)):
                    matched = True
                    break

        if matched:
            citing_article = db.query(Article).filter(Article.id == oe.article_id).first()
            if citing_article:
                citing.append({
                    "id": citing_article.id,
                    "title": citing_article.title or citing_article.original_filename,
                    "status": citing_article.status,
                    "source_type": citing_article.source_type,
                })

    return {
        "article_id": article_id,
        "title": article_title,
        "doi": article_doi,
        "cited_by": citing,
        "cited_by_count": len(citing),
    }


@router.get("/{article_id}/references")
def get_article_references(article_id: int, db: Session = Depends(get_db)):
    """Get the references extracted from this article, with resolved links to articles in the library."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article_id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )

    references: list[dict] = []
    if extraction and extraction.extraction_json:
        try:
            data = json.loads(extraction.extraction_json)
            references = data.get("references") or []
        except json.JSONDecodeError:
            pass

    # Try to resolve references to articles in the library
    resolved = []
    for ref in references:
        if not isinstance(ref, dict):
            continue
        item = dict(ref)
        item["resolved_article_id"] = None
        # Try DOI match
        doi = ref.get("doi", "")
        if doi:
            escaped_doi = doi.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            match = (
                db.query(ArticleExtraction)
                .filter(ArticleExtraction.extraction_json.ilike(f"%{escaped_doi}%", escape="\\"))
                .first()
            )
            if match and match.article_id != article_id:
                item["resolved_article_id"] = match.article_id
        resolved.append(item)

    return {"article_id": article_id, "references": resolved}


# ── Tag Management ─────────────────────────────────────────────────────────

@router.get("/tags/list")
def list_tags(db: Session = Depends(get_db)):
    """Return all unique tags across articles with counts, for a tag cloud."""
    extractions = db.query(ArticleExtraction).filter(
        ArticleExtraction.extraction_json.isnot(None)
    ).all()

    from collections import Counter
    tag_counts: Counter = Counter()

    for ext in extractions:
        try:
            data = json.loads(ext.extraction_json)
            tags = data.get("tags") or []
            for tag in tags:
                if isinstance(tag, str):
                    tag_counts[tag.lower()] += 1
        except json.JSONDecodeError:
            pass

    return {
        "tags": [
            {"name": tag, "count": count}
            for tag, count in tag_counts.most_common(100)
        ],
        "total_unique": len(tag_counts),
    }


@router.put("/{article_id}/tags")
def update_article_tags(article_id: int, body: dict, db: Session = Depends(get_db)):
    """Update the tags for an article. Body: {"tags": ["tag1", "tag2", ...]}.

    Updates the tags in the latest extraction's extraction_json.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    tags = body.get("tags")
    if not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="'tags' must be a list of strings")
    if any(not isinstance(tag, str) for tag in tags):
        raise HTTPException(status_code=400, detail="'tags' must be a list of strings")

    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article_id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )

    if not extraction or not extraction.extraction_json:
        raise HTTPException(status_code=400, detail="Article has no extraction data yet")

    try:
        data = json.loads(extraction.extraction_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Extraction data is corrupt")

    data["tags"] = tags
    extraction.extraction_json = json.dumps(data)
    db.commit()
    upsert_article_search_index(db, article_id)

    return {"article_id": article_id, "tags": tags}


# ── Related Articles ───────────────────────────────────────────────────────

@router.get("/{article_id}/related")
def get_related_articles(
    article_id: int,
    limit: int = 5,
    db: Session = Depends(get_db),
):
    """Find articles related to this one via shared graph entities.

    Uses Jaccard similarity on entity names (case-insensitive). Returns the
    top ``limit`` articles with the most overlapping concepts.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Get this article's entity names
    own_entities = (
        db.query(GraphEntity.name)
        .filter(GraphEntity.article_id == article_id)
        .all()
    )
    own_names = {e.name.lower() for e in own_entities if e.name}

    if not own_names:
        return {"article_id": article_id, "related": []}

    # Find other articles that share at least one entity name
    other_entities = (
        db.query(GraphEntity.article_id, GraphEntity.name)
        .filter(
            GraphEntity.article_id != article_id,
            GraphEntity.name.isnot(None),
            func.lower(GraphEntity.name).in_(own_names),
        )
        .all()
    )

    # Group entity names by article_id
    from collections import defaultdict
    other_names_by_article: dict[int, set[str]] = defaultdict(set)
    for oe in other_entities:
        other_names_by_article[oe.article_id].add(oe.name.lower())

    # Compute Jaccard similarity for each candidate
    scored: list[tuple[int, float, set[str]]] = []
    for other_id, other_names in other_names_by_article.items():
        intersection = own_names & other_names
        if not intersection:
            continue
        union = own_names | other_names
        jaccard = len(intersection) / len(union) if union else 0.0
        scored.append((other_id, jaccard, intersection))

    # Sort by Jaccard similarity descending
    scored.sort(key=lambda x: x[1], reverse=True)

    # Fetch article details for top results
    top_ids = [s[0] for s in scored[:limit]]
    if not top_ids:
        return {"article_id": article_id, "related": []}

    articles_map: dict[int, Article] = {}
    arts = db.query(Article).filter(Article.id.in_(top_ids)).all()
    for a in arts:
        articles_map[a.id] = a

    return {
        "article_id": article_id,
        "related": [
            {
                "id": aid,
                "title": articles_map[aid].title or articles_map[aid].original_filename,
                "status": articles_map[aid].status,
                "source_type": articles_map[aid].source_type,
                "similarity": round(score, 3),
                "shared_entities": sorted(list(intersection))[:10],
            }
            for aid, score, intersection in scored[:limit]
            if aid in articles_map
        ],
    }
