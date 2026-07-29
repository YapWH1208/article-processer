"""SQLite migration smoke tests."""

import os
import subprocess
import sys

from sqlalchemy import create_engine, inspect


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


def test_catalogue_migration_adds_provenance_and_downgrades_on_sqlite(tmp_path):
    db_path = tmp_path / "catalogue-migrations.sqlite3"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    assert upgrade.returncode == 0, upgrade.stdout

    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    assert "conference_catalog_papers" in inspector.get_table_names()
    metadata_columns = {column["name"] for column in inspector.get_columns("article_metadata")}
    assert {"source_provider", "source_external_id", "source_payload_json"} <= metadata_columns
    engine.dispose()

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "downgrade", "e5f6a7b8c9d0"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    assert downgrade.returncode == 0, downgrade.stdout

    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    assert "conference_catalog_papers" not in inspector.get_table_names()
    metadata_columns = {column["name"] for column in inspector.get_columns("article_metadata")}
    assert "source_provider" not in metadata_columns
    engine.dispose()
