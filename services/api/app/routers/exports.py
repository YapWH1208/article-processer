"""Export router — Markdown and JSON export of article summaries."""

import json
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, JSONResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ArticleExtraction, GraphEntity, GraphRelationship
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _build_export_data(article: Article, db: Session) -> dict:
    """Build a comprehensive export dict for an article."""
    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article.id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )

    entities = db.query(GraphEntity).filter(GraphEntity.article_id == article.id).all()
    relationships = (
        db.query(GraphRelationship)
        .filter(GraphRelationship.article_id == article.id)
        .all()
    )

    extraction_data = None
    if extraction and extraction.extraction_json:
        try:
            extraction_data = json.loads(extraction.extraction_json)
        except json.JSONDecodeError:
            pass

    return {
        "article": {
            "id": article.id,
            "title": article.title,
            "original_filename": article.original_filename,
            "source_type": article.source_type,
            "status": article.status,
            "file_hash": article.file_hash,
            "created_at": article.created_at.isoformat() if article.created_at else None,
            "updated_at": article.updated_at.isoformat() if article.updated_at else None,
        },
        "extraction": extraction_data,
        "graph": {
            "entities": [
                {
                    "type": e.type,
                    "name": e.name,
                    "canonical_name": e.canonical_name,
                    "properties": json.loads(e.properties_json) if e.properties_json else None,
                    "confidence": e.confidence,
                }
                for e in entities
            ],
            "relationships": [
                {
                    "type": r.type,
                    "source_entity_id": r.source_entity_id,
                    "target_entity_id": r.target_entity_id,
                    "confidence": r.confidence,
                }
                for r in relationships
            ],
        },
        "markdown": article.markdown_text or "",
    }


@router.get("/{article_id}/export/json")
def export_json(article_id: int, db: Session = Depends(get_db)):
    """Export article summary as JSON."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    data = _build_export_data(article, db)
    return JSONResponse(content=data)


@router.get("/{article_id}/export/markdown")
def export_markdown(article_id: int, db: Session = Depends(get_db)):
    """Export article summary as Markdown."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    data = _build_export_data(article, db)
    extraction = data.get("extraction") or {}

    md_lines = [
        f"# {extraction.get('title') or article.title}",
        "",
    ]

    if extraction.get("authors"):
        md_lines.append(f"**Authors:** {', '.join(extraction['authors'])}")
        md_lines.append("")

    if extraction.get("year"):
        md_lines.append(f"**Year:** {extraction['year']}")
        md_lines.append("")

    if extraction.get("venue"):
        md_lines.append(f"**Venue:** {extraction['venue']}")
        md_lines.append("")

    if extraction.get("doi"):
        md_lines.append(f"**DOI:** {extraction['doi']}")
        md_lines.append("")

    if extraction.get("abstract"):
        md_lines.append("## Abstract")
        md_lines.append(extraction["abstract"])
        md_lines.append("")

    if extraction.get("background"):
        md_lines.append("## Background")
        md_lines.append(extraction["background"])
        md_lines.append("")

    if extraction.get("research_problem"):
        md_lines.append("## Research Problem")
        md_lines.append(extraction["research_problem"])
        md_lines.append("")

    if extraction.get("methodology"):
        md_lines.append("## Methodology")
        md_lines.append(extraction["methodology"])
        md_lines.append("")

    if extraction.get("results"):
        md_lines.append("## Results")
        md_lines.append(extraction["results"])
        md_lines.append("")

    if extraction.get("limitations"):
        md_lines.append("## Limitations")
        md_lines.append(extraction["limitations"])
        md_lines.append("")

    if extraction.get("future_work"):
        md_lines.append("## Future Work")
        md_lines.append(extraction["future_work"])
        md_lines.append("")

    if extraction.get("tags"):
        md_lines.append("## Tags")
        md_lines.append(", ".join(extraction["tags"]))
        md_lines.append("")

    if extraction.get("key_claims"):
        md_lines.append("## Key Claims")
        for claim in extraction["key_claims"]:
            if isinstance(claim, dict):
                md_lines.append(f"- {claim.get('claim', '')}")
            else:
                md_lines.append(f"- {claim}")
        md_lines.append("")

    md_lines.append("---")
    md_lines.append(f"*Exported from Article Processor on {article.updated_at.isoformat() if article.updated_at else ''}*")

    return PlainTextResponse(content="\n".join(md_lines), media_type="text/markdown")


# ── Batch Export ─────────────────────────────────────────────────────────

@router.post("/export")
def export_articles(body: dict, db: Session = Depends(get_db)):
    """Export multiple articles as a JSON array. Body: {"article_ids": [1, 2, 3]} or {"all": true}."""
    article_ids = body.get("article_ids")
    export_all = body.get("all", False)

    if export_all:
        articles = db.query(Article).all()
    elif article_ids and isinstance(article_ids, list):
        articles = db.query(Article).filter(Article.id.in_(article_ids)).all()
    else:
        raise HTTPException(status_code=400, detail="Provide 'article_ids' list or 'all': true")

    result = []
    for article in articles:
        data = _build_export_data(article, db)
        result.append(data)

    return JSONResponse(content={"articles": result, "count": len(result)})
