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
    # Use a state machine: track whether we're inside a $$ block
    envs = r'(?:array|align|aligned|matrix|pmatrix|bmatrix|cases|gather|split|equation|eqnarray)'

    # Split by $$ then reassemble: every odd segment is inside math mode
    parts = re.split(r'\$\$', markdown)
    result: list[str] = []
    for i, part in enumerate(parts):
        in_math = i % 2 == 1  # odd-indexed parts are inside $$...$$
        if not in_math:
            # Wrap orphan \begin/\end in $$
            part = re.sub(
                rf'(\\begin\{{{envs}\}}[^}}]*\}})',
                r'$$\n\1',
                part,
            )
            part = re.sub(
                rf'(\\end\{{{envs}\}})',
                r'\1\n$$',
                part,
            )
        result.append(part)
    markdown = '$$'.join(result)

    # Clean up any duplicate $$ markers
    markdown = re.sub(r'\$\$\s*\$\$', '', markdown)
    markdown = re.sub(r'\$\$\s*\n\s*\$\$', '', markdown)

    # Strip leading/trailing whitespace but ensure single trailing newline
    markdown = markdown.strip() + "\n"

    return markdown
