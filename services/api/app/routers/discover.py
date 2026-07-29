"""Read-only arXiv and local conference catalogue discovery routes."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.discover import (
    ConferenceCollectionResponse,
    DiscoveryCandidate,
    DiscoveryPage,
    SearchScope,
)
from app.services.discovery.arxiv import ArxivDiscoveryError, search_arxiv
from app.services.discovery.catalog import (
    CONFERENCE_COLLECTIONS,
    CatalogValidationError,
    search_catalog_papers,
)


router = APIRouter()


def _catalog_candidate(paper) -> DiscoveryCandidate:
    try:
        authors = json.loads(paper.authors_json or "[]")
    except json.JSONDecodeError:
        authors = []
    try:
        keywords = json.loads(paper.keywords_json or "[]")
    except json.JSONDecodeError:
        keywords = []
    return DiscoveryCandidate(
        id=paper.id,
        source_provider="conference_catalog",
        source_external_id=paper.source_external_id,
        title=paper.title,
        authors=authors if isinstance(authors, list) else [],
        abstract=paper.abstract,
        keywords=keywords if isinstance(keywords, list) else [],
        venue=paper.venue,
        published_date=paper.published_date,
        landing_url=paper.landing_url,
        pdf_url=paper.pdf_url,
        collection=paper.conference_key,
        source_retrieved_at=paper.imported_at,
    )


@router.get("/collections", response_model=list[ConferenceCollectionResponse])
def list_collections():
    return [ConferenceCollectionResponse(**collection) for collection in CONFERENCE_COLLECTIONS]


@router.get("/arxiv", response_model=DiscoveryPage)
def discover_arxiv(
    query: str = Query(..., min_length=1, max_length=200),
    scope: SearchScope = "title",
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=25),
):
    try:
        candidates = search_arxiv(query, scope=scope, offset=offset, limit=limit)
    except ArxivDiscoveryError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return DiscoveryPage(items=candidates, total=len(candidates), offset=offset, limit=limit)


@router.get("/conferences/{conference_key}/papers", response_model=DiscoveryPage)
def discover_conference_papers(
    conference_key: str,
    query: str | None = Query(default=None, max_length=200),
    scope: SearchScope = "title",
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=25),
    db: Session = Depends(get_db),
):
    try:
        papers, total = search_catalog_papers(
            db,
            conference_key,
            query=query,
            scope=scope,
            offset=offset,
            limit=limit,
        )
    except CatalogValidationError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DiscoveryPage(
        items=[_catalog_candidate(paper) for paper in papers],
        total=total,
        offset=offset,
        limit=limit,
    )
