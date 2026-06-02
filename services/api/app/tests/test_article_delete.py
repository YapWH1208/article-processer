"""Tests for permanent article deletion."""

import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleExtraction, ArticleStatus, ProcessingJob
from app.db.session import Base
from app.routers.articles import delete_article


def test_delete_article_removes_article_and_related_database_rows(tmp_path):
    db_path = tmp_path / "delete.sqlite3"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = TestingSessionLocal()
    article = Article(
        title="Delete Me",
        status=ArticleStatus.COMPLETED.value,
        original_filename="delete-me.md",
        source_type="md",
        storage_path="delete-me.md",
        markdown_text="# Delete Me",
    )
    db.add(article)
    db.flush()
    article_id = article.id
    db.add(
        ArticleExtraction(
            article_id=article_id,
            schema_version="1.0",
            extraction_json=json.dumps({"title": "Delete Me"}),
        )
    )
    db.add(
        ProcessingJob(
            article_id=article_id,
            status="completed",
            current_step="complete",
            logs_json=json.dumps([]),
        )
    )
    db.commit()

    response = delete_article(article_id, db=db)

    assert response == {"article_id": article_id, "deleted": True}
    assert db.query(Article).filter(Article.id == article_id).first() is None
    assert db.query(ArticleExtraction).filter(ArticleExtraction.article_id == article_id).count() == 0
    assert db.query(ProcessingJob).filter(ProcessingJob.article_id == article_id).count() == 0

    db.close()
