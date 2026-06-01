export function createGraphNodeArticleSummary(node, article) {
  const confidence = typeof node?.confidence === "number"
    ? `${Math.round(node.confidence * 100)}%`
    : "Unknown";

  return {
    articleId: node.articleId,
    title: article?.title || node.articleTitle || `Article #${node.articleId}`,
    status: article?.status || "Loading",
    sourceType: article?.source_type || "Unknown",
    originalFilename: article?.original_filename || null,
    createdAt: article?.created_at || null,
    updatedAt: article?.updated_at || null,
    needsReview: Boolean(article?.needs_review),
    nodeLabel: node.label,
    nodeType: node.type,
    confidenceLabel: confidence,
  };
}
