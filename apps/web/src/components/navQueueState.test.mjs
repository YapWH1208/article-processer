import assert from "node:assert/strict";
import test from "node:test";

import { summarizeNavQueue } from "./navQueueState.mjs";

test("nav queue summary prioritizes failed work", () => {
  const summary = summarizeNavQueue([
    { queue_state: "active" },
    { queue_state: "queued" },
    { queue_state: "failed" },
    { queue_state: "failed" },
    { queue_state: "completed" },
  ]);

  assert.equal(summary.active, 1);
  assert.equal(summary.queued, 1);
  assert.equal(summary.failed, 2);
  assert.equal(summary.completed, 1);
  assert.equal(summary.attentionCount, 4);
  assert.equal(summary.badgeTone, "destructive");
  assert.equal(summary.badgeLabel, "2 failed");
  assert.equal(summary.shouldShowBadge, true);
});

test("nav queue summary reports active and queued work", () => {
  assert.deepEqual(
    summarizeNavQueue([{ queue_state: "queued" }, { queue_state: "queued" }]),
    {
      active: 0,
      queued: 2,
      failed: 0,
      completed: 0,
      attentionCount: 2,
      badgeLabel: "2 queued",
      badgeTone: "default",
      shouldShowBadge: true,
    },
  );

  assert.equal(
    summarizeNavQueue([{ queue_state: "active" }]).badgeLabel,
    "1 active",
  );
});

test("nav queue summary hides completed-only queues", () => {
  const summary = summarizeNavQueue([
    { queue_state: "completed" },
    { queue_state: "completed" },
  ]);

  assert.equal(summary.completed, 2);
  assert.equal(summary.attentionCount, 0);
  assert.equal(summary.badgeLabel, "");
  assert.equal(summary.shouldShowBadge, false);
});
