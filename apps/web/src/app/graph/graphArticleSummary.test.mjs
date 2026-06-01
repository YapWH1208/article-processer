import assert from "node:assert/strict";
import test from "node:test";

import { createGraphNodeArticleSummary } from "./graphArticleSummary.mjs";

test("graph node article summary prefers fetched article metadata", () => {
  const node = {
    label: "Retrieval Augmented Generation",
    type: "Method",
    articleId: 42,
    articleTitle: "Fallback graph title",
    confidence: 0.87,
  };
  const article = {
    id: 42,
    title: "Grounded RAG Systems",
    status: "completed",
    source_type: "pdf",
    original_filename: "rag.pdf",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-02T11:00:00Z",
    needs_review: false,
  };

  assert.deepEqual(createGraphNodeArticleSummary(node, article), {
    articleId: 42,
    title: "Grounded RAG Systems",
    status: "completed",
    sourceType: "pdf",
    originalFilename: "rag.pdf",
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-02T11:00:00Z",
    needsReview: false,
    nodeLabel: "Retrieval Augmented Generation",
    nodeType: "Method",
    confidenceLabel: "87%",
  });
});

test("graph node article summary falls back to graph data while article loads", () => {
  const node = {
    label: "Transformer",
    type: "Model",
    articleId: 7,
    articleTitle: "Attention Notes",
    confidence: null,
  };

  assert.deepEqual(createGraphNodeArticleSummary(node, null), {
    articleId: 7,
    title: "Attention Notes",
    status: "Loading",
    sourceType: "Unknown",
    originalFilename: null,
    createdAt: null,
    updatedAt: null,
    needsReview: false,
    nodeLabel: "Transformer",
    nodeType: "Model",
    confidenceLabel: "Unknown",
  });
});
