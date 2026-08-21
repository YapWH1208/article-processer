"""OpenAI Responses API provider implementation."""

import json
import logging
from typing import Any
from openai import AsyncOpenAI
from app.core.config import settings
from app.services.ai.base import BaseLLMProvider
from app.services.ai.openai_provider import (
    _EMPTY_RESPONSE_SENTINEL,
    OpenAIProvider,
    _normalize_openai_base_url,
    _repair_json,
)
from app.services.ai.prompts import (
    EXTRACTION_CORRECTION_PROMPT,
    get_input_template,
    get_system_message,
)
from app.services.ai.extraction import ExtractionService
from app.core.security import protect_prompt_from_injection

logger = logging.getLogger(__name__)

_JSON_MODE_ERROR_MARKERS = ("response_format", "json_object", "text.format")


def _is_json_mode_rejection(error: Exception) -> bool:
    """Return True when an API error indicates JSON mode is unsupported."""
    err = str(error).lower()
    return any(marker in err for marker in _JSON_MODE_ERROR_MARKERS)


class ResponsesAPIProvider(OpenAIProvider):
    """LLM provider that speaks the OpenAI Responses API.

    Talks to ``{base}/responses`` via ``client.responses.create`` with
    input message lists.  JSON mode is requested through the ``text`` format
    ``json_object`` with a plain-prompt fallback when the endpoint rejects it.
    """

    def __init__(
        self,
        base_url: str = "",
        api_key: str = "",
        model: str = "",
        provider_name: str = "responses",
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

    async def _create(
        self,
        *,
        input: list,
        temperature: float,
        max_output_tokens: int,
        json_mode: bool,
    ):
        """Create a Responses API completion with optional JSON mode."""
        kwargs: dict = dict(
            model=self.model,
            input=input,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        if json_mode:
            kwargs["text"] = {"format": {"type": "json_object"}}
        return await self.client.responses.create(**kwargs)

    def _capture_usage(self, response: Any) -> None:
        """Accumulate token usage from an OpenAI Responses API response."""
        if hasattr(response, "usage") and response.usage:
            input_tokens = getattr(response.usage, "input_tokens", 0) or 0
            output_tokens = getattr(response.usage, "output_tokens", 0) or 0
            total_tokens = getattr(response.usage, "total_tokens", None)
            if total_tokens is None:
                total_tokens = input_tokens + output_tokens
            self.last_usage.prompt_tokens += input_tokens
            self.last_usage.completion_tokens += output_tokens
            self.last_usage.total_tokens += total_tokens
            self.last_usage.model = self.model
            self.last_usage.provider = self._provider_name

    async def extract_structured(
        self,
        markdown: str,
        article_title: str,
        output_language: str = "en",
    ) -> tuple[dict | None, list[str] | None, float]:
        """Extract structured information using the Responses API.

        Tries JSON mode first; falls back to plain prompting if the endpoint
        doesn't support the ``text`` format parameter.  Uses ``_repair_json``
        to salvage malformed output from smaller / cheaper models.
        """
        protected_text = protect_prompt_from_injection(markdown)
        system_prompt = get_system_message("extraction", output_language=output_language)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Title: {article_title}\n\n{protected_text}"},
        ]

        result, errors = await self._extract_with(
            messages,
            use_json_mode=True,
            article_title=article_title,
        )

        # If JSON mode was rejected by the API, retry without it
        if result is None and errors == ["json_mode_unsupported"]:
            logger.info("Model rejected text format — retrying without JSON mode")
            result, errors = await self._extract_with(
                messages,
                use_json_mode=False,
                article_title=article_title,
            )

        # Some endpoints return an empty body in JSON mode. Retry once
        # without the text format before surfacing the provider failure.
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
        input_messages: list,
        use_json_mode: bool,
        article_title: str,
    ) -> tuple[dict | None, list[str] | None]:
        """Run extraction + optional correction retry.  Returns (parsed, errors)."""
        try:
            response = await self._create(
                input=input_messages,
                temperature=0.1,
                max_output_tokens=8000,
                json_mode=use_json_mode,
            )
        except Exception as e:
            if _is_json_mode_rejection(e):
                return None, ["json_mode_unsupported"]
            logger.error(f"Extraction API call failed: {e}")
            return None, [str(e)]

        # Capture usage from first call
        self._capture_usage(response)

        raw = getattr(response, "output_text", "") or ""
        if not raw.strip():
            usage = getattr(response, "usage", None)
            logger.warning(
                "Extraction response was empty: model=%s json_mode=%s "
                "prompt_tokens=%s completion_tokens=%s",
                getattr(response, "model", self.model),
                use_json_mode,
                getattr(usage, "input_tokens", None) if usage else None,
                getattr(usage, "output_tokens", None) if usage else None,
            )
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
        retry_messages = input_messages + [
            {"role": "assistant", "content": raw},
            {"role": "user", "content": correction_msg},
        ]

        try:
            retry_response = await self._create(
                input=retry_messages,
                temperature=0.1,
                max_output_tokens=8000,
                json_mode=use_json_mode,
            )
            self._capture_usage(retry_response)
            retry_raw = getattr(retry_response, "output_text", "") or ""
            result = ExtractionService.normalize_extraction(
                _repair_json(retry_raw),
                article_title=article_title,
            )
            errors = self._validate_extraction(result)
        except Exception as e:
            logger.error(f"Extraction correction retry failed: {e}")

        return result, errors

    async def generate_deep_report(
        self,
        markdown: str,
        article_title: str,
        extraction: dict | None,
        output_language: str = "en",
    ) -> tuple[dict | None, list[str] | None, float]:
        """Generate a comprehensive Deep Analysis report (JSON output)."""
        protected_text = protect_prompt_from_injection(markdown)
        input_template = get_input_template("deep_report")
        user_content = input_template.format(
            title=article_title,
            document=protected_text,
            extraction=json.dumps(extraction, ensure_ascii=False)
            if extraction is not None
            else "No structured extraction available.",
        )
        messages = [
            {"role": "system", "content": get_system_message("deep_report", output_language=output_language)},
            {"role": "user", "content": user_content},
        ]

        result, errors = None, None
        for use_json_mode in (True, False):
            try:
                response = await self._create(
                    input=messages,
                    temperature=0.2,
                    max_output_tokens=12000,
                    json_mode=use_json_mode,
                )
            except Exception as e:
                if use_json_mode and _is_json_mode_rejection(e):
                    logger.info("Model rejected text format for deep report — retrying without JSON mode")
                    continue
                logger.error(f"Deep report API call failed: {e}")
                return None, [str(e)], 0.0

            self._capture_usage(response)
            raw = getattr(response, "output_text", "") or ""
            if not raw.strip():
                errors = ["model returned empty response"]
                continue

            try:
                result = ExtractionService.normalize_deep_report(
                    _repair_json(raw), article_title=article_title
                )
            except json.JSONDecodeError:
                errors = ["JSON parse error"]
                continue

            errors = ExtractionService.validate_deep_report(result)
            if not errors:
                return result, None, 0.85
            break

        return None, errors or ["deep report failed validation"], 0.0

    async def answer_question(
        self,
        question: str,
        article_title: str,
        article_text: str | None = None,
        chunks: list[Any] | None = None,
        history: list[dict] | None = None,
        output_language: str = "en",
    ) -> tuple[str, list[dict]]:
        """Answer a question using the full article text via the Responses API.

        When ``history`` is provided, prior turns are injected between the
        system prompt and the current user message so the model has conversation
        context spanning multiple turns.
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

        messages = [{"role": "system", "content": get_system_message("chat", output_language=output_language)}]

        # Inject conversation history between system and latest user message
        for msg in self._truncate_history(history):
            messages.append(msg)

        messages.append({"role": "user", "content": user_content})

        try:
            response = await self._create(
                input=messages,
                temperature=0.3,
                max_output_tokens=1500,
                json_mode=False,
            )
            self._capture_usage(response)
            answer = getattr(response, "output_text", "") or ""

            # Extract citations from section references in answer
            citations = self._extract_citations(answer, chunks or [])

            return answer, citations

        except Exception as e:
            logger.error(f"Responses API Q&A failed: {e}")
            raise

    async def stream_answer(
        self,
        question: str,
        article_title: str,
        article_text: str | None = None,
        chunks: list[Any] | None = None,
        history: list[dict] | None = None,
        output_language: str = "en",
    ):
        """Stream answer tokens using the Responses API streaming events."""
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

        messages = [{"role": "system", "content": get_system_message("chat", output_language=output_language)}]

        # Inject conversation history between system and latest user message
        for msg in self._truncate_history(history):
            messages.append(msg)

        messages.append({"role": "user", "content": user_content})

        try:
            stream = await self.client.responses.create(
                model=self.model,
                input=messages,
                temperature=0.3,
                max_output_tokens=1500,
                stream=True,
            )
            async for event in stream:
                if getattr(event, "type", "") == "response.output_text.delta":
                    delta = getattr(event, "delta", None)
                    if delta:
                        yield delta
        except Exception as e:
            logger.error(f"Responses API streaming Q&A failed: {e}")
            raise

    async def run_skill(self, skill: Any, article_markdown: str, output_language: str = "en") -> dict:
        """Run a skill using the Responses API."""
        protected_text = protect_prompt_from_injection(article_markdown)

        output_schema = skill.output_schema if hasattr(skill, 'output_schema') else "{}"
        prompt = get_system_message("skill_default", output_language=output_language).format(
            skill_name=skill.name if hasattr(skill, 'name') else "unknown",
            skill_purpose=skill.purpose if hasattr(skill, 'purpose') else "",
            skill_instructions=skill.prompt_instructions if hasattr(skill, 'prompt_instructions') else "",
            output_schema=output_schema,
        )

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": protected_text},
        ]

        try:
            try:
                response = await self._create(
                    input=messages,
                    temperature=0.2,
                    max_output_tokens=2000,
                    json_mode=True,
                )
            except Exception as e:
                if not _is_json_mode_rejection(e):
                    raise
                logger.info("Model rejected text format for skill — retrying without JSON mode")
                response = await self._create(
                    input=messages,
                    temperature=0.2,
                    max_output_tokens=2000,
                    json_mode=False,
                )
            self._capture_usage(response)
            raw = getattr(response, "output_text", "") or "{}"
            return json.loads(raw)
        except Exception as e:
            logger.error(f"Responses API skill execution failed: {e}")
            return {"error": str(e), "skill": skill.name if hasattr(skill, 'name') else "unknown"}
