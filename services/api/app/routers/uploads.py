"""Upload router — handles file upload, ZIP extraction, and pipeline kickoff."""

import json
import logging
import datetime
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    sanitize_filename,
    compute_file_hash,
    validate_upload_filename,
)
from app.db.session import get_db
from app.db.models import Article, ProcessingJob, ArticleStatus, JobStatus
from app.schemas.article import UploadResponse
from app.services.storage.local import LocalStorage
from app.services.pipeline.processor import run_pipeline_background

logger = logging.getLogger(__name__)
router = APIRouter()
storage = LocalStorage()


@router.post("", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a PDF, ZIP, HTML, MD, or TXT file for processing."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate extension
    if not validate_upload_filename(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: .pdf, .zip, .html, .htm, .md, .txt, .markdown",
        )

    # Read file content
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_mb} MB",
        )

    # Compute hash for deduplication
    file_hash = compute_file_hash(content)

    # Check for duplicates
    existing = db.query(Article).filter(Article.file_hash == file_hash).first()
    if existing:
        # Return existing article info
        job = db.query(ProcessingJob).filter(
            ProcessingJob.article_id == existing.id
        ).order_by(ProcessingJob.created_at.desc()).first()
        return UploadResponse(
            article_id=existing.id,
            job_id=job.id if job else 0,
            filename=existing.original_filename,
            status=existing.status,
        )

    # Determine source type
    ext = Path(file.filename).suffix.lower()
    source_type_map = {
        ".pdf": "pdf",
        ".zip": "zip",
        ".html": "html",
        ".htm": "html",
        ".md": "md",
        ".markdown": "md",
        ".txt": "txt",
    }
    source_type = source_type_map.get(ext, "txt")

    # Store file
    safe_name = sanitize_filename(file.filename)
    storage_path = storage.save_upload(safe_name, content)

    # Create article record
    article = Article(
        title=safe_name,
        status=ArticleStatus.UPLOADED.value,
        original_filename=file.filename,
        file_hash=file_hash,
        source_type=source_type,
        storage_path=str(storage_path),
    )
    db.add(article)
    db.flush()

    # Create processing job
    job = ProcessingJob(
        article_id=article.id,
        status=JobStatus.PENDING.value,
        current_step="uploaded",
        logs_json=json.dumps([
            {
                "step": "uploaded",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "message": f"File '{file.filename}' uploaded successfully",
            }
        ]),
    )
    db.add(job)
    db.commit()
    db.refresh(article)
    db.refresh(job)

    # Kick off background processing
    run_pipeline_background(article.id)

    return UploadResponse(
        article_id=article.id,
        job_id=job.id,
        filename=article.original_filename,
        status=article.status,
    )
