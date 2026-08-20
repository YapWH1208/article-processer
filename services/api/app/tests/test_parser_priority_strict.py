"""Tests for the strict "mineru_only" parser mode and the Docling runtime reset."""


import subprocess

import pytest

from app.services.pipeline import processor
from app.services.parsers import docling_adapter


class FakeParser:
    def __init__(self, available: bool):
        self._available = available

    @property
    def is_available(self) -> bool:
        return self._available


def test_mineru_only_raises_when_mineru_unavailable(monkeypatch):
    # Strict mode must fail loudly even when Docling/pypdf are available.
    monkeypatch.setattr(processor, "_get_mineru", lambda: FakeParser(available=False))
    monkeypatch.setattr(processor, "_get_docling", lambda: FakeParser(available=True))

    with pytest.raises(RuntimeError, match="mineru_only"):
        processor._select_pdf_parser("mineru_only")


def test_mineru_only_returns_mineru_when_available(monkeypatch):
    mineru = FakeParser(available=True)
    monkeypatch.setattr(processor, "_get_mineru", lambda: mineru)
    monkeypatch.setattr(processor, "_get_docling", lambda: FakeParser(available=True))

    assert processor._select_pdf_parser("mineru_only") is mineru


def test_mineru_first_falls_back_to_docling(monkeypatch):
    docling = FakeParser(available=True)
    monkeypatch.setattr(processor, "_get_mineru", lambda: FakeParser(available=False))
    monkeypatch.setattr(processor, "_get_docling", lambda: docling)

    assert processor._select_pdf_parser("mineru_first") is docling


def test_reset_docling_runtime_clears_cached_adapter():
    # A stale cached DoclingAdapter must be invalidated so an in-app install or
    # uninstall takes effect without a process restart.
    processor._docling = object()

    processor.reset_docling_runtime()

    assert processor._docling is None


def test_reset_docling_detection_reprobes_cleanly():
    # invalidating the availability cache must let the next probe re-evaluate
    # against the environment (docling is absent in the test env) without error.
    docling_adapter._has_docling = None
    assert isinstance(docling_adapter.has_docling(), bool)


def test_install_docling_success_runs_pip_and_resets(monkeypatch):
    from app.routers import settings_page

    calls = []

    def fake_run(cmd, capture_output=True, text=True, timeout=None):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    monkeypatch.setattr(settings_page.subprocess, "run", fake_run)
    monkeypatch.setattr(settings_page, "_probe_docling_version", lambda: "2.120.3")
    reset_called = []
    monkeypatch.setattr(settings_page, "reset_docling_runtime",
                        lambda: reset_called.append(True))

    result = settings_page.install_docling()

    assert result.installed is True
    assert result.version == "2.120.3"
    assert result.error is None
    # Two pip invocations: CPU torch first, then docling.
    assert len(calls) == 2
    assert any("torch" in arg for arg in calls[0])
    assert any("docling" in arg for arg in calls[1])
    assert reset_called == [True]


def test_install_docling_failure_reports_error(monkeypatch):
    from app.routers import settings_page

    def fake_run(cmd, capture_output=True, text=True, timeout=None):
        return subprocess.CompletedProcess(cmd, 7, stdout="", stderr="boom: pip failed")

    monkeypatch.setattr(settings_page.subprocess, "run", fake_run)

    result = settings_page.install_docling()

    assert result.installed is False
    assert result.error is not None


def test_uninstall_docling(monkeypatch):
    from app.routers import settings_page

    captured = {}

    def fake_run(cmd, capture_output=True, text=True, timeout=None):
        captured["cmd"] = cmd
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(settings_page.subprocess, "run", fake_run)
    monkeypatch.setattr(settings_page, "_probe_docling_version", lambda: None)

    result = settings_page.uninstall_docling()

    assert result.installed is False
    assert "uninstall" in captured["cmd"]
    assert "docling" in captured["cmd"]


def test_uninstall_docling_timeout_resets_runtime(monkeypatch):
    # A pip uninstall timeout must still reset the cached Docling availability so
    # a later probe does not crash on a stale True (regression for the crash path).
    from app.routers import settings_page

    def fake_run(cmd, capture_output=True, text=True, timeout=None):
        raise subprocess.TimeoutExpired(cmd, timeout=300)

    monkeypatch.setattr(settings_page.subprocess, "run", fake_run)
    monkeypatch.setattr(settings_page, "_probe_docling_version", lambda: None)
    reset_called = []
    monkeypatch.setattr(
        settings_page, "reset_docling_runtime", lambda: reset_called.append(True)
    )

    result = settings_page.uninstall_docling()

    assert result.installed is False
    assert "timed out" in (result.error or "")
    assert reset_called == [True]


def test_install_frozen_build_returns_clear_error(monkeypatch):
    # In the frozen PyInstaller desktop build there is no python -m pip, so the
    # installer must fail fast with a clear message instead of a cryptic error.
    from app.routers import settings_page

    class FakeSys:
        frozen = True

    monkeypatch.setattr(settings_page, "sys", FakeSys())
    run_called = []
    monkeypatch.setattr(
        settings_page.subprocess, "run", lambda *a, **k: run_called.append(True)
    )

    result = settings_page.install_docling()
    uninstall = settings_page.uninstall_docling()

    assert result.installed is False
    assert "packaged build" in (result.error or "")
    assert uninstall.installed is False
    assert "packaged build" in (uninstall.error or "")
    # Never attempted a pip invocation.
    assert run_called == []


def test_parser_priorities_include_mineru_only() -> None:
    from app.routers.settings_page import PARSER_PRIORITIES

    assert "mineru_only" in PARSER_PRIORITIES
    assert "mineru_first" in PARSER_PRIORITIES


def test_config_default_is_mineru_only() -> None:
    from app.core.config import Settings

    # Check the code default, not a .env override the test host may set.
    default = Settings.model_fields["parser_priority"].default
    assert default == "mineru_only"