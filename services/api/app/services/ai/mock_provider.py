"""Mock AI provider for offline development.

Provides deterministic, realistic-enough extraction results without API calls.
"""

import json
import logging
import re
import hashlib
import math
from typing import Any
from app.services.ai.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class MockEmbeddingProvider:
    """Deterministic mock embedding provider for local tests and offline mode."""

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim

    async def embed(self, text: str) -> list[float]:
        """Return a deterministic, approximately unit-normalized vector."""
        values: list[float] = []
        seed = hashlib.sha256(text.encode("utf-8")).digest()
        counter = 0

        while len(values) < self.dim:
            digest = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
            for i in range(0, len(digest), 4):
                if len(values) >= self.dim:
                    break
                number = int.from_bytes(digest[i:i + 4], "big")
                values.append((number / 0xFFFFFFFF) * 2.0 - 1.0)
            counter += 1

        norm = math.sqrt(sum(value * value for value in values))
        if norm == 0:
            return values
        return [value / norm for value in values]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Return deterministic embeddings for each input text."""
        return [await self.embed(text) for text in texts]


class MockLLMProvider(BaseLLMProvider):
    """Deterministic mock LLM provider that extracts structure from text patterns."""

    async def extract_structured(
        self,
        markdown: str,
        article_title: str,
    ) -> tuple[dict | None, list[str] | None, float]:
        """Extract structured information using regex/heuristics (no real AI)."""
        try:
            # Extract title from first H1
            title = article_title
            h1_match = re.search(r'^#\s+(.+)$', markdown, re.MULTILINE)
            if h1_match:
                title = h1_match.group(1).strip()

            # Extract authors — look for common patterns
            authors = self._extract_authors(markdown)

            # Extract year
            year = self._extract_year(markdown)

            # Extract sections
            sections = self._extract_sections(markdown)

            # Extract tags/keywords
            tags = self._extract_tags(markdown)

            # Build graph entities from extracted terms
            entities = self._build_mock_entities(markdown, authors)

            extraction = {
                "title": title,
                "authors": authors,
                "year": year,
                "venue": sections.get("venue"),
                "doi": self._extract_doi(markdown),
                "arxiv_id": self._extract_arxiv_id(markdown),
                "url": None,
                "abstract": sections.get("abstract"),
                "background": sections.get("introduction") or sections.get("background"),
                "research_problem": sections.get("problem"),
                "methodology": sections.get("method") or sections.get("methodology"),
                "datasets": self._extract_list_items(markdown, r'(?:dataset|corpus|data set)[:\s]+(.+?)(?:\.|,|$)'),
                "experiments": self._extract_list_items(markdown, r'(?:experiment|evaluation)[:\s]+(.+?)(?:\.|,|$)'),
                "metrics": self._extract_metrics(markdown),
                "results": sections.get("results") or sections.get("evaluation"),
                "limitations": sections.get("limitations"),
                "future_work": sections.get("future") or sections.get("conclusion"),
                "key_claims": [
                    {
                        "claim": f"Paper introduces a method for {sections.get('method', 'the described approach')[:120]}",
                        "evidence": {
                            "source_section": "methodology",
                            "snippet": sections.get("method", "")[:200] if sections.get("method") else None,
                        },
                        "confidence": 0.7,
                    }
                ],
                "references": [],
                "tags": tags,
                "graph_entities": entities,
                "graph_relationships": self._build_mock_relationships(entities),
            }

            validation_errors = None
            confidence = 0.65  # Mock extraction always has moderate confidence

            return extraction, validation_errors, confidence

        except Exception as e:
            logger.error(f"Mock extraction failed: {e}")
            return None, [str(e)], 0.0

    async def answer_question(
        self,
        question: str,
        article_title: str,
        article_text: str | None = None,
        chunks: list[Any] | None = None,
        history: list[dict] | None = None,
    ) -> tuple[str, list[dict]]:
        """Mock Q&A — returns a response based on keyword matching in article text."""
        question_lower = question.lower()

        stop_words = {'what', 'when', 'where', 'how', 'which', 'who', 'whom',
                      'the', 'and', 'for', 'are', 'was', 'were', 'does', 'did',
                      'can', 'could', 'would', 'should', 'will', 'shall', 'may',
                      'might', 'has', 'have', 'had', 'its', 'not', 'but', 'or'}
        keywords = [w.strip('?.!,;:()[]{}') for w in question_lower.split()
                    if len(w.strip('?.!,;:()[]{}')) >= 3
                    and w.strip('?.!,;:()[]{}') not in stop_words]

        if chunks:
            searchable_items = []
            for chunk in chunks:
                searchable_items.append((
                    getattr(chunk, "text", ""),
                    {
                        "chunk_id": getattr(chunk, "chunk_index", None),
                        "section_title": getattr(chunk, "section_title", None),
                        "page_start": getattr(chunk, "page_start", None),
                        "page_end": getattr(chunk, "page_end", None),
                    },
                ))
        else:
            searchable_items = [
                (
                    article_text or "",
                    {
                        "chunk_id": 0,
                        "section_title": None,
                        "page_start": None,
                        "page_end": None,
                    },
                )
            ]

        # Search sentences in the full article text or supplied chunks.
        relevant_sentences: list[tuple[str, dict]] = []
        for text, base_citation in searchable_items:
            for sentence in text.split('. '):
                if any(kw in sentence.lower() for kw in keywords):
                    citation = {
                        **base_citation,
                        "snippet": sentence[:200].strip(),
                    }
                    relevant_sentences.append((sentence.strip(), citation))

        if not relevant_sentences:
            return (
                "The provided document does not contain sufficient information to answer this question. "
                "Try rephrasing your question or asking about a different aspect of the article.",
                [],
            )

        top = relevant_sentences[:5]
        citations = [c for _, c in top]
        answer_parts = [f"Based on the article \"{article_title}\", here's what I found:\n"]
        for sentence, citation in top:
            answer_parts.append(f"- {sentence.strip()}")

        return ("\n".join(answer_parts), citations)

    async def stream_answer(
        self,
        question: str,
        article_title: str,
        article_text: str | None = None,
        chunks: list[Any] | None = None,
        history: list[dict] | None = None,
    ):
        """Simulate streaming by yielding mock answer word-by-word."""
        import asyncio
        answer, _ = await self.answer_question(
            question, article_title, article_text, chunks, history=history,
        )
        words = answer.split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            await asyncio.sleep(0.02)  # simulate streaming delay

    async def run_skill(self, skill: Any, article_markdown: str) -> dict:
        """Mock skill execution — extracts relevant section based on skill purpose."""
        skill_name = skill.name if hasattr(skill, 'name') else str(skill)
        purpose = skill.purpose if hasattr(skill, 'purpose') else ""

        sections = self._extract_sections(article_markdown)

        return {
            "skill": skill_name,
            "purpose": purpose,
            "extracted_content": {
                "title": sections.get("title", ""),
                "relevant_sections": {k: v[:500] for k, v in sections.items() if v},
            },
            "note": "Mock skill execution — pattern-based extraction only",
        }

    def _extract_authors(self, text: str) -> list[str]:
        """Extract author names using common patterns."""
        # Look for author-like lines (names with commas, affiliations)
        patterns = [
            r'(?:authors?|by)[:\s]+(.+?)(?:\n|$)',
            r'([A-Z][a-z]+(?:\s+(?:van\s+|de\s+|der\s+)?[A-Z][a-z]+)+(?:,\s*(?:and\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                author_str = match.group(1)
                # Split on commas, "and", etc.
                authors = re.split(r',\s*(?:and\s+)?|\s+and\s+', author_str)
                return [a.strip() for a in authors if len(a.strip()) > 2][:10]
        return []

    def _extract_year(self, text: str) -> int | None:
        """Extract publication year."""
        # Look for years 1900-2099 near the start of the document
        match = re.search(r'\b(19[5-9]\d|20[0-2]\d)\b', text[:2000])
        if match:
            return int(match.group(1))
        return None

    def _extract_doi(self, text: str) -> str | None:
        """Extract DOI."""
        match = re.search(r'(?:doi|DOI)[:\s]*(10\.\d{4,}/[^\s]+)', text)
        if match:
            return match.group(1).rstrip('.')
        return None

    def _extract_arxiv_id(self, text: str) -> str | None:
        """Extract arXiv ID."""
        match = re.search(r'(?:arxiv|arXiv)[:\s]*(\d{4}\.\d{4,}(?:v\d+)?)', text)
        if match:
            return match.group(1)
        return None

    def _extract_sections(self, text: str) -> dict[str, str]:
        """Split text into named sections based on headings."""
        sections = {}
        current_section = "preamble"
        current_content: list[str] = []

        for line in text.split('\n'):
            h_match = re.match(r'^#{1,3}\s+(.+)$', line)
            if h_match:
                # Save previous section
                if current_content:
                    sections[current_section.lower()] = '\n'.join(current_content).strip()
                current_section = h_match.group(1).strip()
                current_content = []
            else:
                current_content.append(line)

        if current_content:
            sections[current_section.lower()] = '\n'.join(current_content).strip()

        return sections

    def _extract_tags(self, text: str) -> list[str]:
        """Extract potential tags from keywords section and title terms."""
        tags = set()

        # Look for keywords section
        kw_match = re.search(r'(?:keywords?|index terms?)[:\s]+(.+?)(?:\n\n|\n#)', text, re.IGNORECASE)
        if kw_match:
            kw_text = kw_match.group(1)
            for kw in re.split(r'[,;]\s*', kw_text):
                kw = kw.strip().lower()
                if 2 < len(kw) < 50:
                    tags.add(kw)

        # Add title terms as tags
        h1 = re.search(r'^#\s+(.+)$', text, re.MULTILINE)
        if h1:
            title_words = [w.lower().strip('.,;:()[]{}') for w in h1.group(1).split()
                          if len(w) > 4 and w.lower() not in {'the', 'and', 'for', 'with', 'from', 'using'}]
            tags.update(title_words[:5])

        return sorted(tags)[:15]

    def _extract_list_items(self, text: str, pattern: str) -> list[str]:
        """Extract list items matching a pattern."""
        items = set()
        for match in re.finditer(pattern, text, re.IGNORECASE):
            item = match.group(1).strip()
            if len(item) > 2:
                items.add(item)
        return list(items)[:10]

    def _extract_metrics(self, text: str) -> list[str]:
        """Extract metric names."""
        common_metrics = {
            'accuracy', 'precision', 'recall', 'f1', 'f1-score', 'bleu', 'rouge',
            'perplexity', 'mae', 'mse', 'rmse', 'auc', 'roc', 'map', 'ndcg',
            'exact match', 'rouge-1', 'rouge-2', 'rouge-l', 'meteor', 'bertscore',
        }
        found = set()
        text_lower = text.lower()
        for metric in common_metrics:
            if metric in text_lower:
                found.add(metric)
        return sorted(found)

    def _build_mock_entities(self, text: str, authors: list[str]) -> list[dict]:
        """Build mock graph entities from extracted terms."""
        entities = []

        # Author entities
        for author in authors[:5]:
            entities.append({
                "type": "Author",
                "name": author,
                "canonical_name": author.lower(),
                "properties": {},
                "evidence": {"source_section": "authors"},
                "confidence": 0.9,
            })

        # Method entities from common method terms
        method_terms = {
            'transformer', 'bert', 'cnn', 'rnn', 'lstm', 'attention',
            'fine-tuning', 'pre-training', 'reinforcement learning',
            'supervised', 'unsupervised', 'semi-supervised',
            'regression', 'classification', 'clustering',
            'neural network', 'deep learning', 'machine learning',
        }
        text_lower = text.lower()
        for term in method_terms:
            if term in text_lower:
                entities.append({
                    "type": "Method",
                    "name": term.title(),
                    "canonical_name": term.lower(),
                    "properties": {},
                    "evidence": {"source_section": "methodology"},
                    "confidence": 0.6,
                })

        return entities[:20]

    def _build_mock_relationships(self, entities: list[dict]) -> list[dict]:
        """Build mock relationships between entities."""
        rels = []
        method_entities = [e for e in entities if e["type"] == "Method"]
        author_entities = [e for e in entities if e["type"] == "Author"]

        for method in method_entities[:3]:
            for author in author_entities[:2]:
                rels.append({
                    "source_name": author["name"],
                    "source_type": "Author",
                    "target_name": method["name"],
                    "target_type": "Method",
                    "type": "USES_METHOD",
                    "properties": {},
                    "evidence": {"source_section": "methodology"},
                    "confidence": 0.5,
                })

        return rels[:10]
