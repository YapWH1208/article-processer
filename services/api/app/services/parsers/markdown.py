"""Markdown and text passthrough parser."""

import logging
from pathlib import Path
from app.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)


class MarkdownParser(BaseParser):
    """Pass through Markdown files — preserves existing Markdown structure."""

    async def parse(self, file_path: Path) -> ParseResult:
        """Read Markdown file and return as-is, extracting title if present."""
        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")

            # Try to extract title from first H1
            title = file_path.stem
            for line in content.split("\n"):
                stripped = line.strip()
                if stripped.startswith("# ") and not stripped.startswith("## "):
                    title = stripped[2:].strip()
                    break

            return ParseResult(
                markdown=content.strip(),
                title=title,
                metadata={"source": "markdown"},
            )
        except Exception as e:
            logger.error(f"Markdown parsing failed for {file_path}: {e}")
            raise

    def supports(self, source_type: str) -> bool:
        return source_type in ("md", "txt")
