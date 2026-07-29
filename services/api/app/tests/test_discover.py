"""Tests for fixed-source discovery and selected-paper import provenance."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Article, ArticleMetadata, ArticleStatus, ConferenceCatalogPaper, ProcessingJob
from app.db.session import Base
from app.routers import discover, imports
from app.schemas.discover import ArxivProvenanceRequest
from app.services.discovery import arxiv


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'discover.sqlite3'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


class _FakeArxivResponse:
    text = """<?xml version='1.0' encoding='UTF-8'?>
    <feed xmlns='http://www.w3.org/2005/Atom' xmlns:opensearch='http://a9.com/-/spec/opensearch/1.1/'>
      <opensearch:totalResults>42</opensearch:totalResults>
      <entry>
        <id>http://arxiv.org/abs/2401.12345v2</id>
        <title> Evidence Grounded Discovery </title>
        <summary> A concise abstract. </summary>
        <published>2024-01-22T00:00:00Z</published>
        <author><name>Ada Researcher</name></author>
        <category term='cs.AI'/>
        <link title='pdf' href='https://arxiv.org/pdf/2401.12345v2.pdf'/>
      </entry>
    </feed>"""

    def raise_for_status(self):
        return None


def test_arxiv_search_uses_the_fixed_endpoint_and_maps_atom_entries():
    calls = []

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        return _FakeArxivResponse()

    page = arxiv.search_arxiv("evidence", scope="title", limit=99, http_get=fake_get)
    candidates = page.items

    assert calls[0][0] == arxiv.ARXIV_API_URL
    assert calls[0][1]["params"]["search_query"] == "ti:evidence"
    assert calls[0][1]["params"]["max_results"] == 25
    assert candidates[0].source_external_id == "2401.12345v2"
    assert candidates[0].authors == ["Ada Researcher"]
    assert candidates[0].pdf_url == "https://arxiv.org/pdf/2401.12345v2.pdf"
    assert candidates[0].source_retrieved_at is not None
    assert page.total == 42


def test_catalogue_search_is_local_scoped_and_has_no_article_side_effect(db_session):
    first = ConferenceCatalogPaper(
        conference_key="iclr_2026",
        source_external_id="first",
        title="Evidence First",
        abstract="A retrieval paper",
        keywords_json=json.dumps(["retrieval"]),
        raw_payload_json="{}",
    )
    second = ConferenceCatalogPaper(
        conference_key="iclr_2026",
        source_external_id="second",
        title="Other Work",
        abstract="Evidence in the abstract",
        keywords_json=json.dumps(["analysis"]),
        raw_payload_json="{}",
    )
    db_session.add_all([first, second])
    db_session.commit()

    page = discover.discover_conference_papers(
        "iclr_2026",
        query="evidence",
        scope="abstract",
        offset=0,
        limit=25,
        db=db_session,
    )

    assert page.total == 1
    assert page.items[0].source_external_id == "second"
    assert db_session.query(Article).count() == 0
    assert db_session.query(ProcessingJob).count() == 0


@pytest.mark.asyncio
async def test_catalogue_selection_persists_server_resolved_provenance(db_session, tmp_path, monkeypatch):
    paper = ConferenceCatalogPaper(
        conference_key="iclr_2026",
        source_external_id="openreview-paper",
        title="Selected Conference Paper",
        authors_json=json.dumps(["Ada Researcher"]),
        abstract="Imported only after selection.",
        venue="ICLR 2026",
        landing_url="https://openreview.net/forum?id=openreview-paper",
        pdf_url="https://openreview.net/pdf?id=openreview-paper",
        raw_payload_json=json.dumps({"id": "openreview-paper"}),
    )
    db_session.add(paper)
    db_session.commit()

    def fake_download(_url, dest_path, max_bytes, timeout=60):
        dest_path.write_bytes(b"%PDF-1.4\nconference paper\n")

    monkeypatch.setattr(imports.settings, "storage_dir", str(tmp_path / "storage"))
    monkeypatch.setattr(imports, "_download_file", fake_download)
    from app.services.pipeline import processor
    monkeypatch.setattr(processor, "run_pipeline_background", lambda *args, **kwargs: None)

    response = await imports.import_from_url(
        imports.UrlImportRequest(catalog_paper_id=paper.id, run_ai=False),
        db=db_session,
    )

    article = db_session.query(Article).filter(Article.id == response.article_id).one()
    metadata = db_session.query(ArticleMetadata).filter(ArticleMetadata.article_id == article.id).one()
    assert article.title == "Selected Conference Paper"
    assert article.source_type == "pdf"
    assert metadata.source_provider == "conference_catalog"
    assert metadata.source_collection == "iclr_2026"
    assert metadata.source_external_id == "openreview-paper"


@pytest.mark.asyncio
async def test_arxiv_selection_requires_matching_typed_provenance(db_session, tmp_path, monkeypatch):
    def fake_download(_url, dest_path, max_bytes, timeout=60):
        dest_path.write_bytes(b"%PDF-1.4\narxiv paper\n")

    monkeypatch.setattr(imports.settings, "storage_dir", str(tmp_path / "storage"))
    monkeypatch.setattr(imports, "_download_file", fake_download)
    from app.services.pipeline import processor
    monkeypatch.setattr(processor, "run_pipeline_background", lambda *args, **kwargs: None)

    provenance = ArxivProvenanceRequest(
        source_external_id="2401.12345",
        source_landing_url="https://arxiv.org/abs/2401.12345",
        source_pdf_url="https://arxiv.org/pdf/2401.12345.pdf",
        source_payload={"id": "2401.12345"},
        title="Selected arXiv Paper",
        authors=["Ada Researcher"],
        abstract="A typed arXiv result.",
    )
    response = await imports.import_from_url(
        imports.UrlImportRequest(
            url="https://arxiv.org/abs/2401.12345",
            provenance=provenance,
            run_ai=False,
        ),
        db=db_session,
    )

    metadata = db_session.query(ArticleMetadata).filter(ArticleMetadata.article_id == response.article_id).one()
    assert metadata.source_provider == "arxiv"
    assert metadata.arxiv_id == "2401.12345"
    assert metadata.source_pdf_url == "https://arxiv.org/pdf/2401.12345.pdf"
    assert json.loads(metadata.source_payload_json) == {"id": "2401.12345"}


def test_openreview_pdf_endpoint_is_recognized_without_weakening_other_url_types():
    assert imports._detect_url_type("https://openreview.net/pdf?id=paper-1") == (
        "direct-pdf",
        "https://openreview.net/pdf?id=paper-1",
    )
    assert imports._detect_url_type("https://openreview.net/forum?id=paper-1") == ("unknown", None)
    assert imports._detect_url_type("https://evil-arxiv.org/abs/2401.12345") == ("unknown", None)


def test_article_detail_exposes_optional_provenance_without_changing_source_type(db_session):
    article = Article(
        title="Provenance Article",
        status=ArticleStatus.COMPLETED.value,
        original_filename="provenance.pdf",
        source_type="pdf",
        storage_path="provenance.pdf",
    )
    db_session.add(article)
    db_session.flush()
    db_session.add(ArticleMetadata(
        article_id=article.id,
        source_provider="conference_catalog",
        source_external_id="paper-1",
        source_collection="iclr_2026",
    ))
    db_session.commit()

    from app.routers import articles
    detail = articles.get_article(article.id, db=db_session)

    assert detail.source_type == "pdf"
    assert detail.provenance is not None
    assert detail.provenance.source_external_id == "paper-1"
