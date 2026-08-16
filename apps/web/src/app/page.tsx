"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Settings2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getJobQueue, healthCheck, listArticles } from "@/lib/api";
import type { HealthInfo } from "@/lib/types";
import {
  createHomeArticleSummary,
  createHomeContentSearchHref,
  createHomeExperienceState,
  createHomeHealthSummary,
  createHomeQueueSummary,
} from "./homeCockpitState.mjs";

type ArticleHit = {
  id: number;
  title: string;
  original_filename: string;
  status: string;
  updated_at?: string;
  created_at?: string;
  displayTitle?: string;
};

type QueueJob = {
  job_id: number;
  article_id: number;
  article_title: string;
  queue_state: "active" | "queued" | "failed" | "completed";
  current_step?: string | null;
  error?: string | null;
};

type HomeHealth = HealthInfo & {
  llm_provider_name?: string;
};

type HomeArticleTotals = {
  total: number;
  completed: number;
  failed: number;
  needsReview: number;
  processing: number;
};

const HOME_PROCESSING_STATUSES = ["uploaded", "parsing", "extracting", "indexing"] as const;

async function loadHomeArticleTotals(): Promise<HomeArticleTotals> {
  const [all, completed, failed, needsReview, ...processing] = await Promise.all([
    listArticles({ limit: 1 }),
    listArticles({ status: "completed", limit: 1 }),
    listArticles({ status: "failed", limit: 1 }),
    listArticles({ status: "needs_review", limit: 1 }),
    ...HOME_PROCESSING_STATUSES.map((status) => listArticles({ status, limit: 1 })),
  ]);

  return {
    total: all.total || 0,
    completed: completed.total || 0,
    failed: failed.total || 0,
    needsReview: needsReview.total || 0,
    processing: processing.reduce((sum, response) => sum + (response.total || 0), 0),
  };
}

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
  loading,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  tone: string;
  loading: boolean;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-4 p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
            {loading ? <Skeleton className="mt-1 h-7 w-14" /> : <p className="text-2xl font-bold tabular-nums">{value}</p>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <div className="flex h-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function FirstRunWorkspace({
  healthSummary,
  refreshing,
  onRefresh,
}: {
  healthSummary: ReturnType<typeof createHomeHealthSummary>;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const steps = [
    {
      icon: Upload,
      title: "Add your first source",
      detail: "Choose a document or paste a scholarly URL.",
    },
    {
      icon: Brain,
      title: "Let local AI organize it",
      detail: "Article Processor parses the source and extracts useful structure.",
    },
    {
      icon: MessageCircle,
      title: "Read, ask, and explore",
      detail: "Open the reading guide, ask questions, and follow connected concepts.",
    },
  ];

  return (
    <section aria-labelledby="first-run-title" className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="p-6 sm:p-8">
          <Badge variant="secondary">New workspace</Badge>
          <h2 id="first-run-title" className="mt-4 max-w-2xl text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Turn your first article into something you can explore
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground text-pretty">
            Add one paper, document, or scholarly link. The local pipeline will prepare a reading guide, structured insights, chat context, and graph connections.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="gap-2 sm:w-auto">
              <Link href="/upload">
                <Upload className="h-4 w-4" />
                Upload your first article
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 sm:w-auto">
              <Link href="/settings">
                <Settings2 className="h-4 w-4" />
                Review AI setup
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">PDF, ZIP, HTML, Markdown, or text — up to 50 MB.</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Your first result in three steps</CardTitle>
            <CardDescription>No workspace configuration is required in Mock AI mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{index + 1}. {step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {healthSummary.connected ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {healthSummary.connected ? "Local processing is ready" : "Local API needs attention"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {healthSummary.connected
                    ? <><span>{healthSummary.providerLabel}</span><span aria-hidden="true"> · </span><span>{healthSummary.modelLabel}</span></>
                    : "Start the local API, then check the connection again."}
                </p>
              </div>
            </div>
            {!healthSummary.connected && (
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />
                Retry connection
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function statusVariant(status: string) {
  if (status === "failed") return "destructive" as const;
  if (status === "completed" || status === "active") return "default" as const;
  return "secondary" as const;
}

function formatDate(value?: string) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString();
}

export default function HomePage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleHit[]>([]);
  const [articleTotals, setArticleTotals] = useState<HomeArticleTotals | null>(null);
  const [health, setHealth] = useState<HomeHealth | null>(null);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCockpit = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    const [healthResult, articlesResult, articleTotalsResult, queueResult] = await Promise.allSettled([
      healthCheck(),
      listArticles({ limit: 5, sort_by: "updated_at", sort_order: "desc" }),
      loadHomeArticleTotals(),
      getJobQueue(100),
    ]);

    setHealth(healthResult.status === "fulfilled" ? (healthResult.value as HomeHealth) : null);

    if (articlesResult.status === "fulfilled") {
      setArticles((articlesResult.value.articles || []) as ArticleHit[]);
    } else {
      setArticles([]);
      setError("Unable to load articles.");
    }

    if (articleTotalsResult.status === "fulfilled") {
      setArticleTotals(articleTotalsResult.value);
    } else {
      setArticleTotals(null);
    }

    if (queueResult.status === "fulfilled") {
      setQueueJobs((queueResult.value.jobs || []) as QueueJob[]);
    } else {
      setQueueJobs([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadCockpit();
  }, [loadCockpit]);

  const articleSummary = useMemo(() => createHomeArticleSummary(articles, articleTotals ?? undefined), [articles, articleTotals]);
  const healthSummary = useMemo(() => createHomeHealthSummary(health), [health]);
  const queueSummary = useMemo(() => createHomeQueueSummary(queueJobs), [queueJobs]);
  const attentionCount = articleSummary.failed + articleSummary.needsReview + queueSummary.counts.failed;
  const experienceState = createHomeExperienceState({ loading, error, total: articleTotals?.total });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const href = createHomeContentSearchHref(query);
    if (href) router.push(href);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-balance">Workspace</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            Upload, process, review, and ask questions across your local article library.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={healthSummary.connected ? "default" : "destructive"} className="gap-1.5">
            {healthSummary.connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {healthSummary.statusLabel}
          </Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={loadCockpit} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {experienceState === "first_run" ? (
        <FirstRunWorkspace healthSummary={healthSummary} refreshing={refreshing} onRefresh={loadCockpit} />
      ) : (
        <>
      <section className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Search Library</CardTitle>
            <CardDescription>Find answers or jump into articles by searching parsed content.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search all article content..."
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={!query.trim()} className="gap-1.5">
                Search
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <QuickAction href="/upload" title="Upload" description="Add files or import a URL." icon={Upload} />
              <QuickAction href="/articles" title="Library" description="Browse, filter, and batch export." icon={BookOpen} />
              <QuickAction href="/chat" title="Chat" description="Ask across tagged articles or the whole library." icon={MessageCircle} />
              <QuickAction href="/logs" title="Jobs" description="Watch processing and retry failed work." icon={Clock} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-4 w-4 text-primary" />
              AI Setup
            </CardTitle>
            <CardDescription>Current local processing mode.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-56" />
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="truncate font-medium">{healthSummary.providerLabel}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Model</span>
                  <span className="truncate font-medium">{healthSummary.modelLabel}</span>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                  <Link href="/settings">
                    <Settings2 className="h-3.5 w-3.5" />
                    Configure Providers
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Articles" value={articleSummary.total} icon={FileText} tone="bg-blue-500/10 text-blue-500" loading={loading} href="/articles" />
        <StatCard title="Processing" value={articleSummary.processing + queueSummary.counts.active + queueSummary.counts.queued} icon={Loader2} tone="bg-amber-500/10 text-amber-600" loading={loading} href="/logs" />
        <StatCard title="Needs Review" value={articleSummary.needsReview} icon={AlertCircle} tone="bg-purple-500/10 text-purple-500" loading={loading} href="/articles?status=needs_review" />
        <StatCard title="Attention" value={attentionCount} icon={BarChart3} tone="bg-red-500/10 text-red-500" loading={loading} href="/logs" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Work Queue</CardTitle>
            <CardDescription>Active, queued, and failed processing work.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : queueSummary.focusJobs.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No active or failed jobs. Upload an article to start processing.
              </div>
            ) : (
              <div className="space-y-2">
                {queueSummary.focusJobs.map((job: QueueJob) => (
                  <div key={job.job_id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(job.queue_state)} className="text-[10px]">
                          {job.queue_state}
                        </Badge>
                        <span className="truncate text-sm font-medium">{job.article_title || `Job #${job.job_id}`}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {job.current_step ? `Step: ${job.current_step}` : job.error || `Job #${job.job_id}`}
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/articles/${job.article_id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
                <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                  <Link href="/logs">
                    Open Jobs
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Articles</CardTitle>
            <CardDescription>Latest files in your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : articleSummary.recentArticles.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm font-medium">No articles yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Upload a PDF, Markdown, HTML, text file, or ZIP archive.</p>
                <Button asChild size="sm" className="mt-4 gap-1.5">
                  <Link href="/upload">
                    Upload Articles
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {articleSummary.recentArticles.map((article: ArticleHit) => (
                  <Link key={article.id} href={`/articles/${article.id}`} className="block rounded-md border px-3 py-2 transition-colors hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{article.displayTitle || article.title || article.original_filename}</p>
                      <Badge variant={statusVariant(article.status)} className="text-[10px]">
                        {article.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(article.updated_at || article.created_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <QuickAction href="/dashboard" title="Metrics" description="Review throughput, tokens, and model usage." icon={BarChart3} />
        <QuickAction href="/graph" title="Graph" description="Explore extracted entities and article connections." icon={GitBranch} />
        <QuickAction href="/settings" title="Settings" description="Manage providers, parsers, prompts, and data export." icon={Settings2} />
      </section>
        </>
      )}
    </div>
  );
}
