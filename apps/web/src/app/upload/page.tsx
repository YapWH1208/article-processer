"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle2, AlertCircle, Inbox, Sparkles, Brain, Loader2, Eye, X, Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { uploadFile, getArticleActiveJob } from "@/lib/api";
import { useLanguage } from "@/components/LanguageProvider";
import { FadeIn } from "@/components/ui/animated";
import { canOpenArticleDetail, clearFinishedProcessingFiles, createUploadQueueSnapshot, shouldResumeProcessingFile, upsertProcessingFile } from "./uploadQueueState.mjs";
import { createUploadSetupChecklist } from "./setupChecklistState.mjs";

interface ProcessingFile {
  filename: string;
  articleId: number;
  step: string | null;
  status: string;
  error: string | null;
}

const STEP_ORDER = ["uploaded", "parsing", "extracting", "embedding", "graph"] as const;
const TERMINAL_STEPS = new Set(["completed", "failed", "needs_review"]);
const UPLOAD_QUEUE_STORAGE_KEY = "article-processor.uploadQueue";

function stepLabel(step: string | null): string {
  if (!step) return "Starting…";
  const labels: Record<string, string> = {
    uploaded: "Uploaded",
    parsing: "Parsing document…",
    extracting: "AI extracting…",
    embedding: "Building embeddings…",
    graph: "Building graph…",
  };
  return labels[step] || step;
}

function stepProgress(step: string | null): number {
  if (!step) return 5;
  const idx = STEP_ORDER.indexOf(step as typeof STEP_ORDER[number]);
  if (idx === -1) return 50;
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100);
}

export default function UploadPage() {
  const { language } = useLanguage();
  const [dragover, setDragover] = useState(false);
  const [runAI, setRunAI] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSparkle, setShowSparkle] = useState(false);
  const [clearingFinished, setClearingFinished] = useState(false);
  const [queueRestored, setQueueRestored] = useState(false);
  const pollIntervalsRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const clearFinishedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelInfo, setModelInfo] = useState<{
    llmProvider: string; llmModel: string; llmProtocol: string | null;
    llmProviderName?: string;
    mock: boolean;
  } | null>(null);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach((interval) => clearInterval(interval));
      if (clearFinishedTimeoutRef.current) clearTimeout(clearFinishedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setModelInfo({
        llmProvider: d.llm_provider || "unknown",
        llmModel: d.llm_model || "unknown",
        llmProtocol: d.llm_custom_protocol || null,
        llmProviderName: d.llm_provider_name,
        mock: d.mock_ai || false,
      }))
      .catch(() => {});
  }, []);

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
      setProcessingFiles(snapshot);
      snapshot.filter(shouldResumeProcessingFile).forEach((file) => startPolling(file.articleId, file.filename));
    } catch {
      localStorage.removeItem(UPLOAD_QUEUE_STORAGE_KEY);
    } finally {
      setQueueRestored(true);
    }
  }, [startPolling]);

  useEffect(() => {
    if (!queueRestored) return;
    localStorage.setItem(UPLOAD_QUEUE_STORAGE_KEY, JSON.stringify(createUploadQueueSnapshot(processingFiles)));
  }, [processingFiles, queueRestored]);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true); setError(null); setProgress(0);
    const arr = Array.from(files);

    for (let i = 0; i < arr.length; i++) {
      try {
        const r = await uploadFile(arr[i], runAI, language);
        startPolling(r.article_id, arr[i].name);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
      setProgress(Math.round(((i + 1) / arr.length) * 100));
    }
    setUploading(false);
    if (arr.length > 0) { setShowSparkle(true); setTimeout(() => setShowSparkle(false), 2500); }
  }, [language, runAI, startPolling]);

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

  const hasFinishedProcessingFiles = processingFiles.some((file) => !shouldResumeProcessingFile(file));
  const setupChecklist = createUploadSetupChecklist({ modelInfo, runAI, queueRestored });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance">Upload</h1>
            <p className="text-muted-foreground mt-1 text-pretty">Drag and drop documents to upload.</p>
          </div>
          {modelInfo && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
                <Brain className="h-3 w-3 text-primary" />
                {modelInfo.mock ? (
                  <span className="font-medium">Mock AI</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">
                      {modelInfo.llmProviderName || modelInfo.llmProvider}:
                    </span>
                    <span className="font-medium">{modelInfo.llmModel}</span>
                    {modelInfo.llmProvider === "custom" && modelInfo.llmProtocol && (
                      <span className="text-muted-foreground">via {modelInfo.llmProtocol}</span>
                    )}
                  </>
                )}
              </Badge>
            </div>
          )}
        </div>
      </FadeIn>

      {/* Setup checklist */}
      <FadeIn delay={0.05}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Setup Checklist</CardTitle>
                <CardDescription>{setupChecklist.primaryMessage}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {setupChecklist.readyCount}/{setupChecklist.total} ready
                </Badge>
                {setupChecklist.needsProviderSetup && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/settings" className="gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" />
                      Settings
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3">
              {setupChecklist.items.map((item) => (
                <div key={item.id} className="rounded-md border bg-background px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {item.state === "complete" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : item.state === "warning" ? (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <span>{item.label}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Drop Zone */}
      <FadeIn delay={0.1}>
        <Card
          className={`relative border-2 transition-all duration-300 ${
            dragover
              ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
              : "border-dashed border-muted-foreground/25 animate-border-breathe"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => { e.preventDefault(); setDragover(false); handleUpload(e.dataTransfer.files); }}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <motion.div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              animate={uploading ? { scale: [1, 1.1, 1] } : dragover ? { scale: 1.1 } : { y: [0, -4, 0] }}
              transition={uploading ? { duration: 0.8, repeat: Infinity } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
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
            <label className="mt-4 cursor-pointer">
              <Button variant="outline" size="sm" disabled={uploading} asChild>
                <span>Browse Files</span>
              </Button>
              <input type="file" className="hidden" multiple
                accept=".pdf,.zip,.html,.htm,.md,.txt,.markdown"
                onChange={(e) => e.target.files && handleUpload(e.target.files)} />
            </label>
            <div className="flex items-center gap-2 mt-3">
              <Switch id="run-ai" checked={runAI} onCheckedChange={setRunAI} disabled={uploading} />
              <Label htmlFor="run-ai" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Run AI pipeline (extraction, embeddings, graph)
              </Label>
            </div>
          </CardContent>

          {/* Sparkle overlay on success */}
          <AnimatePresence>
            {showSparkle && (
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
        <UrlImportCard onImported={(articleId, filename) => startPolling(articleId, filename)} />
      </FadeIn>

      {/* Upload progress */}
      <AnimatePresence>
        {uploading && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3 mb-2">
                  <Upload className="h-4 w-4 text-primary animate-pulse" />
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
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {processingFiles.every((f) => f.status === "completed") ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  )}
                  Processing {processingFiles.length} file{processingFiles.length > 1 ? "s" : ""}
                </CardTitle>
                <AnimatePresence>
                  {hasFinishedProcessingFiles && (
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
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        {clearingFinished ? "Clearing..." : "Clear finished"}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                          {f.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : f.status === "failed" ? (
                            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                          ) : (
                            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                          )}
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{f.filename}</span>
                        </div>
                        {canOpenArticleDetail(f) && (
                          <Button variant="link" size="sm" asChild>
                            <Link href={`/articles/${f.articleId}`} className="gap-1.5">
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Link>
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={f.status === "completed" ? 100 : f.status === "failed" ? 100 : stepProgress(f.step)}
                          className={f.status === "failed" ? "[&>div]:bg-destructive" : f.status === "completed" ? "[&>div]:bg-green-500" : ""}
                        />
                      </div>
                      <p className={`text-xs ${f.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                        {f.status === "completed" ? "Complete" : f.status === "failed" ? f.error || "Failed" : stepLabel(f.step)}
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

function UrlImportCard({ onImported }: { onImported: (articleId: number, filename: string) => void }) {
  const { language } = useLanguage();
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [runAI, setRunAI] = useState(true);

  const handleUrlImport = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    setImporting(true);
    setUrlError(null);
    try {
      const { importFromUrl } = await import("@/lib/api");
      const r = await importFromUrl(trimmed, runAI, language);
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
        <CardDescription>Paste an arXiv, DOI, or direct PDF link</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
            placeholder="https://arxiv.org/abs/2301.12345"
            className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
            disabled={importing}
          />
          <Button size="sm" onClick={handleUrlImport} disabled={importing || !importUrl.trim()}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Switch id="url-run-ai" checked={runAI} onCheckedChange={setRunAI} disabled={importing} />
          <Label htmlFor="url-run-ai" className="text-xs text-muted-foreground cursor-pointer">
            Run AI pipeline after import
          </Label>
        </div>
        {urlError && (
          <p className="text-xs text-destructive mt-2">{urlError}</p>
        )}
      </CardContent>
    </Card>
  );
}
