import { translateUiText } from "../lib/languageState.mjs";

const LIBRARY_PROMPTS = [
  "What are the main themes across my library?",
  "Which articles need follow-up?",
  "Create a reading plan from recent papers.",
];

const TAGGED_PROMPTS = [
  "Summarize the tagged articles.",
  "Compare methods across tagged articles.",
  "Find agreements and conflicts in tagged articles.",
];

/**
 * @typedef {{ text: string, label: string }} ChatStarterPrompt
 * @typedef {{
 *   title: string,
 *   detail: string,
 *   primaryAction: "upload" | null,
 *   primaryLabel: string,
 *   prompts: ChatStarterPrompt[],
 * }} ChatStartState
 */

function toPromptItems(prompts) {
  return prompts.map((text) => ({ text, label: text }));
}

export function createChatStarterPromptDraft(prompt, language = "en") {
  return translateUiText(prompt?.text || "", language);
}

/**
 * @param {{ articleCount?: number, taggedCount?: number }} input
 * @returns {ChatStartState}
 */
export function createChatStartState({ articleCount = 0, taggedCount = 0 } = {}) {
  if (articleCount <= 0) {
    return {
      title: "Upload articles to start chatting",
      detail: "Add documents first, then ask questions with source context.",
      primaryAction: "upload",
      primaryLabel: "Upload articles",
      prompts: [],
    };
  }

  return {
    title: "Start a conversation",
    detail: "Use a starter or ask your own question. Tag articles with @ for focused context.",
    primaryAction: null,
    primaryLabel: "",
    prompts: toPromptItems(taggedCount > 0 ? TAGGED_PROMPTS : LIBRARY_PROMPTS),
  };
}
