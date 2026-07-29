"""Run the packaged Alembic migration chain at application startup."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import settings


def upgrade_database(*, database_url: str | None = None) -> None:
    """Upgrade the configured database to Alembic's head revision.

    ``Base.metadata.create_all`` can create a new database, but it cannot add
    columns to an existing one.  Running the migration chain here keeps the
    desktop sidecar and local development server compatible with the user's
    existing SQLite database after an application update.
    """
    api_root = Path(__file__).resolve().parents[2]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "app" / "db" / "migrations"))
    config.attributes["database_url"] = database_url or settings.database_url
    command.upgrade(config, "head")
