"""Anthropic LLM provider — Claude models + custom Anthropic-compatible endpoints.

Installation (optional):
    pip install anthropic
"""

import json
import logging
from typing import Any

from app.core.config import settings
from app.services.ai.base import BaseLLMProvider
from app.services.ai.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    QA_SYSTEM_PROMPT,
    SKILL_SYSTEM_PROMPT,
)
from app.core.security import protect_prompt_from_injection

logger = logging.getLogger(__name__)

# Optional Anthropic SDK
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    anthropic = None  # type: ignore


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider via official SDK."""

    def __init__(self):
        if not HAS_ANTHROPIC:
            raise RuntimeError(
                "Anthropic SDK not installed. Run: pip install anthropic"
            )
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.anthropic_model

    async def extract_structured(
        self, markdown: str, article_title: str,
    ) -> tuple[dict | None, list[str] | None, float]:
        protected_text = protect_prompt_from_injection(markdown)
        prompt = (
            f"{EXTRACTION_SYSTEM_PROMPT}\n\n"
            f"Title: {article_title}\n\n"
            f"{protected_text}\n\n"
            f"Respond with a JSON object only, no other text."
        )
        return await self._call_claude(prompt, "extraction")

    async def answer_question(
        self, question: str, article_title: str, chunks: list[Any],
    ) -> tuple[str, list[dict]]:
        chunk_texts = []
        for c in chunks:
            text = c.text if hasattr(c, 'text') else str(c)
            section = c.section_title if hasattr(c, 'section_title') else None
            page = f"pp. {c.page_start}-{c.page_end}" if hasattr(c, 'page_start') and c.page_start else ""
            idx = c.chunk_index if hasattr(c, 'chunk_index') else 0
            chunk_texts.append(f'[Chunk {idx}, Section: "{section or "N/A"}", {page}]\n{text}')

        context = "\n\n---\n\n".join(chunk_texts)
        protected_context = protect_prompt_from_injection(context)

        prompt = (
            f"{QA_SYSTEM_PROMPT}\n\n"
            f"Article: {article_title}\n\n{protected_context}\n\n"
            f"Question: {question}"
        )
        answer, _ = await self._call_claude(prompt, "qa")
        citations = self._extract_citations(answer, chunks)
        return answer, citations

    async def run_skill(self, skill: Any, article_markdown: str) -> dict:
        protected_text = protect_prompt_from_injection(article_markdown)
        output_schema = skill.output_schema if hasattr(skill, 'output_schema') else "{}"
        prompt = SKILL_SYSTEM_PROMPT.format(
            skill_name=skill.name if hasattr(skill, 'name') else "unknown",
            skill_purpose=skill.purpose if hasattr(skill, 'purpose') else "",
            skill_instructions=skill.prompt_instructions if hasattr(skill, 'prompt_instructions') else "",
            output_schema=output_schema,
        )
        user_prompt = f"{prompt}\n\n{protected_text}\n\nRespond with a JSON object only."
        result, _ = await self._call_claude(user_prompt, "skill")
        return result

    # ── Internal ───────────────────────────────────────────────────────

    async def _call_claude(self, prompt: str, task: str) -> tuple[dict | str, float]:
        """Call Claude and parse the response. Returns (parsed_or_text, confidence)."""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                temperature=0.1,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text if response.content else ""

            # Try to parse as JSON
            try:
                # Claude may wrap in ```json ... ``` blocks
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0].strip()
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0].strip()
                return json.loads(text), 0.85
            except (json.JSONDecodeError, IndexError):
                # Return raw text for QA responses
                return text, 0.7

        except Exception as e:
            logger.error(f"Anthropic {task} failed: {e}")
            if task == "extraction":
                return None, 0.0
            raise

    @staticmethod
    def _extract_citations(answer: str, chunks: list[Any]) -> list[dict]:
        import re
        citations = []
        seen = set()
        pattern = re.compile(
            r'\[Chunk\s+(\d+),\s*Section:\s*"([^"]*)",?\s*(?:Page:\s*(\d+)(?:-(\d+))?)?\]'
        )
        for match in pattern.finditer(answer):
            chunk_id = int(match.group(1))
            if chunk_id not in seen:
                seen.add(chunk_id)
                chunk = next((c for c in chunks if getattr(c, 'chunk_index', 0) == chunk_id), None)
                citations.append({
                    "chunk_id": chunk_id,
                    "section_title": match.group(2),
                    "page_start": chunk.page_start if chunk and hasattr(chunk, 'page_start') else None,
                    "page_end": chunk.page_end if chunk and hasattr(chunk, 'page_end') else None,
                    "snippet": chunk.text[:200] if chunk and hasattr(chunk, 'text') else None,
                })
        return citations


class CustomAnthropicProvider(AnthropicProvider):
    """Anthropic-compatible provider at a custom endpoint.

    Uses ``llm_custom_base_url``, ``llm_custom_api_key``, ``llm_custom_model``.
    """

    def __init__(self):
        if not HAS_ANTHROPIC:
            raise RuntimeError("Anthropic SDK not installed. Run: pip install anthropic")
        self.client = anthropic.AsyncAnthropic(
            api_key=settings.llm_custom_api_key or "not-needed",
            base_url=settings.llm_custom_base_url.rstrip("/"),
        )
        self.model = settings.llm_custom_model
