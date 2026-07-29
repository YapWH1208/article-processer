"""Tests for explicit local conference catalogue imports."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ConferenceCatalogPaper
from app.db.session import Base
from app.services.discovery.catalog import (
    CatalogValidationError,
    SUPPORTED_CONFERENCE_KEYS,
    import_catalog_snapshot,
    normalize_catalog_paper,
    validate_conference_key,
)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _paper_row(title: str = "Evidence-Grounded Paper", paper_id: str = "paper-1") -> dict:
    return {
        "id": paper_id,
        "content": {
            "title": {"value": title},
            "abstract": {"value": "A local source snapshot abstract."},
            "authors": {"value": ["Ada Researcher", "Lin Scientist"]},
            "keywords": {"value": ["evidence", "triage"]},
            "venue": {"value": "ICLR 2026 Poster"},
            "pdf": {"value": "https://openreview.net/pdf?id=paper-1"},
        },
        "landing_url": "https://openreview.net/forum?id=paper-1",
    }


def test_supported_conference_keys_match_approved_scope():
    assert SUPPORTED_CONFERENCE_KEYS == {
        "iclr_2026",
        "chi_2026",
        "cvpr_2026",
        "neurips_2025",
        "icml_2025",
    }
    assert validate_conference_key("ICLR-2026") == "iclr_2026"
    with pytest.raises(CatalogValidationError):
        validate_conference_key("acl_2026")


def test_normalize_paper_insight_style_snapshot_row():
    paper = normalize_catalog_paper(_paper_row())

    assert paper.source_external_id == "paper-1"
    assert paper.title == "Evidence-Grounded Paper"
    assert paper.authors == ["Ada Researcher", "Lin Scientist"]
    assert paper.keywords == ["evidence", "triage"]
    assert paper.venue == "ICLR 2026 Poster"
    assert paper.pdf_url == "https://openreview.net/pdf?id=paper-1"
    assert json.loads(paper.raw_payload_json)["id"] == "paper-1"


def test_import_snapshot_upserts_rows_and_skips_invalid_data(tmp_path, db_session):
    snapshot = tmp_path / "iclr.jsonl"
    initial = _paper_row()
    updated = _paper_row(title="Updated Evidence-Grounded Paper")
    second = _paper_row(title="Second Paper", paper_id="paper-2")
    invalid = {"id": "missing-title", "content": {"abstract": {"value": "No title"}}}
    snapshot.write_text(
        "\n".join([json.dumps(initial), json.dumps(invalid), "not json", "", json.dumps(second)]) + "\n",
        encoding="utf-8",
    )

    first_summary = import_catalog_snapshot(db_session, "iclr_2026", snapshot)

    assert first_summary.created == 2
    assert first_summary.updated == 0
    assert first_summary.invalid == 2
    assert first_summary.skipped == 1
    assert db_session.query(ConferenceCatalogPaper).count() == 2
    assert db_session.query(Article).count() == 0

    snapshot.write_text(json.dumps(updated) + "\n", encoding="utf-8")
    second_summary = import_catalog_snapshot(db_session, "iclr_2026", snapshot)

    assert second_summary.created == 0
    assert second_summary.updated == 1
    stored = db_session.query(ConferenceCatalogPaper).filter_by(source_external_id="paper-1").one()
    assert stored.title == "Updated Evidence-Grounded Paper"
    assert json.loads(stored.authors_json) == ["Ada Researcher", "Lin Scientist"]


def test_import_requires_an_explicit_jsonl_input_path(tmp_path, db_session):
    with pytest.raises(CatalogValidationError):
        import_catalog_snapshot(db_session, "iclr_2026", tmp_path / "missing.jsonl")

    wrong_extension = tmp_path / "snapshot.json"
    wrong_extension.write_text("{}", encoding="utf-8")
    with pytest.raises(CatalogValidationError):
        import_catalog_snapshot(db_session, "iclr_2026", wrong_extension)
