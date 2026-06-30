const EMPTY_SUMMARY = {
  active: 0,
  queued: 0,
  failed: 0,
  completed: 0,
  attentionCount: 0,
  badgeLabel: "",
  badgeTone: "default",
  shouldShowBadge: false,
};

function pluralize(count, word) {
  return `${count} ${word}`;
}

export function summarizeNavQueue(jobs = []) {
  const summary = { ...EMPTY_SUMMARY };

  for (const job of jobs) {
    if (job?.queue_state === "active") summary.active += 1;
    if (job?.queue_state === "queued") summary.queued += 1;
    if (job?.queue_state === "failed") summary.failed += 1;
    if (job?.queue_state === "completed") summary.completed += 1;
  }

  summary.attentionCount = summary.active + summary.queued + summary.failed;
  summary.shouldShowBadge = summary.attentionCount > 0;

  if (summary.failed > 0) {
    summary.badgeLabel = pluralize(summary.failed, "failed");
    summary.badgeTone = "destructive";
    return summary;
  }

  if (summary.active > 0) {
    summary.badgeLabel = pluralize(summary.active, "active");
    return summary;
  }

  if (summary.queued > 0) {
    summary.badgeLabel = pluralize(summary.queued, "queued");
  }

  return summary;
}
