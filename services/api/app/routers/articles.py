"""Articles router — list, detail, markdown, extraction, graph, reprocess, archive, delete."""

import json
import logging
import os
import shutil
import mimetypes
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
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
)
from app.schemas.article import (
    ArticleSummary,
    ArticleDetail,
    ArticleListResponse,
    ReprocessResponse,
)
from app.schemas.extraction import ExtractionResponse
from app.schemas.graph import GraphResponse
from app.schemas.jobs import JobResponse

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
    sort_by: str = "created_at",
    sort_order: str = "desc",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List articles with optional filtering. Archived articles hidden by default.

    - `search`: matches title and filename (fast metadata search).
    - `search_content`: matches inside the parsed Markdown body (full-text search,
      clamped to 200 results max to keep SQLite responsive).
    - `sort_by`: column to sort by (created_at, title, status, updated_at).
    - `sort_order`: asc or desc.
    """
    q = db.query(Article)

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
        q = q.filter(Article.markdown_text.ilike(f"%{search_content}%"))

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
        return {"markdown": _rewrite_markdown_image_urls(cleaned)}

    if article.markdown_path:
        try:
            with open(article.markdown_path, "r", encoding="utf-8") as f:
                return {"markdown": _rewrite_markdown_image_urls(f.read())}
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
        run_pipeline_background(article.id, run_ai=False, start_step="parse")
    elif mode == "extract_only":
        run_pipeline_background(article.id, run_ai=True, start_step="extract")
    else:
        run_pipeline_background(article.id, run_ai=True, start_step="parse")

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
    return {"article_id": article_id, "is_archived": True}


@router.post("/{article_id}/unarchive")
def unarchive_article(article_id: int, db: Session = Depends(get_db)):
    """Restore an archived article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.is_archived = 0
    db.commit()
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
    db.refresh(article)
    return ArticleDetail.model_validate(article)


@router.delete("/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    """Hard-delete an article and its storage files."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Collect paths to clean up
    paths_to_remove: list[str] = []
    if article.storage_path and os.path.exists(article.storage_path):
        paths_to_remove.append(article.storage_path)
    if article.markdown_path and os.path.exists(article.markdown_path):
        paths_to_remove.append(article.markdown_path)

    # Delete from DB (cascade removes everything)
    db.delete(article)
    db.commit()

    # Clean up files on disk
    for path in paths_to_remove:
        try:
            if os.path.isfile(path):
                os.remove(path)
            elif os.path.isdir(path):
                shutil.rmtree(path)
        except OSError as e:
            logger.warning(f"Failed to remove {path}: {e}")

    return {"article_id": article_id, "deleted": True}


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
