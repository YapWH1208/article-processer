"""Extraction service — validates and processes AI extraction results."""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class ExtractionService:
    """Service for managing extraction results."""

    @staticmethod
    def validate_schema(extraction: dict) -> list[str]:
        """Validate an extraction dict against the expected schema.

        Returns a list of error messages (empty = valid).
        """
        errors = []

        expected_keys = {
            "title", "authors", "year", "venue", "doi", "arxiv_id", "url",
            "abstract", "background", "research_problem", "methodology",
            "datasets", "experiments", "metrics", "results", "limitations",
            "future_work", "key_claims", "references", "tags",
            "graph_entities", "graph_relationships",
        }

        for key in expected_keys:
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
        allowed_entities = {
            "Article", "Author", "Institution", "Method", "Dataset",
            "Experiment", "Metric", "Result", "Claim", "Task", "Domain",
            "Tool", "Model", "Citation", "Keyword",
        }
        if "graph_entities" in extraction and isinstance(extraction["graph_entities"], list):
            for i, entity in enumerate(extraction["graph_entities"]):
                if isinstance(entity, dict):
                    etype = entity.get("type", "")
                    if etype and etype not in allowed_entities:
                        errors.append(f"graph_entities[{i}] has invalid type: '{etype}'. Allowed: {allowed_entities}")

        # Validate relationship types
        allowed_rels = {
            "USES_METHOD", "EVALUATES_ON", "REPORTS_RESULT", "USES_METRIC",
            "CITES", "SUPPORTED_BY", "ADDRESSES_TASK", "IMPROVES_ON",
            "HAS_LIMITATION", "HAS_KEYWORD",
        }
        if "graph_relationships" in extraction and isinstance(extraction["graph_relationships"], list):
            for i, rel in enumerate(extraction["graph_relationships"]):
                if isinstance(rel, dict):
                    rtype = rel.get("type", "")
                    if rtype and rtype not in allowed_rels:
                        errors.append(f"graph_relationships[{i}] has invalid type: '{rtype}'. Allowed: {allowed_rels}")

        return errors
