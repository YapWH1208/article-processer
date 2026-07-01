import assert from "node:assert/strict";
import test from "node:test";

import { createChatStartState, createChatStarterPromptDraft } from "./chatStartState.mjs";

test("chat start state routes empty libraries to upload", () => {
  assert.deepEqual(
    createChatStartState({ articleCount: 0, taggedCount: 0 }),
    {
      title: "Upload articles to start chatting",
      detail: "Add documents first, then ask questions with source context.",
      primaryAction: "upload",
      primaryLabel: "Upload articles",
      prompts: [],
    },
  );
});

test("chat start state suggests library-wide prompts when articles exist", () => {
  const state = createChatStartState({ articleCount: 12, taggedCount: 0 });

  assert.equal(state.primaryAction, null);
  assert.equal(state.title, "Start a conversation");
  assert.deepEqual(
    state.prompts.map((prompt) => prompt.text),
    [
      "What are the main themes across my library?",
      "Which articles need follow-up?",
      "Create a reading plan from recent papers.",
    ],
  );
});

test("chat start state switches to tagged-article prompts when context is selected", () => {
  assert.deepEqual(
    createChatStartState({ articleCount: 12, taggedCount: 2 }).prompts.map((prompt) => prompt.text),
    [
      "Summarize the tagged articles.",
      "Compare methods across tagged articles.",
      "Find agreements and conflicts in tagged articles.",
    ],
  );
});

test("chat starter prompt draft follows the selected language", () => {
  assert.equal(
    createChatStarterPromptDraft({ text: "What are the main themes across my library?" }, "zh"),
    "我的文库有哪些主要主题？",
  );
  assert.equal(
    createChatStarterPromptDraft({ text: "我的文库有哪些主要主题？" }, "en"),
    "What are the main themes across my library?",
  );
});
