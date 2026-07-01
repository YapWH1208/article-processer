import assert from "node:assert/strict";
import test from "node:test";

import { createUploadSetupChecklist } from "./setupChecklistState.mjs";

test("setup checklist reports mock AI as ready", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: { llmProvider: "mock", llmModel: "mock-model", mock: true },
    runAI: true,
    queueRestored: true,
  });

  assert.equal(checklist.readyCount, 3);
  assert.equal(checklist.total, 3);
  assert.equal(checklist.primaryMessage, "Ready with Mock AI");
  assert.equal(checklist.needsProviderSetup, false);
  assert.deepEqual(
    checklist.items.map((item) => item.state),
    ["complete", "complete", "complete"],
  );
});

test("setup checklist warns when AI is disabled for the upload", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: { llmProvider: "openai", llmModel: "gpt-4.1-mini", mock: false },
    runAI: false,
    queueRestored: true,
  });

  assert.equal(checklist.readyCount, 2);
  assert.equal(checklist.primaryMessage, "Upload only mode");
  assert.equal(checklist.items[1].state, "warning");
  assert.equal(checklist.items[1].detail, "Extraction, embeddings, and graph creation are off.");
});

test("setup checklist detects missing provider details", () => {
  const checklist = createUploadSetupChecklist({
    modelInfo: { llmProvider: "unknown", llmModel: "unknown", mock: false },
    runAI: true,
    queueRestored: true,
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
  });

  assert.equal(checklist.readyCount, 0);
  assert.equal(checklist.primaryMessage, "Checking local backend");
  assert.deepEqual(
    checklist.items.map((item) => item.state),
    ["pending", "pending", "pending"],
  );
});
