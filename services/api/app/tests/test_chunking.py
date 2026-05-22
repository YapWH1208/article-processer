"""Tests for Markdown chunking."""

import pytest
from app.services.pipeline.chunking import chunk_markdown, estimate_tokens, Chunk


class TestChunking:
    """Test the Markdown chunking functionality."""

    def test_empty_markdown(self):
        """Empty input should return empty list."""
        chunks = chunk_markdown("")
        assert len(chunks) == 0

    def test_single_paragraph(self):
        """A single short paragraph should produce one chunk."""
        md = "This is a single paragraph."
        chunks = chunk_markdown(md)
        assert len(chunks) == 1
        assert chunks[0].text == md
        assert chunks[0].chunk_index == 0
        assert chunks[0].section_title is None

    def test_multiple_sections(self):
        """Multiple heading-delimited sections should produce separate chunks."""
        md = """# Introduction
This is the introduction.

## Methods
We used standard methods.

## Results
The results are promising."""
        chunks = chunk_markdown(md)
        # Should have at least 3 chunks (possibly more if sections are large)
        assert len(chunks) >= 3

        section_titles = {c.section_title for c in chunks}
        assert "Introduction" in section_titles
        assert "Methods" in section_titles
        assert "Results" in section_titles

    def test_chunks_have_sequential_indices(self):
        """Chunk indices should be sequential starting from 0."""
        md = """# One
Content one.

# Two
Content two.

# Three
Content three."""
        chunks = chunk_markdown(md)
        indices = [c.chunk_index for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_long_section_is_split(self):
        """A very long section should be split into multiple overlapping chunks."""
        # Generate a long section with 100 paragraphs
        paragraphs = []
        for i in range(100):
            paragraphs.append(
                f"This is paragraph {i} with some additional text to make it longer and more realistic. " * 3
            )
        md = "# Long Section\n\n" + "\n\n".join(paragraphs)

        chunks = chunk_markdown(md, chunk_size=500, chunk_overlap=100)

        # Should be split into multiple chunks
        assert len(chunks) > 1
        for c in chunks:
            assert len(c.text) > 0
            assert c.section_title == "Long Section"

    def test_page_markers_extracted(self):
        """Page markers in markdown should be extracted correctly."""
        md = """# Title
<!-- page 1 -->
Content on page 1.
<!-- page 2 -->
Content on page 2."""
        chunks = chunk_markdown(md)

        # Find chunks with page info
        pages_found = set()
        for c in chunks:
            if c.page_start is not None:
                pages_found.add(c.page_start)
            if c.page_end is not None:
                pages_found.add(c.page_end)

        assert 1 in pages_found or 2 in pages_found

    def test_token_estimation(self):
        """Token estimation should be roughly proportional to text length."""
        text = "Hello world " * 100
        tokens = estimate_tokens(text)
        # 100 * (~12 chars) = 1200 chars / 4 ≈ 300 tokens
        assert 200 < tokens < 500

    def test_text_without_headings(self):
        """Document without any headings should still be chunked."""
        md = "Just some plain text without any headings.\n\n" * 20
        chunks = chunk_markdown(md)
        assert len(chunks) >= 1
        for c in chunks:
            assert isinstance(c.text, str)
            assert len(c.text) > 0

    def test_code_blocks_preserved(self):
        """Code blocks in markdown should be preserved in chunks."""
        md = """# Code Example

```python
def hello():
    print("Hello, world!")
```

Some explanation text."""
        chunks = chunk_markdown(md)
        all_text = " ".join(c.text for c in chunks)
        assert "def hello()" in all_text
        assert "Hello, world" in all_text
