"""Tests for extraction prompt guardrails."""

import pytest

from app.routers.dev import DEFAULT_DEV_CONFIG
from app.schemas.extraction import ExtractionResult
from app.services.ai.prompts import get_system_message


@pytest.mark.parametrize(
    ("name", "prompt"),
    [
        ("active runtime extraction prompt", get_system_message("extraction")),
        (
            "default developer extraction prompt",
            DEFAULT_DEV_CONFIG["system_messages"]["extraction"],
        ),
    ],
)
def test_extraction_system_prompt_lists_required_schema_fields(name: str, prompt: str):
    """Extraction prompt should name every top-level field validated later."""
    missing = [
        field_name
        for field_name in ExtractionResult.model_fields
        if field_name not in prompt
    ]

    assert missing == [], f"{name} is missing schema fields: {missing}"


@pytest.mark.parametrize(
    ("name", "prompt"),
    [
        ("active runtime extraction prompt", get_system_message("extraction")),
        (
            "default developer extraction prompt",
            DEFAULT_DEV_CONFIG["system_messages"]["extraction"],
        ),
    ],
)
def test_extraction_system_prompt_specifies_empty_values_and_nested_shapes(
    name: str,
    prompt: str,
):
    """Prompt should constrain nullable fields, arrays, and nested objects."""
    required_fragments = [
        "null",
        "empty arrays []",
        "EXAMPLE JSON OUTPUT",
        "key_claims",
        "claim",
        "references",
        "graph_entities",
        "graph_relationships",
        "source_name",
        "target_name",
    ]
    missing = [fragment for fragment in required_fragments if fragment not in prompt]

    assert missing == [], f"{name} is missing guardrail fragments: {missing}"
