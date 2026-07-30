"""Regression tests for persisted extraction response compatibility."""

import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleExtraction, ArticleStatus
from app.db.session import Base
from app.routers.articles import get_article_extraction


def _session_with_extraction(tmp_path, extraction_json: str):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'extraction-response.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    article = Article(
        title="Stored extraction",
        status=ArticleStatus.COMPLETED.value,
        original_filename="stored.pdf",
        source_type="pdf",
        storage_path="stored.pdf",
    )
    session.add(article)
    session.flush()
    session.add(ArticleExtraction(
        article_id=article.id,
        schema_version="1.0",
        extraction_json=extraction_json,
        confidence=0.85,
    ))
    session.commit()
    return session, engine, article.id


def test_extraction_response_coerces_legacy_string_evidence(tmp_path):
    session, engine, article_id = _session_with_extraction(
        tmp_path,
        json.dumps({
            "abstract": "A stored reading summary.",
            "key_claims": [{"claim": "The method improves accuracy.", "evidence": "Section 5.2, Table 4"}],
            "triage": {"results": {"text": "Improved accuracy", "evidence": "Results section"}},
        }),
    )

    response = get_article_extraction(article_id, db=session)

    assert response.extraction is not None
    assert response.extraction.abstract == "A stored reading summary."
    assert response.extraction.key_claims[0].evidence.source_section == "Section 5.2, Table 4"
    assert response.extraction.triage.results.evidence.source_section == "Results section"
    assert response.validation_errors is None
    session.close()
    engine.dispose()


def test_extraction_response_returns_diagnostics_for_unreadable_stored_shape(tmp_path):
    session, engine, article_id = _session_with_extraction(
        tmp_path,
        json.dumps({"key_claims": [{"claim": "Broken evidence", "evidence": ["not", "an", "object"]}]}),
    )

    response = get_article_extraction(article_id, db=session)

    assert response.extraction is None
    assert response.validation_errors
    assert any("key_claims.0.evidence" in error for error in response.validation_errors)
    session.close()
    engine.dispose()
