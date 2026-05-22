"""Embeddings service — generates and stores embeddings for chunks."""

import json
import logging
from typing import Any
from app.services.ai.base import get_embedding_provider

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for generating and caching embeddings."""

    def __init__(self):
        self.provider = get_embedding_provider()

    async def embed_chunks(self, chunks: list[Any]) -> None:
        """Generate and store embeddings for a list of chunks."""
        texts = [c.text if hasattr(c, 'text') else str(c) for c in chunks]
        embeddings = await self.provider.embed_batch(texts)

        for chunk, embedding in zip(chunks, embeddings):
            if hasattr(chunk, 'embedding_json'):
                chunk.embedding_json = json.dumps(embedding)

        logger.info(f"Generated embeddings for {len(chunks)} chunks")
