import assert from "node:assert/strict";
import test from "node:test";

import * as workspaceState from "./articleWorkspaceState.mjs";

const {
  createWorkspacePanelSummary,
  createCitationReaderTarget,
  shouldUseWorkspaceSplit,
} = workspaceState;

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

test("chat submission preserves selected context without making empty prompts", () => {
  assert.equal(typeof workspaceState.createChatSubmission, "function");

  assert.equal(
    workspaceState.createChatSubmission({ question: "   ", contextText: "" }),
    null
  );

  assert.deepEqual(
    workspaceState.createChatSubmission({
      question: "  What changed?  ",
      contextText: "",
    }),
    { content: "What changed?" }
  );

  assert.deepEqual(
    workspaceState.createChatSubmission({
      question: "",
      contextText: "[From Reader]:\nImportant passage",
    }),
    {
      content:
        "[User selected context]:\n[From Reader]:\nImportant passage\n\n[Question]: Tell me about this",
    }
  );
});

test("chat submission uses localized fallback prompt for selected context", () => {
  assert.deepEqual(
    workspaceState.createChatSubmission({
      question: "",
      contextText: "[From Reader]:\nImportant passage",
      language: "zh",
    }),
    {
      content:
        "[用户选择的上下文]:\n[From Reader]:\nImportant passage\n\n[问题]: 请介绍这段内容",
    }
  );
});
