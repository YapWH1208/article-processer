import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
QUICK_START_SCRIPTS = ("quickstart.bat", "quickstart.sh")
RUN_ONLY_SCRIPTS = ("start.bat", "start.sh")
ALL_LAUNCHER_SCRIPTS = QUICK_START_SCRIPTS + RUN_ONLY_SCRIPTS


def test_launcher_scripts_are_ascii():
    """Keep launchers portable across cmd.exe and plain POSIX shells."""
    for script_name in ALL_LAUNCHER_SCRIPTS:
        script = REPO_ROOT / script_name
        assert script.exists(), f"{script_name} is missing"
        try:
            script.read_text(encoding="utf-8").encode("ascii")
        except UnicodeEncodeError as exc:
            raise AssertionError(f"{script_name} contains non-ASCII text") from exc


def test_windows_quick_start_help_exits_before_setup():
    if os.name != "nt":
        return

    result = subprocess.run(
        ["cmd", "/d", "/c", str(REPO_ROOT / "quickstart.bat"), "--help"],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=5,
        check=False,
    )

    assert result.returncode == 0, result.stdout
    assert "Usage: quickstart.bat [--skip-install]" in result.stdout
    assert "Setting up backend" not in result.stdout


def test_windows_run_help_exits_before_launching_services():
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
    assert "Usage: start.bat" in result.stdout
    assert "Starting backend" not in result.stdout
    assert "Starting frontend" not in result.stdout


def test_run_only_scripts_do_not_perform_setup():
    forbidden_commands = (
        "pip install",
        "npm install",
        "alembic",
        "python -m venv",
        "python3 -m venv",
        ".env.example",
        "where python",
        "where node",
        "check_cmd",
    )

    for script_name in RUN_ONLY_SCRIPTS:
        script = REPO_ROOT / script_name
        assert script.exists(), f"{script_name} is missing"
        contents = script.read_text(encoding="utf-8").lower()
        for command in forbidden_commands:
            assert command not in contents, f"{script_name} should not run {command!r}"
