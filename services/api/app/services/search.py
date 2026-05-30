"""SQLite-backed article search and chunk retrieval helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import Article, ArticleChunk, ArticleExtraction, GraphEntity


_TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")
_STOP_WORDS = {
    "about", "after", "also", "and", "are", "can", "could", "does", "for",
    "from", "had", "has", "have", "how", "into", "its", "may", "might",
    "not", "the", "their", "there", "this", "that", "was", "were", "what",
    "when", "where", "which", "with", "would", "your",
}


@dataclass
class RetrievedChunk:
    article_id: int
    article_title: str
    chunk_index: int
    section_title: str | None
    page_start: int | None
    page_end: int | None
    text: str


def _terms(query: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for match in _TOKEN_RE.finditer(query.lower()):
        term = match.group(0)
        if len(term) < 3 or term in _STOP_WORDS or term in seen:
            continue
        seen.add(term)
        terms.append(term)
        if len(terms) >= 12:
            break
    return terms


def _score_text(terms: list[str], text_value: str) -> int:
    text_lower = text_value.lower()
    return sum(text_lower.count(term) for term in terms)


def rank_chunks_for_query(
    chunks: list[RetrievedChunk],
    query: str,
    limit: int = 8,
) -> list[RetrievedChunk]:
    """Return chunks ranked by lexical overlap with the query."""
    terms = _terms(query)
    if not terms:
        return chunks[:limit]

    scored: list[tuple[int, int, RetrievedChunk]] = []
    for pos, chunk in enumerate(chunks):
        haystack = " ".join(
            part
            for part in [
                chunk.article_title,
                chunk.section_title or "",
                chunk.text,
            ]
            if part
        )
        score = _score_text(terms, haystack)
        if score > 0:
            scored.append((score, -pos, chunk))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [chunk for _score, _pos, chunk in scored[:limit]]


def retrieve_relevant_chunks(
    db: Session,
    query: str,
    article_ids: list[int] | None = None,
    limit: int = 8,
) -> list[RetrievedChunk]:
    """Retrieve top chunks for an article-scoped or library-wide question."""
    q = (
        db.query(ArticleChunk, Article.title, Article.original_filename)
        .join(Article, Article.id == ArticleChunk.article_id)
        .filter(Article.deleted_at.is_(None), Article.is_archived == 0)
        .order_by(ArticleChunk.article_id.asc(), ArticleChunk.chunk_index.asc())
    )
    if article_ids:
        q = q.filter(ArticleChunk.article_id.in_(article_ids))

    chunks = [
        RetrievedChunk(
            article_id=chunk.article_id,
            article_title=title or original_filename,
            chunk_index=chunk.chunk_index,
            section_title=chunk.section_title,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            text=chunk.text,
        )
        for chunk, title, original_filename in q.all()
    ]

    ranked = rank_chunks_for_query(chunks, query, limit=limit)
    return ranked or chunks[:limit]


def ensure_article_search_index(db: Session) -> bool:
    """Create the FTS5 article search table when SQLite supports it."""
    try:
        db.execute(text(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS article_search USING fts5(
                article_id UNINDEXED,
                title,
                original_filename,
                markdown_text,
                tags,
                entities
            )
            """
        ))
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()
        return False


def _article_search_document(db: Session, article: Article) -> dict[str, str | int]:
    extraction = (
        db.query(ArticleExtraction)
        .filter(ArticleExtraction.article_id == article.id)
        .order_by(ArticleExtraction.created_at.desc())
        .first()
    )
    tags = ""
    if extraction and extraction.extraction_json:
        import json

        try:
            data = json.loads(extraction.extraction_json)
            raw_tags = data.get("tags") or []
            tags = " ".join(tag for tag in raw_tags if isinstance(tag, str))
        except json.JSONDecodeError:
            tags = ""

    entity_rows = (
        db.query(GraphEntity.name, GraphEntity.canonical_name, GraphEntity.type)
        .filter(GraphEntity.article_id == article.id)
        .all()
    )
    entities = " ".join(
        " ".join(str(part) for part in row if part)
        for row in entity_rows
    )

    return {
        "article_id": article.id,
        "title": article.title or "",
        "original_filename": article.original_filename or "",
        "markdown_text": article.markdown_text or "",
        "tags": tags,
        "entities": entities,
    }


def upsert_article_search_index(db: Session, article_id: int) -> bool:
    if not ensure_article_search_index(db):
        return False

    article = db.query(Article).filter(Article.id == article_id).first()
    try:
        db.execute(text("DELETE FROM article_search WHERE article_id = :article_id"), {"article_id": article_id})
        if article and article.deleted_at is None:
            doc = _article_search_document(db, article)
            db.execute(
                text(
                    """
                    INSERT INTO article_search (
                        article_id, title, original_filename, markdown_text, tags, entities
                    ) VALUES (
                        :article_id, :title, :original_filename, :markdown_text, :tags, :entities
                    )
                    """
                ),
                doc,
            )
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()
        return False


def rebuild_article_search_index(db: Session) -> bool:
    if not ensure_article_search_index(db):
        return False
    try:
        db.execute(text("DELETE FROM article_search"))
        for article in db.query(Article).filter(Article.deleted_at.is_(None)).all():
            doc = _article_search_document(db, article)
            db.execute(
                text(
                    """
                    INSERT INTO article_search (
                        article_id, title, original_filename, markdown_text, tags, entities
                    ) VALUES (
                        :article_id, :title, :original_filename, :markdown_text, :tags, :entities
                    )
                    """
                ),
                doc,
            )
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()
        return False


def search_article_ids(db: Session, query: str, limit: int = 200) -> list[int] | None:
    """Return matching article IDs via FTS5, or None if FTS is unavailable."""
    terms = _terms(query)
    if not terms:
        return []
    if not rebuild_article_search_index(db):
        return None

    fts_query = " OR ".join(f'"{term}"' for term in terms)
    try:
        rows = db.execute(
            text(
                """
                SELECT article_id
                FROM article_search
                WHERE article_search MATCH :query
                LIMIT :limit
                """
            ),
            {"query": fts_query, "limit": limit},
        ).all()
        return [int(row.article_id) for row in rows]
    except SQLAlchemyError:
        db.rollback()
        return None
