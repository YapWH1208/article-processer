"""OpenAI LLM provider implementation."""

import json
import logging
import re
from typing import Any
from openai import AsyncOpenAI
from app.core.config import settings
from app.services.ai.base import BaseLLMProvider
from app.services.ai.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    EXTRACTION_CORRECTION_PROMPT,
    QA_SYSTEM_PROMPT,
    SKILL_SYSTEM_PROMPT,
    get_input_template,
)
from app.services.ai.extraction import ExtractionService
from app.core.security import protect_prompt_from_injection

logger = logging.getLogger(__name__)

_EMPTY_RESPONSE_SENTINEL = "empty_response"


def _repair_json(raw: str) -> dict:
    """Attempt to repair common JSON malformations from LLM output.

    Handles: unterminated strings, missing closing braces, trailing commas.
    Returns a dict on success; raises json.JSONDecodeError if irreparable.
    """
    if not raw or not raw.strip():
        raise json.JSONDecodeError("Empty response", raw, 0)

    # 1. Strip markdown code fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)

    # 2. Try parsing as-is
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 3. Unterminated string — close the last string + any unclosed structures
    #    Find the last unescaped quote and close it
    repaired = cleaned
    in_string = False
    escape_next = False
    for i, ch in enumerate(repaired):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\":
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
    if in_string:
        repaired = repaired + '"'

    # 4. Close any unclosed braces/brackets
    open_stack: list[str] = []
    in_str = False
    esc = False
    for ch in repaired:
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in "{[":
            open_stack.append(ch)
        elif ch in "}]":
            if open_stack and (
                (ch == "}" and open_stack[-1] == "{") or
                (ch == "]" and open_stack[-1] == "[")
            ):
                open_stack.pop()

    for opener in reversed(open_stack):
        closer = "}" if opener == "{" else "]"
        repaired = repaired + closer

    # 5. Remove trailing commas before closing braces/brackets
    repaired = re.sub(r",(\s*[}\]])", r"\1", repaired)

    # 6. Try parsing repaired version
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # 7. Last resort: extract the first complete JSON object
    depth = 0
    start = repaired.find("{")
    if start != -1:
        for i in range(start, len(repaired)):
            ch = repaired[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(repaired[start:i + 1])
                    except json.JSONDecodeError:
                        break

    raise json.JSONDecodeError("Irreparable JSON", repaired, 0)


class OpenAIProvider(BaseLLMProvider):
    """OpenAI LLM provider for extraction, Q&A, and skill execution."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        provider_name: str = "openai",
    ):
        super().__init__()
        self.client = AsyncOpenAI(api_key=api_key or settings.openai_api_key)
        self.model = model or settings.openai_model
        self._provider_name = provider_name

    async def extract_structured(
        self,
        markdown: str,
        article_title: str,
    ) -> tuple[dict | None, list[str] | None, float]:
        """Extract structured information using OpenAI-compatible API.

        Tries JSON mode first; falls back to plain prompting if the model
        doesn't support ``response_format``.  Uses ``_repair_json`` to
        salvage malformed output from smaller / cheaper models.
        """
        protected_text = protect_prompt_from_injection(markdown)

        messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": f"Title: {article_title}\n\n{protected_text}"},
        ]

        result, errors = await self._extract_with(
            messages,
            use_json_mode=True,
            article_title=article_title,
        )

        # If JSON mode was rejected by the API, retry without it
        if result is None and errors == ["json_mode_unsupported"]:
            logger.info("Model rejected response_format — retrying without JSON mode")
            result, errors = await self._extract_with(
                messages,
                use_json_mode=False,
                article_title=article_title,
            )

        # DeepSeek documents occasional empty content from JSON Output. Retry
        # once without response_format before surfacing the provider failure.
        if result is None and errors == [_EMPTY_RESPONSE_SENTINEL]:
            logger.info("Model returned empty JSON-mode extraction response; retrying without JSON mode")
            result, errors = await self._extract_with(
                messages,
                use_json_mode=False,
                article_title=article_title,
            )
            if result is None and errors == [_EMPTY_RESPONSE_SENTINEL]:
                errors = ["model returned empty response"]

        confidence = 0.85 if not errors else (0.6 if result else 0.0)
        return result, errors, confidence

    async def _extract_with(
        self,
        messages: list,
        use_json_mode: bool,
        article_title: str,
    ) -> tuple[dict | None, list[str] | None]:
        """Run extraction + optional correction retry.  Returns (parsed, errors)."""
        kwargs: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 8000,
        }
        if use_json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self.client.chat.completions.create(**kwargs)
        except Exception as e:
            err = str(e).lower()
            if "response_format" in err or "json_object" in err:
                return None, ["json_mode_unsupported"]
            logger.error(f"Extraction API call failed: {e}")
            return None, [str(e)]

        # Capture usage from first call
        self._capture_usage(response)

        choice = response.choices[0]
        raw = choice.message.content or ""
        if not raw.strip():
            self._log_empty_response(response, use_json_mode)
            return None, [_EMPTY_RESPONSE_SENTINEL]

        # Parse (with repair) + validate
        try:
            result = ExtractionService.normalize_extraction(
                _repair_json(raw),
                article_title=article_title,
            )
        except json.JSONDecodeError:
            logger.error(f"Failed to parse extraction response (after repair): raw len={len(raw)}")
            return None, ["JSON parse error"]

        errors = self._validate_extraction(result)
        if not errors:
            return result, None

        # Validation errors → retry once with correction
        logger.warning(f"Extraction validation errors: {errors}")
        correction_msg = EXTRACTION_CORRECTION_PROMPT.format(
            errors=json.dumps(errors),
            title="(see above)",
        )
        retry_kwargs = dict(kwargs)
        retry_kwargs["messages"] = messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": correction_msg},
        ]

        try:
            retry_response = await self.client.chat.completions.create(**retry_kwargs)
            self._capture_usage(retry_response)
            retry_raw = retry_response.choices[0].message.content or ""
            result = ExtractionService.normalize_extraction(
                _repair_json(retry_raw),
                article_title=article_title,
            )
            errors = self._validate_extraction(result)
        except Exception as e:
            logger.error(f"Extraction correction retry failed: {e}")

        return result, errors

    def _log_empty_response(self, response: Any, use_json_mode: bool) -> None:
        """Log non-sensitive diagnostics for empty provider responses."""
        choice = response.choices[0] if getattr(response, "choices", None) else None
        finish_reason = getattr(choice, "finish_reason", None)
        response_model = getattr(response, "model", self.model)
        usage = getattr(response, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        logger.warning(
            "Extraction response was empty: model=%s json_mode=%s finish_reason=%s "
            "prompt_tokens=%s completion_tokens=%s",
            response_model,
            use_json_mode,
            finish_reason,
            prompt_tokens,
            completion_tokens,
        )

    def _capture_usage(self, response: Any) -> None:
        """Accumulate token usage from an OpenAI chat completion response."""
        if hasattr(response, "usage") and response.usage:
            self.last_usage.prompt_tokens += response.usage.prompt_tokens or 0
            self.last_usage.completion_tokens += response.usage.completion_tokens or 0
            self.last_usage.total_tokens += response.usage.total_tokens or 0
            self.last_usage.model = self.model
            self.last_usage.provider = self._provider_name

    async def answer_question(
        self,
        question: str,
        article_title: str,
        article_text: str | None = None,
        chunks: list[Any] | None = None,
    ) -> tuple[str, list[dict]]:
        """Answer a question using the full article text via OpenAI."""
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

        messages = [
            {"role": "system", "content": QA_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=1500,
            )
            self._capture_usage(response)
            answer = response.choices[0].message.content or ""

            # Extract citations from section references in answer
            citations = self._extract_citations(answer, chunks or [])

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
            self._capture_usage(response)
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)
        except Exception as e:
            logger.error(f"OpenAI skill execution failed: {e}")
            return {"error": str(e), "skill": skill.name if hasattr(skill, 'name') else "unknown"}

    def _validate_extraction(self, data: dict) -> list[str]:
        """Validate extraction against expected schema."""
        return ExtractionService.validate_schema(data)

    @staticmethod
    def _format_chunk_for_context(chunk: Any) -> str:
        text = chunk.text if hasattr(chunk, "text") else str(chunk)
        section = chunk.section_title if hasattr(chunk, "section_title") else None
        chunk_idx = chunk.chunk_index if hasattr(chunk, "chunk_index") else 0
        page = (
            f', Page: {chunk.page_start}-{chunk.page_end}'
            if hasattr(chunk, "page_start") and chunk.page_start
            else ""
        )
        return f'[Chunk {chunk_idx}, Section: "{section or "N/A"}"{page}]\n{text}'

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

    def __init__(
        self,
        base_url: str = "",
        api_key: str = "",
        model: str = "",
        provider_name: str = "custom",
    ):
        BaseLLMProvider.__init__(self)
        effective_url = base_url or settings.llm_custom_base_url
        effective_key = api_key or settings.llm_custom_api_key or "not-needed"
        effective_model = model or settings.llm_custom_model

        normalized = _normalize_openai_base_url(effective_url) if effective_url else "http://localhost:11434/v1"
        self.client = AsyncOpenAI(
            api_key=effective_key,
            base_url=normalized,
        )
        self.model = effective_model
        self._provider_name = provider_name


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
