"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ScrollText, Clock, CheckCircle2, AlertCircle, Loader2, Brain,
  Layers, ArrowLeft, ChevronRight, Zap, Hash, BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    fetch(`${API_BASE}/logs?limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setJobs(d.jobs || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Processing Logs</h1>
          <p className="text-muted-foreground mt-1">
            Step-by-step processing history and token usage for all articles.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Button>
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
    </div>
  );
}
