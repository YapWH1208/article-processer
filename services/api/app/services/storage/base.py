"""Abstract storage backend interface."""

from abc import ABC, abstractmethod
from pathlib import Path


class StorageBackend(ABC):
    """Abstract interface for file storage."""

    @abstractmethod
    def save_upload(self, filename: str, content: bytes) -> Path:
        """Save an uploaded file and return its path."""
        ...

    @abstractmethod
    def save_markdown(self, article_id: int, content: str) -> Path:
        """Save processed Markdown for an article."""
        ...

    @abstractmethod
    def save_export(self, article_id: int, format: str, content: str) -> Path:
        """Save an export file."""
        ...

    @abstractmethod
    def read(self, path: Path) -> bytes:
        """Read a file from storage."""
        ...

    @abstractmethod
    def delete(self, path: Path) -> None:
        """Delete a file from storage."""
        ...
