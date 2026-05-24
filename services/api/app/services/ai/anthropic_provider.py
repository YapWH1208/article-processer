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
    get_input_template,
)
from app.core.security import protect_prompt_from_injection
from app.services.ai.openai_provider import _repair_json

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
        super().__init__()
        if not HAS_ANTHROPIC:
            raise RuntimeError(
                "Anthropic SDK not installed. Run: pip install anthropic"
            )
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.anthropic_model
        self._provider_name = "anthropic"

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
        return await self._call_claude(prompt, "extraction", max_tokens=8000)

    async def answer_question(
        self, question: str, article_title: str, article_text: str,
    ) -> tuple[str, list[dict]]:
        protected_text = protect_prompt_from_injection(article_text)

        input_template = get_input_template("chat")
        user_content = input_template.format(
            context_header=f"Article: {article_title}",
            document=protected_text,
            question=question,
        )

        prompt = f"{QA_SYSTEM_PROMPT}\n\n{user_content}"
        answer, _ = await self._call_claude(prompt, "qa")
        citations = self._extract_citations(answer, [])
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

    async def _call_claude(self, prompt: str, task: str, max_tokens: int = 4000) -> tuple[dict | str, float]:
        """Call Claude and parse the response. Returns (parsed_or_text, confidence)."""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=0.1,
                messages=[{"role": "user", "content": prompt}],
            )
            # Capture token usage from Anthropic response
            if hasattr(response, "usage") and response.usage:
                self.last_usage.prompt_tokens += response.usage.input_tokens or 0
                self.last_usage.completion_tokens += response.usage.output_tokens or 0
                total = (response.usage.input_tokens or 0) + (response.usage.output_tokens or 0)
                self.last_usage.total_tokens += total
                self.last_usage.model = self.model
                self.last_usage.provider = self._provider_name

            text = response.content[0].text if response.content else ""

            # Try to parse as JSON with repair
            try:
                return _repair_json(text), 0.85
            except json.JSONDecodeError:
                # Return raw text for QA / skill responses
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
        super().__init__()
        if not HAS_ANTHROPIC:
            raise RuntimeError("Anthropic SDK not installed. Run: pip install anthropic")
        self.client = anthropic.AsyncAnthropic(
            api_key=settings.llm_custom_api_key or "not-needed",
            base_url=settings.llm_custom_base_url.rstrip("/"),
        )
        self.model = settings.llm_custom_model
        self._provider_name = "custom"
