"""Marker adapter placeholder.

Marker (https://github.com/VikParuchuri/marker) converts PDF to Markdown.
This adapter is a placeholder — implement when Marker integration is needed.
"""

from pathlib import Path
from app.services.parsers.base import BaseParser, ParseResult


class MarkerAdapter(BaseParser):
    """Placeholder for Marker PDF parser integration."""

    async def parse(self, file_path: Path) -> ParseResult:
        raise NotImplementedError(
            "Marker adapter is not implemented. Install marker and implement parse()."
        )

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"
