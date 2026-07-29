"""Scrape one supported public proceedings source into the local catalogue."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.core.config import settings
from app.db.migration_runner import upgrade_database
from app.db.session import SessionLocal
from app.services.discovery.catalog import SUPPORTED_CONFERENCE_KEYS, import_catalog_snapshot
from app.services.discovery.conference_scrapers import (
    ConferenceScrapeError,
    scrape_conference,
    write_catalog_snapshot,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scrape a supported public proceedings source into a local conference catalogue snapshot.",
    )
    parser.add_argument("--conference", required=True, choices=sorted(SUPPORTED_CONFERENCE_KEYS))
    parser.add_argument("--output", type=Path, help="Destination .jsonl path (defaults under the local data directory)")
    parser.add_argument("--no-import", action="store_true", help="Only write the JSONL snapshot; do not update SQLite")
    return parser


def _default_output_path(conference_key: str) -> Path:
    return settings.data_path / "data" / "conference-snapshots" / f"{conference_key}.jsonl"


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    output_path = args.output or _default_output_path(args.conference)
    try:
        records = scrape_conference(args.conference)
        count = write_catalog_snapshot(records, output_path)
    except ConferenceScrapeError as exc:
        print(f"Scrape failed: {exc}")
        return 2

    if args.no_import:
        print(f"Wrote {count} {args.conference} catalogue rows to {output_path}.")
        return 0

    upgrade_database()
    db = SessionLocal()
    try:
        summary = import_catalog_snapshot(db, args.conference, output_path)
    finally:
        db.close()
    print(
        f"Wrote {count} rows to {output_path}; imported {summary.imported} catalogue rows for {args.conference} "
        f"(created={summary.created}, updated={summary.updated}, skipped={summary.skipped}, invalid={summary.invalid})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
