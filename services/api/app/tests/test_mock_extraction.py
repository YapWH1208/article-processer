"""Tests for mock AI extraction and Q&A."""

import pytest
from app.services.ai.mock_provider import MockLLMProvider, MockEmbeddingProvider


class TestMockExtraction:
    """Test the mock LLM provider's extraction capabilities."""

    @pytest.mark.asyncio
    async def test_extract_from_simple_paper(self):
        """Extract structured data from a simple paper-like document."""
        provider = MockLLMProvider()

        markdown = """# A Study on Test-Driven Development

## Authors
Alice Researcher, Bob Scientist

## Abstract
This paper examines the impact of test-driven development on code quality.
We find that TDD significantly improves code quality metrics.

## Introduction
Prior work has shown mixed results on TDD effectiveness.

## Methodology
We conducted a controlled experiment with 50 developers using TDD vs non-TDD approaches.

## Experiments
We measured code quality using static analysis tools and test coverage.

## Results
TDD improved code quality by 30% on average (p < 0.01). Test coverage increased from 60% to 85%.

## Limitations
Small sample size. Industry context may differ.

## Future Work
Replicate with larger sample across multiple organizations.

## Keywords
test-driven development, code quality, software engineering
"""

        extraction, errors, confidence = await provider.extract_structured(
            markdown=markdown,
            article_title="A Study on Test-Driven Development",
        )

        assert extraction is not None
        assert extraction["title"] is not None
        assert isinstance(extraction["authors"], list)
        assert len(extraction["authors"]) > 0
        assert extraction["abstract"] is not None
        assert extraction["methodology"] is not None
        assert any("test-driven" in t.lower() or "tdd" in t.lower() for t in extraction.get("tags", []))
        assert isinstance(confidence, float)
        assert 0.0 <= confidence <= 1.0

    @pytest.mark.asyncio
    async def test_extract_without_clear_headings(self):
        """Extraction should still work with loosely structured text."""
        provider = MockLLMProvider()

        markdown = """
Machine learning has revolutionized many fields.
We propose a new method called FastLearn.
We evaluate on ImageNet and CIFAR-10 datasets.
Our method achieves 95% accuracy.
Keywords: deep learning, image classification
"""

        extraction, errors, confidence = await provider.extract_structured(
            markdown=markdown,
            article_title="FastLearn",
        )

        assert extraction is not None
        assert isinstance(extraction["authors"], list)
        # Should detect metrics
        assert "accuracy" in extraction.get("metrics", [])

    @pytest.mark.asyncio
    async def test_graph_entities_generated(self):
        """Mock extraction should generate graph entities."""
        provider = MockLLMProvider()

        markdown = """# Transformer Architecture
## Authors
Ashish Vaswani et al.
We propose the Transformer architecture using self-attention.
We evaluate on WMT 2014 English-German using BLEU score.
"""

        extraction, errors, confidence = await provider.extract_structured(
            markdown=markdown,
            article_title="Transformer",
        )

        assert extraction is not None
        assert len(extraction.get("graph_entities", [])) > 0

        entity_types = {e["type"] for e in extraction["graph_entities"]}
        assert "Author" in entity_types or "Method" in entity_types

    @pytest.mark.asyncio
    async def test_null_fields_when_unknown(self):
        """Fields without evidence should be null, not invented."""
        provider = MockLLMProvider()

        markdown = "# Just a title\n\nSome text with no metadata."

        extraction, errors, confidence = await provider.extract_structured(
            markdown=markdown,
            article_title="Just a title",
        )

        assert extraction is not None
        # Year, venue, DOI should be null since not present
        assert extraction.get("year") is None or extraction.get("year") == 0
        assert extraction.get("doi") is None
        assert isinstance(extraction.get("key_claims", []), list)


class TestMockQA:
    """Test the mock LLM provider's Q&A capabilities."""

    @pytest.mark.asyncio
    async def test_answer_with_relevant_chunks(self):
        """Should answer questions using relevant chunk content."""
        provider = MockLLMProvider()

        chunks = [
            _make_chunk(0, "Introduction", 1, 1, "Test-driven development (TDD) is a software development practice where tests are written before code."),
            _make_chunk(1, "Methodology", 2, 3, "We conducted an experiment with 50 professional developers over 6 months."),
            _make_chunk(2, "Results", 4, 5, "The TDD group produced 30% fewer defects than the control group."),
        ]

        answer, citations = await provider.answer_question(
            question="What is TDD and what were the results?",
            article_title="TDD Study",
            chunks=chunks,
        )

        assert len(answer) > 0
        assert "TDD" in answer or "test-driven" in answer.lower()
        assert len(citations) > 0

    @pytest.mark.asyncio
    async def test_no_answer_when_no_relevant_chunks(self):
        """Should indicate when information is insufficient."""
        provider = MockLLMProvider()

        chunks = [
            _make_chunk(0, "Introduction", 1, 1, "This paper discusses software quality metrics."),
            _make_chunk(1, "Methods", 2, 2, "We used static analysis tools."),
        ]

        answer, citations = await provider.answer_question(
            question="What is the capital of France?",
            article_title="Software Quality Paper",
            chunks=chunks,
        )

        # Should say insufficient info
        assert (
            "insufficient" in answer.lower()
            or "cannot" in answer.lower()
            or len(citations) == 0
        )


class TestMockEmbeddings:
    """Test the mock embedding provider."""

    @pytest.mark.asyncio
    async def test_embed_returns_correct_dimension(self):
        """Embeddings should have the expected dimension."""
        provider = MockEmbeddingProvider(dim=128)
        vec = await provider.embed("Hello world")
        assert len(vec) == 128
        assert all(isinstance(v, float) for v in vec)

    @pytest.mark.asyncio
    async def test_embed_is_deterministic(self):
        """Same text should produce same embedding."""
        provider = MockEmbeddingProvider(dim=128)
        vec1 = await provider.embed("Hello world")
        vec2 = await provider.embed("Hello world")
        assert vec1 == vec2

    @pytest.mark.asyncio
    async def test_different_texts_have_different_embeddings(self):
        """Different texts should produce different embeddings."""
        provider = MockEmbeddingProvider(dim=128)
        vec1 = await provider.embed("Hello world")
        vec2 = await provider.embed("Goodbye world")
        assert vec1 != vec2

    @pytest.mark.asyncio
    async def test_embed_batch(self):
        """Batch embedding should work."""
        provider = MockEmbeddingProvider(dim=128)
        texts = ["text one", "text two", "text three"]
        embeddings = await provider.embed_batch(texts)
        assert len(embeddings) == 3
        for vec in embeddings:
            assert len(vec) == 128

    @pytest.mark.asyncio
    async def test_embedding_is_normalized(self):
        """Embedding vectors should be approximately unit length."""
        provider = MockEmbeddingProvider(dim=128)
        vec = await provider.embed("Test text")
        norm = sum(v * v for v in vec) ** 0.5
        assert abs(norm - 1.0) < 0.01


class TestMockQAWithHistory:
    """Tests for multi-turn conversation history in mock Q&A."""

    @pytest.mark.asyncio
    async def test_answer_question_accepts_history(self):
        """Mock provider should accept and handle a history parameter."""
        provider = MockLLMProvider()

        history = [
            {"role": "user", "content": "What methodology was used?"},
            {"role": "assistant", "content": "The study used a controlled experiment with 50 developers."},
        ]

        answer, citations = await provider.answer_question(
            question="What were the results?",
            article_title="Test Article",
            article_text="Results: TDD improved code quality by 30%.",
            history=history,
        )

        assert isinstance(answer, str)
        assert len(answer) > 0
        assert isinstance(citations, list)

    @pytest.mark.asyncio
    async def test_answer_question_without_history_still_works(self):
        """Backward compatibility: calling without history should still work."""
        provider = MockLLMProvider()

        answer, citations = await provider.answer_question(
            question="What were the results?",
            article_title="Test Article",
            article_text="Results: TDD improved code quality by 30%.",
        )

        assert isinstance(answer, str)
        assert len(answer) > 0

    @pytest.mark.asyncio
    async def test_stream_answer_accepts_history(self):
        """Mock streaming should accept and forward history."""
        provider = MockLLMProvider()

        history = [
            {"role": "user", "content": "What methodology was used?"},
            {"role": "assistant", "content": "The study used a controlled experiment."},
        ]

        tokens = []
        async for token in provider.stream_answer(
            question="What were the results?",
            article_title="Test Article",
            article_text="Results: TDD improved code quality by 30%.",
            history=history,
        ):
            tokens.append(token)

        assert len(tokens) > 0
        full = "".join(tokens)
        assert "30%" in full or "TDD" in full or "improved" in full.lower()


class TestHistoryTruncation:
    """Tests for the _truncate_history helper on BaseLLMProvider."""

    def test_empty_history_returns_empty(self):
        assert MockLLMProvider._truncate_history(None) == []
        assert MockLLMProvider._truncate_history([]) == []

    def test_keeps_most_recent_turns(self):
        history = [
            {"role": "user", "content": "Q1"},
            {"role": "assistant", "content": "A1"},
            {"role": "user", "content": "Q2"},
            {"role": "assistant", "content": "A2"},
            {"role": "user", "content": "Q3"},
            {"role": "assistant", "content": "A3"},
        ]
        result = MockLLMProvider._truncate_history(history, max_turns=2)
        # Should keep only the last 2 turns (4 messages)
        assert len(result) == 4
        assert result[0]["content"] == "Q2"

    def test_truncates_by_char_limit(self):
        long_content = "x" * 10_000
        history = [
            {"role": "user", "content": long_content},
            {"role": "assistant", "content": long_content},
            {"role": "user", "content": "short question"},
            {"role": "assistant", "content": "short answer"},
        ]
        result = MockLLMProvider._truncate_history(history, max_turns=10, max_chars=100)
        # Only the last 2 short messages should remain
        assert len(result) == 2
        assert result[0]["content"] == "short question"
        assert result[1]["content"] == "short answer"


def _make_chunk(idx: int, sec: str, pg_start: int, pg_end: int, txt: str):
    """Helper to create a chunk-like object for testing."""
    class FakeChunk:
        chunk_index = idx
        section_title = sec
        page_start = pg_start
        page_end = pg_end
        text = txt
        token_count = len(txt) // 4
        embedding_json = None

    return FakeChunk()
