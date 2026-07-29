"""Tests for extraction schema validation."""

import pytest
from app.schemas.extraction import ExtractionResponse, ExtractionResult
from app.services.ai.extraction import ExtractionService


def make_valid_extraction() -> dict:
    """Create a minimal valid extraction."""
    return {
        "title": "Test Paper",
        "authors": ["Alice Researcher", "Bob Scientist"],
        "year": 2024,
        "venue": "NeurIPS",
        "doi": "10.1234/test.1",
        "arxiv_id": "2401.00001",
        "url": "https://example.com/paper",
        "abstract": "This is a test abstract.",
        "background": "Prior work on testing.",
        "research_problem": "How to write good tests.",
        "methodology": "We propose a test-driven approach.",
        "datasets": ["TestSet"],
        "experiments": ["Unit tests", "Integration tests"],
        "metrics": ["accuracy", "coverage"],
        "results": "Tests pass with 95% confidence.",
        "limitations": "Only tested on small scale.",
        "future_work": "Scale to larger test suites.",
        "key_claims": [
            {
                "claim": "Testing improves code quality.",
                "evidence": {
                    "source_section": "results",
                    "page_number": 5,
                    "snippet": "Tests pass with 95% confidence.",
                },
                "confidence": 0.9,
            }
        ],
        "references": [
            {
                "title": "Prior Testing Work",
                "authors": "Carol Engineer",
                "year": 2023,
                "venue": "ICLR",
                "doi": "10.5678/prior.1",
            }
        ],
        "tags": ["testing", "quality"],
        "graph_entities": [
            {
                "type": "Method",
                "name": "Test-Driven Development",
                "canonical_name": "test-driven development",
                "properties": {},
                "evidence": {"source_section": "methodology"},
                "confidence": 0.9,
            }
        ],
        "graph_relationships": [
            {
                "source_name": "Test-Driven Development",
                "source_type": "Method",
                "target_name": "TestSet",
                "target_type": "Dataset",
                "type": "EVALUATES_ON",
                "properties": {},
                "evidence": {"source_section": "experiments"},
                "confidence": 0.8,
            }
        ],
    }


class TestExtractionValidation:
    """Test the extraction schema validation logic."""

    def test_valid_extraction_passes(self):
        """A complete valid extraction should have no errors."""
        extraction = make_valid_extraction()
        errors = ExtractionService.validate_schema(extraction)
        assert len(errors) == 0, f"Expected no errors, got: {errors}"

    def test_missing_required_fields_detected(self):
        """Missing top-level fields should be flagged."""
        extraction = {"title": "Minimal"}
        errors = ExtractionService.validate_schema(extraction)
        assert len(errors) > 0
        assert any("Missing field" in e for e in errors)

    def test_invalid_authors_type_detected(self):
        """Non-list authors should be flagged."""
        extraction = make_valid_extraction()
        extraction["authors"] = "Alice Researcher"  # string, not list
        errors = ExtractionService.validate_schema(extraction)
        assert any("authors" in e.lower() for e in errors)

    def test_invalid_entity_type_detected(self):
        """Entities with invalid types should be flagged."""
        extraction = make_valid_extraction()
        extraction["graph_entities"].append({
            "type": "INVALID_TYPE_XYZ",
            "name": "Bad Entity",
        })
        errors = ExtractionService.validate_schema(extraction)
        assert any("INVALID_TYPE_XYZ" in e for e in errors)

    def test_invalid_relationship_type_detected(self):
        """Relationships with invalid types should be flagged."""
        extraction = make_valid_extraction()
        extraction["graph_relationships"].append({
            "source_name": "A",
            "source_type": "Method",
            "target_name": "B",
            "target_type": "Method",
            "type": "INVALID_RELATION",
        })
        errors = ExtractionService.validate_schema(extraction)
        assert any("INVALID_RELATION" in e for e in errors)

    def test_empty_authors_list_ok(self):
        """Empty authors list should be valid."""
        extraction = make_valid_extraction()
        extraction["authors"] = []
        errors = ExtractionService.validate_schema(extraction)
        assert len(errors) == 0

    def test_null_fields_allowed(self):
        """Null values for optional string fields should be valid."""
        extraction = make_valid_extraction()
        extraction["abstract"] = None
        extraction["venue"] = None
        errors = ExtractionService.validate_schema(extraction)
        assert len(errors) == 0

    def test_triage_is_optional_and_repository_links_require_evidence(self):
        legacy = ExtractionResult.model_validate(make_valid_extraction())
        assert legacy.triage is None

        extraction = make_valid_extraction()
        extraction["triage"] = {
            "verdict": {"text": "Read the supported results.", "evidence": {"source_section": "results"}},
            "code_status": {
                "status": "linked_in_paper",
                "repository_url": "https://github.com/example/repo",
                "evidence": {"source_section": "code", "snippet": "Code: https://github.com/example/repo"},
            },
        }
        parsed = ExtractionResult.model_validate(extraction)
        assert parsed.triage is not None
        assert parsed.triage.code_status.status == "linked_in_paper"

        extraction["triage"]["code_status"].pop("evidence")
        with pytest.raises(ValueError, match="requires paper-text evidence"):
            ExtractionResult.model_validate(extraction)

    def test_triage_normalization_drops_non_http_repository_urls(self):
        triage = ExtractionService._coerce_triage({
            "code_status": {
                "status": "linked_in_paper",
                "repository_url": "ftp://example.com/repo",
                "evidence": {"source_section": "Code"},
            },
        })
        assert triage["code_status"] == {
            "status": "unknown",
            "repository_url": None,
            "evidence": {"source_section": "Code", "page_number": None, "chunk_id": None, "snippet": None},
        }

    def test_claim_missing_claim_field(self):
        """Key claims without the 'claim' field should be flagged."""
        extraction = make_valid_extraction()
        extraction["key_claims"].append({"evidence": {"snippet": "test"}})
        errors = ExtractionService.validate_schema(extraction)
        assert any("missing 'claim'" in e.lower() for e in errors)

    def test_realistic_paper_extraction(self):
        """Test with a realistic extraction shape from a ML paper."""
        extraction = {
            "title": "Attention Is All You Need",
            "authors": [
                "Ashish Vaswani",
                "Noam Shazeer",
                "Niki Parmar",
                "Jakob Uszkoreit",
                "Llion Jones",
                "Aidan N. Gomez",
                "Lukasz Kaiser",
                "Illia Polosukhin",
            ],
            "year": 2017,
            "venue": "NeurIPS",
            "doi": None,
            "arxiv_id": "1706.03762",
            "url": "https://arxiv.org/abs/1706.03762",
            "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
            "background": "Prior to Transformers, sequence modeling used RNNs and CNNs.",
            "research_problem": "Reduce sequential computation for sequence transduction.",
            "methodology": "We propose the Transformer, a model architecture using only attention mechanisms.",
            "datasets": ["WMT 2014 English-German", "WMT 2014 English-French"],
            "experiments": ["Machine translation on WMT", "English constituency parsing"],
            "metrics": ["BLEU", "perplexity"],
            "results": "Transformer achieves 28.4 BLEU on EN-DE and 41.8 on EN-FR.",
            "limitations": "Attention scales quadratically with sequence length.",
            "future_work": "Apply to images, audio, and video; develop efficient attention variants.",
            "key_claims": [
                {
                    "claim": "Transformer outperforms previous SOTA on translation tasks.",
                    "evidence": {
                        "source_section": "results",
                        "page_number": 6,
                        "snippet": "28.4 BLEU on WMT 2014 English-German",
                    },
                    "confidence": 0.95,
                }
            ],
            "references": [],
            "tags": ["transformer", "attention", "nlp", "machine translation"],
            "graph_entities": [
                {
                    "type": "Method",
                    "name": "Transformer",
                    "canonical_name": "transformer",
                    "properties": {"type": "architecture"},
                    "evidence": {"source_section": "methodology"},
                    "confidence": 1.0,
                },
                {
                    "type": "Method",
                    "name": "Self-Attention",
                    "canonical_name": "self-attention",
                    "properties": {},
                    "evidence": {"source_section": "methodology"},
                    "confidence": 0.95,
                },
                {
                    "type": "Dataset",
                    "name": "WMT 2014 English-German",
                    "canonical_name": "wmt 2014 en-de",
                    "properties": {},
                    "evidence": {"source_section": "experiments"},
                    "confidence": 0.9,
                },
                {
                    "type": "Metric",
                    "name": "BLEU",
                    "canonical_name": "bleu",
                    "properties": {},
                    "evidence": {"source_section": "experiments"},
                    "confidence": 0.95,
                },
            ],
            "graph_relationships": [
                {
                    "source_name": "Transformer",
                    "source_type": "Method",
                    "target_name": "WMT 2014 English-German",
                    "target_type": "Dataset",
                    "type": "EVALUATES_ON",
                    "properties": {},
                    "evidence": {},
                    "confidence": 0.9,
                },
                {
                    "source_name": "Transformer",
                    "source_type": "Method",
                    "target_name": "BLEU",
                    "target_type": "Metric",
                    "type": "USES_METRIC",
                    "properties": {},
                    "evidence": {},
                    "confidence": 0.9,
                },
            ],
        }

        errors = ExtractionService.validate_schema(extraction)
        assert len(errors) == 0, f"Expected no errors for valid extraction, got: {errors}"


class TestExtractionEdgeCases:
    """Edge case tests for extraction validation."""

    def test_empty_extraction(self):
        """Completely empty dict should have many errors."""
        errors = ExtractionService.validate_schema({})
        assert len(errors) > 0

    def test_non_dict_claims(self):
        """Non-dict items in key_claims should be flagged."""
        extraction = make_valid_extraction()
        extraction["key_claims"] = [{"claim": "valid"}, "not a dict"]
        errors = ExtractionService.validate_schema(extraction)
        assert any("not an object" in e.lower() for e in errors)

    def test_empty_extraction_is_valid_when_minimal(self):
        """Minimal extraction with all required keys but null/empty values should be valid."""
        extraction = {
            "title": None,
            "authors": [],
            "year": None,
            "venue": None,
            "doi": None,
            "arxiv_id": None,
            "url": None,
            "abstract": None,
            "background": None,
            "research_problem": None,
            "methodology": None,
            "datasets": [],
            "experiments": [],
            "metrics": [],
            "results": None,
            "limitations": None,
            "future_work": None,
            "key_claims": [],
            "references": [],
            "tags": [],
            "graph_entities": [],
            "graph_relationships": [],
        }
        errors = ExtractionService.validate_schema(extraction)
        assert len(errors) == 0, f"Expected no errors for minimal valid extraction, got: {errors}"

    def test_extraction_response_accepts_reference_author_arrays(self):
        """LLM reference authors may arrive as arrays and should not break the API."""
        extraction = make_valid_extraction()
        extraction["references"] = [
            {
                "title": "Self-Determination Theory",
                "authors": ["Ryan, R. M.", "Deci, E. L."],
                "year": 2000,
            }
        ]

        response = ExtractionResponse(
            article_id=1,
            schema_version="1.0",
            extraction=extraction,
            validation_errors=None,
            confidence=0.8,
        )

        assert response.extraction is not None
        assert response.extraction.references[0].authors == "Ryan, R. M., Deci, E. L."

    def test_normalize_extraction_repairs_common_provider_shape_drift(self):
        """Provider outputs should be normalized before validation."""
        raw = {
            "paper_title": "Shape Drift Paper",
            "authors": "Alice Researcher, Bob Scientist",
            "year": "2024",
            "datasets": [{"name": "ImageNet"}, "CIFAR-10"],
            "key_claims": ["The method improves accuracy.", {"text": "It is efficient."}],
            "references": [
                {
                    "title": "Prior Work",
                    "authors": ["Carol Engineer", "Dan Scientist"],
                    "year": "2020",
                }
            ],
            "graph_entities": [
                {"type": "method", "name": "FastLearn"},
                {"type": "unknown_type", "label": "Computer Vision"},
            ],
            "graph_relationships": [
                {
                    "source": "FastLearn",
                    "source_type": "method",
                    "target": "ImageNet",
                    "target_type": "dataset",
                    "relationship": "evaluates_on",
                }
            ],
        }

        normalized = ExtractionService.normalize_extraction(raw, article_title="Fallback Title")
        errors = ExtractionService.validate_schema(normalized)

        assert errors == []
        assert normalized["title"] == "Shape Drift Paper"
        assert normalized["authors"] == ["Alice Researcher", "Bob Scientist"]
        assert normalized["year"] == 2024
        assert normalized["abstract"] is None
        assert normalized["experiments"] == []
        assert normalized["key_claims"][0]["claim"] == "The method improves accuracy."
        assert normalized["references"][0]["authors"] == "Carol Engineer, Dan Scientist"
        assert normalized["graph_entities"][0]["type"] == "Method"
        assert normalized["graph_entities"][0]["confidence"] == 0.5
        assert normalized["graph_entities"][1]["type"] == "Keyword"
        assert normalized["graph_relationships"][0]["type"] == "EVALUATES_ON"
        assert normalized["graph_relationships"][0]["confidence"] == 0.5

    def test_split_authors_preserves_citation_style_initials(self):
        parts = ExtractionService._split_list_text("Ryan, R. M., Deci, E. L.", "authors")
        assert parts == ["Ryan, R. M., Deci, E. L."]
