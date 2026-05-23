"""MinerU adapter — state-of-the-art PDF document parsing.

MinerU (https://github.com/opendatalab/MinerU) provides high-quality
PDF-to-Markdown conversion with:
- Layout-preserving text extraction
- Image/figure extraction and embedding
- Table detection and export
- Formula/equation recognition (LaTeX)
- Reading-order recovery

Installation:
    pip install magic-pdf

This adapter auto-detects whether mineru is installed and falls back
gracefully if not.
"""

import logging
import os
import tempfile
import shutil
from pathlib import Path
from app.services.parsers.base import BaseParser, ParseResult
from app.core.config import settings

logger = logging.getLogger(__name__)

# Try importing mineru
try:
    import magic_pdf.model as model_config
    model_config.__use_inside__ = True  # enable offline mode
    from magic_pdf.pipe.UNIPipe import UNIPipe
    from magic_pdf.rw.DiskReaderWriter import DiskReaderWriter
    HAS_MINERU = True
except ImportError:
    HAS_MINERU = False
    UNIPipe = None  # type: ignore
    DiskReaderWriter = None  # type: ignore


class MinerUAdapter(BaseParser):
    """High-quality PDF parser using MinerU (magic-pdf).

    Features over pypdf/Docling:
    - Best-in-class layout preservation
    - Real image extraction with file output
    - Formula/equation detection (LaTeX)
    - Table structure preservation
    - Automatic reading-order recovery
    """

    def __init__(self):
        self._available = HAS_MINERU

    async def parse(self, file_path: Path) -> ParseResult:
        """Convert PDF to Markdown using MinerU with full layout preservation."""
        if not HAS_MINERU:
            raise RuntimeError(
                "MinerU is not installed. Install it with: pip install magic-pdf"
            )

        try:
            pdf_bytes = file_path.read_bytes()

            # Create temp directory for image output
            tmp_dir = tempfile.mkdtemp(prefix="mineru_")
            image_dir = os.path.join(tmp_dir, "images")
            os.makedirs(image_dir, exist_ok=True)

            try:
                image_writer = DiskReaderWriter(image_dir)

                # Parse with MinerU pipeline
                jso_data = {"pdf_info": {}}
                pipe = UNIPipe(pdf_bytes, jso_data, image_writer)
                pipe.pipe_classify()
                pipe.pipe_parse()

                # Generate markdown with embedded image references
                md_content = pipe.pipe_mk_markdown(image_dir)

                # Determine title from first heading or filename
                title = file_path.stem
                lines = md_content.strip().split("\n")
                for line in lines[:5]:
                    line = line.strip()
                    if line.startswith("# ") and not line.startswith("## "):
                        title = line[2:].strip()
                        break

                # Collect extracted image paths for potential storage
                image_paths: list[str] = []
                if os.path.isdir(image_dir):
                    for f in sorted(os.listdir(image_dir)):
                        img_path = os.path.join(image_dir, f)
                        if os.path.isfile(img_path):
                            image_paths.append(img_path)

                # Persist images to project storage if any were extracted
                stored_image_dir = ""
                if image_paths and md_content:
                    stored_image_dir = self._store_images(image_paths)

                # Rewrite image paths in markdown if we stored them
                if stored_image_dir:
                    md_content = self._rewrite_image_paths(
                        md_content, image_dir, stored_image_dir
                    )

                page_count = self._estimate_page_count(md_content)

                return ParseResult(
                    markdown=md_content.strip(),
                    title=title,
                    page_count=page_count,
                    metadata={
                        "parser": "mineru",
                        "image_dir": stored_image_dir,
                        "image_count": len(image_paths),
                    },
                )

            finally:
                # Clean up temp directory
                shutil.rmtree(tmp_dir, ignore_errors=True)

        except Exception as e:
            logger.error(f"MinerU parsing failed for {file_path}: {e}")
            logger.info("Falling back to pypdf parser...")
            from app.services.parsers.pdf import PdfParser
            fallback = PdfParser()
            return await fallback.parse(file_path)

    def _store_images(self, image_paths: list[str]) -> str:
        """Copy extracted images to project storage under storage/images/."""
        try:
            images_root = settings.project_root / "storage" / "images"
            # Use a subdirectory based on timestamp to avoid collisions
            import datetime
            ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
            dest_dir = images_root / ts
            dest_dir.mkdir(parents=True, exist_ok=True)

            for img_path in image_paths:
                fname = os.path.basename(img_path)
                shutil.copy2(img_path, dest_dir / fname)

            return str(dest_dir.relative_to(settings.project_root))
        except Exception as e:
            logger.warning(f"Failed to store images: {e}")
            return ""

    def _rewrite_image_paths(
        self, markdown: str, old_dir: str, new_dir: str
    ) -> str:
        """Rewrite image references from temp dir to persisted storage path.

        MinerU outputs paths like ``images/abc.jpg`` — we replace them
        with the persisted path so they survive beyond the temp dir.
        """
        # Replace absolute old_dir paths
        markdown = markdown.replace(old_dir, new_dir)
        # Replace relative "images/" references with the stored path
        old_basename = os.path.basename(old_dir.rstrip("/"))
        if old_basename:
            markdown = markdown.replace(
                f"{old_basename}/", f"{new_dir}/"
            )
        return markdown

    def _estimate_page_count(self, markdown: str) -> int:
        """Estimate page count from markdown page markers."""
        import re
        # MinerU may embed page markers like <!-- page N -->
        pages = re.findall(r'<!--\s*page\s+(\d+)', markdown, re.IGNORECASE)
        if pages:
            return max(int(p) for p in pages)
        # Rough estimate: ~3000 chars per page
        return max(1, len(markdown) // 3000)

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"

    @property
    def is_available(self) -> bool:
        """Check if MinerU is installed and usable."""
        return HAS_MINERU
