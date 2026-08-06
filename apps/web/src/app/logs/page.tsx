"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ScrollText, Clock, CheckCircle2, AlertCircle, Loader2, Brain,
  Layers, ArrowLeft, ChevronRight, Zap, Hash, BarChart3, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/LanguageProvider";
import { getJobQueue, reprocessArticle } from "@/lib/api";
import type { JobQueueItem } from "@/lib/types";
import { getJobQueueActionState, summarizeJobQueue } from "./jobQueueState.mjs";

interface LogEntry {
  step: string;
  timestamp: string;
  message: string;
  error?: boolean;
}

interface TokenUsage {
  step: string;
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface JobItem {
  job_id: number;
  article_id: number;
  article_title: string;
  status: string;
  current_step: string | null;
  logs: LogEntry[];
  error: string | null;
  created_at: string | null;
  completed_at: string | null;
  token_usage: TokenUsage[];
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  parsing: <ScrollText className="h-3.5 w-3.5" />,
  chunking: <Hash className="h-3.5 w-3.5" />,
  extracting: <Brain className="h-3.5 w-3.5" />,
  indexing: <Layers className="h-3.5 w-3.5" />,
  graph: <BarChart3 className="h-3.5 w-3.5" />,
};

function elapsed(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.round((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainder = secs % 60;
  return `${mins}m ${remainder}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function LogsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [queueJobs, setQueueJobs] = useState<JobQueueItem[]>([]);
  const [queueCounts, setQueueCounts] = useState({ active: 0, queued: 0, failed: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    const [res, queue] = await Promise.all([
      fetch(`${API_BASE}/dashboard/logs?limit=100`),
      getJobQueue(100).catch(() => null),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    setJobs(d.jobs || []);
    if (queue) {
      const summary = summarizeJobQueue(queue.jobs || []);
      setQueueJobs(summary.jobs);
      setQueueCounts(summary.counts);
    }
    return d;
  };

  const retryJob = async (job: JobQueueItem) => {
    setRetryingJobId(job.job_id);
    try {
      await reprocessArticle(job.article_id, "full", language);
      toast.success(`Requeued "${job.article_title}"`);
      await fetchLogs();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryingJobId(null);
    }
  };

  useEffect(() => {
    fetchLogs()
      .then(() => setLoading(false))
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // Live polling
  useEffect(() => {
    if (!liveMode) return;
    const interval = setInterval(() => { fetchLogs().catch(() => {}); }, 2000);
    return () => clearInterval(interval);
  }, [liveMode]);

  // Auto-scroll in live mode
  useEffect(() => {
    if (liveMode) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [jobs, liveMode]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Processing Logs</h1>
          <p className="text-muted-foreground mt-1 text-pretty">
            Step-by-step processing history and token usage for all articles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={liveMode ? "default" : "outline"}
            size="sm"
            onClick={() => setLiveMode((prev) => !prev)}
            className="gap-1.5"
          >
            {liveMode && <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>}
            {liveMode ? "Live" : "Live"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
        </div>
      </motion.div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading logs…
        </div>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Failed to load logs: {error}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && jobs.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground py-12">
            <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No processing jobs found.</p>
            <p className="text-sm mt-1">Upload an article to see logs here.</p>
          </CardContent>
        </Card>
      )}

      {!loading && queueJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Job Queue</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Current processing work across the local queue.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  ["Active", queueCounts.active],
                  ["Queued", queueCounts.queued],
                  ["Failed", queueCounts.failed],
                  ["Done", queueCounts.completed],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-md border px-2 py-1.5 min-w-16">
                    <div className="text-base font-semibold tabular-nums">{value as number}</div>
                    <div className="text-[10px] text-muted-foreground">{label as string}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {queueJobs.slice(0, 8).map((job) => {
              const actionState = getJobQueueActionState(job, retryingJobId);
              return (
                <div key={job.job_id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={job.queue_state === "failed" ? "destructive" : job.queue_state === "completed" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {job.queue_state}
                      </Badge>
                      <span className="font-medium truncate">{job.article_title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Job #{job.job_id}</span>
                      {job.current_step && <span>Step: {job.current_step}</span>}
                      <span>{elapsed(job.created_at, job.completed_at)}</span>
                      {job.worker_id && <span>{job.worker_id}</span>}
                    </div>
                    {job.error && <p className="mt-1 text-xs text-destructive line-clamp-1">{job.error}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {actionState.canRetry && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={actionState.retryDisabled}
                        onClick={() => retryJob(job)}
                      >
                        <RotateCw className={`h-3.5 w-3.5 ${retryingJobId === job.job_id ? "animate-spin" : ""}`} />
                        {actionState.retryLabel}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/articles/${job.article_id}`)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {jobs.map((job, i) => (
        <motion.div
          key={job.job_id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base truncate">
                      {job.article_title}
                    </CardTitle>
                    <Badge
                      variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {elapsed(job.created_at, job.completed_at)}
                    </span>
                    <span>Article #{job.article_id}</span>
                    {job.current_step && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {job.current_step}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/articles/${job.article_id}`)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
              {/* Step logs */}
              {job.logs.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Steps</p>
                  {job.logs.map((entry, j) => (
                    <div
                      key={j}
                      className={`flex items-center gap-2 text-xs rounded px-2 py-1 ${
                        entry.error ? "bg-destructive/10 text-destructive" : "bg-muted/40"
                      }`}
                    >
                      <span className="shrink-0">
                        {entry.error ? (
                          <AlertCircle className="h-3 w-3" />
                        ) : (
                          STEP_ICONS[entry.step] || <CheckCircle2 className="h-3 w-3" />
                        )}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="truncate">{entry.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Token usage */}
              {job.token_usage.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Token Usage</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.token_usage.map((t, k) => (
                      <Badge key={k} variant="outline" className="gap-1 text-[10px] px-1.5 py-0.5">
                        <span className="text-muted-foreground">{t.step}:</span>
                        <span className="font-medium">{formatTokens(t.total_tokens)}</span>
                        <span className="text-muted-foreground">
                          ({formatTokens(t.prompt_tokens)} in / {formatTokens(t.completion_tokens)} out)
                        </span>
                      </Badge>
                    ))}
                    {/* Total */}
                    <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0.5 ml-1">
                      <span className="text-muted-foreground">total:</span>
                      <span className="font-medium">
                        {formatTokens(job.token_usage.reduce((s, t) => s + t.total_tokens, 0))}
                      </span>
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
