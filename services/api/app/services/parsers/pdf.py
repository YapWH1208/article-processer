"""PDF parser using pypdf for text extraction with OCR fallback."""

import logging
from pathlib import Path
from pypdf import PdfReader
from app.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)


class PdfParser(BaseParser):
    """Parse PDF files to Markdown using pypdf text extraction.

    Auto-detects scanned/image-based pages with no extractable text
    and falls back to OCR if available.
    """

    async def parse(self, file_path: Path) -> ParseResult:
        """Extract text from PDF and convert to simple Markdown.

        For pages with no extractable text, attempts OCR fallback
        before leaving them empty.
        """
        try:
            reader = PdfReader(str(file_path))
            page_count = len(reader.pages)

            markdown_parts = []
            title = None
            ocr_pages: list[int] = []

            # Check OCR availability
            ocr = None
            try:
                from app.services.parsers.ocr_adapter import OcrAdapter
                ocr = OcrAdapter()
                if not ocr.is_available:
                    ocr = None
            except Exception:
                pass

            for i, page in enumerate(reader.pages):
                page_num = i + 1
                text = page.extract_text() or ""

                # If page has no text, try OCR
                if not text.strip() and ocr:
                    logger.info(f"Page {page_num} has no extractable text — trying OCR...")
                    try:
                        ocr_result = await ocr.parse_page(file_path, page_num)
                        text = ocr_result.markdown
                        ocr_pages.append(page_num)
                        logger.info(f"Page {page_num}: OCR extracted {len(text)} chars")
                    except Exception as ocr_err:
                        logger.warning(f"OCR failed for page {page_num}: {ocr_err}")

                if not text.strip():
                    markdown_parts.append(f"\n<!-- page {page_num} — no text extracted -->\n")
                    continue

                # Try to extract title from first page
                if i == 0 and not title:
                    lines = text.strip().split("\n")
                    if lines:
                        title = lines[0].strip()
                        markdown_parts.append(f"# {title}\n")
                        if len(lines) > 1:
                            markdown_parts.append("\n".join(lines[1:]))
                    else:
                        markdown_parts.append(text)
                else:
                    ocr_note = " (OCR)" if page_num in ocr_pages else ""
                    markdown_parts.append(f"\n<!-- page {page_num}{ocr_note} -->\n")
                    markdown_parts.append(text)

            full_markdown = "\n\n".join(markdown_parts)

            # Try to extract metadata
            metadata = {}
            if reader.metadata:
                meta = reader.metadata
                if meta.title:
                    metadata["pdf_title"] = str(meta.title)
                if meta.author:
                    metadata["pdf_author"] = str(meta.author)

            if ocr_pages:
                metadata["ocr_pages"] = ocr_pages

            return ParseResult(
                markdown=full_markdown.strip(),
                title=title or file_path.stem,
                page_count=page_count,
                metadata=metadata,
            )
        except Exception as e:
            logger.error(f"PDF parsing failed for {file_path}: {e}")
            raise

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"
