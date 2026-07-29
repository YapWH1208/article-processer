"""Offline conference catalogue snapshot import helpers.

The browser reads only the SQLite catalogue. A maintainer supplies a JSONL
snapshot explicitly; this module never performs network requests or crawling.
"""

from __future__ import annotations

from dataclasses import dataclass
import datetime
import json
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.db.models import ConferenceCatalogPaper


SUPPORTED_CONFERENCE_KEYS = frozenset({
    "iclr_2026",
    "chi_2026",
    "cvpr_2026",
    "neurips_2025",
    "icml_2025",
})

CONFERENCE_COLLECTIONS = (
    {"key": "iclr_2026", "label": "ICLR 2026", "year": 2026},
    {"key": "chi_2026", "label": "CHI 2026", "year": 2026},
    {"key": "cvpr_2026", "label": "CVPR 2026", "year": 2026},
    {"key": "neurips_2025", "label": "NeurIPS 2025", "year": 2025},
    {"key": "icml_2025", "label": "ICML 2025", "year": 2025},
)


class CatalogValidationError(ValueError):
    """Raised when a catalogue key or source row cannot be safely normalized."""


@dataclass(frozen=True)
class NormalizedCatalogPaper:
    source_external_id: str
    title: str
    authors: list[str]
    abstract: str | None
    keywords: list[str]
    published_date: str | None
    venue: str | None
    landing_url: str | None
    pdf_url: str | None
    raw_payload_json: str


@dataclass
class CatalogImportSummary:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    invalid: int = 0

    @property
    def imported(self) -> int:
        return self.created + self.updated


def validate_conference_key(value: str) -> str:
    key = str(value or "").strip().lower().replace("-", "_")
    if key not in SUPPORTED_CONFERENCE_KEYS:
        allowed = ", ".join(sorted(SUPPORTED_CONFERENCE_KEYS))
        raise CatalogValidationError(f"Unsupported conference collection: {value!r}. Allowed: {allowed}")
    return key


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    if isinstance(value, (int, float)):
        return str(value)
    return None


def _content_value(raw: dict[str, Any], name: str) -> Any:
    content = raw.get("content")
    if isinstance(content, dict) and name in content:
        value = content[name]
    else:
        value = raw.get(name)
    if isinstance(value, dict) and "value" in value:
        return value.get("value")
    return value


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if not isinstance(value, (list, tuple)):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, dict):
            item = item.get("name") or item.get("value") or item.get("text")
        text = _text(item)
        if text:
            result.append(text)
    return result


def _first_text(*values: Any) -> str | None:
    for value in values:
        text = _text(value)
        if text:
            return text
    return None


def _safe_public_link(value: str | None) -> str | None:
    """Keep only browser-safe HTTP(S) links from untrusted catalogue snapshots."""
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    return value


def normalize_catalog_paper(raw: Any) -> NormalizedCatalogPaper:
    """Normalize a Paper Insight-style JSONL row into application metadata."""
    if not isinstance(raw, dict):
        raise CatalogValidationError("Catalogue row must be a JSON object")

    source_external_id = _first_text(raw.get("id"), raw.get("source_external_id"), raw.get("paper_id"))
    title = _text(_content_value(raw, "title"))
    if not source_external_id:
        raise CatalogValidationError("Catalogue row is missing an external identifier")
    if not title:
        raise CatalogValidationError("Catalogue row is missing a title")

    authors = _string_list(_content_value(raw, "authors"))
    keywords = _string_list(_content_value(raw, "keywords"))
    abstract = _text(_content_value(raw, "abstract"))
    venue = _text(_content_value(raw, "venue"))
    published_date = _first_text(
        _content_value(raw, "published_date"),
        _content_value(raw, "publication_date"),
        raw.get("published_date"),
        raw.get("publication_date"),
    )
    landing_url = _first_text(
        _content_value(raw, "landing_url"),
        _content_value(raw, "url"),
        raw.get("landing_url"),
        raw.get("url"),
        raw.get("forum_url"),
    )
    pdf_url = _first_text(_content_value(raw, "pdf"), raw.get("pdf_url"))

    return NormalizedCatalogPaper(
        source_external_id=source_external_id,
        title=title,
        authors=authors,
        abstract=abstract,
        keywords=keywords,
        published_date=published_date,
        venue=venue,
        landing_url=_safe_public_link(landing_url),
        pdf_url=_safe_public_link(pdf_url),
        raw_payload_json=json.dumps(raw, ensure_ascii=False, separators=(",", ":")),
    )


def iter_snapshot_paths(input_path: Path) -> Iterable[Path]:
    """Yield a deterministic set of explicitly supplied JSONL snapshot files."""
    if input_path.is_file():
        if input_path.suffix.lower() != ".jsonl":
            raise CatalogValidationError("Catalogue input file must use the .jsonl extension")
        yield input_path
        return
    if input_path.is_dir():
        paths = sorted(path for path in input_path.glob("*.jsonl") if path.is_file())
        if not paths:
            raise CatalogValidationError("Catalogue input directory contains no .jsonl files")
        yield from paths
        return
    raise CatalogValidationError(f"Catalogue input path does not exist: {input_path}")


def _assign_catalog_paper(target: ConferenceCatalogPaper, paper: NormalizedCatalogPaper) -> None:
    target.title = paper.title
    target.authors_json = json.dumps(paper.authors, ensure_ascii=False)
    target.abstract = paper.abstract
    target.keywords_json = json.dumps(paper.keywords, ensure_ascii=False)
    target.published_date = paper.published_date
    target.venue = paper.venue
    target.landing_url = paper.landing_url
    target.pdf_url = paper.pdf_url
    target.raw_payload_json = paper.raw_payload_json
    target.imported_at = datetime.datetime.utcnow()


def import_catalog_snapshot(db: Session, conference_key: str, input_path: Path) -> CatalogImportSummary:
    """Import local snapshot rows atomically while reporting row-level validation skips."""
    conference_key = validate_conference_key(conference_key)
    summary = CatalogImportSummary()

    try:
        for snapshot_path in iter_snapshot_paths(input_path):
            with snapshot_path.open("r", encoding="utf-8") as source:
                for line in source:
                    if not line.strip():
                        summary.skipped += 1
                        continue
                    try:
                        paper = normalize_catalog_paper(json.loads(line))
                    except (CatalogValidationError, json.JSONDecodeError):
                        summary.invalid += 1
                        continue

                    existing = (
                        db.query(ConferenceCatalogPaper)
                        .filter(
                            ConferenceCatalogPaper.conference_key == conference_key,
                            ConferenceCatalogPaper.source_external_id == paper.source_external_id,
                        )
                        .one_or_none()
                    )
                    if existing is None:
                        existing = ConferenceCatalogPaper(
                            conference_key=conference_key,
                            source_external_id=paper.source_external_id,
                        )
                        db.add(existing)
                        summary.created += 1
                    else:
                        summary.updated += 1
                    _assign_catalog_paper(existing, paper)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return summary


def get_catalog_paper(db: Session, conference_key: str, paper_id: int) -> ConferenceCatalogPaper | None:
    """Return one local catalogue record after validating its approved collection."""
    conference_key = validate_conference_key(conference_key)
    return (
        db.query(ConferenceCatalogPaper)
        .filter(
            ConferenceCatalogPaper.conference_key == conference_key,
            ConferenceCatalogPaper.id == paper_id,
        )
        .one_or_none()
    )


def search_catalog_papers(
    db: Session,
    conference_key: str,
    *,
    query: str | None,
    scope: str,
    offset: int,
    limit: int,
) -> tuple[list[ConferenceCatalogPaper], int]:
    """Search a local collection without performing network work."""
    conference_key = validate_conference_key(conference_key)
    scope = str(scope or "title").strip().lower()
    if scope not in {"title", "abstract", "keywords"}:
        raise CatalogValidationError(f"Unsupported catalogue search scope: {scope!r}")

    result_limit = max(1, min(int(limit), 25))
    result_offset = max(0, int(offset))
    records = db.query(ConferenceCatalogPaper).filter(
        ConferenceCatalogPaper.conference_key == conference_key,
    )
    needle = str(query or "").strip()
    if needle:
        match = f"%{needle}%"
        field = {
            "title": ConferenceCatalogPaper.title,
            "abstract": ConferenceCatalogPaper.abstract,
            "keywords": ConferenceCatalogPaper.keywords_json,
        }[scope]
        records = records.filter(field.ilike(match))

    total = records.count()
    papers = (
        records.order_by(ConferenceCatalogPaper.title.asc(), ConferenceCatalogPaper.id.asc())
        .offset(result_offset)
        .limit(result_limit)
        .all()
    )
    return papers, total
