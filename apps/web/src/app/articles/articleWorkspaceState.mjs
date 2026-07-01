import { getPromptText, getPromptWrapperLabels } from "../../lib/languageState.mjs";

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
  const { selectedContext: contextLabel, question: questionLabel } = getPromptWrapperLabels(language);

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

/**
 * @param {{
 *   article?: { status?: string, processing_error?: string | null } | null,
 *   extractionErrors?: string[],
 * }} input
 */
export function createArticleStatusCallout({ article = null, extractionErrors = [] } = {}) {
  if (!article) return null;

  if (article.status === "failed") {
    return {
      tone: "destructive",
      title: "Processing failed",
      detail: article.processing_error || "The latest processing job failed.",
      actions: [
        { id: "retry_processing", label: "Retry processing", mode: "full" },
        { id: "view_jobs", label: "View jobs" },
      ],
    };
  }

  if (article.status === "needs_review" && extractionErrors.length > 0) {
    return {
      tone: "warning",
      title: "Extraction needs review",
      detail: extractionErrors.join("; "),
      actions: [
        { id: "review_extraction", label: "Review extraction" },
        { id: "rerun_extraction", label: "Rerun extraction", mode: "extract_only" },
      ],
    };
  }

  return null;
}
