import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCOVER_PAGE_SIZE,
  REQUIRED_CONFERENCE_COLLECTIONS,
  canAnalyseCandidate,
  createArxivProvenance,
  createDiscoverRequest,
  getDiscoverEmptyState,
  normalizeDiscoverSearch,
} from "./discoverState.mjs";

test("Discover exposes exactly the five approved conference collections", () => {
  assert.deepEqual(REQUIRED_CONFERENCE_COLLECTIONS.map((item) => item.key), [
    "iclr_2026", "chi_2026", "cvpr_2026", "neurips_2025", "icml_2025",
  ]);
});

test("Discover search normalizes scope, query, and pagination", () => {
  assert.deepEqual(normalizeDiscoverSearch({ query: "  evidence  ", scope: "abstract", page: "3" }), {
    query: "evidence", scope: "abstract", page: 3,
  });
  assert.deepEqual(createDiscoverRequest({ query: "x", scope: "invalid", page: 2 }), {
    query: "x", scope: "title", page: 2, offset: DISCOVER_PAGE_SIZE, limit: DISCOVER_PAGE_SIZE,
  });
});

test("Analyse remains unavailable until a candidate has a valid selected import path", () => {
  assert.equal(canAnalyseCandidate({ source_provider: "conference_catalog", id: 4, pdf_url: "https://example.com/p.pdf" }), true);
  assert.equal(canAnalyseCandidate({ source_provider: "conference_catalog", pdf_url: "https://example.com/p.pdf" }), false);
  assert.equal(canAnalyseCandidate({ source_provider: "arxiv", source_external_id: "2401.1", landing_url: "https://arxiv.org/abs/2401.1", pdf_url: "https://arxiv.org/pdf/2401.1.pdf" }), true);
  assert.equal(canAnalyseCandidate({ source_provider: "arxiv", source_external_id: "2401.1" }), false);
});

test("arXiv provenance preserves source metadata only after a selected candidate", () => {
  const provenance = createArxivProvenance({
    source_provider: "arxiv", source_external_id: "2401.12345", landing_url: "https://arxiv.org/abs/2401.12345",
    pdf_url: "https://arxiv.org/pdf/2401.12345.pdf", source_retrieved_at: "2026-07-29T00:00:00Z",
    title: "Evidence", authors: ["Ada"], abstract: "Abstract", keywords: ["cs.AI"],
  });
  assert.equal(provenance.source_payload.id, "2401.12345");
  assert.equal(createArxivProvenance({ source_provider: "conference_catalog" }), null);
});

test("Discover empty states distinguish an unopened arXiv search from empty results", () => {
  assert.equal(getDiscoverEmptyState({ mode: "arxiv", query: "" }).title, "Search arXiv");
  assert.equal(getDiscoverEmptyState({ mode: "collection", query: "none" }).title, "No papers found");
});
