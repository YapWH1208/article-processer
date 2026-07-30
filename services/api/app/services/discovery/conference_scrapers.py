"""Bounded public-proceedings scrapers for the supported conference catalogue.

Scraping is deliberately an explicit maintainer operation.  It writes a local
JSONL snapshot which is then imported into SQLite, so the user-facing Discover
route only reads local, reviewable catalogue data and never causes a network
request to a conference host.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, urlencode, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.services.discovery.catalog import CatalogValidationError, validate_conference_key


FetchText = Callable[[str], str]

_USER_AGENT = "ArticleProcessorConferenceCatalog/1.0 (+https://github.com/YapWH1208/article-processer)"
_REQUEST_TIMEOUT_SECONDS = 30.0
_ICLR_2026_URL = "https://iclr.cc/static/virtual/data/iclr-2026-orals-posters.json"
_CVPR_2026_URL = "https://openaccess.thecvf.com/CVPR2026?day=all"
_CHI_2026_URL = "https://dl.acm.org/doi/proceedings/10.1145/3772318"
_NEURIPS_2025_URL = "https://proceedings.neurips.cc/paper_files/paper/2025"
_ICML_2025_URL = "https://proceedings.mlr.press/v267/"
_CHI_2026_CROSSREF_URL = "https://api.crossref.org/works"
_CHI_2026_PROCEEDINGS_TITLE = "Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems"
_CHI_2026_DOI_PREFIX = "10.1145/3772318."
_CHI_2026_CROSSREF_PAGE_SIZE = 1_000
_MAX_CHI_2026_CROSSREF_PAGES = 5


class ConferenceScrapeError(RuntimeError):
    """Raised when an approved public proceedings source cannot be read."""


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).replace("\xa0", " ")
    text = " ".join(text.split())
    return text or None


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return _split_authors(value)
    if not isinstance(value, (list, tuple)):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, dict):
            item = item.get("name") or item.get("value") or item.get("text")
        text = _clean_text(item)
        if text:
            result.append(text)
    return result


def _split_authors(value: str | None) -> list[str]:
    text = _clean_text(value)
    if not text:
        return []
    return [name.strip() for name in re.split(r"\s*(?:;|,)\s*", text) if name.strip()]


def _absolute_url(base_url: str, href: str | None) -> str | None:
    if not href:
        return None
    value = urljoin(base_url, href.strip())
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    return value


def _record(
    *,
    source_external_id: str,
    title: str,
    authors: list[str],
    venue: str,
    landing_url: str,
    pdf_url: str | None,
    source_url: str,
    abstract: str | None = None,
    keywords: list[str] | None = None,
    published_date: str | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the Paper Insight-compatible row consumed by ``catalog.py``."""
    return {
        "id": source_external_id,
        "content": {
            "title": {"value": title},
            "authors": {"value": authors},
            "abstract": {"value": abstract} if abstract else None,
            "keywords": {"value": keywords or []},
            "venue": {"value": venue},
            "published_date": {"value": published_date} if published_date else None,
            "pdf": {"value": pdf_url} if pdf_url else None,
        },
        "landing_url": landing_url,
        "source_url": source_url,
        "source_payload": raw or {},
    }


def _dedupe_and_sort(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for record in records:
        identifier = _clean_text(record.get("id"))
        if identifier:
            by_id[identifier] = record
    return [by_id[key] for key in sorted(by_id, key=str.casefold)]


def _iclr_event_authors(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    authors: list[str] = []
    for author in value:
        if isinstance(author, dict):
            name = _clean_text(author.get("fullname") or author.get("name"))
        else:
            name = _clean_text(author)
        if name:
            authors.append(name)
    return authors


def _scrape_iclr_2026(fetch: FetchText) -> list[dict[str, Any]]:
    """Read the official accepted-papers feed from ICLR's virtual program.

    OpenReview's API may require an interactive challenge.  The conference's
    own virtual-program JSON is public, contains only oral/poster entries, and
    gives us the canonical OpenReview forum link without querying reviewer or
    discussion data.
    """
    records: list[dict[str, Any]] = []
    try:
        payload = json.loads(fetch(_ICLR_2026_URL))
    except json.JSONDecodeError as exc:
        raise ConferenceScrapeError("ICLR 2026 virtual program returned invalid JSON") from exc
    events = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(events, list):
        raise ConferenceScrapeError("ICLR 2026 virtual program did not contain a papers list")
    for event in events:
        if not isinstance(event, dict):
            continue
        decision = _clean_text(event.get("decision")) or ""
        if "accept" not in decision.casefold():
            continue
        title = _clean_text(event.get("name"))
        event_id = _clean_text(event.get("id"))
        landing_url = _absolute_url(_ICLR_2026_URL, _clean_text(event.get("paper_url")))
        if not title or not event_id:
            continue
        forum_id = parse_qs(urlparse(landing_url or "").query).get("id", [None])[0]
        external_id = _clean_text(forum_id) or f"iclr-2026-event-{event_id}"
        pdf_url = _absolute_url(_ICLR_2026_URL, _clean_text(event.get("paper_pdf_url")))
        if not pdf_url and forum_id:
            pdf_url = f"https://openreview.net/pdf?id={quote(forum_id, safe='')}"
        records.append(
            _record(
                source_external_id=external_id,
                title=title,
                authors=_iclr_event_authors(event.get("authors")),
                keywords=_string_list(event.get("keywords")),
                venue=f"ICLR 2026 {decision}",
                published_date=_clean_text(event.get("starttime"))[:10] if _clean_text(event.get("starttime")) else None,
                landing_url=landing_url or f"https://iclr.cc/virtual/2026/poster/{event_id}",
                pdf_url=pdf_url,
                source_url=_ICLR_2026_URL,
                raw=event,
            )
        )
    if not records:
        raise ConferenceScrapeError("ICLR 2026 virtual program did not contain accepted paper entries")
    return records


def _scrape_cvpr_2026(fetch: FetchText) -> list[dict[str, Any]]:
    source_url = _CVPR_2026_URL
    soup = BeautifulSoup(fetch(source_url), "html.parser")
    records: list[dict[str, Any]] = []
    for title_node in soup.select("dt.ptitle"):
        title_link = title_node.find("a", href=True)
        title = _clean_text(title_link.get_text(" ", strip=True) if title_link else None)
        landing_url = _absolute_url(source_url, title_link.get("href") if title_link else None)
        # The CVF index uses two sibling ``dd`` nodes per paper: the first
        # holds author links and the second holds the PDF/supplement links.
        # Looking at only the immediate sibling silently lost every 2026 PDF.
        details = []
        for sibling in title_node.find_next_siblings():
            if sibling.name == "dt":
                break
            if sibling.name == "dd":
                details.append(sibling)
        if not title or not landing_url or not details:
            continue
        pdf_link = next(
            (
                anchor
                for detail in details
                for anchor in detail.find_all("a", href=True)
                if _clean_text(anchor.get_text(" ", strip=True)) == "pdf" or ".pdf" in anchor["href"].lower()
            ),
            None,
        )
        author_names = [
            _clean_text(input_node.get("value"))
            for detail in details
            for input_node in detail.select('input[name="query_author"][value]')
        ]
        author_node = details[0].find("i")
        identifier = Path(urlparse(landing_url).path).stem
        if not identifier:
            continue
        records.append(
            _record(
                source_external_id=identifier,
                title=title,
                authors=[name for name in author_names if name]
                or _split_authors(author_node.get_text(" ", strip=True) if author_node else None),
                venue="CVPR 2026",
                published_date="2026-06",
                landing_url=landing_url,
                pdf_url=_absolute_url(source_url, pdf_link.get("href") if pdf_link else None),
                source_url=source_url,
                raw={"landing_url": landing_url},
            )
        )
    if not records:
        raise ConferenceScrapeError("CVPR 2026 proceedings page did not contain paper entries")
    return records


def _scrape_chi_2026_from_acm(fetch: FetchText) -> list[dict[str, Any]]:
    source_url = _CHI_2026_URL
    soup = BeautifulSoup(fetch(source_url), "html.parser")
    records: list[dict[str, Any]] = []
    title_links = soup.select(".issue-item__title a[href], a.issue-item__title[href]")
    for title_link in title_links:
        title = _clean_text(title_link.get_text(" ", strip=True))
        landing_url = _absolute_url(source_url, title_link.get("href"))
        if not title or not landing_url:
            continue
        doi_match = re.search(r"/doi/(?:abs/)?(10\.1145/[^/?#]+)", urlparse(landing_url).path)
        if not doi_match:
            continue
        doi = doi_match.group(1)
        if doi.startswith("proceedings/"):
            continue
        item = title_link.find_parent(class_=lambda classes: classes and "issue-item" in classes)
        authors_node = item.select_one(".issue-item__authors") if item else None
        author_nodes = item.select(".loa__author-name") if item else []
        abstract_node = item.select_one(".issue-item__abstract") if item else None
        authors = (
            _split_authors(authors_node.get_text(" ", strip=True))
            if authors_node
            else [_clean_text(node.get_text(" ", strip=True)) for node in author_nodes]
        )
        records.append(
            _record(
                source_external_id=doi,
                title=title,
                authors=[name for name in authors if name],
                abstract=_clean_text(abstract_node.get_text(" ", strip=True) if abstract_node else None),
                venue="CHI 2026",
                published_date="2026-04",
                landing_url=landing_url,
                pdf_url=f"https://dl.acm.org/doi/pdf/{doi}",
                source_url=source_url,
                raw={"doi": doi, "landing_url": landing_url},
            )
        )
    if not records:
        raise ConferenceScrapeError("CHI 2026 proceedings page did not contain paper entries")
    return records


def _crossref_authors(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    authors: list[str] = []
    for author in value:
        if not isinstance(author, dict):
            continue
        name = _clean_text(author.get("name"))
        if not name:
            name = _clean_text(" ".join(part for part in (author.get("given"), author.get("family")) if part))
        if name:
            authors.append(name)
    return authors


def _crossref_date(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    date_parts = value.get("date-parts")
    if not isinstance(date_parts, list) or not date_parts or not isinstance(date_parts[0], list):
        return None
    parts = date_parts[0]
    if not parts or not isinstance(parts[0], int):
        return None
    return "-".join(str(part).zfill(2) if index else str(part) for index, part in enumerate(parts[:3]))


def _scrape_chi_2026_from_crossref(fetch: FetchText) -> list[dict[str, Any]]:
    """Use Crossref's public metadata index when ACM's anti-bot page blocks us.

    Crossref ranks the exact proceedings title first.  We additionally require
    the CHI 2026 DOI prefix, and stop after the first empty matching page, so
    unrelated ACM records returned later in the broad search are never stored.
    """
    records: list[dict[str, Any]] = []
    for page_index in range(_MAX_CHI_2026_CROSSREF_PAGES):
        query = urlencode(
            {
                "query.container-title": _CHI_2026_PROCEEDINGS_TITLE,
                "filter": "from-pub-date:2026-04-01,until-pub-date:2026-05-31",
                "rows": _CHI_2026_CROSSREF_PAGE_SIZE,
                "offset": page_index * _CHI_2026_CROSSREF_PAGE_SIZE,
                "select": "DOI,title,container-title,author,published,resource",
            }
        )
        source_url = f"{_CHI_2026_CROSSREF_URL}?{query}"
        try:
            payload = json.loads(fetch(source_url))
        except json.JSONDecodeError as exc:
            raise ConferenceScrapeError("Crossref returned invalid JSON for CHI 2026") from exc
        items = payload.get("message", {}).get("items", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            raise ConferenceScrapeError("Crossref response did not contain a works list for CHI 2026")

        matching_records = 0
        for item in items:
            if not isinstance(item, dict):
                continue
            doi = _clean_text(item.get("DOI"))
            title_values = item.get("title")
            title = _clean_text(title_values[0] if isinstance(title_values, list) and title_values else None)
            container_titles = item.get("container-title")
            container_title = _clean_text(
                container_titles[0] if isinstance(container_titles, list) and container_titles else None
            )
            if not doi or not title or doi.casefold().startswith(_CHI_2026_DOI_PREFIX) is False:
                continue
            if container_title != _CHI_2026_PROCEEDINGS_TITLE:
                continue
            matching_records += 1
            records.append(
                _record(
                    source_external_id=doi,
                    title=title,
                    authors=_crossref_authors(item.get("author")),
                    venue="CHI 2026",
                    published_date=_crossref_date(item.get("published")),
                    landing_url=f"https://doi.org/{doi}",
                    pdf_url=f"https://dl.acm.org/doi/pdf/{doi}",
                    source_url=source_url,
                    raw=item,
                )
            )
        if matching_records == 0 or len(items) < _CHI_2026_CROSSREF_PAGE_SIZE:
            break
    if not records:
        raise ConferenceScrapeError("CHI 2026 was unavailable from both the ACM proceedings page and Crossref")
    return records


def _scrape_chi_2026(fetch: FetchText) -> list[dict[str, Any]]:
    try:
        return _scrape_chi_2026_from_acm(fetch)
    except Exception:
        try:
            return _scrape_chi_2026_from_crossref(fetch)
        except ConferenceScrapeError as crossref_error:
            raise ConferenceScrapeError(
                "CHI 2026 proceedings could not be read from ACM or Crossref"
            ) from crossref_error


def _scrape_neurips_2025(fetch: FetchText) -> list[dict[str, Any]]:
    source_url = _NEURIPS_2025_URL
    soup = BeautifulSoup(fetch(source_url), "html.parser")
    records: list[dict[str, Any]] = []
    for title_link in soup.select('a[href*="-Abstract-Conference.html"]'):
        title = _clean_text(title_link.get_text(" ", strip=True))
        landing_url = _absolute_url(source_url, title_link.get("href"))
        if not title or not landing_url:
            continue
        item = title_link.find_parent("li") or title_link.parent
        author_node = item.find("i") if item else None
        path = urlparse(landing_url).path
        identifier = Path(path).name.replace("-Abstract-Conference.html", "")
        if not identifier:
            continue
        records.append(
            _record(
                source_external_id=identifier,
                title=title,
                authors=_split_authors(author_node.get_text(" ", strip=True) if author_node else None),
                venue="NeurIPS 2025",
                published_date="2025",
                landing_url=landing_url,
                # NeurIPS lists abstracts below ``/hash/`` but stores PDFs
                # below ``/file/``.  Keeping the hash path produces a 404.
                pdf_url=landing_url.replace("/hash/", "/file/").replace(
                    "-Abstract-Conference.html", "-Paper-Conference.pdf"
                ),
                source_url=source_url,
                raw={"landing_url": landing_url},
            )
        )
    if not records:
        raise ConferenceScrapeError("NeurIPS 2025 proceedings page did not contain paper entries")
    return records


def _scrape_icml_2025(fetch: FetchText) -> list[dict[str, Any]]:
    source_url = _ICML_2025_URL
    soup = BeautifulSoup(fetch(source_url), "html.parser")
    records: list[dict[str, Any]] = []
    for container in soup.select("div.paper"):
        title_node = container.select_one("p.title")
        title = _clean_text(title_node.get_text(" ", strip=True) if title_node else None)
        authors_node = container.select_one(".authors")
        links = container.find_all("a", href=True)
        abstract_link = next(
            (anchor for anchor in links if _clean_text(anchor.get_text(" ", strip=True)) == "abs"),
            None,
        )
        pdf_link = next(
            (
                anchor
                for anchor in links
                if "pdf" in (_clean_text(anchor.get_text(" ", strip=True)) or "").casefold()
            ),
            None,
        )
        landing_url = _absolute_url(source_url, abstract_link.get("href") if abstract_link else None)
        if not title or not landing_url:
            continue
        identifier = Path(urlparse(landing_url).path).stem
        if not identifier:
            continue
        records.append(
            _record(
                source_external_id=identifier,
                title=title,
                authors=_split_authors(authors_node.get_text(" ", strip=True) if authors_node else None),
                venue="ICML 2025",
                published_date="2025-07",
                landing_url=landing_url,
                pdf_url=_absolute_url(source_url, pdf_link.get("href") if pdf_link else None),
                source_url=source_url,
                raw={"landing_url": landing_url},
            )
        )
    if not records:
        raise ConferenceScrapeError("ICML 2025 proceedings page did not contain paper entries")
    return records


def _scrape_with_client(conference_key: str) -> list[dict[str, Any]]:
    with httpx.Client(
        follow_redirects=True,
        timeout=httpx.Timeout(_REQUEST_TIMEOUT_SECONDS),
        headers={"User-Agent": _USER_AGENT, "Accept": "application/json, text/html;q=0.9, */*;q=0.1"},
    ) as client:
        def fetch(url: str) -> str:
            try:
                response = client.get(url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                raise ConferenceScrapeError(f"Could not fetch {url}: {exc}") from exc
            return response.text

        return _scrape_with_fetcher(conference_key, fetch)


def _scrape_with_fetcher(
    conference_key: str,
    fetch: FetchText,
) -> list[dict[str, Any]]:
    handlers = {
        "iclr_2026": lambda: _scrape_iclr_2026(fetch),
        "chi_2026": lambda: _scrape_chi_2026(fetch),
        "cvpr_2026": lambda: _scrape_cvpr_2026(fetch),
        "neurips_2025": lambda: _scrape_neurips_2025(fetch),
        "icml_2025": lambda: _scrape_icml_2025(fetch),
    }
    try:
        return _dedupe_and_sort(handlers[conference_key]())
    except KeyError as exc:  # validate_conference_key should make this unreachable.
        raise ConferenceScrapeError(f"No scraper configured for {conference_key}") from exc


def scrape_conference(
    conference_key: str,
    *,
    fetch: FetchText | None = None,
) -> list[dict[str, Any]]:
    """Fetch accepted papers from one approved public proceedings source.

    ``fetch`` exists for deterministic offline tests. Production calls are
    sequential and use only the approved public proceedings metadata feeds.
    """
    try:
        key = validate_conference_key(conference_key)
    except CatalogValidationError as exc:
        raise ConferenceScrapeError(str(exc)) from exc
    if fetch is not None:
        return _scrape_with_fetcher(key, fetch)
    return _scrape_with_client(key)


def write_catalog_snapshot(records: Iterable[dict[str, Any]], output_path: Path) -> int:
    """Atomically write a deterministic JSONL snapshot for catalogue import."""
    if output_path.suffix.lower() != ".jsonl":
        raise ConferenceScrapeError("Conference snapshot output must use the .jsonl extension")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sorted_records = _dedupe_and_sort(records)
    temporary_path = output_path.with_suffix(".tmp")
    try:
        with temporary_path.open("w", encoding="utf-8", newline="\n") as destination:
            for record in sorted_records:
                destination.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
                destination.write("\n")
        temporary_path.replace(output_path)
    except OSError as exc:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise ConferenceScrapeError(f"Could not write conference snapshot: {exc}") from exc
    return len(sorted_records)
