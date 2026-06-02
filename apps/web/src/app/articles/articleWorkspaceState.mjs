import { getPromptText } from "../../lib/languageState.mjs";

export function slugifyWorkspaceText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function createCitationReaderTarget(citation) {
  const label = citation?.section_title || `Chunk ${citation?.chunk_id ?? ""}`.trim();
  const anchorId =
    citation?.chunk_id != null
      ? `chunk-${citation.chunk_id}`
      : slugifyWorkspaceText(citation?.section_title);

  const metaParts = [];
  if (citation?.article_title) metaParts.push(citation.article_title);
  if (citation?.page_start) {
    const page =
      citation.page_end && citation.page_end !== citation.page_start
        ? `p.${citation.page_start}-${citation.page_end}`
        : `p.${citation.page_start}`;
    metaParts.push(page);
  }

  return {
    anchorId,
    label: label || "Source",
    meta: metaParts.join(", "),
  };
}

export function shouldUseWorkspaceSplit(width) {
  return Number(width) >= 1024;
}

export function createChatSubmission({ question = "", contextText = "", language = "en" } = {}) {
  const trimmedQuestion = String(question || "").trim();
  const selectedContext = String(contextText || "");
  const isChinese = language === "zh";
  const contextLabel = isChinese ? "[用户选择的上下文]" : "[User selected context]";
  const questionLabel = isChinese ? "[问题]" : "[Question]";

  if (!trimmedQuestion && !selectedContext) return null;

  return {
    content: selectedContext
      ? `${contextLabel}:\n${selectedContext}\n\n${questionLabel}: ${
          trimmedQuestion || getPromptText("contextDefault", language)
        }`
      : trimmedQuestion,
  };
}

function countSources(messages) {
  let count = 0;
  for (const message of messages || []) {
    if (!message?.citations_json) continue;
    try {
      const citations = JSON.parse(message.citations_json);
      if (Array.isArray(citations)) count += citations.length;
    } catch {
      // Ignore malformed historic citation payloads.
    }
  }
  return count;
}

/**
 * @param {{
 *   messages?: Array<{ citations_json?: string, prompt_tokens?: number, completion_tokens?: number }>,
 *   jobs?: Array<{ status?: string }>,
 *   graph?: { entities?: unknown[], relationships?: unknown[] } | null,
 * }} input
 */
export function createWorkspacePanelSummary({ messages = [], jobs = [], graph = null } = {}) {
  return {
    messageCount: messages.length,
    sourceCount: countSources(messages),
    tokenCount: messages.reduce(
      (sum, message) => sum + (message.prompt_tokens || 0) + (message.completion_tokens || 0),
      0
    ),
    jobCount: jobs.length,
    activeJobCount: jobs.filter((job) => !["completed", "failed"].includes(job.status)).length,
    failedJobCount: jobs.filter((job) => job.status === "failed").length,
    entityCount: Array.isArray(graph?.entities) ? graph.entities.length : 0,
    relationshipCount: Array.isArray(graph?.relationships) ? graph.relationships.length : 0,
  };
}
