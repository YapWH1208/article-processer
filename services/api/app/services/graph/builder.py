"""Graph builder — converts extraction results into graph entities and relationships."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Builds graph entities and relationships from AI extraction results."""

    def build_from_extraction(
        self,
        article_id: int,
        extraction: dict,
    ) -> tuple[list[dict], list[dict]]:
        """Convert extraction JSON into graph entities and relationships.

        Returns:
            (entities_list, relationships_list) — each item is a dict
            ready for database insertion (without auto-generated IDs).
        """
        entities: list[dict] = []
        relationships: list[dict] = []
        entity_map: dict[tuple[str, str], int] = {}  # (type, name) -> temp_id
        temp_id_counter = 0

        def get_or_create_entity(etype: str, name: str, canonical: str | None = None, properties: dict | None = None, evidence: dict | None = None, confidence: float = 0.5) -> int:
            nonlocal temp_id_counter
            key = (etype, name.lower())
            if key in entity_map:
                return entity_map[key]

            temp_id_counter += 1
            eid = temp_id_counter
            entity_map[key] = eid
            entities.append({
                "temp_id": eid,
                "article_id": article_id,
                "type": etype,
                "name": name,
                "canonical_name": canonical or name.lower(),
                "properties": properties or {},
                "evidence": evidence or {},
                "confidence": min(1.0, max(0.0, confidence)),
            })
            return eid

        # ── Helpers ────────────────────────────────────────────────────
        def _to_str(value):
            """Safely extract a string name from a value that could be a str, dict, or list."""
            if isinstance(value, str):
                return value
            if isinstance(value, dict):
                return str(value.get("name") or value.get("title") or list(value.values())[0] if value else "")
            if isinstance(value, (list, tuple)):
                for item in value:
                    s = _to_str(item)
                    if s:
                        return s
            return str(value) if value is not None else ""

        # ── Authors ────────────────────────────────────────────────────
        for author_entry in extraction.get("authors") or []:
            author_name = _to_str(author_entry)
            if author_name:
                get_or_create_entity("Author", author_name, confidence=0.9)

        # ── Graph entities from AI extraction ──────────────────────────
        for ge in extraction.get("graph_entities") or []:
            if not isinstance(ge, dict):
                continue
            eid = get_or_create_entity(
                etype=ge.get("type", "Keyword"),
                name=ge.get("name", "Unknown"),
                canonical=ge.get("canonical_name"),
                properties=ge.get("properties"),
                evidence=ge.get("evidence"),
                confidence=ge.get("confidence", 0.5),
            )

        # ── Methods ────────────────────────────────────────────────────
        for method_name in self._extract_methods(extraction):
            get_or_create_entity("Method", method_name, confidence=0.7)

        # ── Datasets ───────────────────────────────────────────────────
        for ds_entry in extraction.get("datasets") or []:
            ds_name = _to_str(ds_entry)
            if ds_name:
                get_or_create_entity("Dataset", ds_name, confidence=0.7)

        # ── Metrics ────────────────────────────────────────────────────
        for metric_entry in extraction.get("metrics") or []:
            metric_name = _to_str(metric_entry)
            if metric_name:
                get_or_create_entity("Metric", metric_name, confidence=0.7)

        # ── Tags as Keywords ───────────────────────────────────────────
        for tag_entry in extraction.get("tags") or []:
            tag_name = _to_str(tag_entry)
            if tag_name:
                get_or_create_entity("Keyword", tag_name, confidence=0.8)

        # ── Venue ──────────────────────────────────────────────────────
        venue = extraction.get("venue")
        if venue:
            get_or_create_entity("Institution", venue, confidence=0.6)

        # ── Key Claims ─────────────────────────────────────────────────
        for claim in extraction.get("key_claims") or []:
            if isinstance(claim, dict):
                claim_text = claim.get("claim", "")
                if claim_text:
                    evidence = claim.get("evidence")
                    get_or_create_entity(
                        "Claim",
                        claim_text[:200],
                        evidence=evidence,
                        confidence=claim.get("confidence", 0.5),
                    )

        # ── Extract relationships from AI output ───────────────────────
        for gr in extraction.get("graph_relationships") or []:
            if not isinstance(gr, dict):
                continue
            source_id = get_or_create_entity(
                etype=gr.get("source_type", "Method"),
                name=gr.get("source_name", "Unknown"),
            )
            target_id = get_or_create_entity(
                etype=gr.get("target_type", "Method"),
                name=gr.get("target_name", "Unknown"),
            )
            relationships.append({
                "article_id": article_id,
                "source_entity_id": source_id,
                "target_entity_id": target_id,
                "type": gr.get("type", "USES_METHOD"),
                "properties": gr.get("properties", {}),
                "evidence": gr.get("evidence", {}),
                "confidence": gr.get("confidence", 0.5),
            })

        # ── Build relationships from entity types ──────────────────────
        # For each method, connect to the first author
        author_ids = [eid for (etype, _), eid in entity_map.items() if etype == "Author"]
        method_ids = [eid for (etype, _), eid in entity_map.items() if etype == "Method"]
        dataset_ids = [eid for (etype, _), eid in entity_map.items() if etype == "Dataset"]
        metric_ids = [eid for (etype, _), eid in entity_map.items() if etype == "Metric"]
        keyword_ids = [eid for (etype, _), eid in entity_map.items() if etype == "Keyword"]

        # Existing relationships from AI (avoid duplicates)
        existing_pairs = {(r["source_entity_id"], r["target_entity_id"], r["type"]) for r in relationships}

        # Author → Method (USES_METHOD)
        for author_id in author_ids[:2]:
            for method_id in method_ids[:3]:
                pair = (author_id, method_id, "USES_METHOD")
                if pair not in existing_pairs:
                    relationships.append({
                        "article_id": article_id,
                        "source_entity_id": author_id,
                        "target_entity_id": method_id,
                        "type": "USES_METHOD",
                        "properties": {},
                        "evidence": {"source_section": "methodology"},
                        "confidence": 0.5,
                    })
                    existing_pairs.add(pair)

        # Method → Dataset (EVALUATES_ON)
        for method_id in method_ids[:2]:
            for ds_id in dataset_ids[:2]:
                pair = (method_id, ds_id, "EVALUATES_ON")
                if pair not in existing_pairs:
                    relationships.append({
                        "article_id": article_id,
                        "source_entity_id": method_id,
                        "target_entity_id": ds_id,
                        "type": "EVALUATES_ON",
                        "properties": {},
                        "evidence": {"source_section": "experiments"},
                        "confidence": 0.5,
                    })
                    existing_pairs.add(pair)

        # Method → Metric (USES_METRIC)
        for method_id in method_ids[:2]:
            for metric_id in metric_ids[:3]:
                pair = (method_id, metric_id, "USES_METRIC")
                if pair not in existing_pairs:
                    relationships.append({
                        "article_id": article_id,
                        "source_entity_id": method_id,
                        "target_entity_id": metric_id,
                        "type": "USES_METRIC",
                        "properties": {},
                        "evidence": {"source_section": "experiments"},
                        "confidence": 0.5,
                    })
                    existing_pairs.add(pair)

        # Article → Keyword (HAS_KEYWORD)
        # Create a "self" entity for the article
        article_eid = get_or_create_entity(
            "Article",
            extraction.get("title") or f"Article {article_id}",
            confidence=1.0,
        )
        for kw_id in keyword_ids[:10]:
            pair = (article_eid, kw_id, "HAS_KEYWORD")
            if pair not in existing_pairs:
                relationships.append({
                    "article_id": article_id,
                    "source_entity_id": article_eid,
                    "target_entity_id": kw_id,
                    "type": "HAS_KEYWORD",
                    "properties": {},
                    "evidence": {},
                    "confidence": 0.8,
                })
                existing_pairs.add(pair)

        logger.info(
            f"Graph built for article {article_id}: "
            f"{len(entities)} entities, {len(relationships)} relationships"
        )

        return entities, relationships

    def _extract_methods(self, extraction: dict) -> list[str]:
        """Extract method names from extraction data."""
        methods = []
        methodology = extraction.get("methodology") or ""
        # Simple heuristic: extract capitalized phrases that look like methods
        import re
        # Look for method-related keywords followed by names
        patterns = [
            r'(?:using|applying?|leveraging?|employing?|propose|introduce|present)\s+(?:a\s+)?(?:novel\s+)?(?:new\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})',
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, methodology, re.IGNORECASE):
                methods.append(match.group(1).strip())

        return list(set(methods))[:5]
