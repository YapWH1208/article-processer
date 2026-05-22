"""GROBID adapter placeholder.

GROBID (https://github.com/kermitt2/grobid) extracts structured metadata from PDFs.
This adapter is a placeholder — implement when GROBID integration is needed.
"""

from pathlib import Path
from app.services.parsers.base import BaseParser, ParseResult


class GrobidAdapter(BaseParser):
    """Placeholder for GROBID parser integration."""

    async def parse(self, file_path: Path) -> ParseResult:
        raise NotImplementedError(
            "GROBID adapter is not implemented. Deploy GROBID server and implement parse()."
        )

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"
