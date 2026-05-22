"""RAG service — retrieves relevant chunks and generates cited answers."""

import json
import logging
import math
from typing import Any

logger = logging.getLogger(__name__)


class RagService:
    """Retrieval-Augmented Generation service for article Q&A."""

    def retrieve(
        self,
        query: str,
        chunks: list[Any],
        top_k: int = 5,
    ) -> list[Any]:
        """Retrieve the most relevant chunks for a query.

        Uses cosine similarity between query embedding and chunk embeddings.
        Falls back to keyword matching if embeddings are unavailable.
        """
        from app.services.ai.base import get_embedding_provider

        # Check if chunks have embeddings
        chunks_with_embeddings = []
        for c in chunks:
            emb_json = c.embedding_json if hasattr(c, 'embedding_json') else None
            if emb_json:
                try:
                    embedding = json.loads(emb_json)
                    chunks_with_embeddings.append((c, embedding))
                except (json.JSONDecodeError, TypeError):
                    pass

        if chunks_with_embeddings:
            return self._retrieve_by_embedding(query, chunks_with_embeddings, top_k)
        else:
            return self._retrieve_by_keyword(query, chunks, top_k)

    def _retrieve_by_embedding(
        self,
        query: str,
        chunks_with_embeddings: list[tuple[Any, list[float]]],
        top_k: int,
    ) -> list[Any]:
        """Retrieve using cosine similarity."""
        import asyncio
        from app.services.ai.base import get_embedding_provider

        provider = get_embedding_provider()

        # Generate query embedding
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're in an async context, create a new event loop
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(asyncio.run, provider.embed(query))
                    query_emb = future.result(timeout=30)
            else:
                query_emb = loop.run_until_complete(provider.embed(query))
        except RuntimeError:
            query_emb = asyncio.run(provider.embed(query))

        # Compute cosine similarities
        scored = []
        for chunk, emb in chunks_with_embeddings:
            sim = self._cosine_similarity(query_emb, emb)
            scored.append((sim, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k]]

    def _retrieve_by_keyword(
        self,
        query: str,
        chunks: list[Any],
        top_k: int,
    ) -> list[Any]:
        """Fallback keyword-based retrieval."""
        query_terms = set(query.lower().split())
        # Filter out very short terms
        query_terms = {t for t in query_terms if len(t) > 2}

        if not query_terms:
            return chunks[:top_k]

        scored = []
        for chunk in chunks:
            text = chunk.text.lower() if hasattr(chunk, 'text') else str(chunk).lower()
            score = sum(1 for term in query_terms if term in text)
            scored.append((score, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k] if _[0] > 0] or chunks[:top_k]

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if len(a) != len(b):
            # Pad the shorter one
            max_len = max(len(a), len(b))
            a = a + [0.0] * (max_len - len(a))
            b = b + [0.0] * (max_len - len(b))

        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot / (norm_a * norm_b)
