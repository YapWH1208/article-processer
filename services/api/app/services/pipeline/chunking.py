"""Article chunking — section-aware chunking for RAG."""

import re
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """A chunk of article text with section metadata."""
    chunk_index: int
    section_title: str | None
    page_start: int | None
    page_end: int | None
    text: str
    token_count: int


def estimate_tokens(text: str) -> int:
    """Rough token count estimation: ~4 chars per token for English."""
    return max(1, len(text) // 4)


def chunk_markdown(
    markdown: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[Chunk]:
    """Chunk Markdown into section-aware chunks.

    Splits on headings first, then splits large sections into
    overlapping chunks of approximately chunk_size tokens.
    """
    if not markdown:
        return []

    # Split on headings to get sections
    sections = _split_by_headings(markdown)
    chunks: list[Chunk] = []
    idx = 0

    for section_title, section_text in sections:
        # Extract page markers from section text
        pages = _extract_pages(section_text)

        if estimate_tokens(section_text) <= chunk_size:
            chunks.append(Chunk(
                chunk_index=idx,
                section_title=section_title,
                page_start=pages[0] if pages else None,
                page_end=pages[-1] if pages else None,
                text=section_text.strip(),
                token_count=estimate_tokens(section_text),
            ))
            idx += 1
        else:
            # Split large section into overlapping chunks
            sub_chunks = _split_long_text(
                section_text,
                chunk_size=chunk_size,
                overlap=chunk_overlap,
                base_index=idx,
                section_title=section_title,
            )
            chunks.extend(sub_chunks)
            idx += len(sub_chunks)

    return chunks


def _split_by_headings(markdown: str) -> list[tuple[str | None, str]]:
    """Split Markdown into (section_title, content) by headings."""
    # Pattern: any level heading at start of line
    heading_pattern = re.compile(r'^(#{1,6})\s+(.+)$', re.MULTILINE)

    # Find all heading positions
    positions = [(m.start(), m.end(), m.group(1), m.group(2).strip())
                 for m in heading_pattern.finditer(markdown)]

    if not positions:
        # No headings — treat entire text as one section
        return [(None, markdown)]

    sections = []

    # Text before first heading
    if positions[0][0] > 0:
        pre_text = markdown[:positions[0][0]].strip()
        if pre_text:
            sections.append((None, pre_text))

    # Process each heading and its content
    for i, (start, end, level, title) in enumerate(positions):
        next_start = positions[i + 1][0] if i + 1 < len(positions) else len(markdown)
        content = markdown[end:next_start].strip()
        sections.append((title, content))

    return sections


def _extract_pages(text: str) -> list[int]:
    """Extract page numbers from HTML comment markers."""
    pattern = re.compile(r'<!-- page (\d+) -->')
    return [int(m) for m in pattern.findall(text)]


def _split_long_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
    base_index: int = 0,
    section_title: str | None = None,
) -> list[Chunk]:
    """Split a long text into overlapping chunks, preferring paragraph boundaries."""
    paragraphs = text.split("\n\n")
    chunks: list[Chunk] = []
    current_chunk: list[str] = []
    current_size = 0
    idx = base_index

    for para in paragraphs:
        para_size = estimate_tokens(para)

        if current_size + para_size > chunk_size and current_chunk:
            # Finalize current chunk
            chunk_text = "\n\n".join(current_chunk)
            pages = _extract_pages(chunk_text)
            chunks.append(Chunk(
                chunk_index=idx,
                section_title=section_title,
                page_start=pages[0] if pages else None,
                page_end=pages[-1] if pages else None,
                text=chunk_text.strip(),
                token_count=estimate_tokens(chunk_text),
            ))
            idx += 1

            # Keep overlap: last paragraph(s) as context
            overlap_text = ""
            overlap_tokens = 0
            overlap_paras = []
            for p in reversed(current_chunk):
                pt = estimate_tokens(p)
                if overlap_tokens + pt > overlap:
                    break
                overlap_paras.insert(0, p)
                overlap_tokens += pt

            current_chunk = overlap_paras
            current_size = overlap_tokens

        current_chunk.append(para)
        current_size += para_size

    # Final chunk
    if current_chunk:
        chunk_text = "\n\n".join(current_chunk)
        pages = _extract_pages(chunk_text)
        chunks.append(Chunk(
            chunk_index=idx,
            section_title=section_title,
            page_start=pages[0] if pages else None,
            page_end=pages[-1] if pages else None,
            text=chunk_text.strip(),
            token_count=estimate_tokens(chunk_text),
        ))

    return chunks
