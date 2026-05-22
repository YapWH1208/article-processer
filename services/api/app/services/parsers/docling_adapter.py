"""Docling adapter — high-quality PDF document understanding.

Docling (https://github.com/DS4SD/docling) provides advanced PDF parsing
with layout-aware structure preservation, table extraction, and figure detection.

Installation:
    pip install docling

This adapter auto-detects whether docling is installed and falls back
gracefully if not.
"""

import logging
from pathlib import Path
from app.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)

# Try importing docling
try:
    from docling.document_converter import DocumentConverter
    HAS_DOCLING = True
except ImportError:
    HAS_DOCLING = False
    DocumentConverter = None  # type: ignore


class DoclingAdapter(BaseParser):
    """High-quality PDF parser using Docling.

    Features over pypdf:
    - Layout-aware text extraction
    - Table detection and export
    - Figure/image placeholder detection
    - Heading hierarchy preservation
    - Reading order recovery
    """

    def __init__(self):
        if HAS_DOCLING:
            self._converter = DocumentConverter()
        else:
            self._converter = None

    async def parse(self, file_path: Path) -> ParseResult:
        """Convert PDF to Markdown using Docling with structure preservation."""
        if not HAS_DOCLING:
            raise RuntimeError(
                "Docling is not installed. Install it with: pip install docling"
            )

        try:
            # Convert document
            result = self._converter.convert(str(file_path))
            doc = result.document

            # Extract title from metadata or first heading
            title = file_path.stem
            page_count = 0

            # Build Markdown with structure
            markdown_parts = []

            # Document title
            if hasattr(doc, 'title') and doc.title:
                title = str(doc.title)
                markdown_parts.append(f"# {title}\n")

            # Process document structure
            if hasattr(doc, 'texts'):
                current_section = None
                for item in doc.texts:
                    if hasattr(item, 'label') and item.label == 'title':
                        continue  # Already handled

                    label = getattr(item, 'label', None)
                    text = getattr(item, 'text', '')

                    if not text.strip():
                        continue

                    # Heading detection
                    if label in ('section_header', 'section-header', 'heading'):
                        level = min(getattr(item, 'level', 2) + 1, 6)
                        markdown_parts.append(f"\n{'#' * level} {text.strip()}\n")
                    elif label in ('paragraph', 'text', 'p'):
                        markdown_parts.append(f"\n{text.strip()}\n")
                    elif label in ('list_item', 'list-item', 'bullet'):
                        markdown_parts.append(f"- {text.strip()}\n")
                    elif label == 'table':
                        # Docling provides table data — build Markdown table
                        table_md = self._build_table_markdown(item)
                        if table_md:
                            markdown_parts.append(f"\n{table_md}\n")
                    elif label == 'figure' or label == 'picture':
                        caption = getattr(item, 'caption', '')
                        markdown_parts.append(
                            f"\n<!-- figure placeholder -->\n"
                            f"![{caption or 'Figure'}](figure)\n"
                            f"{'*' + caption + '*' if caption else ''}\n"
                        )
                    elif label in ('code', 'formula'):
                        markdown_parts.append(f"\n```\n{text.strip()}\n```\n")
                    else:
                        markdown_parts.append(f"\n{text.strip()}\n")

            # If no structured texts were found, try markdown export
            if not markdown_parts and hasattr(doc, 'export_to_markdown'):
                full_md = doc.export_to_markdown()
                markdown_parts = [full_md]

            # If still nothing, fall back to raw text
            if not markdown_parts:
                raw_text = str(doc) if doc else ""
                markdown_parts = [raw_text]

            # Count pages
            if hasattr(doc, 'pages'):
                page_count = len(doc.pages)

            # Extract metadata
            metadata = {}
            if hasattr(doc, 'metadata') and doc.metadata:
                meta = doc.metadata
                metadata = {
                    "title": getattr(meta, 'title', None),
                    "authors": getattr(meta, 'authors', None),
                    "subject": getattr(meta, 'subject', None),
                    "creator": getattr(meta, 'creator', None),
                }

            full_markdown = "\n".join(markdown_parts).strip()

            return ParseResult(
                markdown=full_markdown,
                title=title or file_path.stem,
                page_count=page_count,
                metadata=metadata,
            )

        except Exception as e:
            logger.error(f"Docling parsing failed for {file_path}: {e}")
            # Fall back to pypdf if Docling fails
            logger.info("Falling back to pypdf parser...")
            from app.services.parsers.pdf import PdfParser
            fallback = PdfParser()
            return await fallback.parse(file_path)

    def _build_table_markdown(self, table_item) -> str | None:
        """Convert a Docling table item to Markdown table format."""
        try:
            if hasattr(table_item, 'data') and table_item.data:
                data = table_item.data
                if hasattr(data, 'grid'):
                    grid = data.grid
                    rows = []
                    for row in grid:
                        cells = [str(cell) if cell else '' for cell in row]
                        rows.append(cells)

                    if not rows:
                        return None

                    # Build header separator
                    col_count = len(rows[0])
                    header_sep = '|' + '|'.join(['---' for _ in range(col_count)]) + '|'

                    md_lines = []
                    for i, row in enumerate(rows):
                        md_lines.append('| ' + ' | '.join(row) + ' |')
                        if i == 0:
                            md_lines.append(header_sep)

                    return '\n'.join(md_lines)

            # Fallback: render as plain text
            text = getattr(table_item, 'text', '')
            if text:
                return f"```\n{text}\n```"

        except Exception:
            pass

        return None

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"

    @property
    def is_available(self) -> bool:
        """Check if Docling is installed and usable."""
        return HAS_DOCLING
