"""Import router — article JSON import."""

import json
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ArticleExtraction, GraphEntity, GraphRelationship, ProcessingJob, ArticleStatus, JobStatus
from app.core.security import compute_file_hash

logger = logging.getLogger(__name__)
router = APIRouter()


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
