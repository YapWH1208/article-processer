"""Extraction service — validates and processes AI extraction results."""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

EXPECTED_EXTRACTION_KEYS = {
    "title", "authors", "year", "venue", "doi", "arxiv_id", "url",
    "abstract", "background", "research_problem", "methodology",
    "datasets", "experiments", "metrics", "results", "limitations",
    "future_work", "key_claims", "references", "tags",
    "graph_entities", "graph_relationships",
}

OPTIONAL_EXTRACTION_KEYS = {"triage"}

SCALAR_FIELDS = {
    "title", "venue", "doi", "arxiv_id", "url", "abstract", "background",
    "research_problem", "methodology", "results", "limitations", "future_work",
}

LIST_FIELDS = {"authors", "datasets", "experiments", "metrics", "tags"}

FIELD_ALIASES = {
    "paper_title": "title",
    "article_title": "title",
    "problem": "research_problem",
    "methods": "methodology",
    "method": "methodology",
    "claims": "key_claims",
    "entities": "graph_entities",
    "relationships": "graph_relationships",
}

ALLOWED_ENTITY_TYPES = {
    "Article", "Author", "Institution", "Method", "Dataset",
    "Experiment", "Metric", "Result", "Claim", "Task", "Domain",
    "Tool", "Model", "Citation", "Keyword",
}

ALLOWED_RELATIONSHIP_TYPES = {
    "USES_METHOD", "EVALUATES_ON", "REPORTS_RESULT", "USES_METRIC",
    "CITES", "SUPPORTED_BY", "ADDRESSES_TASK", "IMPROVES_ON",
    "HAS_LIMITATION", "HAS_KEYWORD",
}

ENTITY_TYPE_ALIASES = {
    type_name.lower(): type_name for type_name in ALLOWED_ENTITY_TYPES
}
ENTITY_TYPE_ALIASES.update({
    "paper": "Article",
    "article": "Article",
    "author": "Author",
    "authors": "Author",
    "institution": "Institution",
    "organization": "Institution",
    "method": "Method",
    "methods": "Method",
    "dataset": "Dataset",
    "datasets": "Dataset",
    "data_set": "Dataset",
    "experiment": "Experiment",
    "experiments": "Experiment",
    "metric": "Metric",
    "metrics": "Metric",
    "finding": "Result",
    "result": "Result",
    "results": "Result",
    "claim": "Claim",
    "task": "Task",
    "domain": "Domain",
    "tool": "Tool",
    "model": "Model",
    "citation": "Citation",
    "reference": "Citation",
    "keyword": "Keyword",
    "tag": "Keyword",
})

RELATIONSHIP_TYPE_ALIASES = {
    type_name.lower(): type_name for type_name in ALLOWED_RELATIONSHIP_TYPES
}


class ExtractionService:
    """Service for managing extraction results."""

    @staticmethod
    def normalize_extraction(extraction: Any, article_title: str | None = None) -> dict:
        """Normalize provider output into the canonical extraction schema.

        LLM providers vary in how strictly they follow JSON schemas. This
        accepts common shape drift and returns a complete object with only the
        supported top-level keys, so validation can focus on genuinely
        unusable data instead of recoverable formatting differences.
        """
        source = dict(extraction) if isinstance(extraction, dict) else {}
        for alias, canonical in FIELD_ALIASES.items():
            if canonical not in source and alias in source:
                source[canonical] = source[alias]

        normalized: dict[str, Any] = {}
        for field in SCALAR_FIELDS:
            fallback = article_title if field == "title" else None
            normalized[field] = ExtractionService._coerce_optional_string(
                source.get(field), fallback=fallback
            )

        normalized["year"] = ExtractionService._coerce_year(source.get("year"))

        for field in LIST_FIELDS:
            normalized[field] = ExtractionService._coerce_string_list(
                source.get(field), field_name=field
            )

        normalized["key_claims"] = ExtractionService._coerce_key_claims(
            source.get("key_claims")
        )
        normalized["references"] = ExtractionService._coerce_references(
            source.get("references")
        )
        normalized["graph_entities"] = ExtractionService._coerce_graph_entities(
            source.get("graph_entities")
        )
        normalized["graph_relationships"] = ExtractionService._coerce_graph_relationships(
            source.get("graph_relationships")
        )
        normalized["triage"] = ExtractionService._coerce_triage(source.get("triage"))

        return {
            key: normalized.get(key)
            for key in sorted(EXPECTED_EXTRACTION_KEYS | OPTIONAL_EXTRACTION_KEYS)
        }

    @staticmethod
    def validate_schema(extraction: dict) -> list[str]:
        """Validate an extraction dict against the expected schema.

        Returns a list of error messages (empty = valid).
        """
        errors = []

        for key in EXPECTED_EXTRACTION_KEYS:
            if key not in extraction:
                errors.append(f"Missing field: {key}")

        # Type checks
        for list_field in ["authors", "datasets", "experiments", "metrics", "tags", "key_claims", "references", "graph_entities", "graph_relationships"]:
            if list_field in extraction and not isinstance(extraction[list_field], list):
                errors.append(f"'{list_field}' must be an array, got {type(extraction[list_field]).__name__}")

        # Validate key_claims structure
        if "key_claims" in extraction and isinstance(extraction["key_claims"], list):
            for i, claim in enumerate(extraction["key_claims"]):
                if not isinstance(claim, dict):
                    errors.append(f"key_claims[{i}] is not an object")
                elif "claim" not in claim:
                    errors.append(f"key_claims[{i}] missing 'claim' field")

        # Validate entity types
        if "graph_entities" in extraction and isinstance(extraction["graph_entities"], list):
            for i, entity in enumerate(extraction["graph_entities"]):
                if isinstance(entity, dict):
                    etype = entity.get("type", "")
                    if etype and etype not in ALLOWED_ENTITY_TYPES:
                        errors.append(f"graph_entities[{i}] has invalid type: '{etype}'. Allowed: {ALLOWED_ENTITY_TYPES}")

        # Validate relationship types
        if "graph_relationships" in extraction and isinstance(extraction["graph_relationships"], list):
            for i, rel in enumerate(extraction["graph_relationships"]):
                if isinstance(rel, dict):
                    rtype = rel.get("type", "")
                    if rtype and rtype not in ALLOWED_RELATIONSHIP_TYPES:
                        errors.append(f"graph_relationships[{i}] has invalid type: '{rtype}'. Allowed: {ALLOWED_RELATIONSHIP_TYPES}")

        return errors

    @staticmethod
    def _coerce_triage(value: Any) -> dict | None:
        if not isinstance(value, dict):
            return None

        def fact(raw: Any) -> dict:
            if isinstance(raw, str):
                return {"text": ExtractionService._coerce_optional_string(raw), "evidence": None}
            if not isinstance(raw, dict):
                return {"text": None, "evidence": None}
            return {
                "text": ExtractionService._coerce_optional_string(
                    raw.get("text") or raw.get("summary") or raw.get("value")
                ),
                "evidence": ExtractionService._coerce_evidence(raw.get("evidence")),
            }

        raw_code = value.get("code_status")
        raw_code = raw_code if isinstance(raw_code, dict) else {}
        status = ExtractionService._coerce_optional_string(raw_code.get("status")) or "unknown"
        if status not in {"linked_in_paper", "not_stated", "unknown"}:
            status = "unknown"
        repository_url = ExtractionService._coerce_optional_string(raw_code.get("repository_url"))
        evidence = ExtractionService._coerce_evidence(raw_code.get("evidence"))
        if repository_url and (evidence is None or not repository_url.startswith(("https://", "http://"))):
            repository_url = None
            status = "unknown"

        return {
            "verdict": fact(value.get("verdict")),
            "problem": fact(value.get("problem")),
            "method": fact(value.get("method")),
            "results": fact(value.get("results")),
            "limitations": fact(value.get("limitations")),
            "code_status": {
                "status": status,
                "repository_url": repository_url,
                "evidence": evidence,
            },
        }

    @staticmethod
    def _coerce_evidence(value: Any) -> dict | None:
        if isinstance(value, str):
            source_section = ExtractionService._coerce_optional_string(value)
            return {"source_section": source_section} if source_section else None
        if not isinstance(value, dict):
            return None
        page_number = value.get("page_number")
        try:
            page_number = int(page_number) if page_number is not None else None
        except (TypeError, ValueError):
            page_number = None
        evidence = {
            "source_section": ExtractionService._coerce_optional_string(value.get("source_section")),
            "page_number": page_number,
            "chunk_id": None,
            "snippet": ExtractionService._coerce_optional_string(value.get("snippet")),
        }
        chunk_id = value.get("chunk_id")
        try:
            evidence["chunk_id"] = int(chunk_id) if chunk_id is not None else None
        except (TypeError, ValueError):
            evidence["chunk_id"] = None
        if not any(item is not None for item in evidence.values()):
            return None
        return evidence

    @staticmethod
    def _coerce_optional_string(value: Any, fallback: str | None = None) -> str | None:
        text = ExtractionService._value_to_text(value)
        if text:
            return text
        return fallback

    @staticmethod
    def _coerce_year(value: Any) -> int | None:
        if isinstance(value, int):
            return value if 1000 <= value <= 3000 else None
        text = ExtractionService._value_to_text(value)
        if not text:
            return None
        match = re.search(r"\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b", text)
        return int(match.group(1)) if match else None

    @staticmethod
    def _coerce_string_list(value: Any, field_name: str = "") -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            items = value
        elif isinstance(value, tuple):
            items = list(value)
        elif isinstance(value, dict):
            items = [value]
        else:
            text = ExtractionService._value_to_text(value)
            if not text:
                return []
            items = ExtractionService._split_list_text(text, field_name)

        result: list[str] = []
        for item in items:
            if isinstance(item, str):
                parts = ExtractionService._split_list_text(item, field_name)
                result.extend(parts)
            else:
                text = ExtractionService._value_to_text(item)
                if text:
                    result.append(text)
        return ExtractionService._dedupe_strings(result)

    @staticmethod
    def _split_list_text(text: str, field_name: str = "") -> list[str]:
        if not text:
            return []
        if field_name == "authors":
            if ";" in text:
                parts = re.split(r"\s*;\s*", text)
            elif re.search(r"\s+and\s+", text, flags=re.IGNORECASE):
                parts = re.split(r"\s+and\s+", text, flags=re.IGNORECASE)
            elif re.search(r",\s+[A-Z][a-z]", text) and not re.search(r",\s*[A-Z]\.", text):
                parts = re.split(r",\s+", text)
            else:
                parts = [text]
        else:
            parts = re.split(r"\s*(?:,|;|\n)\s*", text)
        return [part.strip() for part in parts if part and part.strip()]

    @staticmethod
    def _coerce_key_claims(value: Any) -> list[dict]:
        items = value if isinstance(value, list) else ([] if value is None else [value])
        claims: list[dict] = []
        for item in items:
            if isinstance(item, str):
                claims.append({"claim": item})
                continue
            if not isinstance(item, dict):
                continue
            claim_text = (
                item.get("claim")
                or item.get("text")
                or item.get("content")
                or item.get("description")
            )
            claim_text = ExtractionService._value_to_text(claim_text)
            if not claim_text:
                continue
            claims.append({
                "claim": claim_text,
                "evidence": ExtractionService._coerce_evidence(item.get("evidence")),
                "confidence": ExtractionService._coerce_confidence(item.get("confidence"), default=0.5),
            })
        return claims

    @staticmethod
    def _coerce_references(value: Any) -> list[dict]:
        items = value if isinstance(value, list) else ([] if value is None else [value])
        references: list[dict] = []
        for item in items:
            if isinstance(item, str):
                references.append({"citation_text": item})
                continue
            if not isinstance(item, dict):
                continue
            references.append({
                "title": ExtractionService._coerce_optional_string(item.get("title")),
                "authors": ExtractionService._coerce_reference_authors(item.get("authors")),
                "year": ExtractionService._coerce_year(item.get("year")),
                "venue": ExtractionService._coerce_optional_string(item.get("venue")),
                "doi": ExtractionService._coerce_optional_string(item.get("doi")),
                "url": ExtractionService._coerce_optional_string(item.get("url")),
                "citation_text": ExtractionService._coerce_optional_string(
                    item.get("citation_text") or item.get("citation")
                ),
            })
        return references

    @staticmethod
    def _coerce_reference_authors(value: Any) -> str | None:
        if isinstance(value, list):
            authors = [
                ExtractionService._value_to_text(item)
                for item in value
            ]
            authors = [author for author in authors if author]
            return ", ".join(authors) if authors else None
        return ExtractionService._coerce_optional_string(value)

    @staticmethod
    def _coerce_graph_entities(value: Any) -> list[dict]:
        items = value if isinstance(value, list) else ([] if value is None else [value])
        entities: list[dict] = []
        for item in items:
            if isinstance(item, str):
                entities.append({
                    "type": "Keyword",
                    "name": item,
                    "canonical_name": item.lower(),
                    "properties": {},
                    "evidence": None,
                    "confidence": 0.5,
                })
                continue
            if not isinstance(item, dict):
                continue
            name = ExtractionService._value_to_text(
                item.get("name") or item.get("title") or item.get("label") or item.get("canonical_name")
            )
            if not name:
                continue
            entity_type = ExtractionService._coerce_entity_type(item.get("type"))
            entities.append({
                "type": entity_type,
                "name": name,
                "canonical_name": ExtractionService._coerce_optional_string(
                    item.get("canonical_name"), fallback=name.lower()
                ),
                "properties": item.get("properties") if isinstance(item.get("properties"), dict) else {},
                "evidence": ExtractionService._coerce_evidence(item.get("evidence")),
                "confidence": ExtractionService._coerce_confidence(item.get("confidence"), default=0.5),
            })
        return entities

    @staticmethod
    def _coerce_graph_relationships(value: Any) -> list[dict]:
        items = value if isinstance(value, list) else ([] if value is None else [value])
        relationships: list[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            source_name = ExtractionService._value_to_text(
                item.get("source_name") or item.get("source") or item.get("from")
            )
            target_name = ExtractionService._value_to_text(
                item.get("target_name") or item.get("target") or item.get("to")
            )
            if not source_name or not target_name:
                continue
            relationships.append({
                "source_name": source_name,
                "source_type": ExtractionService._coerce_entity_type(item.get("source_type")),
                "target_name": target_name,
                "target_type": ExtractionService._coerce_entity_type(item.get("target_type")),
                "type": ExtractionService._coerce_relationship_type(
                    item.get("type") or item.get("relationship") or item.get("relation")
                ),
                "properties": item.get("properties") if isinstance(item.get("properties"), dict) else {},
                "evidence": ExtractionService._coerce_evidence(item.get("evidence")),
                "confidence": ExtractionService._coerce_confidence(item.get("confidence"), default=0.5),
            })
        return relationships

    @staticmethod
    def _coerce_entity_type(value: Any) -> str:
        text = ExtractionService._value_to_text(value)
        key = ExtractionService._normalize_enum_key(text)
        return ENTITY_TYPE_ALIASES.get(key, "Keyword")

    @staticmethod
    def _coerce_relationship_type(value: Any) -> str:
        text = ExtractionService._value_to_text(value)
        key = ExtractionService._normalize_enum_key(text)
        return RELATIONSHIP_TYPE_ALIASES.get(key, "USES_METHOD")

    @staticmethod
    def _normalize_enum_key(value: str | None) -> str:
        return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")

    @staticmethod
    def _coerce_confidence(value: Any, default: float | None = None) -> float | None:
        if value is None:
            return default
        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return default
        return min(1.0, max(0.0, confidence))

    @staticmethod
    def _value_to_text(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, dict):
            for key in ("name", "title", "label", "text", "content", "value", "citation_text"):
                text = ExtractionService._value_to_text(value.get(key))
                if text:
                    return text
            return ""
        if isinstance(value, (list, tuple)):
            parts = [ExtractionService._value_to_text(item) for item in value]
            return ", ".join(part for part in parts if part)
        return str(value).strip()

    @staticmethod
    def _dedupe_strings(values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            key = value.casefold()
            if key and key not in seen:
                result.append(value)
                seen.add(key)
        return result
