"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { sendChatMessage, streamChatMessage, getArticle, getArticleMarkdown, getArticleExtraction, getArticleGraph, reprocessArticle, getChatHistory, listSkills, runSkill, getArticleJobs, getArticleActiveJob, updateArticle } from "@/lib/api";
import type { ExtractionResult } from "@/lib/types";
import { TypingDots, PulseDot, FadeIn } from "@/components/ui/animated";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
interface Citation { chunk_id: number; section_title: string; snippet: string; page_start?: number; }
interface JobInfo { id: number; status: string; current_step: string | null; logs: Record<string, unknown>[] | null; error: string | null; created_at: string; completed_at: string | null; }

const TERMINAL_ARTICLE_STATUSES = new Set(["completed", "failed", "needs_review"]);

function isTerminalArticleStatus(status: string | null | undefined) {
  return !!status && TERMINAL_ARTICLE_STATUSES.has(status);
}

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const articleId = Number(id);

  const [article, setArticle] = useState<Article | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extractionErrors, setExtractionErrors] = useState<string[]>([]);
  const [graph, setGraph] = useState<{ entities: unknown[]; relationships: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("reader");
  const [readerView, setReaderView] = useState<"markdown" | "pdf">("markdown");

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [contextText, setContextText] = useState("");
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
    } catch { /* handled */ }
    finally { setLoading(false); }
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
      } catch { /* ignore poll errors */ }
    };
    poll(); // immediate first poll
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [article?.status, articleId, loadData, prevStatus]);

  const handleChat = async () => {
    const msg = question.trim();
    if (!msg && !contextText) return;
    setChatting(true);
    // Build message with context
    const fullContent = contextText
      ? `[User selected context]:\n${contextText}\n\n[Question]: ${msg || "Tell me about this"}`
      : msg;
    const userMsg: ChatMessage = { role: "user", content: fullContent };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setContextText("");

    // Placeholder assistant message for streaming
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    let streamedContent = "";

    await streamChatMessage(
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
      () => {
        setChatting(false);
      },
      // onError: fall back to non-streaming endpoint
      async (streamErr) => {
        // Remove the empty streaming placeholder
        setMessages((prev) => prev.slice(0, -1));
        try {
          const res = await sendChatMessage(articleId, userMsg.content);
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
    );
  };

  // Add text selection to chat context
  const addToChat = (text: string, source: string) => {
    const formatted = `[From ${source}]:\n"${text.slice(0, 500)}"`;
    setContextText((prev) => prev ? `${prev}\n\n${formatted}` : formatted);
    setChatOpen(true);
    toast.success("Added to chat context");
  };

  // Add claim/question to chat
  const askAbout = (text: string) => {
    setQuestion(text);
    setChatOpen(true);
  };

  const handleReprocess = async (mode: "full" | "extract_only" = "extract_only") => {
    setReprocessing(true);
    try {
      await reprocessArticle(articleId, mode);
      setArticle((prev) => prev ? { ...prev, status: "extracting", processing_error: null } : prev);
      setExtractionErrors([]);
      toast.success(mode === "extract_only" ? "AI extraction started" : "Full reprocessing started");
    }
    catch { toast.error("Reprocess failed"); }
    finally { setReprocessing(false); }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      const url = article?.is_archived ? "unarchive" : "archive";
      const res = await fetch(`${API_BASE}/articles/${articleId}/${url}`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setArticle((prev) => prev ? { ...prev, is_archived: data.is_archived ? 1 : 0 } : null);
      toast.success(data.is_archived ? "Article archived" : "Article restored");
    } catch { toast.error("Failed"); }
    finally { setArchiving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${API_BASE}/articles/${articleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleteOpen(false);
      toast.success("Article trashed", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const restoreRes = await fetch(`${API_BASE}/articles/${articleId}/restore`, { method: "POST" });
              if (restoreRes.ok) {
                setArticle((prev) => prev ? { ...prev, status: prev.status } : null);
                toast.success("Article restored");
              }
            } catch { toast.error("Restore failed"); }
          },
        },
      });
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
  const citations = (msg: ChatMessage): Citation[] => {
    try { return msg.citations_json ? JSON.parse(msg.citations_json) : []; }
    catch { return []; }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64"/><Skeleton className="h-4 w-48"/><Skeleton className="h-[70vh] w-full"/></div>;
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
        {/* Processing error */}
        {article.status === "failed" && article.processing_error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive mb-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5"/>
            <div>
              <p className="font-medium">Processing failed</p>
              <p className="text-xs opacity-80 mt-0.5">{article.processing_error}</p>
            </div>
          </motion.div>
        )}
        {article.status === "needs_review" && extractionErrors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700 dark:text-amber-300 mb-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5"/>
            <div>
              <p className="font-medium">Extraction needs review</p>
              <p className="text-xs opacity-80 mt-0.5">{extractionErrors.join("; ")}</p>
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
      <div className="flex gap-4 h-[calc(100vh-14rem)]">
        {/* Left: Content + Tabs */}
        <div className={`flex-1 min-w-0 flex flex-col ${chatOpen ? 'hidden md:flex' : 'flex'}`}>
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              <TabsList>
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
              {/* Reader */}
              {tab === "reader" && (
                <motion.div key="reader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0">
                  <TabsContent value="reader" forceMount className="h-full m-0">
                    <Card className="h-full flex flex-col">
                      <CardHeader className="shrink-0 pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Document View</CardTitle>
                        {article.source_type === "pdf" && (
                          <div className="flex rounded-md border border-border overflow-hidden">
                            <button
                              onClick={() => setReaderView("markdown")}
                              className={`px-3 py-1 text-xs font-medium transition-colors ${readerView === "markdown" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                            >Markdown</button>
                            <button
                              onClick={() => setReaderView("pdf")}
                              className={`px-3 py-1 text-xs font-medium transition-colors ${readerView === "pdf" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                            >PDF</button>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0 p-4 pt-0">
                        {readerView === "pdf" && article.source_type === "pdf" ? (
                          <iframe
                            src={`${API_BASE}/articles/${articleId}/file`}
                            className="w-full h-full rounded border border-border"
                            title="Original PDF"
                          />
                        ) : markdown ? (
                          <ScrollArea className="h-full">
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
                          {["json","markdown"].map(f=><a key={f} href={`${API_BASE}/articles/${articleId}/export/${f}`} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5"/>{f}</Button></a>)}
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 min-h-0 p-4">
                        {extraction ? (
                          <ScrollArea className="h-full"><SummaryContent extraction={extraction} onAsk={askAbout} onAdd={addToChat}/></ScrollArea>
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
                                        const res = await runSkill(s.name, articleId);
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
                <CardHeader className="pb-2 shrink-0 flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4"/> Chat
                    {messages.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                        {messages.reduce((sum, m) => sum + (m.prompt_tokens || 0) + (m.completion_tokens || 0), 0).toLocaleString()} tokens
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={() => setChatOpen(false)}>
                      <X className="h-3.5 w-3.5"/>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 hidden md:flex" onClick={() => setChatOpen(false)} title="Collapse">
                      <PanelRightClose className="h-3.5 w-3.5"/>
                    </Button>
                  </div>
                </CardHeader>

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
                    <div className="space-y-3 pr-3">
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
                              <p className="whitespace-pre-wrap text-xs">{msg.content.slice(0, 600)}{msg.content.length > 600 ? "..." : ""}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {msg.role === "assistant" && citations(msg).length > 0 && (
                                  <div className="mt-1.5 pt-1.5 border-t border-border/50 w-full">
                                    <p className="text-[10px] font-medium mb-0.5">Sources:</p>
                                    {citations(msg).slice(0, 3).map((c, ci) => (
                                      <div key={ci} className="text-[10px] opacity-70 mt-0.5">§{c.section_title} {c.page_start ? `p.${c.page_start}` : ""}</div>
                                    ))}
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
                  <div className="flex gap-2 shrink-0">
                    <Input value={question} onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleChat()}
                      placeholder="Ask a question..." disabled={chatting} className="text-xs h-9"/>
                    <Button size="icon" className="h-9 w-9" onClick={handleChat} disabled={chatting || (!question.trim() && !contextText)}>
                      <Send className="h-3.5 w-3.5"/>
                    </Button>
                  </div>
                </CardContent>
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

/** Renders Markdown via react-markdown with text-selection "Add to Chat" support. */
function MarkdownReader({ text, onSelect }: { text: string; onSelect: (t: string, src: string) => void }) {
  const [selected, setSelected] = useState("");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

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
    <div onMouseUp={handleMouseUp} className="relative">
      <div className="prose prose-sm dark:prose-invert max-w-none font-serif
        prose-headings:scroll-mt-20 prose-headings:font-sans prose-a:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:font-mono prose-pre:bg-muted prose-img:rounded-lg">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        >
          {text}
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

/** Summary content with "Ask" buttons */
function SummaryContent({ extraction, onAsk, onAdd }: { extraction: ExtractionResult; onAsk: (t: string) => void; onAdd: (t: string, s: string) => void }) {
  return (
    <div className="space-y-4 text-sm">
      {extraction.abstract && <SectionWithAsk title="Abstract" text={extraction.abstract} onAsk={onAsk} onAdd={onAdd}/>}
      {Array.isArray(extraction.authors) && extraction.authors.length > 0 && (
        <div><h4 className="font-semibold mb-1 flex items-center gap-2">Authors <button onClick={()=>onAsk(`Tell me about the authors of this paper`)} className="text-primary hover:underline text-xs font-normal"><MessageCircle className="h-3 w-3 inline mr-0.5"/>Ask</button></h4>
          <div className="flex flex-wrap gap-1">{extraction.authors.map((a,i)=><Badge key={i} variant="secondary">{a}</Badge>)}</div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {[["Year",extraction.year],["Venue",extraction.venue],["DOI",extraction.doi],["URL",extraction.url]].map(([l,v])=>v?<div key={l}><h4 className="font-semibold mb-1">{l}</h4><p className="text-muted-foreground text-xs break-all">{String(v)}</p></div>:null)}
      </div>
      {["background","research_problem","methodology","results","limitations","future_work"].map(k=>{
        const label = k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
        const val = (extraction as any)[k];
        return val ? <SectionWithAsk key={k} title={label} text={String(val)} onAsk={onAsk} onAdd={onAdd}/> : null;
      })}
      {Array.isArray(extraction.key_claims) && extraction.key_claims.length > 0 && (
        <div><h4 className="font-semibold mb-1">Key Claims</h4>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            {extraction.key_claims.map((c,i)=><li key={i} className="group flex items-start gap-2"><span className="flex-1">{c.claim}</span><button onClick={()=>onAsk(`Tell me more about this claim: "${c.claim}"`)} className="opacity-0 group-hover:opacity-100 text-primary shrink-0" title="Ask"><MessageCircle className="h-3 w-3"/></button></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionWithAsk({ title, text, onAsk, onAdd }: { title: string; text: string; onAsk: (t: string) => void; onAdd: (t: string, s: string) => void }) {
  return (
    <div>
      <h4 className="font-semibold mb-1 flex items-center gap-2">
        {title}
        <button onClick={() => onAsk(`Tell me about the ${title.toLowerCase()} of this paper`)} className="text-primary hover:underline text-xs font-normal"><MessageCircle className="h-3 w-3 inline mr-0.5"/>Ask</button>
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

// ── Pipeline Progress Bar ──────────────────────────────────────────────

// ── AI Extraction Progress Bar ───────────────────────────────────────

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
