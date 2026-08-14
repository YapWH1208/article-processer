"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Upload, FileText, CheckCircle2, AlertCircle, Inbox, Sparkles, Brain, Loader2, Eye, X, Settings2, Zap, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRawFetch, uploadFile, getArticleActiveJob } from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";
import { FadeIn } from "@/components/ui/animated";
import { canOpenArticleDetail, clearFinishedProcessingFiles, createUploadQueueSnapshot, createUploadQueueSummary, shouldResumeProcessingFile, upsertProcessingFile } from "./uploadQueueState.mjs";
import { createUploadSetupChecklist } from "./setupChecklistState.mjs";

interface ProcessingFile {
  filename: string;
  articleId: number;
  step: string | null;
  status: string;
  error: string | null;
}

const STEP_ORDER = ["uploaded", "parsing", "extracting", "embedding", "graph"] as const;
const UPLOAD_QUEUE_STORAGE_KEY = "article-processor.uploadQueue";

type AnalysisMode = "quick" | "deep" | "parse_only";
type BackendState = "checking" | "ready" | "unavailable";
type ModelInfo = {
  llmProvider: string;
  llmModel: string;
  llmProtocol: string | null;
  llmProviderName?: string;
  mock: boolean;
};

const MODE_OPTIONS: { value: AnalysisMode; label: string; icon: typeof Brain; detail: string }[] = [
  { value: "deep", label: "Deep Analysis", icon: Brain, detail: "Extraction, graph, and a comprehensive report" },
  { value: "quick", label: "Quick Read", icon: Zap, detail: "Full extraction and graph (default)" },
  { value: "parse_only", label: "Parse Only", icon: Eye, detail: "Convert to readable markdown, no AI" },
];

function ModeSelector({ value, onChange, disabled }: {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Analysis mode">
      {MODE_OPTIONS.map((option) => {
        const active = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
              active
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
            }`}
          >
            <span className={`flex items-center gap-1.5 text-sm font-medium ${active ? "text-primary" : ""}`}>
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </span>
            <span className="text-xs text-muted-foreground leading-4">{option.detail}</span>
          </button>
        );
      })}
    </div>
  );
}

function stepLabel(step: string | null): string {
  if (!step) return "Starting…";
  const labels: Record<string, string> = {
    uploaded: "Uploaded",
    parsing: "Parsing document…",
    chunking: "Chunking document…",
    extracting: "AI extracting…",
    embedding: "Building embeddings…",
    graph: "Building graph…",
    deep_report: "Generating deep analysis report…",
  };
  return labels[step] || step;
}

function stepProgress(step: string | null): number {
  if (!step) return 5;
  const idx = STEP_ORDER.indexOf(step as typeof STEP_ORDER[number]);
  if (idx === -1) return 50;
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100);
}

function isReadyStatus(status: string): boolean {
  return status === "completed" || status === "needs_review";
}

type SetupChecklist = ReturnType<typeof createUploadSetupChecklist>;

function SetupChecklistItems({ checklist }: { checklist: SetupChecklist }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {checklist.items.map((item) => (
        <div key={item.id} className="rounded-md border bg-background px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {item.state === "complete" ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : item.state === "warning" ? (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            ) : item.state === "error" ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />
            )}
            <span>{item.label}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function BackendRecoveryCard({ state, onRetry }: { state: BackendState; onRetry: () => void }) {
  const unavailable = state === "unavailable";
  return (
    <Card className={unavailable ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" role={unavailable ? "alert" : "status"}>
        <div className="flex items-start gap-3">
          {unavailable ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : (
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
          )}
          <div>
            <p className="text-sm font-semibold">{unavailable ? "Local API unavailable" : "Checking local API"}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {unavailable
                ? "Start the local API, then retry the connection before choosing a source."
                : "Source controls will be ready as soon as the local processing service responds."}
            </p>
          </div>
        </div>
        {unavailable && (
          <Button variant="outline" className="shrink-0 gap-2" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Retry connection
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function HealthySetupDetails({ checklist }: { checklist: SetupChecklist }) {
  const readinessLabel = `${checklist.readyCount}/${checklist.total} ready`;
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>
            <span className="block text-sm font-semibold">Processing setup</span>
            <span className="mt-1 block text-xs text-muted-foreground">{checklist.primaryMessage}</span>
            <span className="mt-1 block text-xs text-muted-foreground">Review connection, AI, and restored queue details.</span>
          </span>
          <Badge variant="outline" className="shrink-0">
            {readinessLabel}
          </Badge>
        </summary>
        <CardContent className="space-y-3 border-t pt-4">
          <SetupChecklistItems checklist={checklist} />
          {checklist.needsProviderSetup && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings" className="gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Configure provider
              </Link>
            </Button>
          )}
        </CardContent>
      </details>
    </Card>
  );
}

export default function UploadPage() {
  const { language } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [dragover, setDragover] = useState(false);
  const [mode, setMode] = useState<AnalysisMode>("quick");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSparkle, setShowSparkle] = useState(false);
  const [clearingFinished, setClearingFinished] = useState(false);
  const [queueRestored, setQueueRestored] = useState(false);
  const [restoredCount, setRestoredCount] = useState(0);
  const [backendState, setBackendState] = useState<BackendState>("checking");
  const pollIntervalsRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const clearFinishedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthRequestRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach((interval) => clearInterval(interval));
      if (clearFinishedTimeoutRef.current) clearTimeout(clearFinishedTimeoutRef.current);
      const request = healthRequestRef.current;
      healthRequestRef.current = null;
      request?.abort();
    };
  }, []);

  const loadBackendStatus = useCallback(async () => {
    healthRequestRef.current?.abort();
    const controller = new AbortController();
    healthRequestRef.current = controller;
    setBackendState("checking");
    setModelInfo(null);
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await apiRawFetch("/health", { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (healthRequestRef.current !== controller) return;
      setModelInfo({
        llmProvider: data.llm_provider || "unknown",
        llmModel: data.llm_model || "unknown",
        llmProtocol: data.llm_custom_protocol || null,
        llmProviderName: data.llm_provider_name,
        mock: data.mock_ai || false,
      });
      setBackendState("ready");
    } catch {
      if (healthRequestRef.current !== controller) return;
      setModelInfo(null);
      setBackendState("unavailable");
    } finally {
      clearTimeout(timeout);
      if (healthRequestRef.current === controller) healthRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    void loadBackendStatus();
  }, [loadBackendStatus]);

  const startPolling = useCallback((articleId: number, filename: string) => {
    // Set initial processing state
    setProcessingFiles((prev) =>
      upsertProcessingFile(prev, { filename, articleId, step: null, status: "processing", error: null })
    );

    const poll = async () => {
      try {
        const { job } = await getArticleActiveJob(articleId);
        setProcessingFiles((prev) =>
          upsertProcessingFile(
            prev,
            {
              filename,
              articleId,
              step: job?.current_step || null,
              status: job?.status === "completed" ? "completed"
                : job?.status === "failed" ? "failed"
                : "processing",
              error: job?.error || null,
            }
          )
        );
        // Stop polling when terminal
        if (job && (job.status === "completed" || job.status === "failed")) {
          const interval = pollIntervalsRef.current.get(articleId);
          if (interval) { clearInterval(interval); pollIntervalsRef.current.delete(articleId); }
        }
      } catch {
        // keep polling on transient errors
      }
    };

    const existingInterval = pollIntervalsRef.current.get(articleId);
    if (existingInterval) clearInterval(existingInterval);
    poll(); // immediate first poll
    const interval = setInterval(poll, 2000);
    pollIntervalsRef.current.set(articleId, interval);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOAD_QUEUE_STORAGE_KEY);
      const snapshot: ProcessingFile[] = raw ? createUploadQueueSnapshot(JSON.parse(raw)) : [];
      const activeRows = snapshot.filter(shouldResumeProcessingFile);
      setProcessingFiles(snapshot);
      setRestoredCount(activeRows.length);
      activeRows.forEach((file) => startPolling(file.articleId, file.filename));
    } catch {
      localStorage.removeItem(UPLOAD_QUEUE_STORAGE_KEY);
      setRestoredCount(0);
    } finally {
      setQueueRestored(true);
    }
  }, [startPolling]);

  useEffect(() => {
    if (!queueRestored) return;
    localStorage.setItem(UPLOAD_QUEUE_STORAGE_KEY, JSON.stringify(createUploadQueueSnapshot(processingFiles)));
  }, [processingFiles, queueRestored]);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    if (backendState !== "ready" || uploading) {
      setError("Connect to the local API before uploading files.");
      return;
    }
    setUploading(true); setError(null); setProgress(0);
    const arr = Array.from(files);

    for (let i = 0; i < arr.length; i++) {
      try {
        const r = await uploadFile(arr[i], mode, language);
        startPolling(r.article_id, arr[i].name);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
      setProgress(Math.round(((i + 1) / arr.length) * 100));
    }
    setUploading(false);
    if (arr.length > 0 && !shouldReduceMotion) { setShowSparkle(true); setTimeout(() => setShowSparkle(false), 2500); }
  }, [backendState, language, mode, shouldReduceMotion, startPolling, uploading]);

  const handleClearFinished = useCallback(() => {
    if (clearingFinished) return;
    setClearingFinished(true);
    if (clearFinishedTimeoutRef.current) clearTimeout(clearFinishedTimeoutRef.current);
    clearFinishedTimeoutRef.current = setTimeout(() => {
      setProcessingFiles((prev) => clearFinishedProcessingFiles(prev));
      setClearingFinished(false);
      clearFinishedTimeoutRef.current = null;
    }, 120);
  }, [clearingFinished]);

  const queueSummary = createUploadQueueSummary(processingFiles);
  const sourceControlsDisabled = backendState !== "ready" || uploading;
  const setupChecklist = createUploadSetupChecklist({
    modelInfo,
    runAI: mode !== "parse_only",
    queueRestored,
    restoredCount,
    backendState,
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Upload</h1>
          <p className="text-muted-foreground mt-1 text-pretty">Drag and drop documents to upload.</p>
        </div>
      </FadeIn>

      {backendState !== "ready" && (
        <FadeIn delay={0.05}>
          <BackendRecoveryCard state={backendState} onRetry={loadBackendStatus} />
        </FadeIn>
      )}

      {/* Drop Zone */}
      <FadeIn delay={0.1}>
        <Card
          className={`relative border-2 transition-all duration-300 motion-reduce:transform-none motion-reduce:transition-none ${
            dragover
              ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
              : "border-dashed border-muted-foreground/25 animate-border-breathe"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => { e.preventDefault(); setDragover(false); void handleUpload(e.dataTransfer.files); }}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <motion.div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              animate={shouldReduceMotion ? undefined : uploading ? { scale: [1, 1.1, 1] } : dragover ? { scale: 1.1 } : { y: [0, -4, 0] }}
              transition={shouldReduceMotion ? undefined : uploading ? { duration: 0.8, repeat: Infinity } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {uploading ? (
                <Upload className="h-8 w-8 text-primary" />
              ) : (
                <Inbox className="h-8 w-8 text-primary" />
              )}
            </motion.div>
            <CardTitle className="text-lg mb-1">
              {uploading ? "Uploading..." : dragover ? "Drop files here" : "Drop files here"}
            </CardTitle>
            <CardDescription>PDF, ZIP, HTML, Markdown, TXT — up to 50 MB</CardDescription>
            <div className={`relative mt-4 inline-flex rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${sourceControlsDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
              <span aria-hidden="true" className={buttonVariants({ variant: "outline", size: "sm", className: "pointer-events-none" })}>
                Browse Files
              </span>
              <input
                ref={fileInputRef}
                type="file"
                className="absolute inset-0 h-full w-full cursor-pointer rounded-md opacity-0 disabled:cursor-not-allowed"
                aria-label="Browse files to upload"
                disabled={sourceControlsDisabled}
                multiple
                accept=".pdf,.zip,.html,.htm,.md,.txt,.markdown"
                onChange={(e) => {
                  if (e.target.files) void handleUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div className="mt-4 flex w-full max-w-md flex-col gap-2">
              <ModeSelector value={mode} onChange={setMode} disabled={sourceControlsDisabled} />
            </div>
          </CardContent>

          {/* Sparkle overlay on success */}
          <AnimatePresence>
            {showSparkle && !shouldReduceMotion && (
              <motion.div
                className="absolute inset-0 pointer-events-none flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                    animate={{
                      x: (Math.random() - 0.5) * 200,
                      y: (Math.random() - 0.5) * 200,
                      scale: [0, 1.5, 0],
                      opacity: [0, 1, 0],
                    }}
                    transition={{ duration: 1.5, delay: i * 0.1, ease: "easeOut" }}
                  >
                    <Sparkles className="h-5 w-5 text-primary" />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </FadeIn>

      {/* URL Import */}
      <FadeIn delay={0.15}>
        <UrlImportCard
          disabled={backendState !== "ready"}
          onImported={(articleId, filename) => startPolling(articleId, filename)}
        />
      </FadeIn>

      {backendState === "ready" && (
        <FadeIn delay={0.2}>
          <HealthySetupDetails checklist={setupChecklist} />
        </FadeIn>
      )}

      {/* Upload progress */}
      <AnimatePresence>
        {uploading && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3 mb-2">
                  <Upload className="h-4 w-4 animate-pulse text-primary motion-reduce:animate-none" />
                  <span className="text-sm font-medium">Uploading... {progress}%</span>
                </div>
                <Progress value={progress} className="animate-shimmer" />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Per-file processing progress */}
      <AnimatePresence>
        {processingFiles.length > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <Card>
              <CardHeader className="flex flex-col items-stretch justify-between gap-3 space-y-0 sm:flex-row sm:items-center">
                <CardTitle className="text-base flex items-center gap-2">
                  {queueSummary.counts.processing === 0 && queueSummary.counts.ready > 0 && queueSummary.counts.failed === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : queueSummary.counts.processing > 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span role="status" aria-live="polite">{queueSummary.title}</span>
                </CardTitle>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={sourceControlsDisabled}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload another
                  </Button>
                  <AnimatePresence>
                    {queueSummary.hasFinished && (
                      <motion.div
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ duration: 0.16 }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 min-w-[8.5rem] gap-1.5"
                          disabled={clearingFinished}
                          onClick={handleClearFinished}
                        >
                          {clearingFinished ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                          {clearingFinished ? "Clearing..." : "Clear finished"}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {processingFiles.map((f) => (
                    <motion.div
                      key={f.articleId}
                      layout
                      initial={{ opacity: 0, x: -10, scale: 0.99 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{
                        opacity: 0,
                        x: 24,
                        scale: 0.98,
                        height: 0,
                        paddingTop: 0,
                        paddingBottom: 0,
                      }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="py-2 px-3 rounded-md bg-accent/50 space-y-1.5 overflow-hidden"
                    >
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {isReadyStatus(f.status) ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : f.status === "failed" ? (
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                          ) : (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
                          )}
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{f.filename}</span>
                        </div>
                        {canOpenArticleDetail(f) && (
                          <Button variant="link" size="sm" asChild>
                            <Link href={`/articles/${f.articleId}`} className="gap-1.5">
                              <Eye className="h-3.5 w-3.5" />
                              {isReadyStatus(f.status) ? "Open reading guide" : "Open article"}
                            </Link>
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={isReadyStatus(f.status) || f.status === "failed" ? 100 : stepProgress(f.step)}
                          className={f.status === "failed" ? "[&>div]:bg-destructive" : isReadyStatus(f.status) ? "[&>div]:bg-green-500" : ""}
                        />
                      </div>
                      <p className={`text-xs ${f.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                        {f.status === "completed" ? "Complete" : f.status === "needs_review" ? "Ready for review" : f.status === "failed" ? f.error || "Failed" : stepLabel(f.step)}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accepted Types */}
      <FadeIn delay={0.3}>
        <Card>
          <CardHeader><CardTitle className="text-base">Accepted File Types</CardTitle></CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              {[["PDF", "Papers, articles"], ["ZIP", "Archive of PDFs/HTML/MD"], ["HTML", "Web pages"],
                ["Markdown", ".md files"], ["Text", ".txt files"]]
                .map(([ext, desc]) => (
                  <div key={ext} className="flex gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono">{ext}</Badge><span>{desc}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}

// ── URL Import Card ──────────────────────────────────────────────────────

function UrlImportCard({
  onImported,
  disabled = false,
}: {
  onImported: (articleId: number, filename: string) => void;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [mode, setMode] = useState<AnalysisMode>("quick");

  const handleUrlImport = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed || disabled || importing) return;
    setImporting(true);
    setUrlError(null);
    try {
      const { importFromUrl } = await import("@/lib/api");
      const r = await importFromUrl(trimmed, mode, language);
      onImported(r.article_id, r.filename);
      setImportUrl("");
    } catch (e: unknown) {
      setUrlError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Import from URL</CardTitle>
        <CardDescription>Paste an arXiv, OpenReview, DOI, scholarly page, or direct PDF link</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleUrlImport();
              }
            }}
            placeholder="https://openreview.net/forum?id=..."
            className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
            disabled={disabled || importing}
          />
          <Button size="sm" onClick={() => void handleUrlImport()} disabled={disabled || importing || !importUrl.trim()}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : "Import"}
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <ModeSelector value={mode} onChange={setMode} disabled={disabled || importing} />
        </div>
        {urlError && (
          <p className="text-xs text-destructive mt-2">{urlError}</p>
        )}
      </CardContent>
    </Card>
  );
}
