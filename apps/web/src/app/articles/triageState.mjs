export function getTriageWorkspaceState(extraction) {
  const triage = extraction?.triage;
  return {
    defaultTab: triage ? "triage" : "guide",
    triage: triage || null,
  };
}

export function createTriageEvidenceTarget(evidence) {
  if (!evidence?.source_section) {
    return { available: false, label: "Source unavailable", citation: null };
  }
  return {
    available: true,
    label: "View source",
    citation: {
      section_title: evidence.source_section || null,
      chunk_id: evidence.chunk_id ?? null,
      page_start: evidence.page_number ?? null,
      page_end: evidence.page_number ?? null,
      snippet: evidence.snippet || null,
    },
  };
}

/**
 * @param {{ articleId?: number, articleTitle?: string, selectedArticleIds?: number[] }} input
 */
export function createTriageComparison({ articleId, articleTitle = "this paper", selectedArticleIds = [] } = {}) {
  const currentId = Number(articleId);
  const selectedIds = Array.from(new Set(
    selectedArticleIds.map(Number).filter((id) => Number.isFinite(id) && id !== currentId),
  ));
  if (!Number.isFinite(currentId) || selectedIds.length < 2) return null;

  return {
    articleIds: [currentId, ...selectedIds],
    prompt: `Compare "${articleTitle}" with the selected papers. Contrast the research task, method, results, and limitations. Identify agreements, differences, and uncertainty using only paper-supported evidence.`,
  };
}
