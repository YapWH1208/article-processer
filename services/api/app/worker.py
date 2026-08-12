"""Manual worker script for running the processing pipeline independently.

Usage:
    python -m app.worker --article-id 1

This provides an alternative to the in-process background thread approach.
Useful for debugging or when you want to process articles separately.
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Ensure the app package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.core.logging import setup_logging
from app.services.pipeline.processor import run_pipeline


def main():
    parser = argparse.ArgumentParser(description="Article processing worker")
    parser.add_argument(
        "--article-id",
        type=int,
        required=True,
        help="ID of the article to process",
    )
    parser.add_argument(
        "--step",
        type=str,
        default=None,
        help="Run only a specific pipeline step (parse, chunk, extract, embed, graph)",
    )
    parser.add_argument(
        "--mode",
        type=str,
        default="quick",
        choices=["quick", "deep", "parse_only"],
        help="Processing mode: quick (default), deep (adds Deep Analysis report), or parse_only",
    )
    args = parser.parse_args()

    setup_logging(logging.INFO)
    logger = logging.getLogger("worker")

    logger.info(f"Starting worker for article {args.article_id} (mode={args.mode})")
    logger.info(f"Mock AI: {settings.use_mock_ai}")

    asyncio.run(
        run_pipeline(
            args.article_id,
            run_ai=args.mode != "parse_only",
            analysis_mode=args.mode,
        )
    )

    logger.info("Worker finished")


if __name__ == "__main__":
    main()
