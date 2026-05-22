"""BibTeX parser — import and export BibTeX records.

Uses bibtexparser if available, otherwise falls back to simple regex parsing.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

try:
    import bibtexparser
    from bibtexparser.bparser import BibTexParser
    from bibtexparser.customization import convert_to_unicode
    HAS_BIBTEXPARSER = True
except ImportError:
    HAS_BIBTEXPARSER = False
    bibtexparser = None  # type: ignore


def parse_bibtex(bibtex_text: str) -> list[dict[str, Any]]:
    """Parse a BibTeX string into a list of entry dicts.

    Returns list of dicts with keys: entry_type, citation_key, title, authors,
    year, venue (journal/booktitle), doi, url, abstract, and raw fields.
    """
    if HAS_BIBTEXPARSER:
        return _parse_with_bibtexparser(bibtex_text)
    else:
        return _parse_with_regex(bibtex_text)


def _parse_with_bibtexparser(bibtex_text: str) -> list[dict[str, Any]]:
    """Parse using the bibtexparser library."""
    parser = BibTexParser(common_strings=True)
    parser.customization = convert_to_unicode
    bib_db = bibtexparser.loads(bibtex_text, parser=parser)

    entries = []
    for entry in bib_db.entries:
        parsed = {
            "entry_type": entry.get("ENTRYTYPE", "misc"),
            "citation_key": entry.get("ID", ""),
            "title": _clean_text(entry.get("title", "")),
            "authors": _parse_authors(entry.get("author", "")),
            "year": _parse_year(entry.get("year", "")),
            "venue": entry.get("journal") or entry.get("booktitle") or entry.get("publisher", ""),
            "doi": entry.get("doi", ""),
            "url": entry.get("url", ""),
            "abstract": entry.get("abstract", ""),
            "raw": entry,
        }
        entries.append(parsed)

    return entries


def _parse_with_regex(bibtex_text: str) -> list[dict[str, Any]]:
    """Fallback BibTeX parser using regex (no external dependency)."""
    # Match @type{key, ...} entries
    entry_pattern = re.compile(
        r'@(\w+)\s*\{\s*([^,]+)\s*,\s*(.+?)\}',
        re.DOTALL | re.IGNORECASE,
    )

    entries = []
    for match in entry_pattern.finditer(bibtex_text):
        entry_type = match.group(1).lower()
        citation_key = match.group(2).strip()
        fields_text = match.group(3)

        # Parse fields
        fields = {}
        # Match field = {value} or field = "value"
        field_pattern = re.compile(
            r'(\w+)\s*=\s*[{"](.+?)[}"]\s*,?\s*',
            re.DOTALL,
        )

        for fm in field_pattern.finditer(fields_text):
            key = fm.group(1).lower().strip()
            value = _clean_text(fm.group(2))
            fields[key] = value

        parsed = {
            "entry_type": entry_type,
            "citation_key": citation_key,
            "title": _clean_text(fields.get("title", "")),
            "authors": _parse_authors(fields.get("author", "")),
            "year": _parse_year(fields.get("year", "")),
            "venue": fields.get("journal") or fields.get("booktitle") or fields.get("publisher", ""),
            "doi": fields.get("doi", ""),
            "url": fields.get("url", ""),
            "abstract": fields.get("abstract", ""),
            "raw": fields,
        }
        entries.append(parsed)

    return entries


def export_to_bibtex(
    title: str,
    authors: list[str],
    year: int | None = None,
    venue: str | None = None,
    doi: str | None = None,
    url: str | None = None,
    abstract: str | None = None,
    entry_type: str = "article",
    citation_key: str = "",
) -> str:
    """Generate a BibTeX entry string from article metadata."""
    if not citation_key:
        # Generate a citation key from first author last name + year + first title word
        first_author = authors[0] if authors else "unknown"
        last_name = first_author.split()[-1].lower() if first_author else "unknown"
        year_str = str(year) if year else "XXXX"
        first_title_word = title.split()[0].lower() if title else "untitled"
        first_title_word = re.sub(r'[^a-z0-9]', '', first_title_word)
        citation_key = f"{last_name}{year_str}{first_title_word}"

    lines = [f"@{entry_type}{{{citation_key},"]

    if authors:
        lines.append(f"  author = {{{' and '.join(authors)}}},")
    if title:
        lines.append(f"  title = {{{title}}},")
    if year:
        lines.append(f"  year = {{{year}}},")
    if venue:
        # Determine field based on entry type
        if entry_type == "article":
            lines.append(f"  journal = {{{venue}}},")
        elif entry_type in ("inproceedings", "conference"):
            lines.append(f"  booktitle = {{{venue}}},")
        else:
            lines.append(f"  publisher = {{{venue}}},")
    if doi:
        lines.append(f"  doi = {{{doi}}},")
    if url:
        lines.append(f"  url = {{{url}}},")
    if abstract:
        lines.append(f"  abstract = {{{abstract}}},")

    lines.append("}")

    return "\n".join(lines)


def _parse_authors(author_str: str) -> list[str]:
    """Parse author string into list of names."""
    if not author_str:
        return []
    # Split on 'and' (BibTeX convention)
    parts = re.split(r'\s+and\s+', author_str)
    return [p.strip() for p in parts if p.strip()]


def _parse_year(year_str: str) -> int | None:
    """Parse year string to int."""
    if not year_str:
        return None
    # Handle ranges like "2020-2021" or "2020a"
    match = re.search(r'(\d{4})', str(year_str))
    if match:
        return int(match.group(1))
    return None


def _clean_text(text: str) -> str:
    """Clean LaTeX/BibTeX formatting from text."""
    if not text:
        return ""
    # Remove curly braces used for capitalization protection
    text = re.sub(r'\{([^}]+)\}', r'\1', text)
    # Remove LaTeX commands
    text = re.sub(r'\\[a-zA-Z]+\{([^}]+)\}', r'\1', text)
    # Remove remaining backslash commands
    text = re.sub(r'\\[a-zA-Z]+', '', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text
