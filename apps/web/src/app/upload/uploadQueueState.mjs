const SNAPSHOT_LIMIT = 10;
const TERMINAL_STATUSES = new Set(["completed", "failed", "needs_review"]);

function normalizeProcessingFile(file) {
  return {
    filename: String(file?.filename || "Untitled"),
    articleId: Number(file?.articleId),
    step: file?.step || null,
    status: String(file?.status || "processing"),
    error: file?.error || null,
  };
}

export function upsertProcessingFile(files, incoming) {
  const next = normalizeProcessingFile(incoming);
  return [next, ...files.filter((file) => Number(file.articleId) !== next.articleId)];
}

export function createUploadQueueSnapshot(files) {
  return files
    .map(normalizeProcessingFile)
    .filter((file) => Number.isFinite(file.articleId))
    .slice(0, SNAPSHOT_LIMIT);
}

export function shouldResumeProcessingFile(file) {
  return Boolean(file?.articleId && !TERMINAL_STATUSES.has(file.status));
}
