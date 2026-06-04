import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenArticleDetail,
  clearFinishedProcessingFiles,
  createUploadQueueSnapshot,
  shouldResumeProcessingFile,
  upsertProcessingFile,
} from "./uploadQueueState.mjs";

test("upload queue upsert replaces an existing article row without duplicating it", () => {
  const files = upsertProcessingFile(
    [
      { articleId: 1, filename: "old.pdf", status: "processing", step: "parsing", error: null },
      { articleId: 2, filename: "other.pdf", status: "completed", step: "graph", error: null },
    ],
    { articleId: 1, filename: "new.pdf", status: "failed", step: "extracting", error: "Bad JSON" }
  );

  assert.deepEqual(files, [
    { articleId: 1, filename: "new.pdf", status: "failed", step: "extracting", error: "Bad JSON" },
    { articleId: 2, filename: "other.pdf", status: "completed", step: "graph", error: null },
  ]);
});

test("upload queue snapshot keeps recent normalized rows and resumes only active work", () => {
  const snapshot = createUploadQueueSnapshot([
    { articleId: 1, filename: "a.pdf", status: "processing", step: null, error: null },
    { articleId: 2, filename: "b.pdf", status: "completed", step: "graph", error: null },
    { articleId: 3, filename: "c.pdf", status: "failed", step: "extracting", error: "No JSON" },
  ]);

  assert.deepEqual(snapshot, [
    { articleId: 1, filename: "a.pdf", status: "processing", step: null, error: null },
    { articleId: 2, filename: "b.pdf", status: "completed", step: "graph", error: null },
    { articleId: 3, filename: "c.pdf", status: "failed", step: "extracting", error: "No JSON" },
  ]);
  assert.equal(shouldResumeProcessingFile(snapshot[0]), true);
  assert.equal(shouldResumeProcessingFile(snapshot[1]), false);
  assert.equal(shouldResumeProcessingFile(snapshot[2]), false);
});

test("upload queue allows opening article detail as soon as an article id exists", () => {
  assert.equal(
    canOpenArticleDetail({ articleId: 42, filename: "paper.pdf", status: "processing" }),
    true
  );
  assert.equal(
    canOpenArticleDetail({ articleId: Number.NaN, filename: "paper.pdf", status: "processing" }),
    false
  );
});

test("upload queue clears finished rows without dropping active progress", () => {
  assert.deepEqual(
    clearFinishedProcessingFiles([
      { articleId: 1, filename: "active.pdf", status: "processing", step: "extracting", error: null },
      { articleId: 2, filename: "complete.pdf", status: "completed", step: "graph", error: null },
      { articleId: 3, filename: "failed.pdf", status: "failed", step: "extracting", error: "Bad JSON" },
      { articleId: 4, filename: "review.pdf", status: "needs_review", step: "graph", error: null },
    ]),
    [
      { articleId: 1, filename: "active.pdf", status: "processing", step: "extracting", error: null },
    ]
  );
});
