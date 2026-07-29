"""Fixed-host, read-only arXiv discovery adapter."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Callable
from xml.etree import ElementTree

import httpx

from app.schemas.discover import DiscoveryCandidate


ARXIV_API_URL = "https://export.arxiv.org/api/query"
_ATOM_NAMESPACE = "{http://www.w3.org/2005/Atom}"
_OPENSEARCH_NAMESPACE = "{http://a9.com/-/spec/opensearch/1.1/}"
_ARXIV_QUERY_FIELDS = {
    "title": "ti",
    "abstract": "abs",
    "keywords": "all",
}


class ArxivDiscoveryError(RuntimeError):
    """The fixed arXiv source failed or returned an invalid feed."""


@dataclass(frozen=True)
class ArxivSearchPage:
    items: list[DiscoveryCandidate]
    total: int


def _text(element: ElementTree.Element | None) -> str | None:
    if element is None or element.text is None:
        return None
    value = " ".join(element.text.split())
    return value or None


def _arxiv_identifier(entry_id: str | None) -> str | None:
    if not entry_id:
        return None
    match = re.search(r"(\d{4}\.\d{4,}(?:v\d+)?)$", entry_id.strip())
    return match.group(1) if match else None


def search_arxiv(
    query: str,
    *,
    scope: str,
    offset: int = 0,
    limit: int = 25,
    http_get: Callable[..., httpx.Response] | None = None,
) -> ArxivSearchPage:
    """Search only the fixed arXiv API and map its Atom feed to typed candidates."""
    normalized_query = " ".join(str(query or "").split())
    if not normalized_query:
        raise ArxivDiscoveryError("Search query is required")
    if len(normalized_query) > 200:
        raise ArxivDiscoveryError("Search query must be at most 200 characters")
    if scope not in _ARXIV_QUERY_FIELDS:
        raise ArxivDiscoveryError("Unsupported arXiv search scope")

    result_limit = max(1, min(int(limit), 25))
    result_offset = max(0, int(offset))
    get = http_get or httpx.get
    try:
        response = get(
            ARXIV_API_URL,
            params={
                "search_query": f"{_ARXIV_QUERY_FIELDS[scope]}:{normalized_query}",
                "start": result_offset,
                "max_results": result_limit,
            },
            timeout=10.0,
            headers={"User-Agent": "ArticleProcessor/1.0"},
        )
        response.raise_for_status()
        root = ElementTree.fromstring(response.text)
    except (httpx.HTTPError, ElementTree.ParseError) as exc:
        raise ArxivDiscoveryError("arXiv search is temporarily unavailable") from exc

    retrieved_at = datetime.now(timezone.utc).isoformat()
    candidates: list[DiscoveryCandidate] = []
    for entry in root.findall(f"{_ATOM_NAMESPACE}entry"):
        entry_id = _text(entry.find(f"{_ATOM_NAMESPACE}id"))
        external_id = _arxiv_identifier(entry_id)
        title = _text(entry.find(f"{_ATOM_NAMESPACE}title"))
        if not external_id or not title:
            continue

        landing_url = f"https://arxiv.org/abs/{external_id}"
        pdf_url = f"https://arxiv.org/pdf/{external_id}.pdf"
        for link in entry.findall(f"{_ATOM_NAMESPACE}link"):
            href = link.attrib.get("href")
            if link.attrib.get("title") == "pdf" and href:
                pdf_url = href

        authors = [
            author_name
            for author in entry.findall(f"{_ATOM_NAMESPACE}author")
            if (author_name := _text(author.find(f"{_ATOM_NAMESPACE}name")))
        ]
        categories = [
            term
            for category in entry.findall(f"{_ATOM_NAMESPACE}category")
            if (term := category.attrib.get("term"))
        ]
        published = _text(entry.find(f"{_ATOM_NAMESPACE}published"))
        summary = _text(entry.find(f"{_ATOM_NAMESPACE}summary"))
        candidates.append(
            DiscoveryCandidate(
                source_provider="arxiv",
                source_external_id=external_id,
                title=title,
                authors=authors,
                abstract=summary,
                keywords=categories,
                published_date=published,
                landing_url=landing_url,
                pdf_url=pdf_url,
                collection=None,
                source_retrieved_at=retrieved_at,
            )
        )
    total_text = _text(root.find(f"{_OPENSEARCH_NAMESPACE}totalResults"))
    try:
        total = max(0, int(total_text)) if total_text is not None else result_offset + len(candidates)
    except ValueError:
        total = result_offset + len(candidates)
    return ArxivSearchPage(items=candidates, total=total)
