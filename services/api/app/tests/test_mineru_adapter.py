"""Targeted tests for MinerU's Windows model-cache recovery."""

import types

import pytest

from app.services.parsers import mineru_adapter
from app.services.parsers.base import ParseResult


class _WindowsSymlinkPrivilegeError(OSError):
    winerror = 1314


def test_huggingface_symlink_workaround_copies_a_cached_blob_when_windows_denies_links(tmp_path):
    source = tmp_path / "blob"
    destination = tmp_path / "snapshot" / "README.md"
    destination.parent.mkdir()
    source.write_bytes(b"model data")

    def denied_symlink(*, src, dst, new_blob=False):
        raise _WindowsSymlinkPrivilegeError("symlink privilege denied")

    fake_hub = types.SimpleNamespace(_create_symlink=denied_symlink)
    mineru_adapter._install_huggingface_windows_symlink_fallback(
        file_download_module=fake_hub,
        is_windows=True,
    )

    fake_hub._create_symlink(str(source), str(destination), new_blob=False)

    assert destination.read_bytes() == b"model data"
    assert source.exists()


@pytest.mark.asyncio
async def test_mineru_uses_pypdf_when_all_available_mineru_strategies_fail(monkeypatch, tmp_path):
    file_path = tmp_path / "paper.pdf"
    file_path.write_bytes(b"%PDF-1.4\n")
    adapter = mineru_adapter.MinerUAdapter()

    async def failed_parse(_file_path):
        raise RuntimeError("model setup failed")

    async def fallback_parse(_self, _file_path):
        return ParseResult(markdown="# Recovered", metadata={"parser": "pypdf"})

    monkeypatch.setattr(mineru_adapter, "HAS_MINERU_CLI", False)
    monkeypatch.setattr(mineru_adapter, "HAS_MINERU_DO_PARSE", True)
    monkeypatch.setattr(mineru_adapter, "HAS_LEGACY_MAGIC_PDF", False)
    monkeypatch.setattr(adapter, "_parse_via_do_parse", failed_parse)
    monkeypatch.setattr("app.services.parsers.pdf.PdfParser.parse", fallback_parse)

    result = await adapter.parse(file_path)

    assert result.markdown == "# Recovered"
    assert result.metadata["parser"] == "pypdf"
    assert result.metadata["mineru_fallback_reason"] == "do_parse: model setup failed"
