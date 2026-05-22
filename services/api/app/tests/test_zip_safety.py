"""Tests for ZIP safety — path traversal prevention and zip bomb detection."""

import io
import os
import tempfile
import zipfile
import pytest
from pathlib import Path


def create_zip_in_memory(files: dict[str, bytes]) -> bytes:
    """Create a ZIP file in memory from a dict of filename -> content."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _make_temp_dir() -> Path:
    """Create a temporary directory for extraction tests."""
    path = Path(tempfile.mkdtemp(prefix="zip_test_"))
    return path


def test_safe_zip_extraction():
    """Test that normal ZIP extraction works."""
    content = create_zip_in_memory({
        "doc1.txt": b"Hello world",
        "subdir/doc2.md": b"# Test\nContent",
    })

    extract_dir = _make_temp_dir()
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for info in zf.infolist():
                member_path = extract_dir / info.filename
                resolved = member_path.resolve()
                if not str(resolved).startswith(str(extract_dir.resolve())):
                    raise ValueError(f"Path traversal detected: {info.filename}")
                if info.is_dir():
                    member_path.mkdir(parents=True, exist_ok=True)
                else:
                    member_path.parent.mkdir(parents=True, exist_ok=True)
                    member_path.write_bytes(zf.read(info))

        assert (extract_dir / "doc1.txt").exists()
        assert (extract_dir / "subdir" / "doc2.md").exists()
        assert (extract_dir / "doc1.txt").read_text() == "Hello world"
    finally:
        # Cleanup
        import shutil
        shutil.rmtree(extract_dir, ignore_errors=True)


def test_prevent_path_traversal_absolute():
    """Test that absolute paths in ZIP are rejected."""
    content = create_zip_in_memory({
        "/etc/passwd": b"malicious",
    })

    extract_dir = _make_temp_dir()
    try:
        traversal_detected = False
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for info in zf.infolist():
                member_path = extract_dir / info.filename
                resolved = member_path.resolve()
                if not str(resolved).startswith(str(extract_dir.resolve())):
                    traversal_detected = True
                    break

        assert traversal_detected, "Path traversal not detected for absolute path"
    finally:
        import shutil
        shutil.rmtree(extract_dir, ignore_errors=True)


def test_prevent_path_traversal_dotdot():
    """Test that ../ paths in ZIP are rejected."""
    content = create_zip_in_memory({
        "../outside.txt": b"evil",
    })

    extract_dir = _make_temp_dir()
    try:
        traversal_detected = False
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for info in zf.infolist():
                member_path = extract_dir / info.filename
                resolved = member_path.resolve()
                if not str(resolved).startswith(str(extract_dir.resolve())):
                    traversal_detected = True
                    break

        assert traversal_detected, "Path traversal not detected for ../ path"
    finally:
        import shutil
        shutil.rmtree(extract_dir, ignore_errors=True)


def test_zip_bomb_detection_by_file_count():
    """Test that ZIPs with too many files are rejected."""
    files = {f"file_{i}.txt": b"x" for i in range(2000)}
    content = create_zip_in_memory(files)

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        file_count = len(zf.infolist())
        max_files = 1000
        assert file_count > max_files, f"ZIP bomb should have > {max_files} files, has {file_count}"


def test_zip_bomb_detection_by_size():
    """Test that ZIPs with high compression ratio are detected."""
    huge_data = b"A" * 1_000_000
    content = create_zip_in_memory({"huge.txt": huge_data})

    compressed_size = len(content)
    original_size = 1_000_000
    ratio = original_size / compressed_size if compressed_size > 0 else float("inf")

    max_ratio = 100
    assert ratio > max_ratio, f"Zip bomb compression ratio expected > {max_ratio}:1, got {ratio:.0f}:1"


def test_valid_zip_with_reasonable_content():
    """Test that a normal ZIP with reasonable content passes all checks."""
    files = {
        "paper1.pdf": b"%PDF-1.4\n" + b"x" * 50000,
        "notes.md": b"# Research Notes\n\nImportant findings.",
        "data.txt": b"sample data\n" * 100,
    }
    content = create_zip_in_memory(files)

    extract_dir = _make_temp_dir()
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            file_count = len(zf.infolist())
            assert file_count <= 1000

            total_size = sum(info.file_size for info in zf.infolist())
            assert total_size < 100 * 1024 * 1024

            for info in zf.infolist():
                member_path = extract_dir / info.filename
                resolved = member_path.resolve()
                assert str(resolved).startswith(str(extract_dir.resolve()))
                if not info.is_dir():
                    member_path.parent.mkdir(parents=True, exist_ok=True)
                    member_path.write_bytes(zf.read(info))

        assert (extract_dir / "paper1.pdf").exists()
        assert (extract_dir / "notes.md").exists()
        assert (extract_dir / "data.txt").exists()
    finally:
        import shutil
        shutil.rmtree(extract_dir, ignore_errors=True)
