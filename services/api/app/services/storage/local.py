"""Local filesystem storage implementation."""

import logging
from pathlib import Path
from app.core.config import settings
from app.services.storage.base import StorageBackend

logger = logging.getLogger(__name__)


class LocalStorage(StorageBackend):
    """Local filesystem storage backend."""

    def __init__(self):
        self.uploads_dir = settings.uploads_path
        self.markdown_dir = settings.markdown_path
        self.exports_dir = settings.exports_path
        self._ensure_dirs()

    def _ensure_dirs(self):
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.markdown_dir.mkdir(parents=True, exist_ok=True)
        self.exports_dir.mkdir(parents=True, exist_ok=True)

    def save_upload(self, filename: str, content: bytes) -> Path:
        """Save an uploaded file. Creates subdirectories to avoid flat dirs."""
        # Use first two chars of hash or filename as sharding prefix
        import hashlib
        h = hashlib.md5(filename.encode()).hexdigest()[:4]
        subdir = self.uploads_dir / h[:2]
        subdir.mkdir(parents=True, exist_ok=True)
        dest = subdir / f"{h}_{filename}"
        dest.write_bytes(content)
        logger.info(f"Saved upload: {dest}")
        return dest

    def save_markdown(self, article_id: int, content: str) -> Path:
        dest = self.markdown_dir / f"{article_id}.md"
        dest.write_text(content, encoding="utf-8")
        logger.info(f"Saved Markdown for article {article_id}: {dest}")
        return dest

    def save_export(self, article_id: int, format: str, content: str) -> Path:
        ext = "md" if format == "markdown" else "json"
        dest = self.exports_dir / f"{article_id}.{ext}"
        dest.write_text(content, encoding="utf-8")
        return dest

    def read(self, path: Path) -> bytes:
        return path.read_bytes()

    def delete(self, path: Path) -> None:
        if path.exists():
            path.unlink()
            logger.info(f"Deleted: {path}")
