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
    get_input_template,
    get_system_message,
)
from app.core.security import protect_prompt_from_injection
from app.services.ai.extraction import ExtractionService
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

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        provider_name: str = "anthropic",
    ):
        super().__init__()
        if not HAS_ANTHROPIC:
            raise RuntimeError(
                "Anthropic SDK not installed. Run: pip install anthropic"
            )
        self.client = anthropic.AsyncAnthropic(api_key=api_key or settings.anthropic_api_key)
        self.model = model or settings.anthropic_model
        self._provider_name = provider_name

    async def extract_structured(
        self, markdown: str, article_title: str, output_language: str = "en",
    ) -> tuple[dict | None, list[str] | None, float]:
        protected_text = protect_prompt_from_injection(markdown)
        prompt = (
            f"{get_system_message('extraction', output_language=output_language)}\n\n"
            f"Title: {article_title}\n\n"
            f"{protected_text}\n\n"
            f"Respond with a JSON object only, no other text."
        )
        try:
            parsed, _ = await self._call_claude(prompt, "extraction", max_tokens=8000)
        except Exception as e:
            return None, [f"Provider error: {e}"], 0.0
        if not isinstance(parsed, dict):
            return None, ["JSON parse error"], 0.0

        result = ExtractionService.normalize_extraction(parsed, article_title=article_title)
        errors = ExtractionService.validate_schema(result)
        return result, (errors or None), 0.85 if not errors else 0.6

    async def answer_question(
        self,
        question: str,
        article_title: str,
        article_text: str | None = None,
        chunks: list[Any] | None = None,
        history: list[dict] | None = None,
        output_language: str = "en",
    ) -> tuple[str, list[dict]]:
        """Answer a question with optional conversation history.

        When ``history`` is provided, prior turns are injected between the
        system prompt and the current user message.
        """
        if chunks:
            article_text = "\n\n---\n\n".join(
                self._format_chunk_for_context(chunk)
                for chunk in chunks
            )
        protected_text = protect_prompt_from_injection(article_text or "")

        input_template = get_input_template("chat")
        user_content = input_template.format(
            context_header=f"Article: {article_title}",
            document=protected_text,
            question=question,
        )

        # Build conversation with history
        parts = [f"{get_system_message('chat', output_language=output_language)}\n\n"]
        for msg in self._truncate_history(history):
            role = msg.get("role", "user")
            content = msg.get("content", "")
            parts.append(f"[{role.upper()}]\n{content}\n\n")
        parts.append(f"[USER]\n{user_content}")

        prompt = "".join(parts)
        answer, _ = await self._call_claude(prompt, "qa")
        citations = self._extract_citations(answer, chunks or [])
        return answer, citations

    async def run_skill(self, skill: Any, article_markdown: str, output_language: str = "en") -> dict:
        protected_text = protect_prompt_from_injection(article_markdown)
        output_schema = skill.output_schema if hasattr(skill, 'output_schema') else "{}"
        prompt = get_system_message("skill_default", output_language=output_language).format(
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
            raise

    @staticmethod
    def _extract_citations(answer: str, chunks: list[Any]) -> list[dict]:
        import re
        citations = []
        seen = set()
        pattern = re.compile(
            r'\[Chunk\s+(\d+),\s*Section:\s*"([^"]*)"[^\]]*\]'
        )
        for match in pattern.finditer(answer):
            chunk_id = int(match.group(1))
            if chunk_id not in seen:
                seen.add(chunk_id)
                chunk = next((c for c in chunks if getattr(c, 'chunk_index', 0) == chunk_id), None)
                header = match.group(0)
                page_match = re.search(r'Page:\s*(\d+)(?:-(\d+))?', header)
                page_start = chunk.page_start if chunk and hasattr(chunk, 'page_start') else None
                page_end = chunk.page_end if chunk and hasattr(chunk, 'page_end') else None
                if page_start is None and page_match:
                    page_start = int(page_match.group(1))
                    page_end = int(page_match.group(2)) if page_match.group(2) else page_start

                citation = {
                    "chunk_id": chunk_id,
                    "section_title": match.group(2),
                    "page_start": page_start,
                    "page_end": page_end,
                    "snippet": chunk.text[:200] if chunk and hasattr(chunk, 'text') else None,
                }
                if chunk and hasattr(chunk, "article_id"):
                    citation["article_id"] = chunk.article_id
                if chunk and hasattr(chunk, "article_title"):
                    citation["article_title"] = chunk.article_title
                citations.append(citation)
        return citations

    @staticmethod
    def _format_chunk_for_context(chunk: Any) -> str:
        text = chunk.text if hasattr(chunk, 'text') else str(chunk)
        section = chunk.section_title if hasattr(chunk, 'section_title') else None
        article = (
            f', Article: "{chunk.article_title}" (ID: {chunk.article_id})'
            if hasattr(chunk, "article_title") and hasattr(chunk, "article_id")
            else ""
        )
        page = (
            f', Page: {chunk.page_start}-{chunk.page_end}'
            if hasattr(chunk, 'page_start') and chunk.page_start
            else ""
        )
        idx = chunk.chunk_index if hasattr(chunk, 'chunk_index') else 0
        return f'[Chunk {idx}, Section: "{section or "N/A"}"{article}{page}]\n{text}'


class CustomAnthropicProvider(AnthropicProvider):
    """Anthropic-compatible provider at a custom endpoint.

    Uses ``llm_custom_base_url``, ``llm_custom_api_key``, ``llm_custom_model``.
    """

    def __init__(
        self,
        api_key: str = "",
        base_url: str = "",
        model: str = "",
        provider_name: str = "custom",
    ):
        BaseLLMProvider.__init__(self)
        if not HAS_ANTHROPIC:
            raise RuntimeError("Anthropic SDK not installed. Run: pip install anthropic")
        self.client = anthropic.AsyncAnthropic(
            api_key=api_key or settings.llm_custom_api_key or "not-needed",
            base_url=(base_url or settings.llm_custom_base_url).rstrip("/"),
        )
        self.model = model or settings.llm_custom_model
        self._provider_name = provider_name
