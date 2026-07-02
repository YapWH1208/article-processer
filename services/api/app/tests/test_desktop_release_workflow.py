from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]


def test_desktop_release_publish_step_sets_gh_repo_context():
    workflow = REPO_ROOT / ".github" / "workflows" / "release-desktop.yml"
    contents = workflow.read_text(encoding="utf-8")

    assert "GH_REPO: ${{ github.repository }}" in contents
