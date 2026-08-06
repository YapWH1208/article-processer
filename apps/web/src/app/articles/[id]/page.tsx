"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  FileText, MessageCircle, Info, ScrollText, Loader2, Send,
  RotateCw, Download, AlertCircle, CheckCircle2, Trash2, Archive, ArchiveRestore, Plus,
  PanelRightClose, PanelRightOpen, X, Wand2, ArrowLeft, ChevronRight,
  Calendar, Activity,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLanguage } from "@/components/LanguageProvider";
import { sendChatMessage, sendMultiArticleChatMessage, streamChatMessage, getArticle, getArticleMarkdown, getArticleExtraction, getArticleGraph, reprocessArticle, getChatHistory, listSkills, runSkill, getArticleJobs, getArticleActiveJob, updateArticle, updateArticleExtraction, toggleArchiveArticle, deleteArticle, getRelatedArticles } from "@/lib/api";
import { getPromptText, translateUiText } from "@/lib/languageState.mjs";
import { normalizeHtmlTablesForMarkdown } from "@/lib/markdownHtmlTables.mjs";
import type { ExtractionResult } from "@/lib/types";
import { TypingDots, PulseDot, FadeIn } from "@/components/ui/animated";
import { createArticleStatusCallout, createChatSubmission, createCitationReaderTarget, createWorkspacePanelSummary, slugifyWorkspaceText } from "../articleWorkspaceState.mjs";
import { formatExtractionForReview, parseReviewedExtraction } from "../extractionReviewState.mjs";
import { createArticleReadingGuide, createLibraryReadingGuide } from "../readingGuideState.mjs";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface Article {
  id: number; title: string; status: string; original_filename: string;
  source_type: string; parser_name?: string | null; created_at: string; updated_at: string; is_archived: number;
  processing_error?: string | null;
}

interface SkillDef {
  name: string; purpose: string; description: string;
  input_schema: Record<string, unknown>; output_schema: Record<string, unknown>;
}

interface ChatMessage { role: string; content: string; citations_json?: string; prompt_tokens?: number; completion_tokens?: number; }
interface Citation {
  article_id?: number | null;
  article_title?: string | null;
  chunk_id?: number | null;
  section_title?: string | null;
  snippet?: string | null;
  page_start?: number | null;
  page_end?: number | null;
}
interface JobInfo { id: number; status: string; current_step: string | null; logs: Record<string, unknown>[] | null; error: string | null; created_at: string; completed_at: string | null; }
interface RelatedArticleItem { id: number; title: string; status: string; source_type: string; similarity: number; shared_entities: string[]; }

const TERMINAL_ARTICLE_STATUSES = new Set(["completed", "failed", "needs_review"]);

function isTerminalArticleStatus(status: string | null | undefined) {
  return !!status && TERMINAL_ARTICLE_STATUSES.has(status);
}

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { language } = useLanguage();
  const articleId = Number(id);

  const [article, setArticle] = useState<Article | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extractionErrors, setExtractionErrors] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [graph, setGraph] = useState<{ entities: unknown[]; relationships: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("guide");
  const [sidePanelTab, setSidePanelTab] = useState("chat");
  const [readerView, setReaderView] = useState<"markdown" | "pdf">("markdown");

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatting, setChatting] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [contextText, setContextText] = useState("");
  const [chatDraftSeed, setChatDraftSeed] = useState({ id: 0, text: "" });
  const [expandedMsgs, setExpandedMsgs] = useState<Set<number>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Actions
  const [reprocessing, setReprocessing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Skills
  const [skills, setSkills] = useState<SkillDef[]>([]);
  const [runningSkill, setRunningSkill] = useState<string | null>(null);
  const [skillResult, setSkillResult] = useState<{ skill: string; result: unknown } | null>(null);

  // Jobs
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [activeJob, setActiveJob] = useState<JobInfo | null>(null);
  const [prevStatus, setPrevStatus] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [art, mdResp, extResp, gr, histResp] = await Promise.all([
        getArticle(articleId),
        getArticleMarkdown(articleId).catch(() => ({ markdown: "" })),
        getArticleExtraction(articleId).catch(() => null),
        getArticleGraph(articleId).catch(() => null),
        getChatHistory(articleId).catch(() => null),
      ]);
      setArticle(art as Article);
      setMarkdown(mdResp.markdown || "");
      setExtraction(extResp?.extraction || null);
      setExtractionErrors(extResp?.validation_errors || []);
      setGraph(gr);
      // Hydrate chat history from server
      if (histResp?.messages?.length) {
        setMessages(histResp.messages.map((m: { role: string; content: string; citations: unknown[] | null; prompt_tokens?: number; completion_tokens?: number }) => ({
          role: m.role,
          content: m.content,
          citations_json: m.citations ? JSON.stringify(m.citations) : undefined,
          prompt_tokens: m.prompt_tokens || 0,
          completion_tokens: m.completion_tokens || 0,
        })));
      }
      // Load available skills
      listSkills().then((s) => setSkills(s.skills || [])).catch(() => {});
      // Load job history
      getArticleJobs(articleId).then((j) => setJobs(Array.isArray(j) ? j : [])).catch(() => {});
    } catch (e) {
      console.error("Failed to load article data:", e);
      toast.error("Failed to load article. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [articleId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Polling for active job (progress bar) ──────────────────────
  useEffect(() => {
    if (!article) return;
    const isProcessing = !isTerminalArticleStatus(article.status);
    if (!isProcessing) {
      setActiveJob(null);
      // Detect transition to completed — soft reload
      if (prevStatus && !isTerminalArticleStatus(prevStatus) && isTerminalArticleStatus(article.status)) {
        loadData();
      }
      setPrevStatus(article.status);
      return;
    }
    setPrevStatus(article.status);

    const poll = async () => {
      try {
        const res = await getArticleActiveJob(articleId);
        setActiveJob(res.job);
        // If job completed, reload article data
        if (isTerminalArticleStatus(res.article_status)) {
          loadData();
        }
      } catch { /* ignore poll errors — will retry on next interval */ }
    };
    poll(); // immediate first poll
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [article?.status, articleId, loadData, prevStatus]);

  const handleChat = useCallback((draftQuestion: string) => {
    const submission = createChatSubmission({ question: draftQuestion, contextText, language });
    if (!submission) return false;

    setChatting(true);
    const userMsg: ChatMessage = { role: "user", content: submission.content };
    setMessages((prev) => [...prev, userMsg]);
    setContextText("");

    // Placeholder assistant message for streaming
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    let streamedContent = "";

    void streamChatMessage(
      articleId,
      userMsg.content,
      // onToken: append each token to the streaming message
      (token) => {
        streamedContent += token;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: streamedContent };
          return updated;
        });
      },
      // onDone: streaming completed successfully
      (_answer, citations) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            citations_json: citations?.length ? JSON.stringify(citations) : undefined,
          };
          return updated;
        });
        setChatting(false);
      },
      // onError: fall back to non-streaming endpoint
      async (streamErr) => {
        // Remove the empty streaming placeholder
        setMessages((prev) => prev.slice(0, -1));
        try {
          const res = await sendChatMessage(articleId, userMsg.content, language);
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { ...prev[prev.length - 1], prompt_tokens: res.prompt_tokens || 0 },
            { role: "assistant", content: res.answer, citations_json: JSON.stringify(res.citations), prompt_tokens: 0, completion_tokens: res.completion_tokens || 0 },
          ]);
        } catch {
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${streamErr}` }]);
        }
        setChatting(false);
      },
      language,
    );
    return true;
  }, [articleId, contextText, language]);

  // Add text selection to chat context
  const addToChat = (text: string, source: string) => {
    const formatted = `[From ${source}]:\n"${text.slice(0, 500)}"`;
    setContextText((prev) => prev ? `${prev}\n\n${formatted}` : formatted);
    setChatOpen(true);
    toast.success("Added to chat context");
  };

  // Add claim/question to chat
  const askAbout = (text: string) => {
    setChatDraftSeed((prev) => ({ id: prev.id + 1, text }));
    setChatOpen(true);
  };

  const compareArticles = useCallback(async (prompt: string, articleIds: number[]) => {
    const normalizedIds = Array.from(new Set(articleIds.map(Number).filter(Number.isFinite)));
    const message = prompt.trim();
    if (!message || normalizedIds.length < 2) return;

    setChatOpen(true);
    setSidePanelTab("chat");
    setChatting(true);
    setMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      const res = await sendMultiArticleChatMessage(normalizedIds, message, language, articleId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer,
          citations_json: JSON.stringify(res.citations || []),
          prompt_tokens: res.prompt_tokens || 0,
          completion_tokens: res.completion_tokens || 0,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error instanceof Error ? error.message : "Compare failed"}` },
      ]);
    } finally {
      setChatting(false);
    }
  }, [articleId, language]);

  const handleReprocess = async (mode: "full" | "extract_only" = "extract_only") => {
    setReprocessing(true);
    try {
      await reprocessArticle(articleId, mode, language);
      setArticle((prev) => prev ? { ...prev, status: "extracting", processing_error: null } : prev);
      setExtractionErrors([]);
      toast.success(mode === "extract_only" ? "AI extraction started" : "Full reprocessing started");
    }
    catch { toast.error("Reprocess failed"); }
    finally { setReprocessing(false); }
  };

  const openExtractionReview = () => {
    setReviewDraft(formatExtractionForReview(extraction || {}));
    setReviewError(null);
    setReviewOpen(true);
  };

  const saveExtractionReview = async () => {
    const parsed = parseReviewedExtraction(reviewDraft);
    if (!parsed.ok) {
      setReviewError(parsed.error || "Invalid JSON");
      return;
    }
    setReviewSaving(true);
    try {
      const response = await updateArticleExtraction(articleId, {
        extraction: parsed.value as ExtractionResult,
        confidence: 1,
      });
      setExtraction(response.extraction || null);
      setExtractionErrors(response.validation_errors || []);
      setArticle((prev) => prev ? { ...prev, status: prev.status === "needs_review" ? "completed" : prev.status } : prev);
      setReviewOpen(false);
      toast.success("Reviewed extraction saved");
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "Failed to save reviewed extraction");
    } finally {
      setReviewSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const data = await toggleArchiveArticle(articleId, Boolean(article?.is_archived));
      setArticle((prev) => prev ? { ...prev, is_archived: data.is_archived ? 1 : 0 } : null);
      toast.success(data.is_archived ? "Article archived" : "Article restored");
    } catch { toast.error("Failed"); }
    finally { setArchiving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteArticle(articleId);
      setDeleteOpen(false);
      toast.success("Article deleted");
      router.push("/articles");
    } catch { toast.error("Delete failed"); setDeleting(false); setDeleteOpen(false); }
  };

  const statusVariant = (s: string) => {
    switch (s) {
      case "completed": return "default" as const;
      case "failed": return "destructive" as const;
      default: return "secondary" as const;
    }
  };

  const isProcessing = article && !isTerminalArticleStatus(article.status);
  const workspaceSummary = createWorkspacePanelSummary({ messages, jobs, graph });
  const statusCallout = createArticleStatusCallout({ article, extractionErrors });
  const citations = (msg: ChatMessage): Citation[] => {
    try { return msg.citations_json ? JSON.parse(msg.citations_json) : []; }
    catch { return []; }
  };

  const openCitation = (citation: Citation) => {
    const target = createCitationReaderTarget(citation);
    setTab("reader");
    if (readerView === "pdf") setReaderView("markdown");

    setTimeout(() => {
      const fallbackAnchor = citation.section_title ? slugifyWorkspaceText(citation.section_title) : "";
      const element = document.getElementById(target.anchorId) || (fallbackAnchor ? document.getElementById(fallbackAnchor) : null);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      toast.info("Source section is not visible in the reader yet");
    }, 50);
  };

  if (loading) {
    return (
      <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
        <Skeleton className="h-8 w-64"/><Skeleton className="h-4 w-48"/><Skeleton className="h-[70vh] w-full"/>
      </motion.div>
    );
  }

  if (!article) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col items-center py-12 gap-3">
          <AlertCircle className="h-10 w-10 text-destructive"/>
          <CardTitle>Article not found</CardTitle>
          <CardDescription>ID {articleId} does not exist.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <FadeIn>
        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
          <Link href="/articles" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5"/> Articles
          </Link>
          <ChevronRight className="h-3.5 w-3.5"/>
          <span className="text-foreground truncate max-w-[300px]">{article.title}</span>
        </div>
      </FadeIn>

      {/* Header */}
      <FadeIn delay={0.05}>
        {statusCallout && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col gap-3 rounded-md border p-3 text-sm mb-3 sm:flex-row sm:items-start sm:justify-between ${
              statusCallout.tone === "destructive"
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
            }`}>
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5"/>
              <div className="min-w-0">
                <p className="font-medium">{statusCallout.title}</p>
                <p className="text-xs opacity-80 mt-0.5 break-words">{statusCallout.detail}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {statusCallout.actions.map((action) => {
                if (action.mode) {
                  const mode = action.mode === "full" ? "full" : "extract_only";
                  return (
                    <Button
                      key={action.id}
                      variant="outline"
                      size="sm"
                      className="h-8 bg-background/70"
                      disabled={reprocessing}
                      onClick={() => handleReprocess(mode)}
                    >
                      {reprocessing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1" />}
                      {action.label}
                    </Button>
                  );
                }
                if (action.id === "view_jobs") {
                  return (
                    <Button
                      key={action.id}
                      variant="outline"
                      size="sm"
                      className="h-8 bg-background/70"
                      onClick={() => { setChatOpen(true); setSidePanelTab("jobs"); }}
                    >
                      <ScrollText className="h-3.5 w-3.5 mr-1" />
                      {action.label}
                    </Button>
                  );
                }
                if (action.id === "review_extraction") {
                  return (
                    <Button
                      key={action.id}
                      variant="outline"
                      size="sm"
                      className="h-8 bg-background/70"
                      onClick={openExtractionReview}
                    >
                      <Wand2 className="h-3.5 w-3.5 mr-1" />
                      {action.label}
                    </Button>
                  );
                }
                return null;
              })}
            </div>
          </motion.div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <form className="flex items-center gap-2" onSubmit={async (e) => {
                e.preventDefault();
                const trimmed = editTitleValue.trim();
                if (!trimmed) { setEditingTitle(false); return; }
                try {
                  const updated = await updateArticle(articleId, { title: trimmed });
                  setArticle(updated as Article);
                  toast.success("Title updated");
                } catch { toast.error("Failed to update title"); }
                setEditingTitle(false);
              }}>
                <Input
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  className="text-2xl font-bold h-auto py-1 px-2 max-w-md"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingTitle(false); }}
                />
              </form>
            ) : (
              <h1
                className="text-2xl font-bold tracking-tight truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => { setEditTitleValue(article.title); setEditingTitle(true); }}
                title="Click to edit title"
              >{article.title}</h1>
            )}
            <div className="flex gap-2 items-center mt-1 text-sm text-muted-foreground flex-wrap">
              <span>{article.original_filename}</span><span>·</span>
              <Badge variant={statusVariant(article.status)} className="gap-1.5">
                {isProcessing && <PulseDot color="bg-amber-500"/>}{article.status}
              </Badge>
              {article.is_archived === 1 && <Badge variant="outline" className="text-muted-foreground">Archived</Badge>}
              <span>·</span>
              <span>{new Date(article.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handleReprocess("extract_only")} disabled={reprocessing} className="gap-1">
              <RotateCw className={`h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`}/> Re-extract
            </Button>
            <Button variant="outline" size="sm" onClick={handleArchive} disabled={archiving} className="gap-1">
              {article.is_archived ? <><ArchiveRestore className="h-3.5 w-3.5"/> Restore</> : <><Archive className="h-3.5 w-3.5"/> Archive</>}
            </Button>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5"/> Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Article</DialogTitle>
                  <DialogDescription>
                    Permanently delete &ldquo;{article.title}&rdquo; and all associated data? This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting..." : "Delete Permanently"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      {/* ── Processing Progress Bar ────────────────────────────── */}
      <AnimatePresence>
        {isProcessing && activeJob && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-3">
                <PipelineProgress job={activeJob} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Split Layout ───────────────────────────────────────── */}
      <div className="flex gap-4 h-[calc(100dvh-14rem)]">
        {/* Left: Content + Tabs */}
        <div className={`flex-1 min-w-0 flex flex-col ${chatOpen ? 'hidden md:flex' : 'flex'}`}>
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              <TabsList>
                <TabsTrigger value="guide" className="gap-1.5"><ChevronRight className="h-4 w-4"/>{translateUiText("Guide", language)}</TabsTrigger>
                <TabsTrigger value="reader" className="gap-1.5"><ScrollText className="h-4 w-4"/>Reader</TabsTrigger>
                <TabsTrigger value="summary" className="gap-1.5"><FileText className="h-4 w-4"/>Summary</TabsTrigger>
                <TabsTrigger value="skills" className="gap-1.5"><Wand2 className="h-4 w-4"/>Skills</TabsTrigger>
                <TabsTrigger value="metadata" className="gap-1.5"><Info className="h-4 w-4"/>Metadata</TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setChatOpen(true)}>
                <MessageCircle className="h-4 w-4"/>
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {/* Guide */}
              {tab === "guide" && (
                <motion.div key="guide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                  <TabsContent value="guide" forceMount className="h-full m-0">
                    <Card className="h-full flex flex-col">
                      <CardHeader className="shrink-0 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{translateUiText("Reading Guide", language)}</CardTitle>
                          <CardDescription>{translateUiText("Start with the brief, then follow the suggested questions and related papers.", language)}</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setTab("reader")} className="gap-1">
                          <ScrollText className="h-3.5 w-3.5" /> {translateUiText("Open Reader", language)}
                        </Button>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0 p-4">
                        <ScrollArea className="h-full">
                          <ReadingGuideContent
                            articleId={articleId}
                            articleTitle={article.title || article.original_filename}
                            extraction={extraction}
                            graph={graph}
                            hasMarkdown={Boolean(markdown.trim())}
                            reprocessing={reprocessing}
                            onAsk={askAbout}
                            onAdd={addToChat}
                            onCompare={compareArticles}
                            onRunExtraction={handleReprocess}
                            comparing={chatting}
                            language={language}
                          />
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </motion.div>
              )}

              {/* Reader */}
              {tab === "reader" && (
                <motion.div key="reader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                  <TabsContent value="reader" forceMount className="h-full m-0">
                    <Card className="h-full flex flex-col">
                      <CardHeader className="shrink-0 pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Document View</CardTitle>
                        {article.source_type === "pdf" && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">View as:</span>
                            <div className="flex rounded-md border border-border overflow-hidden">
                              <button
                                onClick={() => setReaderView("markdown")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${readerView === "markdown" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                                aria-label="View as Markdown"
                              >
                                <ScrollText className="h-3 w-3" /> Markdown
                              </button>
                              <button
                                onClick={() => setReaderView("pdf")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${readerView === "pdf" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                                aria-label="View original PDF"
                              >
                                <FileText className="h-3 w-3" /> PDF
                              </button>
                            </div>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0 min-w-0 p-4 pt-0">
                        {readerView === "pdf" && article.source_type === "pdf" ? (
                          <iframe
                            src={`${API_BASE}/articles/${articleId}/file`}
                            className="w-full h-full rounded border border-border"
                            title="Original PDF"
                          />
                        ) : markdown ? (
                          <ScrollArea className="h-full w-full min-w-0 max-w-full">
                            <MarkdownReader text={markdown} onSelect={addToChat} />
                          </ScrollArea>
                        ) : (
                          <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                            <ScrollText className="h-10 w-10 opacity-30"/><p>No parsed markdown.</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </motion.div>
              )}

              {/* Summary */}
              {tab === "summary" && (
                <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                  <TabsContent value="summary" forceMount className="h-full m-0">
                    <Card className="h-full flex flex-col">
                      <CardHeader className="shrink-0 flex flex-row items-center justify-between">
                        <div><CardTitle className="text-lg">Extraction</CardTitle><CardDescription>AI-extracted info</CardDescription></div>
                        <div className="flex gap-2">
                          <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={openExtractionReview} disabled={!extraction && extractionErrors.length === 0}>
                                Review JSON
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>Review Extraction JSON</DialogTitle>
                                <DialogDescription>
                                  Edit the structured extraction and save it as reviewed data for search and analysis.
                                </DialogDescription>
                              </DialogHeader>
                              <Textarea
                                value={reviewDraft}
                                onChange={(e) => { setReviewDraft(e.target.value); setReviewError(null); }}
                                className="min-h-[420px] font-mono text-xs"
                                spellCheck={false}
                              />
                              {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
                                <Button onClick={saveExtractionReview} disabled={reviewSaving}>
                                  {reviewSaving ? "Saving..." : "Save Review"}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          {["json", "markdown"].map((f) => (
                            <a key={f} href={`${API_BASE}/articles/${articleId}/export/${f}`} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="gap-1">
                                <Download className="h-3.5 w-3.5" />
                                Export {f.toUpperCase()}
                              </Button>
                            </a>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0 p-4">
                        {extraction ? (
                          <ScrollArea className="h-full"><SummaryContent extraction={extraction} onAsk={askAbout} onAdd={addToChat} language={language}/></ScrollArea>
                        ) : extractionErrors.length > 0 ? (
                          <div className="flex flex-col items-center py-12 text-muted-foreground gap-3 text-center">
                            <AlertCircle className="h-10 w-10 text-amber-500"/>
                            <div>
                              <p className="font-medium text-foreground">AI extraction returned no summary</p>
                              <p className="text-xs mt-1 max-w-md">{extractionErrors.join("; ")}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => handleReprocess("extract_only")} disabled={reprocessing} className="gap-1">
                              <RotateCw className={`h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`}/> Re-extract
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-12 text-muted-foreground"><FileText className="h-10 w-10 opacity-30"/><p>No extraction yet.</p></div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </motion.div>
              )}

              {/* Skills */}
              {tab === "skills" && (
                <motion.div key="skills" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                  <TabsContent value="skills" forceMount className="h-full m-0">
                    <Card className="h-full flex flex-col">
                      <CardHeader className="shrink-0">
                        <CardTitle className="text-lg">AI Skills</CardTitle>
                        <CardDescription>Run focused analysis on this article.</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0 p-4">
                        <ScrollArea className="h-full">
                          <div className="space-y-3">
                            {skills.length === 0 && (
                              <p className="text-sm text-muted-foreground py-8 text-center">Loading skills...</p>
                            )}
                            {skills.map((s) => (
                              <Card key={s.name} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-sm capitalize">{s.purpose}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                                  </div>
                                  <Button size="sm" variant="outline" className="gap-1 shrink-0"
                                    disabled={runningSkill === s.name}
                                    onClick={async () => {
                                      setRunningSkill(s.name); setSkillResult(null);
                                      try {
                                        const res = await runSkill(s.name, articleId, language);
                                        setSkillResult(res as { skill: string; result: unknown });
                                        toast.success(`"${s.purpose}" completed`);
                                      } catch (e: unknown) {
                                        toast.error(e instanceof Error ? e.message : "Skill failed");
                                      } finally { setRunningSkill(null); }
                                    }}>
                                    {runningSkill === s.name ? <><Loader2 className="h-3.5 w-3.5 animate-spin"/> Running</> : <><Wand2 className="h-3.5 w-3.5"/> Run</>}
                                  </Button>
                                </div>
                                {/* Show result inline */}
                                {skillResult && skillResult.skill === s.name && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                    className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/20 text-xs max-h-80 overflow-y-auto">
                                    <SkillResultView result={skillResult.result} />
                                  </motion.div>
                                )}
                              </Card>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </motion.div>
              )}

              {/* Metadata */}
              {tab === "metadata" && (
                <motion.div key="metadata" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                  <TabsContent value="metadata" forceMount className="h-full m-0">
                    <Card className="h-full flex flex-col">
                      <CardHeader className="shrink-0"><CardTitle className="text-lg">Metadata</CardTitle></CardHeader>
                      <CardContent className="flex-1 min-h-0 p-4">
                        <ScrollArea className="h-full">
                          <div className="space-y-4">
                            <div className="space-y-2 text-sm">
                              {[
                                ["ID", String(article.id), <Info key="id" className="h-3.5 w-3.5 opacity-60" />],
                                ["Filename", article.original_filename, <FileText key="fn" className="h-3.5 w-3.5 opacity-60" />],
                                ["Source", article.source_type.toUpperCase(), <ScrollText key="src" className="h-3.5 w-3.5 opacity-60" />],
                                ["Parser", article.parser_name || article.source_type?.toUpperCase(), <Wand2 key="pr" className="h-3.5 w-3.5 opacity-60" />],
                                ["Status", article.status, <Activity key="st" className="h-3.5 w-3.5 opacity-60" />],
                                ["Archived", article.is_archived ? "Yes" : "No", <Archive key="ar" className="h-3.5 w-3.5 opacity-60" />],
                                ["Created", new Date(article.created_at).toLocaleString(), <Calendar key="cr" className="h-3.5 w-3.5 opacity-60" />],
                                ["Updated", new Date(article.updated_at).toLocaleString(), <Calendar key="up" className="h-3.5 w-3.5 opacity-60" />],
                              ].map(([label, value, icon]) => (
                                <div key={label as string} className="flex items-center justify-between py-1.5 border-b border-border/50">
                                  <span className="text-muted-foreground flex items-center gap-2">{icon}{label as string}</span>
                                  <span className="font-medium text-right max-w-[60%] truncate">{value as string}</span>
                                </div>
                              ))}
                            </div>

                            {/* Processing Jobs */}
                            {jobs.length > 0 && (
                              <>
                                <Separator />
                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Processing Jobs ({jobs.length})</h4>
                                  <div className="space-y-2">
                                    {jobs.map((j) => (
                                      <div key={j.id} className="p-3 rounded-md bg-muted/50 text-xs">
                                        <div className="flex items-center justify-between mb-1">
                                          <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{j.status}</Badge>
                                          <span className="text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span>
                                        </div>
                                        {j.current_step && <p className="text-muted-foreground">Step: {j.current_step}</p>}
                                        {j.error && <p className="text-destructive mt-1">{j.error}</p>}
                                        {j.logs && j.logs.length > 0 && (
                                          <div className="mt-2 space-y-0.5">
                                            {j.logs.slice(-5).map((l: any, i: number) => (
                                              <div key={i} className="flex gap-2 text-[10px] text-muted-foreground">
                                                <span className="shrink-0">{new Date(l.timestamp as string).toLocaleTimeString()}</span>
                                                <span className="capitalize">{(l.step as string || "").replace(/_/g, " ")}</span>
                                                <span>— {l.message as string}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Related Articles */}
                            <Separator />
                            <div>
                              <h4 className="font-semibold text-sm mb-2">Related Articles</h4>
                              <RelatedArticles articleId={articleId} />
                            </div>
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Tabs>
        </div>

        {/* Right: Chat Panel — aligned below tabs */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: "40%", opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 flex flex-col min-w-0 border-l md:border-l-0 pt-10"
            >
              <Card className="h-full flex flex-col border md:border rounded-lg">
                <CardHeader className="pb-2 shrink-0 flex flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageCircle className="h-4 w-4"/> Workspace
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      {workspaceSummary.messageCount} messages - {workspaceSummary.sourceCount} sources - {workspaceSummary.entityCount} entities
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={() => setChatOpen(false)} aria-label="Close chat panel">
                      <X className="h-3.5 w-3.5"/>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hidden md:flex" onClick={() => setChatOpen(false)} aria-label="Collapse chat panel">
                      <PanelRightClose className="h-3.5 w-3.5"/>
                    </Button>
                  </div>
                </CardHeader>

                <Tabs value={sidePanelTab} onValueChange={setSidePanelTab} className="flex-1 flex flex-col min-h-0">
                <div className="px-4 pb-3">
                  <TabsList className="grid h-9 w-full grid-cols-3">
                    <TabsTrigger value="chat" className="gap-1 text-xs">
                      Chat
                      {workspaceSummary.messageCount > 0 && <span className="rounded bg-muted px-1 text-[10px]">{workspaceSummary.messageCount}</span>}
                    </TabsTrigger>
                    <TabsTrigger value="jobs" className="gap-1 text-xs">
                      Jobs
                      {workspaceSummary.failedJobCount > 0 ? (
                        <span className="rounded bg-destructive px-1 text-[10px] text-destructive-foreground">{workspaceSummary.failedJobCount}</span>
                      ) : workspaceSummary.activeJobCount > 0 ? (
                        <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{workspaceSummary.activeJobCount}</span>
                      ) : null}
                    </TabsTrigger>
                    <TabsTrigger value="context" className="gap-1 text-xs">
                      Context
                      {workspaceSummary.entityCount > 0 && <span className="rounded bg-muted px-1 text-[10px]">{workspaceSummary.entityCount}</span>}
                    </TabsTrigger>
                  </TabsList>
                </div>

                {sidePanelTab === "chat" && (
                  <>
                {/* Context preview */}
                <AnimatePresence>
                  {contextText && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="px-4 pb-2">
                      <div className="p-2 rounded-md bg-primary/5 border border-primary/20 text-xs text-muted-foreground relative">
                        <button onClick={() => setContextText("")} className="absolute top-1 right-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3"/></button>
                        <span className="font-medium text-primary">Context added:</span> {contextText.slice(0, 120)}...
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <CardContent className="flex-1 flex flex-col min-h-0 p-4 pt-0">
                  <ScrollArea className="flex-1 mb-3">
                    <div className="space-y-3 pr-3" role="log" aria-live="polite">
                      {messages.length === 0 && (
                        <p className="text-muted-foreground text-sm text-center py-8">
                          Select text and click <strong>Add to Chat</strong> to give the model context, or just ask a question.
                        </p>
                      )}
                      <AnimatePresence>
                        {messages.map((msg, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                              <div className="whitespace-pre-wrap text-xs">
                                {msg.content.length > 400 && !expandedMsgs.has(i) ? (
                                  <>
                                    {msg.content.slice(0, 400)}...
                                    <button
                                      onClick={() => setExpandedMsgs((prev) => { const next = new Set(prev); next.add(i); return next; })}
                                      className="ml-1 text-primary hover:underline font-medium"
                                    >
                                      Show more
                                    </button>
                                  </>
                                ) : msg.content.length > 400 ? (
                                  <>
                                    {msg.content}
                                    <button
                                      onClick={() => setExpandedMsgs((prev) => { const next = new Set(prev); next.delete(i); return next; })}
                                      className="ml-1 text-primary hover:underline font-medium"
                                    >
                                      Show less
                                    </button>
                                  </>
                                ) : (
                                  msg.content
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {msg.role === "assistant" && citations(msg).length > 0 && (
                                  <div className="mt-1.5 pt-1.5 border-t border-border/50 w-full">
                                    <p className="text-[10px] font-medium mb-0.5">Sources:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {citations(msg).slice(0, 5).map((c, ci) => {
                                        const target = createCitationReaderTarget(c);
                                        return (
                                          <button
                                            key={ci}
                                            type="button"
                                            onClick={() => openCitation(c)}
                                            className="rounded border border-border bg-background px-1.5 py-0.5 text-left text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                                            title={c.snippet || target.label}
                                          >
                                            {target.label}{target.meta ? ` - ${target.meta}` : ""}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {(msg.prompt_tokens || msg.completion_tokens) ? (
                                  <span className="text-[9px] opacity-50 mt-0.5">
                                    ~{(msg.prompt_tokens || 0) + (msg.completion_tokens || 0)} tokens
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {chatting && <div className="flex justify-start"><div className="bg-muted rounded-lg"><TypingDots/></div></div>}
                      <div ref={chatEndRef}/>
                    </div>
                  </ScrollArea>
                  <ChatComposer
                    chatting={chatting}
                    contextText={contextText}
                    draftSeed={chatDraftSeed}
                    language={language}
                    onSubmit={handleChat}
                  />
                </CardContent>
                  </>
                )}

                {sidePanelTab === "jobs" && (
                  <CardContent className="flex-1 min-h-0 p-4 pt-0">
                    <ScrollArea className="h-full">
                      <div className="grid grid-cols-3 gap-2 pb-3 text-center text-xs">
                        <div className="rounded-md border p-2">
                          <div className="text-base font-semibold">{workspaceSummary.jobCount}</div>
                          <div className="text-muted-foreground">Total</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="text-base font-semibold">{workspaceSummary.activeJobCount}</div>
                          <div className="text-muted-foreground">Active</div>
                        </div>
                        <div className="rounded-md border p-2">
                          <div className="text-base font-semibold">{workspaceSummary.failedJobCount}</div>
                          <div className="text-muted-foreground">Failed</div>
                        </div>
                      </div>
                      {jobs.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-8">No processing jobs yet.</p>
                      ) : (
                        <div className="space-y-2 pr-3">
                          {jobs.slice(0, 8).map((j) => (
                            <div key={j.id} className="rounded-md border bg-muted/20 p-3 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{j.status}</Badge>
                                <span className="text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span>
                              </div>
                              {j.current_step && <p className="mt-1 text-muted-foreground">Step: {j.current_step}</p>}
                              {j.error && <p className="mt-1 text-destructive">{j.error}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                )}

                {sidePanelTab === "context" && (
                  <CardContent className="flex-1 min-h-0 p-4 pt-0">
                    <ScrollArea className="h-full">
                      <div className="space-y-4 pr-3">
                        <div className="grid grid-cols-2 gap-2 text-center text-xs">
                          <div className="rounded-md border p-2">
                            <div className="text-base font-semibold">{workspaceSummary.entityCount}</div>
                            <div className="text-muted-foreground">Entities</div>
                          </div>
                          <div className="rounded-md border p-2">
                            <div className="text-base font-semibold">{workspaceSummary.relationshipCount}</div>
                            <div className="text-muted-foreground">Links</div>
                          </div>
                        </div>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Related Articles</h4>
                          <RelatedArticles articleId={articleId} />
                        </div>
                      </div>
                    </ScrollArea>
                  </CardContent>
                )}
                </Tabs>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Open chat button when collapsed */}
        {!chatOpen && (
          <Button variant="outline" size="sm" className="shrink-0 h-full hidden md:flex items-center gap-1" onClick={() => setChatOpen(true)}>
            <PanelRightOpen className="h-4 w-4"/> Chat
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function slugify(children: React.ReactNode): string {
  if (typeof children === "string") return slugifyWorkspaceText(children);
  if (Array.isArray(children)) return slugifyWorkspaceText(children.map(c => (typeof c === "string" ? c : "")).join(" "));
  return "";
}

const mdComponents = {
  h1: ({ children, ...props }: any) => <h1 id={slugify(children)} className="text-2xl font-bold mt-6 mb-3 border-b pb-1 scroll-mt-20" {...props}>{children}</h1>,
  h2: ({ children, ...props }: any) => <h2 id={slugify(children)} className="text-xl font-bold mt-5 mb-2 border-b pb-0.5 scroll-mt-20" {...props}>{children}</h2>,
  h3: ({ children, ...props }: any) => <h3 id={slugify(children)} className="text-lg font-semibold mt-4 mb-2 scroll-mt-20" {...props}>{children}</h3>,
  h4: ({ children, ...props }: any) => <h4 id={slugify(children)} className="text-base font-semibold mt-3 mb-1 scroll-mt-20" {...props}>{children}</h4>,
  h5: ({ children, ...props }: any) => <h5 id={slugify(children)} className="text-sm font-semibold mt-3 mb-1 scroll-mt-20" {...props}>{children}</h5>,
  h6: ({ children, ...props }: any) => <h6 id={slugify(children)} className="text-xs font-semibold mt-3 mb-1 uppercase tracking-wide scroll-mt-20" {...props}>{children}</h6>,
  img: ({ src, alt, ...props }: any) => (
    <span className="my-4 mx-auto block w-[calc(100%-0.5rem)] max-w-[calc(100%-0.5rem)] text-center">
      <img {...props} src={src} alt={alt} className="inline-block h-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain align-middle" />
    </span>
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-4 mx-auto block w-[calc(100%-0.5rem)] min-w-0 max-w-[calc(100%-0.5rem)] rounded-md border font-sans">
      <table {...props} className="w-full max-w-full table-fixed border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: any) => <thead className="bg-muted/70" {...props}>{children}</thead>,
  tr: ({ children, ...props }: any) => <tr className="border-b last:border-b-0" {...props}>{children}</tr>,
  th: ({ children, ...props }: any) => <th className="border-r px-3 py-2 text-left align-top font-semibold [overflow-wrap:anywhere] break-words whitespace-normal last:border-r-0" {...props}>{children}</th>,
  td: ({ children, ...props }: any) => <td className="border-r px-3 py-2 align-top [overflow-wrap:anywhere] break-words whitespace-normal last:border-r-0" {...props}>{children}</td>,
};

/** Renders Markdown via react-markdown with text-selection "Add to Chat" support. */
function MarkdownReader({ text, onSelect }: { text: string; onSelect: (t: string, src: string) => void }) {
  const [selected, setSelected] = useState("");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const renderedText = useMemo(() => normalizeHtmlTablesForMarkdown(text), [text]);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const t = sel?.toString().trim();
    if (t && t.length > 10) {
      setSelected(t);
      const range = sel?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
      }
    } else {
      setSelected("");
      setPos(null);
    }
  };

  return (
    <div onMouseUp={handleMouseUp} className="relative w-full min-w-0 max-w-full">
      <div className="prose prose-sm dark:prose-invert w-full min-w-0 max-w-full [overflow-wrap:anywhere] font-serif
        prose-headings:scroll-mt-20 prose-headings:font-sans prose-a:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:font-mono prose-pre:bg-muted prose-img:rounded-lg">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
          components={mdComponents}
        >
          {renderedText}
        </ReactMarkdown>
      </div>
      <AnimatePresence>
        {selected && pos && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
            className="fixed z-50" style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}>
            <Button size="sm" className="gap-1 shadow-lg text-xs h-7" onClick={() => { onSelect(selected, "Reader"); setSelected(""); setPos(null); }}>
              <Plus className="h-3 w-3"/> Add to Chat
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReadingGuideContent({
  articleId,
  articleTitle,
  extraction,
  graph,
  hasMarkdown,
  reprocessing,
  onAsk,
  onAdd,
  onCompare,
  onRunExtraction,
  comparing,
  language,
}: {
  articleId: number;
  articleTitle: string;
  extraction: ExtractionResult | null;
  graph: { entities: unknown[]; relationships: unknown[] } | null;
  hasMarkdown: boolean;
  reprocessing: boolean;
  onAsk: (text: string) => void;
  onAdd: (text: string, source: string) => void;
  onCompare: (prompt: string, articleIds: number[]) => void;
  onRunExtraction: (mode: "full" | "extract_only") => void;
  comparing: boolean;
  language: "en" | "zh";
}) {
  const [related, setRelated] = useState<RelatedArticleItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const guideText = useCallback((value: string) => translateUiText(value, language), [language]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRelated(true);
    getRelatedArticles(articleId, 5)
      .then((response) => {
        if (!cancelled) setRelated(response.related || []);
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRelated(false);
      });
    return () => { cancelled = true; };
  }, [articleId]);

  const articleGuide = useMemo(
    () => createArticleReadingGuide({ articleTitle, extraction, graph, hasMarkdown, language }),
    [articleTitle, extraction, graph, hasMarkdown, language],
  );
  const libraryGuide = useMemo(
    () => createLibraryReadingGuide({ articleId, articleTitle, related, language }),
    [articleId, articleTitle, related, language],
  );

  if (articleGuide.status === "missing_extraction") {
    const extractionMode = articleGuide.actions[0]?.mode === "full" ? "full" : "extract_only";
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <div>
          <p className="font-medium text-foreground">{articleGuide.title}</p>
          <p className="mt-1 max-w-md text-sm">{articleGuide.detail}</p>
        </div>
        <Button size="sm" onClick={() => onRunExtraction(extractionMode)} disabled={reprocessing} className="gap-1">
          <RotateCw className={`h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`} />
          {reprocessing ? guideText("Starting...") : articleGuide.actions[0]?.label || guideText("Run extraction")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pr-3 text-sm">
      <section className="rounded-md border bg-muted/20 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{guideText("TL;DR")}</h3>
            <p className="text-xs text-muted-foreground">{guideText("Fast orientation before you read the full article.")}</p>
          </div>
          {articleGuide.tldr && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd(articleGuide.tldr, guideText("Reading Guide"))}>
              <Plus className="h-3.5 w-3.5" /> {guideText("Add")}
            </Button>
          )}
        </div>
        <p className="leading-6 text-foreground">{articleGuide.tldr || guideText("No abstract or summary was extracted.")}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <GuideBlock title={guideText("Main Contribution")} text={articleGuide.contribution} onAsk={() => onAsk(getPromptText("readingMainContribution", language))} language={language} />
        <GuideBlock title={guideText("Method In Plain Language")} text={articleGuide.method} onAsk={() => onAsk(getPromptText("readingMethodPlain", language))} language={language} />
      </div>

      {articleGuide.claims.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">{guideText("Key Claims")}</h3>
          <div className="space-y-2">
            {articleGuide.claims.map((claim: string, index: number) => (
              <div key={index} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <p className="text-muted-foreground">{claim}</p>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onAsk(getPromptText("readingClaim", language, { claim }))} aria-label={guideText("Ask about claim")}>
                  <MessageCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {articleGuide.limitations && (
        <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="font-semibold">{guideText("Limitations")}</h3>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => onAsk(getPromptText("readingLimitations", language))}>
              <MessageCircle className="h-3.5 w-3.5" /> {guideText("Ask")}
            </Button>
          </div>
          <p className="text-muted-foreground">{articleGuide.limitations}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 font-semibold">{guideText("Read First")}</h3>
          <div className="space-y-2">
            {articleGuide.readFirst.map((section: { title: string; reason: string; prompt: string }, index: number) => (
              <button
                key={section.title}
                type="button"
                onClick={() => onAsk(section.prompt)}
                className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                <span>
                  <span className="block font-medium">{section.title}</span>
                  <span className="block text-xs text-muted-foreground">{section.reason}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">{guideText("Concepts To Know")}</h3>
          {articleGuide.concepts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {articleGuide.concepts.map((concept: { name: string; type: string }) => (
                <Badge key={`${concept.type}-${concept.name}`} variant="secondary" className="gap-1">
                  <span className="text-[10px] uppercase text-muted-foreground">{concept.type}</span>
                  {concept.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{guideText("No concepts were extracted yet.")}</p>
          )}
        </section>
      </div>

      {articleGuide.questions.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">{guideText("Suggested Questions")}</h3>
          <div className="flex flex-wrap gap-2">
            {articleGuide.questions.map((question: { label: string; text: string }) => (
              <Button key={question.text} variant="outline" size="sm" className="gap-1" onClick={() => onAsk(question.text)}>
                <MessageCircle className="h-3.5 w-3.5" /> {question.label}
              </Button>
            ))}
          </div>
        </section>
      )}

      <Separator />

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{guideText("Read Next")}</h3>
            <p className="text-xs text-muted-foreground">{guideText("Suggested from shared extracted concepts.")}</p>
          </div>
          {libraryGuide.comparePrompt && libraryGuide.compareArticleIds.length > 1 && (
            <Button variant="outline" size="sm" className="gap-1" disabled={comparing} onClick={() => onCompare(libraryGuide.comparePrompt, libraryGuide.compareArticleIds)}>
              <MessageCircle className="h-3.5 w-3.5" /> {guideText("Compare")}
            </Button>
          )}
        </div>
        {loadingRelated ? (
          <p className="text-xs text-muted-foreground">{guideText("Loading related articles...")}</p>
        ) : libraryGuide.status === "empty" ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{libraryGuide.detail}</p>
        ) : (
          <div className="space-y-2">
            {libraryGuide.readNext.map((item: { rank: number; articleId: number; title: string; reason: string }) => (
              <Link key={item.articleId} href={`/articles/${item.articleId}`} className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:border-primary hover:bg-primary/5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{item.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.reason}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GuideBlock({ title, text, onAsk, language }: { title: string; text: string; onAsk: () => void; language: "en" | "zh" }) {
  return (
    <section className="rounded-md border p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {text && (
          <Button variant="ghost" size="sm" className="gap-1" onClick={onAsk}>
            <MessageCircle className="h-3.5 w-3.5" /> {translateUiText("Ask", language)}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground">{text || translateUiText("Not extracted yet.", language)}</p>
    </section>
  );
}

function ChatComposer({
  chatting,
  contextText,
  draftSeed,
  language,
  onSubmit,
}: {
  chatting: boolean;
  contextText: string;
  draftSeed: { id: number; text: string };
  language: "en" | "zh";
  onSubmit: (question: string) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draftSeed.id === 0) return;
    setDraft(draftSeed.text);
    inputRef.current?.focus();
  }, [draftSeed.id, draftSeed.text]);

  const submit = () => {
    if (chatting) return;
    if (onSubmit(draft)) setDraft("");
  };

  const canSubmit = !chatting && Boolean(draft.trim() || contextText);

  return (
    <div className="flex gap-2 shrink-0">
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={translateUiText("Ask a question...", language)}
        disabled={chatting}
        className="text-xs h-9"
      />
      <Button size="icon" className="h-9 w-9" onClick={submit} disabled={!canSubmit}>
        <Send className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Summary content with "Ask" buttons */
function SummaryContent({ extraction, onAsk, onAdd, language }: { extraction: ExtractionResult; onAsk: (t: string) => void; onAdd: (t: string, s: string) => void; language: "en" | "zh" }) {
  return (
    <div className="space-y-4 text-sm">
      {extraction.abstract && <SectionWithAsk title="Abstract" text={extraction.abstract} onAsk={onAsk} onAdd={onAdd} language={language}/>}
      {Array.isArray(extraction.authors) && extraction.authors.length > 0 && (
        <div><h4 className="font-semibold mb-1 flex items-center gap-2">Authors <button onClick={()=>onAsk(getPromptText("authors", language))} className="text-primary hover:underline text-xs font-normal"><MessageCircle className="h-3 w-3 inline-block"/></button></h4>
          <div className="flex flex-wrap gap-1">{extraction.authors.map((a,i)=><Badge key={i} variant="secondary">{a}</Badge>)}</div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {[["Year",extraction.year],["Venue",extraction.venue],["DOI",extraction.doi],["URL",extraction.url]].map(([l,v])=>v?<div key={l as string}><h4 className="font-semibold mb-1">{l as string}</h4><p className="text-muted-foreground">{String(v)}</p></div>:null)}
      </div>
      {["background","research_problem","methodology","results","limitations","future_work"].map(k=>{
        const label = k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
        const val = (extraction as any)[k];
        return val ? <SectionWithAsk key={k} title={label} text={String(val)} onAsk={onAsk} onAdd={onAdd} language={language}/> : null;
      })}
      {Array.isArray(extraction.key_claims) && extraction.key_claims.length > 0 && (
        <div><h4 className="font-semibold mb-1">Key Claims</h4>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            {extraction.key_claims.map((c,i)=><li key={i} className="group flex items-start gap-2"><span className="flex-1">{c.claim}</span><button onClick={()=>onAsk(getPromptText("claim", language, { claim: c.claim }))} className="text-primary hover:underline text-xs opacity-0 group-hover:opacity-100"><MessageCircle className="h-3 w-3"/></button><button onClick={()=>onAdd(c.claim,"Key Claims")} className="text-primary hover:underline text-xs opacity-0 group-hover:opacity-100"><Plus className="h-3 w-3"/></button></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionWithAsk({ title, text, onAsk, onAdd, language }: { title: string; text: string; onAsk: (t: string) => void; onAdd: (t: string, s: string) => void; language: "en" | "zh" }) {
  return (
    <div>
      <h4 className="font-semibold mb-1 flex items-center gap-2">
        {title}
        <button onClick={() => onAsk(getPromptText("section", language, { section: title }))} className="text-primary hover:underline text-xs font-normal"><MessageCircle className="h-3 w-3 inline-block"/></button>
        <button onClick={() => onAdd(text, title)} className="text-primary hover:underline text-xs font-normal"><Plus className="h-3 w-3 inline-block"/></button>
      </h4>
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}

function SkillResultView({ result }: { result: unknown }) {
  if (!result || typeof result !== "object") {
    return <p className="text-muted-foreground">{String(result)}</p>;
  }
  const obj = result as Record<string, unknown>;
  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className="font-semibold capitalize shrink-0 text-muted-foreground min-w-[140px]">{key.replace(/_/g, " ")}</span>
          <span className="text-foreground">
            {Array.isArray(value)
              ? value.map((v, i) => <Badge key={i} variant="secondary" className="mr-1 mb-1 text-[10px]">{typeof v === "object" ? JSON.stringify(v) : String(v)}</Badge>)
              : typeof value === "object" && value !== null
                ? <code className="text-[10px] bg-muted px-1 rounded">{JSON.stringify(value)}</code>
                : String(value ?? "—")}
          </span>
        </div>
      ))}
    </div>
  );
}

function RelatedArticles({ articleId }: { articleId: number }) {
  const [related, setRelated] = useState<Array<{ id: number; title: string; status: string; source_type: string; similarity: number; shared_entities: string[] }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRelatedArticles(articleId)
      .then((r) => setRelated(r.related))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [articleId]);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading related articles...</p>;
  }

  if (related.length === 0) {
    return <p className="text-xs text-muted-foreground">No related articles found. Process more articles to discover connections.</p>;
  }

  return (
    <div className="space-y-2">
      {related.map((r) => (
        <Link key={r.id} href={`/articles/${r.id}`} className="block p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium truncate">{r.title}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">{Math.round(r.similarity * 100)}%</Badge>
          </div>
          {r.shared_entities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {r.shared_entities.slice(0, 4).map((e, i) => (
                <Badge key={i} variant="outline" className="text-[9px] px-1 py-0">{e}</Badge>
              ))}
              {r.shared_entities.length > 4 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0">+{r.shared_entities.length - 4}</Badge>
              )}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

function PipelineProgress({ job }: { job: JobInfo }) {
  const logs = job.logs || [];
  const completedSteps = new Set(logs.filter((l: any) => !l.error).map((l: any) => l.step));
  const isFailed = job.status === "failed";

  // Count completed extract-relevant steps
  const extractSteps = ["started", "parsing", "chunking", "extracting"];
  const doneCount = extractSteps.filter(s => completedSteps.has(s)).length;
  const isExtracting = job.current_step === "extracting";
  const progressPct = isFailed ? 100 : Math.min(Math.round((doneCount / extractSteps.length) * 100), 100);

  const statusLabel = isFailed
    ? "Extraction failed"
    : isExtracting
      ? "AI extracting..."
      : job.current_step === "graph" || completedSteps.has("extracting")
        ? "AI extraction complete"
        : "Preparing for extraction...";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium flex items-center gap-2">
          {!isFailed && !completedSteps.has("extracting") && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
          {!isFailed && completedSteps.has("extracting") && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          )}
          {isFailed && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
          AI Extraction
        </span>
        <span className="text-muted-foreground text-xs">{statusLabel}</span>
      </div>
      <Progress value={progressPct} className={`h-2 ${isFailed ? "[&>div]:bg-destructive" : ""}`} />
      {isFailed && job.error && (
        <p className="text-xs text-destructive mt-1">Error: {job.error.slice(0, 200)}</p>
      )}
    </div>
  );
}
