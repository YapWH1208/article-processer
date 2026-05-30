"""Tests for article search and retrieval helpers."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleChunk, ArticleStatus, GraphEntity
from app.db.session import Base


def _session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'search.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)()


def test_rank_chunks_for_query_prefers_relevant_text():
    try:
        from app.services import search
    except ImportError as exc:
        raise AssertionError("search retrieval service is missing") from exc

    chunks = [
        search.RetrievedChunk(
            article_id=1,
            article_title="Other",
            chunk_index=0,
            section_title="Background",
            page_start=None,
            page_end=None,
            text="This section discusses unrelated metadata.",
        ),
        search.RetrievedChunk(
            article_id=1,
            article_title="Attention Paper",
            chunk_index=1,
            section_title="Method",
            page_start=2,
            page_end=2,
            text="The transformer attention mechanism improves retrieval accuracy.",
        ),
    ]

    ranked = search.rank_chunks_for_query(chunks, "attention retrieval")

    assert [chunk.chunk_index for chunk in ranked] == [1]


def test_article_search_index_finds_body_and_graph_terms(tmp_path):
    try:
        from app.services import search
    except ImportError as exc:
        raise AssertionError("article FTS search service is missing") from exc

    db = _session(tmp_path)
    article = Article(
        title="Sparse title",
        status=ArticleStatus.COMPLETED.value,
        original_filename="paper.md",
        source_type="md",
        storage_path="paper.md",
        markdown_text="The body studies contrastive retrieval over long documents.",
    )
    db.add(article)
    db.flush()
    db.add(
        GraphEntity(
            article_id=article.id,
            type="Method",
            name="Hybrid Reranker",
            canonical_name="hybrid reranker",
        )
    )
    db.commit()

    search.upsert_article_search_index(db, article.id)

    assert search.search_article_ids(db, "contrastive") == [article.id]
    assert search.search_article_ids(db, "Hybrid Reranker") == [article.id]
    db.close()
