"""SQLite migration smoke tests."""

import os
import subprocess
import sys

from sqlalchemy import create_engine, inspect, text

from app.db.migration_runner import upgrade_database


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


def test_startup_migration_runner_upgrades_an_existing_sqlite_database(tmp_path):
    db_path = tmp_path / "existing.sqlite3"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    initial_upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "e5f6a7b8c9d0"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    assert initial_upgrade.returncode == 0, initial_upgrade.stdout

    upgrade_database(database_url=f"sqlite:///{db_path}")

    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    metadata_columns = {column["name"] for column in inspector.get_columns("article_metadata")}
    assert "source_provider" in metadata_columns
    assert "conference_catalog_papers" in inspector.get_table_names()
    engine.dispose()


def test_catalogue_migration_recovers_from_a_previously_added_provenance_column(tmp_path):
    db_path = tmp_path / "partially-upgraded.sqlite3"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    initial_upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "e5f6a7b8c9d0"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    assert initial_upgrade.returncode == 0, initial_upgrade.stdout

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE article_metadata ADD COLUMN source_provider VARCHAR(64)"))
    engine.dispose()

    upgrade_database(database_url=f"sqlite:///{db_path}")

    engine = create_engine(f"sqlite:///{db_path}")
    inspector = inspect(engine)
    metadata_columns = {column["name"] for column in inspector.get_columns("article_metadata")}
    assert {"source_provider", "source_external_id", "source_payload_json"} <= metadata_columns
    assert "conference_catalog_papers" in inspector.get_table_names()
    engine.dispose()


def test_conference_pdf_repair_preserves_corrected_links_when_downgraded(tmp_path):
    db_path = tmp_path / "conference-pdf-repair.sqlite3"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    initial_upgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "f6a7b8c9d0e1"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        check=False,
    )
    assert initial_upgrade.returncode == 0, initial_upgrade.stdout

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO conference_catalog_papers (
                    conference_key, source_external_id, title, authors_json,
                    landing_url, pdf_url, raw_payload_json, imported_at
                ) VALUES (
                    'neurips_2025', 'neurips-paper', 'NeurIPS paper', '[]',
                    'https://proceedings.neurips.cc/paper_files/paper/2025/hash/example-Abstract-Conference.html',
                    'https://proceedings.neurips.cc/paper_files/paper/2025/hash/example-Paper-Conference.pdf',
                    '{}', CURRENT_TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO conference_catalog_papers (
                    conference_key, source_external_id, title, authors_json,
                    landing_url, pdf_url, raw_payload_json, imported_at
                ) VALUES (
                    'cvpr_2026', 'cvpr-paper', 'CVPR paper', '[]',
                    'https://openaccess.thecvf.com/content/CVPR2026/html/Example_paper.html',
                    NULL, '{}', CURRENT_TIMESTAMP
                )
                """
            )
        )
    engine.dispose()

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
    with engine.connect() as connection:
        repaired_rows = dict(
            connection.execute(
                text("SELECT conference_key, pdf_url FROM conference_catalog_papers")
            ).all()
        )
    assert repaired_rows["neurips_2025"].endswith("/file/example-Paper-Conference.pdf")
    assert repaired_rows["cvpr_2026"].endswith("/content/CVPR2026/papers/Example_paper.pdf")
    engine.dispose()

    downgrade = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "downgrade", "f6a7b8c9d0e1"],
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
    with engine.connect() as connection:
        preserved_rows = dict(
            connection.execute(
                text("SELECT conference_key, pdf_url FROM conference_catalog_papers")
            ).all()
        )
    assert preserved_rows == repaired_rows
    engine.dispose()
