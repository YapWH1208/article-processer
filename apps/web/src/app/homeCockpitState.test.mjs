import assert from "node:assert/strict";
import test from "node:test";

import {
  createHomeArticleSummary,
  createHomeContentSearchHref,
  createHomeHealthSummary,
  createHomeQueueSummary,
} from "./homeCockpitState.mjs";

test("home article summary counts operational states and recent articles", () => {
  const summary = createHomeArticleSummary([
    { id: 1, title: "Done", original_filename: "done.pdf", status: "completed", updated_at: "2026-06-01T10:00:00Z" },
    { id: 2, title: "Failed", original_filename: "failed.pdf", status: "failed", updated_at: "2026-06-03T10:00:00Z" },
    { id: 3, title: "Review", original_filename: "review.pdf", status: "needs_review", updated_at: "2026-06-02T10:00:00Z" },
    { id: 4, title: "Parsing", original_filename: "parsing.pdf", status: "parsing", updated_at: "2026-06-04T10:00:00Z" },
    { id: 5, title: "", original_filename: "extra.pdf", status: "completed", updated_at: "2026-05-30T10:00:00Z" },
  ]);

  assert.equal(summary.total, 5);
  assert.equal(summary.completed, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.needsReview, 1);
  assert.equal(summary.processing, 1);
  assert.deepEqual(summary.recentArticles.map((article) => article.id), [4, 2, 3, 1, 5]);
  assert.equal(summary.recentArticles[4].displayTitle, "extra.pdf");
});

test("home article summary uses server totals when the recent article list is paged", () => {
  const summary = createHomeArticleSummary(
    [
      { id: 1, title: "Recent", original_filename: "recent.pdf", status: "completed", updated_at: "2026-06-04T10:00:00Z" },
    ],
    {
      total: 250,
      completed: 180,
      failed: 12,
      needsReview: 9,
      processing: 6,
    },
  );

  assert.equal(summary.total, 250);
  assert.equal(summary.completed, 180);
  assert.equal(summary.failed, 12);
  assert.equal(summary.needsReview, 9);
  assert.equal(summary.processing, 6);
  assert.deepEqual(summary.recentArticles.map((article) => article.id), [1]);
});

test("home article summary only counts needs-review status in the review bucket", () => {
  const summary = createHomeArticleSummary([
    { id: 1, status: "failed", needs_review: 1 },
    { id: 2, status: "needs_review", needs_review: 1 },
  ]);

  assert.equal(summary.failed, 1);
  assert.equal(summary.needsReview, 1);
});

test("home health summary distinguishes connected mock and real providers", () => {
  assert.deepEqual(createHomeHealthSummary(null), {
    connected: false,
    statusLabel: "Backend offline",
    providerLabel: "Unavailable",
    modelLabel: "No model",
    mock: false,
  });

  assert.deepEqual(createHomeHealthSummary({ status: "ok", mock_ai: true }), {
    connected: true,
    statusLabel: "Backend connected",
    providerLabel: "Mock AI",
    modelLabel: "Local deterministic mode",
    mock: true,
  });

  assert.deepEqual(
    createHomeHealthSummary({
      status: "ok",
      mock_ai: false,
      llm_provider_name: "OpenAI Work",
      llm_provider: "openai",
      llm_model: "gpt-4.1-mini",
    }),
    {
      connected: true,
      statusLabel: "Backend connected",
      providerLabel: "OpenAI Work",
      modelLabel: "gpt-4.1-mini",
      mock: false,
    }
  );
});

test("home queue summary prioritizes active and failed work", () => {
  const summary = createHomeQueueSummary([
    { job_id: 1, queue_state: "completed", article_title: "Done" },
    { job_id: 2, queue_state: "failed", article_title: "Broken" },
    { job_id: 3, queue_state: "queued", article_title: "Waiting" },
    { job_id: 4, queue_state: "active", article_title: "Running" },
  ]);

  assert.deepEqual(summary.counts, {
    active: 1,
    queued: 1,
    failed: 1,
    completed: 1,
  });
  assert.deepEqual(summary.focusJobs.map((job) => job.job_id), [4, 3, 2]);
});

test("home content search links to the article content query parameter", () => {
  assert.equal(createHomeContentSearchHref(" retrieval augmented generation "), "/articles?q=retrieval+augmented+generation");
  assert.equal(createHomeContentSearchHref(""), null);
});
