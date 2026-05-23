"""OpenAI LLM and embedding provider implementations."""

import json
import logging
from typing import Any
from openai import AsyncOpenAI
from app.core.config import settings
from app.services.ai.base import BaseLLMProvider, BaseEmbeddingProvider
from app.services.ai.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    EXTRACTION_CORRECTION_PROMPT,
    QA_SYSTEM_PROMPT,
    SKILL_SYSTEM_PROMPT,
)
from app.core.security import protect_prompt_from_injection

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """OpenAI LLM provider for extraction, Q&A, and skill execution."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model

    async def extract_structured(
        self,
        markdown: str,
        article_title: str,
    ) -> tuple[dict | None, list[str] | None, float]:
        """Extract structured information using OpenAI."""
        protected_text = protect_prompt_from_injection(markdown)

        messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": f"Title: {article_title}\n\n{protected_text}"},
        ]

        # First attempt
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=4000,
            )
            raw = response.choices[0].message.content or "{}"
            result = json.loads(raw)

            # Validate and check for errors
            errors = self._validate_extraction(result)
            if errors:
                # Retry with correction prompt
                logger.warning(f"Extraction validation errors: {errors}")
                correction_msg = EXTRACTION_CORRECTION_PROMPT.format(
                    errors=json.dumps(errors),
                    title=article_title,
                )
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user", "content": correction_msg})

                retry_response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=4000,
                )
                retry_raw = retry_response.choices[0].message.content or "{}"
                result = json.loads(retry_raw)
                errors = self._validate_extraction(result)

            confidence = 0.85 if not errors else 0.6
            return result, errors, confidence

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI extraction response: {e}")
            return None, [f"JSON parse error: {str(e)}"], 0.0
        except Exception as e:
            logger.error(f"OpenAI extraction failed: {e}")
            raise

    async def answer_question(
        self,
        question: str,
        article_title: str,
        chunks: list[Any],
    ) -> tuple[str, list[dict]]:
        """Answer a question using retrieved chunks via OpenAI."""
        # Build context from chunks
        chunk_texts = []
        for c in chunks:
            chunk_text = c.text if hasattr(c, 'text') else str(c)
            section = c.section_title if hasattr(c, 'section_title') else None
            page = f"pp. {c.page_start}-{c.page_end}" if hasattr(c, 'page_start') and c.page_start else ""
            chunk_idx = c.chunk_index if hasattr(c, 'chunk_index') else 0
            chunk_texts.append(
                f'[Chunk {chunk_idx}, Section: "{section or "N/A"}", {page}]\n{chunk_text}'
            )

        context = "\n\n---\n\n".join(chunk_texts)
        protected_context = protect_prompt_from_injection(context)

        messages = [
            {"role": "system", "content": QA_SYSTEM_PROMPT},
            {"role": "user", "content": f"Article: {article_title}\n\n{protected_context}\n\nQuestion: {question}"},
        ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=1500,
            )
            answer = response.choices[0].message.content or ""

            # Extract citations from chunk references in answer
            citations = self._extract_citations(answer, chunks)

            return answer, citations

        except Exception as e:
            logger.error(f"OpenAI Q&A failed: {e}")
            raise

    async def run_skill(self, skill: Any, article_markdown: str) -> dict:
        """Run a skill using OpenAI."""
        protected_text = protect_prompt_from_injection(article_markdown)

        output_schema = skill.output_schema if hasattr(skill, 'output_schema') else "{}"
        prompt = SKILL_SYSTEM_PROMPT.format(
            skill_name=skill.name if hasattr(skill, 'name') else "unknown",
            skill_purpose=skill.purpose if hasattr(skill, 'purpose') else "",
            skill_instructions=skill.prompt_instructions if hasattr(skill, 'prompt_instructions') else "",
            output_schema=output_schema,
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": protected_text},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=2000,
            )
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)
        except Exception as e:
            logger.error(f"OpenAI skill execution failed: {e}")
            return {"error": str(e), "skill": skill.name if hasattr(skill, 'name') else "unknown"}

    def _validate_extraction(self, data: dict) -> list[str]:
        """Validate extraction against expected schema."""
        errors = []

        # Check required top-level keys
        expected_keys = {
            "title", "authors", "year", "venue", "doi", "arxiv_id", "url",
            "abstract", "background", "research_problem", "methodology",
            "datasets", "experiments", "metrics", "results", "limitations",
            "future_work", "key_claims", "references", "tags",
            "graph_entities", "graph_relationships",
        }
        missing = expected_keys - set(data.keys())
        if missing:
            errors.append(f"Missing fields: {', '.join(sorted(missing))}")

        # Validate types
        if "authors" in data and not isinstance(data["authors"], list):
            errors.append("'authors' must be an array")

        if "datasets" in data and not isinstance(data["datasets"], list):
            errors.append("'datasets' must be an array")

        if "key_claims" in data and isinstance(data["key_claims"], list):
            for i, claim in enumerate(data["key_claims"]):
                if not isinstance(claim, dict):
                    errors.append(f"key_claims[{i}] must be an object")
                elif "claim" not in claim:
                    errors.append(f"key_claims[{i}] missing 'claim'")

        # Validate entity types
        allowed_entities = {
            "Article", "Author", "Institution", "Method", "Dataset",
            "Experiment", "Metric", "Result", "Claim", "Task", "Domain",
            "Tool", "Model", "Citation", "Keyword",
        }
        if "graph_entities" in data and isinstance(data["graph_entities"], list):
            for i, e in enumerate(data["graph_entities"]):
                if isinstance(e, dict) and e.get("type") not in allowed_entities:
                    errors.append(f"graph_entities[{i}] has invalid type: {e.get('type')}")

        # Validate relationship types
        allowed_rels = {
            "USES_METHOD", "EVALUATES_ON", "REPORTS_RESULT", "USES_METRIC",
            "CITES", "SUPPORTED_BY", "ADDRESSES_TASK", "IMPROVES_ON",
            "HAS_LIMITATION", "HAS_KEYWORD",
        }
        if "graph_relationships" in data and isinstance(data["graph_relationships"], list):
            for i, r in enumerate(data["graph_relationships"]):
                if isinstance(r, dict) and r.get("type") not in allowed_rels:
                    errors.append(f"graph_relationships[{i}] has invalid type: {r.get('type')}")

        return errors

    def _extract_citations(self, answer: str, chunks: list[Any]) -> list[dict]:
        """Extract citation references from the answer text."""
        import re
        citations = []
        seen = set()

        # Match [Chunk N, Section: "...", ...] patterns
        pattern = re.compile(
            r'\[Chunk\s+(\d+),\s*Section:\s*"([^"]*)",?\s*(?:Page:\s*(\d+)(?:-(\d+))?)?\]'
        )
        for match in pattern.finditer(answer):
            chunk_id = int(match.group(1))
            section = match.group(2)

            if chunk_id not in seen:
                seen.add(chunk_id)
                # Find matching chunk
                chunk = None
                for c in chunks:
                    cid = c.chunk_index if hasattr(c, 'chunk_index') else 0
                    if cid == chunk_id:
                        chunk = c
                        break

                citations.append({
                    "chunk_id": chunk_id,
                    "section_title": section,
                    "page_start": chunk.page_start if chunk and hasattr(chunk, 'page_start') else None,
                    "page_end": chunk.page_end if chunk and hasattr(chunk, 'page_end') else None,
                    "snippet": chunk.text[:200] if chunk and hasattr(chunk, 'text') else None,
                })

        return citations


class CustomOpenAIProvider(OpenAIProvider):
    """OpenAI-compatible provider pointed at a custom endpoint.

    Uses ``llm_custom_base_url``, ``llm_custom_api_key``, ``llm_custom_model``
    by default, but can be constructed with explicit parameters for preset providers.
    """

    def __init__(self, base_url: str = "", api_key: str = "", model: str = ""):
        effective_url = base_url or settings.llm_custom_base_url
        effective_key = api_key or settings.llm_custom_api_key or "not-needed"
        effective_model = model or settings.llm_custom_model

        normalized = _normalize_openai_base_url(effective_url) if effective_url else "http://localhost:11434/v1"
        self.client = AsyncOpenAI(
            api_key=effective_key,
            base_url=normalized,
        )
        self.model = effective_model


def _normalize_openai_base_url(raw: str) -> str:
    """Ensure the base URL has a ``/v1`` path segment.

    OpenAI-compatible servers (LM Studio, Ollama, vLLM, etc.) expect requests
    at ``{base}/v1/embeddings``, but users often set the base to just
    ``http://localhost:1234``.  This auto-appends ``/v1`` when missing.
    """
    url = raw.rstrip("/")
    if not url:
        return url  # caller should handle empty
    # Already ends with /v1 — nothing to do
    if url.endswith("/v1"):
        return url
    # Append /v1
    return url + "/v1"


class CustomEmbeddingProvider(BaseEmbeddingProvider):
    """Embedding provider pointed at a custom OpenAI-compatible endpoint.

    Uses ``embedding_custom_base_url``, ``embedding_custom_api_key``,
    ``embedding_custom_model``.

    The base URL is auto-normalised: ``http://localhost:1234`` becomes
    ``http://localhost:1234/v1`` so it works out-of-the-box with
    LM Studio, Ollama, vLLM, and any other OpenAI-compatible server.
    """

    def __init__(self):
        raw_url = settings.embedding_custom_base_url
        normalized = _normalize_openai_base_url(raw_url) if raw_url else ""
        self.client = AsyncOpenAI(
            api_key=settings.embedding_custom_api_key or "not-needed",
            base_url=normalized,
        )
        self.model = settings.embedding_custom_model or "text-embedding-3-small"

    async def embed(self, text: str) -> list[float]:
        try:
            response = await self.client.embeddings.create(
                model=self.model, input=text[:8000],
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Custom embedding failed: {e}")
            raise

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        try:
            truncated = [t[:8000] for t in texts]
            response = await self.client.embeddings.create(
                model=self.model, input=truncated,
            )
            return [d.embedding for d in response.data]
        except Exception as e:
            logger.error(f"Custom batch embedding failed: {e}")
            raise


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """OpenAI embedding provider."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_embedding_model

    async def embed(self, text: str) -> list[float]:
        try:
            response = await self.client.embeddings.create(
                model=self.model,
                input=text[:8000],  # Truncate to token limit
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"OpenAI embedding failed: {e}")
            raise

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        try:
            truncated = [t[:8000] for t in texts]
            response = await self.client.embeddings.create(
                model=self.model,
                input=truncated,
            )
            return [d.embedding for d in response.data]
        except Exception as e:
            logger.error(f"OpenAI batch embedding failed: {e}")
            raise
