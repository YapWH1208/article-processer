import assert from "node:assert/strict";
import test from "node:test";

import { summarizeJobQueue } from "./jobQueueState.mjs";

test("job queue summary keeps active and queued work first", () => {
  const summary = summarizeJobQueue([
    { job_id: 1, queue_state: "completed", article_title: "Done" },
    { job_id: 2, queue_state: "failed", article_title: "Failed" },
    { job_id: 3, queue_state: "queued", article_title: "Waiting" },
    { job_id: 4, queue_state: "active", article_title: "Running" },
  ]);

  assert.deepEqual(summary.counts, {
    active: 1,
    queued: 1,
    failed: 1,
    completed: 1,
  });
  assert.deepEqual(summary.jobs.map((job) => job.job_id), [4, 3, 2, 1]);
});
