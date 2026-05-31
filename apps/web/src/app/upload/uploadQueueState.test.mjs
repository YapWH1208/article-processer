import assert from "node:assert/strict";
import test from "node:test";

import {
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
