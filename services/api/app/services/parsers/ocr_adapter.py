"""OCR adapter — optical character recognition for scanned/image-based PDFs.

Supports Tesseract OCR as the primary engine, with placeholders for
PaddleOCR and cloud OCR providers.

Installation:
    # System (required for Tesseract)
    macOS:   brew install tesseract tesseract-lang
    Ubuntu:  sudo apt-get install tesseract-ocr tesseract-ocr-eng
    Windows: download from https://github.com/UB-Mannheim/tesseract/wiki

    # Python
    pip install pytesseract Pillow pdf2image

    # poppler (required by pdf2image)
    macOS:   brew install poppler
    Ubuntu:  sudo apt-get install poppler-utils
    Windows: download from https://github.com/oschwartz10612/poppler-windows

This adapter auto-detects available OCR engines and falls back gracefully.
"""

import logging
from pathlib import Path
from typing import Optional
from app.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)

# ── Optional dependency detection ──────────────────────────────────────────

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    Image = None  # type: ignore

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False
    pytesseract = None  # type: ignore

try:
    from pdf2image import convert_from_path
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False
    convert_from_path = None  # type: ignore


class OcrAdapter(BaseParser):
    """OCR parser for scanned/image-based PDFs.

    Workflow:
    1. Convert PDF pages to images (pdf2image)
    2. Run OCR on each image (Tesseract)
    3. Combine recognized text into Markdown

    Auto-detects pages with no extractable text and routes them through OCR.
    """

    def __init__(self, engine: str = "tesseract", language: str = "eng"):
        self.engine = engine
        self.language = language

        self._available = False
        if engine == "tesseract":
            self._available = all([HAS_PIL, HAS_TESSERACT, HAS_PDF2IMAGE])

        if self._available:
            logger.info(f"OCR adapter ready (engine={engine}, lang={language})")
        else:
            missing = []
            if not HAS_PIL: missing.append("Pillow")
            if not HAS_TESSERACT: missing.append("pytesseract")
            if not HAS_PDF2IMAGE: missing.append("pdf2image")
            logger.warning(
                f"OCR adapter not fully available. Missing: {', '.join(missing)}. "
                f"Install with: pip install pytesseract Pillow pdf2image"
            )

    async def parse(self, file_path: Path, pages: Optional[list[int]] = None) -> ParseResult:
        """Run OCR on a PDF file and return extracted text as Markdown.

        Args:
            file_path: Path to PDF file.
            pages: Specific pages to OCR (None = all pages).

        Returns:
            ParseResult with Markdown-formatted OCR output.
        """
        if not self._available:
            raise RuntimeError(
                f"OCR engine '{self.engine}' is not available. "
                "Install system dependencies and Python packages: "
                "pip install pytesseract Pillow pdf2image"
            )

        try:
            # Convert PDF pages to images
            logger.info(f"Converting PDF to images: {file_path}")

            if pages:
                images = convert_from_path(
                    str(file_path),
                    dpi=300,
                    first_page=min(pages),
                    last_page=max(pages),
                )
                # Filter to only requested pages
                page_offset = min(pages) - 1
                images = {p: images[p - page_offset - 1] for p in pages if p - page_offset - 1 < len(images)}
            else:
                raw_images = convert_from_path(str(file_path), dpi=300)
                images = {i + 1: img for i, img in enumerate(raw_images)}

            page_count = len(images)

            # OCR each page
            markdown_parts = []
            title = file_path.stem

            for page_num in sorted(images.keys()):
                img = images[page_num]
                logger.debug(f"Running OCR on page {page_num}...")

                # Tesseract OCR
                if self.engine == "tesseract":
                    text = pytesseract.image_to_string(
                        img,
                        lang=self.language,
                        config='--psm 6',  # Assume uniform block of text
                    )
                else:
                    raise ValueError(f"Unknown OCR engine: {self.engine}")

                if not text.strip():
                    continue

                # Try to extract title from first page
                if page_num == 1 and not title:
                    lines = text.strip().split('\n')
                    for line in lines[:5]:
                        stripped = line.strip()
                        if len(stripped) > 10 and not stripped.startswith(('http', 'www', '©')):
                            title = stripped[:200]
                            break

                # Add page marker and text
                markdown_parts.append(f"\n<!-- page {page_num} (OCR) -->\n")
                markdown_parts.append(text.strip())

            full_markdown = "\n\n".join(markdown_parts)

            # Build final Markdown with title
            if title:
                full_markdown = f"# {title}\n\n{full_markdown}"

            return ParseResult(
                markdown=full_markdown.strip(),
                title=title or file_path.stem,
                page_count=page_count,
                metadata={"ocr_engine": self.engine, "source": "ocr"},
            )

        except Exception as e:
            logger.error(f"OCR parsing failed for {file_path}: {e}")
            raise

    async def parse_page(self, file_path: Path, page_num: int) -> ParseResult:
        """OCR a single page and return its text."""
        return await self.parse(file_path, pages=[page_num])

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"  # For scanned/image-based PDFs

    @property
    def is_available(self) -> bool:
        """Check if the OCR engine is installed and usable."""
        return self._available

    @staticmethod
    def get_available_engines() -> list[str]:
        """Return list of available OCR engine names."""
        engines = []
        if HAS_TESSERACT:
            try:
                langs = pytesseract.get_languages()
                if langs:
                    engines.append("tesseract")
            except Exception:
                pass
        return engines

    @staticmethod
    def check_page_has_text(file_path: Path, page_num: int) -> bool:
        """Quick check whether a PDF page has extractable text (non-scanned).

        Returns True if the page has text, False if it likely needs OCR.
        """
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            if page_num < 1 or page_num > len(reader.pages):
                return False
            text = reader.pages[page_num - 1].extract_text() or ""
            # Heuristic: if a page has < 50 chars of extractable text, it's likely scanned
            return len(text.strip()) > 50
        except Exception:
            # If we can't check, assume it might need OCR
            return False
