"""Default internal tools for article operations.

These tools follow the MCP design pattern: name, description, input/output schemas, handler.
"""

import json
import logging
from app.services.tools.registry import Tool, ToolRegistry
from app.db.session import SessionLocal
from app.db.models import Article, ArticleChunk, ArticleExtraction

logger = logging.getLogger(__name__)


def _search_articles(query: str = "", status: str | None = None, limit: int = 20) -> dict:
    """Search articles by title or status."""
    db = SessionLocal()
    try:
        q = db.query(Article)
        if query:
            q = q.filter(
                Article.title.ilike(f"%{query}%")
                | Article.original_filename.ilike(f"%{query}%")
            )
        if status:
            q = q.filter(Article.status == status)
        articles = q.order_by(Article.created_at.desc()).limit(limit).all()
        return {
            "articles": [
                {
                    "id": a.id,
                    "title": a.title,
                    "status": a.status,
                    "source_type": a.source_type,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in articles
            ]
        }
    finally:
        db.close()


def _get_article(article_id: int) -> dict:
    """Get full article details including extraction."""
    db = SessionLocal()
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return {"error": f"Article {article_id} not found"}

        extraction = (
            db.query(ArticleExtraction)
            .filter(ArticleExtraction.article_id == article_id)
            .order_by(ArticleExtraction.created_at.desc())
            .first()
        )

        return {
            "id": article.id,
            "title": article.title,
            "status": article.status,
            "source_type": article.source_type,
            "original_filename": article.original_filename,
            "extraction": json.loads(extraction.extraction_json) if extraction and extraction.extraction_json else None,
            "needs_review": bool(article.needs_review),
        }
    finally:
        db.close()


def _query_article_chunks(article_id: int, query: str, top_k: int = 5) -> dict:
    """Search chunks within an article."""
    db = SessionLocal()
    try:
        chunks = (
            db.query(ArticleChunk)
            .filter(ArticleChunk.article_id == article_id)
            .all()
        )

        if not chunks:
            return {"chunks": []}

        # Simple keyword matching
        query_terms = set(query.lower().split())
        query_terms = {t for t in query_terms if len(t) > 2}

        scored = []
        for chunk in chunks:
            text_lower = chunk.text.lower()
            score = sum(1 for term in query_terms if term in text_lower)
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]

        return {
            "chunks": [
                {
                    "chunk_index": chunk.chunk_index,
                    "section_title": chunk.section_title,
                    "page_start": chunk.page_start,
                    "page_end": chunk.page_end,
                    "text": chunk.text[:500],
                    "score": score,
                }
                for score, chunk in top
            ]
        }
    finally:
        db.close()


def _compare_articles(article_ids: list[int]) -> dict:
    """Placeholder: compare multiple articles."""
    return {
        "message": "Multi-article comparison is not yet implemented.",
        "article_ids": article_ids,
    }


def _export_article_summary(article_id: int, format: str = "json") -> dict:
    """Export article summary in specified format."""
    db = SessionLocal()
    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return {"error": f"Article {article_id} not found"}

        extraction = (
            db.query(ArticleExtraction)
            .filter(ArticleExtraction.article_id == article_id)
            .order_by(ArticleExtraction.created_at.desc())
            .first()
        )

        extraction_data = None
        if extraction and extraction.extraction_json:
            extraction_data = json.loads(extraction.extraction_json)

        return {
            "article": {
                "id": article.id,
                "title": article.title,
                "status": article.status,
            },
            "extraction": extraction_data,
            "format": format,
        }
    finally:
        db.close()


def register_default_tools(registry: ToolRegistry) -> None:
    """Register all default tools in the given registry."""
    registry.register(Tool(
        name="searchArticles",
        description="Search articles by title, filename, or status",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "status": {"type": "string", "description": "Filter by status"},
                "limit": {"type": "integer", "description": "Max results", "default": 20},
            },
        },
        output_schema={
            "type": "object",
            "properties": {
                "articles": {"type": "array"},
            },
        },
        handler=_search_articles,
    ))

    registry.register(Tool(
        name="getArticle",
        description="Get full article details by ID",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "title": {"type": "string"},
                "extraction": {"type": "object"},
            },
        },
        handler=_get_article,
    ))

    registry.register(Tool(
        name="queryArticleChunks",
        description="Search chunks within a specific article",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
                "query": {"type": "string"},
                "top_k": {"type": "integer", "default": 5},
            },
            "required": ["article_id", "query"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "chunks": {"type": "array"},
            },
        },
        handler=_query_article_chunks,
    ))

    registry.register(Tool(
        name="compareArticles",
        description="Compare multiple articles (placeholder)",
        input_schema={
            "type": "object",
            "properties": {
                "article_ids": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["article_ids"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "message": {"type": "string"},
            },
        },
        handler=_compare_articles,
    ))

    registry.register(Tool(
        name="exportArticleSummary",
        description="Export article summary in JSON or Markdown format",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
                "format": {"type": "string", "enum": ["json", "markdown"], "default": "json"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
        },
        handler=_export_article_summary,
    ))
