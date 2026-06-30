const TERMINAL_STATUSES = new Set(["completed", "failed", "needs_review"]);
const QUEUE_ORDER = {
  active: 0,
  queued: 1,
  failed: 2,
  completed: 3,
};

function articleTimestamp(article) {
  return new Date(article?.updated_at || article?.created_at || 0).getTime() || 0;
}

export function createHomeArticleSummary(articles = []) {
  const normalizedArticles = Array.isArray(articles) ? articles : [];
  const recentArticles = normalizedArticles
    .map((article) => ({
      ...article,
      displayTitle: article?.title || article?.original_filename || `Article #${article?.id ?? ""}`.trim(),
    }))
    .sort((a, b) => articleTimestamp(b) - articleTimestamp(a))
    .slice(0, 5);

  return {
    total: normalizedArticles.length,
    completed: normalizedArticles.filter((article) => article?.status === "completed").length,
    failed: normalizedArticles.filter((article) => article?.status === "failed").length,
    needsReview: normalizedArticles.filter((article) => article?.status === "needs_review" || article?.needs_review).length,
    processing: normalizedArticles.filter((article) => article?.status && !TERMINAL_STATUSES.has(article.status)).length,
    recentArticles,
  };
}

export function createHomeHealthSummary(health) {
  const connected = health?.status === "ok";
  const mock = Boolean(connected && health?.mock_ai);

  return {
    connected,
    statusLabel: connected ? "Backend connected" : "Backend offline",
    providerLabel: connected
      ? mock
        ? "Mock AI"
        : health?.llm_provider_name || health?.llm_provider || "AI provider"
      : "Unavailable",
    modelLabel: connected
      ? mock
        ? "Local deterministic mode"
        : health?.llm_model || "Default model"
      : "No model",
    mock,
  };
}

export function createHomeQueueSummary(jobs = []) {
  const normalizedJobs = Array.isArray(jobs) ? jobs : [];
  const counts = {
    active: 0,
    queued: 0,
    failed: 0,
    completed: 0,
  };

  for (const job of normalizedJobs) {
    const state = job?.queue_state;
    if (state in counts) counts[state] += 1;
  }

  return {
    counts,
    focusJobs: [...normalizedJobs]
      .filter((job) => job?.queue_state && job.queue_state !== "completed")
      .sort((a, b) => (QUEUE_ORDER[a.queue_state] ?? 99) - (QUEUE_ORDER[b.queue_state] ?? 99))
      .slice(0, 5),
  };
}
