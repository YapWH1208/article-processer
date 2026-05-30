"""SQLite migration smoke tests."""

import os
import subprocess
import sys


def test_alembic_upgrade_head_on_fresh_sqlite_database(tmp_path):
    db_path = tmp_path / "migrations.sqlite3"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )

    assert result.returncode == 0, result.stdout
    assert db_path.exists()
