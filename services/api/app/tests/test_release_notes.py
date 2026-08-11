import importlib.util
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / "scripts" / "release_notes.py"


@pytest.fixture(scope="module")
def release_notes_module():
    spec = importlib.util.spec_from_file_location("release_notes", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SAMPLE_CHANGELOG = """# Changelog

All notable changes to the Article Processor project.

---

## [0.3.0] — 2026-08-11

### Added

- Deep Analysis mode - a comprehensive AI report on top of the full pipeline.

### Fixed

- Release workflow reads notes from CHANGELOG.

---

## [0.2.1] — 2026-08-08

### Fixed

- Source card snippet quotes.

---
"""


def test_extracts_section_for_tag_version(release_notes_module):
    notes = release_notes_module.extract_release_notes(SAMPLE_CHANGELOG, "v0.3.0")
    assert "Deep Analysis mode" in notes
    assert "Release workflow reads notes from CHANGELOG" in notes
    assert "## [0.2.1]" not in notes
    assert "---" not in notes


def test_extracts_section_for_bare_version(release_notes_module):
    notes = release_notes_module.extract_release_notes(SAMPLE_CHANGELOG, "0.2.1")
    assert "Source card snippet quotes" in notes
    assert "0.3.0" not in notes


def test_returns_last_section_when_no_separator_follows(release_notes_module):
    notes = release_notes_module.extract_release_notes(SAMPLE_CHANGELOG, "0.2.1")
    assert notes.endswith("\n")


def test_missing_version_raises_with_guidance(release_notes_module):
    with pytest.raises(ValueError, match="No CHANGELOG entry found for version '9.9.9'"):
        release_notes_module.extract_release_notes(SAMPLE_CHANGELOG, "v9.9.9")


def test_cli_writes_notes_to_stdout(release_notes_module, capsys, tmp_path):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(SAMPLE_CHANGELOG, encoding="utf-8")
    exit_code = release_notes_module.main([str(changelog), "v0.3.0"])
    assert exit_code == 0
    assert "Deep Analysis mode" in capsys.readouterr().out


def test_cli_fails_on_missing_entry(release_notes_module, capsys, tmp_path):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(SAMPLE_CHANGELOG, encoding="utf-8")
    exit_code = release_notes_module.main([str(changelog), "v9.9.9"])
    assert exit_code == 1
    assert "No CHANGELOG entry found" in capsys.readouterr().err
