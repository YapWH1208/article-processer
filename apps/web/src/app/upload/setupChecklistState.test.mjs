import assert from "node:assert/strict";
import test from "node:test";

import { createUploadSetupChecklist } from "./setupChecklistState.mjs";

test("setup checklist reports mock AI as ready", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: { llmProvider: "mock", llmModel: "mock-model", mock: true },
    runAI: true,
    queueRestored: true,
    restoredCount: 0,
    backendState: "ready",
  });

  assert.equal(checklist.readyCount, 3);
  assert.equal(checklist.total, 3);
  assert.equal(checklist.primaryMessage, "Ready with Mock AI");
  assert.equal(checklist.needsProviderSetup, false);
  assert.deepEqual(
    checklist.items.map((item) => item.state),
    ["complete", "complete", "complete"],
  );
  assert.equal(checklist.items[2].detail, "Queue checked — no active uploads to restore.");
});

test("setup checklist warns when AI is disabled for the upload", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: { llmProvider: "openai", llmModel: "gpt-4.1-mini", mock: false },
    runAI: false,
    queueRestored: true,
    restoredCount: 2,
    backendState: "ready",
  });

  assert.equal(checklist.readyCount, 2);
  assert.equal(checklist.primaryMessage, "Upload only mode");
  assert.equal(checklist.items[1].state, "warning");
  assert.equal(checklist.items[1].detail, "Extraction, embeddings, and graph creation are off.");
  assert.equal(checklist.items[2].detail, "2 active uploads restored.");
});

test("setup checklist detects missing provider details", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: { llmProvider: "unknown", llmModel: "unknown", mock: false },
    runAI: true,
    queueRestored: true,
    backendState: "ready",
  });

  assert.equal(checklist.needsProviderSetup, true);
  assert.equal(checklist.items[1].state, "warning");
  assert.equal(checklist.items[1].detail, "Choose a provider and model before relying on AI extraction.");
});

test("setup checklist handles a backend still being checked", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: null,
    runAI: true,
    queueRestored: false,
    backendState: "checking",
  });

  assert.equal(checklist.readyCount, 0);
  assert.equal(checklist.primaryMessage, "Checking local backend");
  assert.deepEqual(
    checklist.items.map((item) => item.state),
    ["pending", "pending", "pending"],
  );
});

test("setup checklist exposes a retryable backend failure without claiming AI readiness", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: null,
    runAI: true,
    queueRestored: true,
    restoredCount: 1,
    backendState: "unavailable",
  });

  assert.equal(checklist.primaryMessage, "Local API unavailable");
  assert.equal(checklist.backendReady, false);
  assert.equal(checklist.backendUnavailable, true);
  assert.deepEqual(
    checklist.items.map((item) => item.state),
    ["error", "pending", "complete"],
  );
  assert.equal(checklist.items[1].detail, "AI readiness cannot be checked until the local API reconnects.");
  assert.equal(checklist.items[2].detail, "1 active upload restored.");
});
