from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]


def test_desktop_release_publish_step_sets_gh_repo_context():
    workflow = REPO_ROOT / ".github" / "workflows" / "release-desktop.yml"
    contents = workflow.read_text(encoding="utf-8")

    assert "GH_REPO: ${{ github.repository }}" in contents


def test_desktop_release_uploads_assets_one_at_a_time_without_builder_debug():
    workflow = REPO_ROOT / ".github" / "workflows" / "release-desktop.yml"
    contents = workflow.read_text(encoding="utf-8")

    assert "builder-debug.yml" in contents
    assert "xargs -0 gh release upload" not in contents
    assert 'gh release upload "$TAG_NAME" "$asset" --clobber' in contents


def test_desktop_release_uses_changelog_for_release_notes():
    workflow = REPO_ROOT / ".github" / "workflows" / "release-desktop.yml"
    contents = workflow.read_text(encoding="utf-8")

    assert "scripts/release_notes.py" in contents
    assert "--notes-file release-notes.md" in contents
    assert "--notes \"Desktop release" not in contents
