"""Markdown normalization — cleans and standardizes extracted Markdown."""

import re
import logging

logger = logging.getLogger(__name__)


def normalize_markdown(markdown: str) -> str:
    """Normalize Markdown to canonical form.

    - Remove excessive blank lines (collapse 3+ to 2)
    - Normalize heading spacing
    - Remove control characters
    - Ensure single trailing newline
    """
    if not markdown:
        return ""

    # Remove control characters except newlines and tabs
    markdown = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', markdown)

    # Collapse 3+ blank lines to 2
    markdown = re.sub(r'\n{3,}', '\n\n', markdown)

    # Ensure space after # in headings
    markdown = re.sub(r'^(#{1,6})([^\s#])', r'\1 \2', markdown, flags=re.MULTILINE)

    # Strip leading/trailing whitespace but ensure single trailing newline
    markdown = markdown.strip() + "\n"

    return markdown
