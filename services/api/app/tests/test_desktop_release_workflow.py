from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]


def _read_workflow() -> str:
    workflow = REPO_ROOT / ".github" / "workflows" / "release-desktop.yml"
    return workflow.read_text(encoding="utf-8")


def test_desktop_release_publish_step_sets_gh_repo_context():
    contents = _read_workflow()

    assert "GH_REPO: ${{ github.repository }}" in contents


def test_desktop_release_publishes_without_artifact_round_trip():
    contents = _read_workflow()

    assert "actions/upload-artifact" not in contents
    assert "actions/download-artifact" not in contents


def test_desktop_release_publish_steps_are_tag_gated_and_cross_os():
    contents = _read_workflow()

    assert contents.count("if: startsWith(github.ref, 'refs/tags/')") == 2
    assert "shell: bash" in contents


def test_desktop_release_has_no_separate_release_job():
    contents = _read_workflow()

    assert "name: Publish GitHub Release" not in contents
    assert "needs: build" not in contents


def test_desktop_release_creates_release_with_retry():
    contents = _read_workflow()

    assert 'gh release create "$TAG_NAME"' in contents
    assert "--notes-file release-notes.md" in contents
    assert "for attempt in" in contents
    assert 'gh release view "$TAG_NAME" >/dev/null' in contents


def test_desktop_release_uploads_assets_one_at_a_time_without_builder_debug():
    contents = _read_workflow()

    assert "builder-debug.yml" in contents
    assert "xargs -0 gh release upload" not in contents
    assert 'gh release upload "$TAG_NAME" "$asset" --clobber' in contents
    assert "set -euo pipefail" in contents
    assert "-print0 |" not in contents
    assert '[[ ! -s "$asset_list" ]]' in contents
    assert 'done < "$asset_list"' in contents


def test_desktop_release_uses_changelog_for_release_notes():
    contents = _read_workflow()

    assert "scripts/release_notes.py" in contents
    assert "--notes-file release-notes.md" in contents
    assert '--notes "Desktop release' not in contents


def test_desktop_release_notes_use_portable_python_command():
    contents = _read_workflow()

    assert "python3 scripts/release_notes.py" not in contents
    assert "python scripts/release_notes.py" in contents
