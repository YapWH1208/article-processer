"""Tests for manual extraction review updates."""

import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleExtraction, ArticleStatus
from app.db.session import Base
from app.routers.articles import update_article_extraction
from app.schemas.extraction import ExtractionUpdateRequest


def test_update_article_extraction_saves_reviewed_json_and_clears_review(tmp_path):
    db_path = tmp_path / "review.sqlite3"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    article = Article(
        title="Needs Review",
        status=ArticleStatus.NEEDS_REVIEW.value,
        original_filename="review.md",
        source_type="md",
        storage_path="review.md",
        markdown_text="Reviewed method text",
        needs_review=1,
    )
    db.add(article)
    db.flush()
    db.add(
        ArticleExtraction(
            article_id=article.id,
            extraction_json=None,
            validation_errors=json.dumps(["model returned empty response"]),
            confidence=0.0,
        )
    )
    db.commit()
    article_id = article.id

    response = update_article_extraction(
        article_id,
        ExtractionUpdateRequest(
            extraction={
                "title": "Reviewed Paper",
                "authors": ["Ada"],
                "abstract": "Reviewed abstract",
                "methodology": "Reviewed method",
                "tags": ["reviewed"],
            },
            confidence=0.95,
        ),
        db,
    )

    refreshed = db.query(Article).filter(Article.id == article_id).one()
    extraction = db.query(ArticleExtraction).filter(ArticleExtraction.article_id == article_id).one()
    assert response.validation_errors is None
    assert response.confidence == 0.95
    assert response.extraction.title == "Reviewed Paper"
    assert refreshed.needs_review == 0
    assert refreshed.status == ArticleStatus.COMPLETED.value
    assert json.loads(extraction.extraction_json)["tags"] == ["reviewed"]
    assert extraction.validation_errors is None
