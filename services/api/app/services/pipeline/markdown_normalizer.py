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

    # ── LaTeX math block cleanup ──────────────────────────────────────────
    # MinerU sometimes produces spurious empty $$ blocks that break math
    # delimiters. Collapse consecutive $$...$$ (including empty) into one.

    # Collapse: $$<blank>$$ → nothing (remove empty math blocks between real ones)
    markdown = re.sub(r'\$\$\s*\$\$', '', markdown)

    # Collapse: $$\n...\n$$\n$$\n... → $$\n...\n... (merge adjacent blocks)
    markdown = re.sub(r'\$\$\s*\n\s*\$\$', '$$', markdown)

    # Ensure \begin{...} / \end{...} environments are wrapped in $$
    # Run in a loop to handle multiple consecutive environments
    for _ in range(3):
        markdown = re.sub(
            r'(?<!\$)\s*(\\begin\{(?:array|align|aligned|matrix|pmatrix|bmatrix|cases|gather|split|equation|eqnarray)\}[^}]*\})',
            r'\n$$\n\1',
            markdown,
        )
        markdown = re.sub(
            r'(\\end\{(?:array|align|aligned|matrix|pmatrix|bmatrix|cases|gather|split|equation|eqnarray)\})\s*(?!\$|\\end)',
            r'\1\n$$\n',
            markdown,
        )
        # Remove duplicate $$ markers introduced by the wrapping
        markdown = re.sub(r'\$\$\s*\n\s*\$\$', '$$', markdown)

    # Strip leading/trailing whitespace but ensure single trailing newline
    markdown = markdown.strip() + "\n"

    return markdown
