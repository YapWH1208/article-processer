"""Abstract parser interface and provider registry."""

from abc import ABC, abstractmethod
from pathlib import Path
from dataclasses import dataclass


@dataclass
class ParseResult:
    """Result of parsing a document."""
    markdown: str
    title: str | None = None
    page_count: int | None = None
    metadata: dict | None = None


class BaseParser(ABC):
    """Abstract interface for document parsers."""

    @abstractmethod
    async def parse(self, file_path: Path) -> ParseResult:
        """Parse a document file and return canonical Markdown."""
        ...

    @abstractmethod
    def supports(self, source_type: str) -> bool:
        """Check if this parser supports the given source type."""
        ...
