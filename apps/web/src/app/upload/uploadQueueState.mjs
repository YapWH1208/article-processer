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

export function canOpenArticleDetail(file) {
  return Number.isFinite(Number(file?.articleId));
}

export function clearFinishedProcessingFiles(files) {
  return files.filter((file) => !TERMINAL_STATUSES.has(String(file?.status || "processing")));
}

export function shouldResumeProcessingFile(file) {
  return Boolean(file?.articleId && !TERMINAL_STATUSES.has(file.status));
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function createUploadQueueSummary(files) {
  const counts = files.reduce(
    (summary, file) => {
      const status = String(file?.status || "processing");
      if (status === "failed") summary.failed += 1;
      else if (status === "completed" || status === "needs_review") summary.ready += 1;
      else summary.processing += 1;
      return summary;
    },
    { processing: 0, ready: 0, failed: 0 },
  );

  let title = "Upload progress";
  if (counts.processing > 0) {
    title = `Processing ${countLabel(counts.processing, "file")}`;
  } else if (counts.ready > 0 && counts.failed > 0) {
    title = `${countLabel(counts.ready, "article")} ready · ${countLabel(counts.failed, "upload")} ${counts.failed === 1 ? "needs" : "need"} attention`;
  } else if (counts.ready > 0) {
    title = `${countLabel(counts.ready, "article")} ready`;
  } else if (counts.failed > 0) {
    title = `${countLabel(counts.failed, "upload")} ${counts.failed === 1 ? "needs" : "need"} attention`;
  }

  return {
    counts,
    title,
    hasFinished: counts.ready + counts.failed > 0,
  };
}
