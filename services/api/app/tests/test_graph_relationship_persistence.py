"""Regression tests for graph relationship persistence."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import (
    Article,
    ArticleStatus,
    GraphEntity,
    GraphRelationship,
    ProcessingJob,
)
from app.db.session import Base
from app.services.ai.base import TokenUsage
from app.services.pipeline import processor


class GraphExtractionProvider:
    def __init__(self):
        self.last_usage = TokenUsage()

    async def extract_structured(self, markdown: str, article_title: str):
        return (
            {
                "title": article_title,
                "authors": ["Alice Example"],
                "methodology": "The paper proposes Transformer Retrieval.",
                "datasets": ["PaperBench"],
                "metrics": ["accuracy"],
                "tags": ["retrieval"],
                "graph_entities": [
                    {"type": "Method", "name": "Transformer Retrieval"},
                ],
                "graph_relationships": [
                    {
                        "source_name": "Alice Example",
                        "source_type": "Author",
                        "target_name": "Transformer Retrieval",
                        "target_type": "Method",
                        "type": "USES_METHOD",
                    }
                ],
            },
            None,
            0.9,
        )


@pytest.mark.asyncio
async def test_pipeline_maps_graph_temp_ids_to_persisted_entity_ids(tmp_path, monkeypatch):
    db_path = tmp_path / "graph.sqlite3"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    monkeypatch.setattr(processor, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(processor, "get_llm_provider", lambda: GraphExtractionProvider())

    db = TestingSessionLocal()
    existing_article = Article(
        title="Existing",
        status=ArticleStatus.COMPLETED.value,
        original_filename="existing.md",
        source_type="md",
        storage_path="existing.md",
        markdown_text="# Existing",
    )
    db.add(existing_article)
    db.flush()
    db.add(
        GraphEntity(
            article_id=existing_article.id,
            type="Method",
            name="Existing Method",
            canonical_name="existing method",
        )
    )

    article = Article(
        title="New graph paper",
        status=ArticleStatus.COMPLETED.value,
        original_filename="new.md",
        source_type="md",
        storage_path="new.md",
        markdown_text="# New graph paper\n\nTransformer Retrieval improves accuracy.",
    )
    db.add(article)
    db.flush()
    db.add(
        ProcessingJob(
            article_id=article.id,
            status="pending",
            current_step="queued",
            logs_json=json.dumps([]),
        )
    )
    db.commit()
    article_id = article.id
    db.close()

    await processor.run_pipeline(article_id, run_ai=True, start_step="extract")

    db = TestingSessionLocal()
    new_entity_ids = {
        row.id
        for row in db.query(GraphEntity).filter(GraphEntity.article_id == article_id).all()
    }
    relationships = (
        db.query(GraphRelationship)
        .filter(GraphRelationship.article_id == article_id)
        .all()
    )

    assert relationships
    for rel in relationships:
        assert rel.source_entity_id in new_entity_ids
        assert rel.target_entity_id in new_entity_ids
    db.close()
