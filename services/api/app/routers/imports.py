"""Import router — BibTeX/Zotero import for batch article creation."""

import json
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ProcessingJob, ArticleStatus, JobStatus
from app.services.parsers.bibtex_parser import parse_bibtex
from app.services.pipeline.processor import run_pipeline_background
from app.core.security import sanitize_filename, compute_file_hash

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/bibtex")
async def import_bibtex(
    bibtex_text: str = Form(None),
    bibtex_file: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    """Import articles from BibTeX text or .bib file.

    Provide either bibtex_text (raw string) or bibtex_file (uploaded .bib file).
    Each BibTeX entry creates a placeholder article record.
    """
    if not bibtex_text and not bibtex_file:
        raise HTTPException(
            status_code=400,
            detail="Provide either bibtex_text or bibtex_file",
        )

    # Get text from file if provided
    if bibtex_file:
        if not bibtex_file.filename or not bibtex_file.filename.endswith(('.bib', '.bibtex')):
            raise HTTPException(status_code=400, detail="File must be .bib or .bibtex")
        bibtex_text = (await bibtex_file.read()).decode("utf-8", errors="replace")

    if not bibtex_text or not bibtex_text.strip():
        raise HTTPException(status_code=400, detail="Empty BibTeX content")

    # Parse entries
    try:
        entries = parse_bibtex(bibtex_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse BibTeX: {str(e)}")

    if not entries:
        raise HTTPException(status_code=400, detail="No valid BibTeX entries found")

    created = []
    skipped = 0

    for entry in entries:
        title = entry.get("title") or entry.get("citation_key", "Untitled")
        authors = entry.get("authors", [])

        # Build a simple text representation as the article "content"
        # for processing. This won't be a real PDF but can still be extracted.
        content_parts = [f"# {title}\n"]
        if authors:
            content_parts.append(f"**Authors:** {', '.join(authors)}\n")
        if entry.get("year"):
            content_parts.append(f"**Year:** {entry['year']}\n")
        if entry.get("venue"):
            content_parts.append(f"**Venue:** {entry['venue']}\n")
        if entry.get("doi"):
            content_parts.append(f"**DOI:** {entry['doi']}\n")
        if entry.get("url"):
            content_parts.append(f"**URL:** {entry['url']}\n")
        if entry.get("abstract"):
            content_parts.append(f"\n## Abstract\n{entry['abstract']}\n")

        markdown_content = "\n".join(content_parts)

        # Compute hash from BibTeX entry for dedup
        file_hash = compute_file_hash(title.encode() + entry.get("doi", "").encode())

        # Check for duplicates
        existing = db.query(Article).filter(Article.file_hash == file_hash).first()
        if existing:
            skipped += 1
            continue

        # Create article record with the BibTeX content as markdown
        article = Article(
            title=title,
            status=ArticleStatus.COMPLETED.value,  # BibTeX imports are pre-parsed
            original_filename=f"{entry.get('citation_key', 'import')}.bib",
            file_hash=file_hash,
            source_type="md",
            storage_path="bibtex://import",
            markdown_text=markdown_content,
        )
        db.add(article)
        db.flush()

        # Create processing job (marked as completed since content is already text)
        job = ProcessingJob(
            article_id=article.id,
            status=JobStatus.COMPLETED.value,
            current_step="imported",
            logs_json=json.dumps([
                {
                    "step": "imported",
                    "timestamp": datetime.datetime.utcnow().isoformat(),
                    "message": f"Imported from BibTeX: {entry.get('citation_key', 'unknown')}",
                }
            ]),
            completed_at=datetime.datetime.utcnow(),
        )
        db.add(job)

        created.append({
            "article_id": article.id,
            "title": title,
            "citation_key": entry.get("citation_key", ""),
        })

    db.commit()

    # Kick off background processing for created articles
    for item in created:
        try:
            run_pipeline_background(item["article_id"])
        except Exception as e:
            logger.error(f"Failed to start pipeline for article {item['article_id']}: {e}")

    return {
        "imported": len(created),
        "skipped": skipped,
        "total_entries": len(entries),
        "articles": created,
    }
