import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkspacePanelSummary,
  createCitationReaderTarget,
  shouldUseWorkspaceSplit,
} from "./articleWorkspaceState.mjs";

test("citation target prefers a stable chunk anchor", () => {
  assert.deepEqual(
    createCitationReaderTarget({
      article_id: 12,
      article_title: "A Study",
      chunk_id: 4,
      section_title: "Findings",
      page_start: 8,
    }),
    {
      anchorId: "chunk-4",
      label: "Findings",
      meta: "A Study, p.8",
    }
  );
});

test("citation target falls back to a section anchor when chunk id is missing", () => {
  assert.deepEqual(
    createCitationReaderTarget({
      section_title: "Related Work & Methods",
    }),
    {
      anchorId: "related-work-methods",
      label: "Related Work & Methods",
      meta: "",
    }
  );
});

test("article workspace split remains desktop-only", () => {
  assert.equal(shouldUseWorkspaceSplit(1280), true);
  assert.equal(shouldUseWorkspaceSplit(760), false);
});

test("workspace panel summary counts chat, sources, jobs, and graph context", () => {
  const summary = createWorkspacePanelSummary({
    messages: [
      { role: "user", content: "Question", prompt_tokens: 8 },
      {
        role: "assistant",
        content: "Answer",
        completion_tokens: 16,
        citations_json: JSON.stringify([{ chunk_id: 1 }, { chunk_id: 2 }]),
      },
    ],
    jobs: [
      { status: "completed" },
      { status: "failed" },
      { status: "running" },
    ],
    graph: {
      entities: [{ id: 1 }, { id: 2 }],
      relationships: [{ id: 3 }],
    },
  });

  assert.deepEqual(summary, {
    messageCount: 2,
    sourceCount: 2,
    tokenCount: 24,
    jobCount: 3,
    activeJobCount: 1,
    failedJobCount: 1,
    entityCount: 2,
    relationshipCount: 1,
  });
});
