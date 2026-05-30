"""Security utilities for uploads, paths, and prompt protection."""

import hashlib
import re
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """Remove path traversal characters and normalize."""
    name = Path(filename).name
    name = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", name)
    name = name.lstrip(".")
    if not name:
        name = "unnamed"
    return name


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def validate_upload_filename(filename: str) -> bool:
    """Check that filename has an allowed extension."""
    allowed = {".pdf", ".zip", ".html", ".htm", ".md", ".txt", ".markdown"}
    ext = Path(filename).suffix.lower()
    return ext in allowed


def protect_prompt_from_injection(document_text: str) -> str:
    """Wrap untrusted document text before sending it to an AI provider."""
    max_len = 50_000
    if len(document_text) > max_len:
        document_text = document_text[:max_len] + "\n\n[... document truncated ...]"

    return f"<document>\n{document_text}\n</document>"


def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """Check that target_path is within base_dir."""
    try:
        resolved = base_dir.resolve()
        target = (resolved / target_path).resolve()
        return str(target).startswith(str(resolved))
    except (ValueError, OSError):
        return False
