import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]


def test_quick_start_scripts_are_ascii():
    """Keep launchers portable across cmd.exe and plain POSIX shells."""
    for script_name in ("start.bat", "start.sh"):
        script = REPO_ROOT / script_name
        try:
            script.read_text(encoding="utf-8").encode("ascii")
        except UnicodeEncodeError as exc:
            raise AssertionError(f"{script_name} contains non-ASCII text") from exc


def test_windows_quick_start_help_exits_before_setup():
    if os.name != "nt":
        return

    result = subprocess.run(
        ["cmd", "/d", "/c", str(REPO_ROOT / "start.bat"), "--help"],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=5,
        check=False,
    )

    assert result.returncode == 0, result.stdout
    assert "Usage: start.bat [--skip-install]" in result.stdout
    assert "Setting up backend" not in result.stdout
