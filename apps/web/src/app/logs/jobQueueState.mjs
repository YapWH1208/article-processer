const STATE_ORDER = {
  active: 0,
  queued: 1,
  failed: 2,
  completed: 3,
};

export function summarizeJobQueue(jobs) {
  const counts = {
    active: 0,
    queued: 0,
    failed: 0,
    completed: 0,
  };

  for (const job of jobs) {
    if (job.queue_state in counts) {
      counts[job.queue_state] += 1;
    }
  }

  const sorted = [...jobs].sort((a, b) => {
    const stateDelta = (STATE_ORDER[a.queue_state] ?? 99) - (STATE_ORDER[b.queue_state] ?? 99);
    if (stateDelta !== 0) return stateDelta;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return { counts, jobs: sorted };
}
