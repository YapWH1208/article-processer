"""Import an explicit local conference JSONL snapshot into SQLite."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.db.session import SessionLocal
from app.services.discovery.catalog import (
    CatalogValidationError,
    SUPPORTED_CONFERENCE_KEYS,
    import_catalog_snapshot,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import a local Paper Insight-style conference JSONL snapshot into the catalogue.",
    )
    parser.add_argument("--conference", required=True, choices=sorted(SUPPORTED_CONFERENCE_KEYS))
    parser.add_argument("--input", required=True, type=Path, help="A .jsonl file or directory containing .jsonl files")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    db = SessionLocal()
    try:
        summary = import_catalog_snapshot(db, args.conference, args.input)
    except CatalogValidationError as exc:
        print(f"Import failed: {exc}")
        return 2
    finally:
        db.close()

    print(
        f"Imported {summary.imported} catalogue rows for {args.conference} "
        f"(created={summary.created}, updated={summary.updated}, "
        f"skipped={summary.skipped}, invalid={summary.invalid})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
