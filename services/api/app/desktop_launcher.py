"""Desktop entry point for the packaged FastAPI sidecar."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _log_dir() -> Path:
    data_dir = os.environ.get("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR")
    if data_dir:
        return Path(data_dir).expanduser() / "logs"
    return Path.cwd() / "logs"


def bootstrap_frozen_stdio() -> None:
    """Route hidden-window tracebacks to a log file in packaged builds."""
    if not getattr(sys, "frozen", False):
        return

    log_dir = _log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = open(log_dir / "backend.log", "a", encoding="utf-8", buffering=1)

    if sys.stdout is None:
        sys.stdout = log_file
    if sys.stderr is None:
        sys.stderr = log_file


def create_app():
    """Return the FastAPI app without starting a server."""
    from app.main import app

    return app


def main() -> None:
    bootstrap_frozen_stdio()

    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(create_app(), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
