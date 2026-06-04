"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Send, MessageCircle, Hash, FileText, X, Loader2,
  Plus, BookOpen, ArrowUp, Trash2, PanelLeftClose, PanelLeftOpen,
  MessageSquare, Brain, ChevronDown, Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useLanguage } from "@/components/LanguageProvider";
import {
  listArticles, listSessions, createSession, deleteSession,
  getSessionMessages, sendSessionMessage,
  getDevConfig, setActiveProvider,
} from "@/lib/api";
import { translateUiText } from "@/lib/languageState.mjs";
import { normalizeHtmlTablesForMarkdown } from "@/lib/markdownHtmlTables.mjs";
import type { ArticleSummary, ChatSession, ChatMessageResponse, Citation, ProviderEntry } from "@/lib/types";
import { TypingDots } from "@/components/ui/animated";

// ── Mention Popover ──────────────────────────────────────────────────────

function MentionPopover({
  show, query, articles, onSelect, onClose,
}: {
  show: boolean; query: string;
  articles: ArticleSummary[];
  onSelect: (a: ArticleSummary) => void;
  onClose: () => void;
}) {
  const filtered = query
    ? articles.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.original_filename.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : articles.slice(0, 5);

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      className="absolute z-50 w-72 bg-card border rounded-xl shadow-xl overflow-hidden"
      style={{ bottom: "100%", marginBottom: 8, left: 0 }}
    >
      <div className="p-1.5">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tag Articles
        </div>
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">No articles found</div>
        )}
        {filtered.map((a) => (
          <button
            key={a.id}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent text-left transition-colors"
            onClick={() => onSelect(a)}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{a.title || a.original_filename}</div>
              <div className="text-xs text-muted-foreground">
                {a.status === "completed" ? "✓ Processed" : "○ " + a.status}
              </div>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Message Bubble ───────────────────────────────────────────────────────

interface BubbleData {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

function MessageBubble({ msg }: { msg: BubbleData }) {
  const renderedContent = useMemo(() => normalizeHtmlTablesForMarkdown(msg.content), [msg.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex min-w-0 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-3 ${
          msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60 border"
        }`}
      >
        <div className="prose prose-sm dark:prose-invert w-full min-w-0 max-w-full overflow-x-auto break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
            components={{
              h1: ({ children, ...props }: any) => <h1 className="text-xl font-bold mt-5 mb-2 border-b pb-0.5" {...props}>{children}</h1>,
              h2: ({ children, ...props }: any) => <h2 className="text-lg font-bold mt-4 mb-1.5 border-b pb-0.5" {...props}>{children}</h2>,
              h3: ({ children, ...props }: any) => <h3 className="text-base font-semibold mt-3 mb-1" {...props}>{children}</h3>,
              h4: ({ children, ...props }: any) => <h4 className="text-sm font-semibold mt-2 mb-1" {...props}>{children}</h4>,
              h5: ({ children, ...props }: any) => <h5 className="text-xs font-semibold mt-2 mb-0.5" {...props}>{children}</h5>,
              h6: ({ children, ...props }: any) => <h6 className="text-[11px] font-semibold mt-2 mb-0.5 uppercase tracking-wide" {...props}>{children}</h6>,
              img: ({ src, alt, ...props }: any) => (
                <span className="my-3 block w-full max-w-full text-center">
                  <img {...props} src={src} alt={alt} className="inline-block h-auto max-h-[50vh] w-auto max-w-full rounded-lg object-contain align-middle" />
                </span>
              ),
              table: ({ children, ...props }: any) => (
                <div className="my-3 block w-full min-w-0 max-w-full overflow-x-auto rounded-md border font-sans">
                  <table {...props} className="w-max min-w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              thead: ({ children, ...props }: any) => <thead className="bg-muted/70" {...props}>{children}</thead>,
              tr: ({ children, ...props }: any) => <tr className="border-b last:border-b-0" {...props}>{children}</tr>,
              th: ({ children, ...props }: any) => <th className="border-r px-3 py-2 text-left font-semibold last:border-r-0" {...props}>{children}</th>,
              td: ({ children, ...props }: any) => <td className="border-r px-3 py-2 align-top last:border-r-0" {...props}>{children}</td>,
            }}
          >
            {renderedContent}
          </ReactMarkdown>
        </div>
        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">📎 Sources</p>
            <div className="space-y-1.5">
              {msg.citations.map((cit, ci) => (
                <div key={ci} className="text-[11px] text-muted-foreground bg-background/50 rounded-lg px-2.5 py-1.5">
                  {cit.section_title && (
                    <span className="font-medium text-foreground/80">{cit.section_title}</span>
                  )}
                  {cit.snippet && (
                    <p className="mt-0.5 opacity-70 line-clamp-2 italic">
                      &ldquo;{String(cit.snippet).replace(/^\[.*?\]\s*/, "")}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Chat Page ────────────────────────────────────────────────────────

export default function ChatPage() {
  const { language } = useLanguage();
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<BubbleData[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [taggedArticles, setTaggedArticles] = useState<ArticleSummary[]>([]);

  // Provider / model selector
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);

  // @ mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIdx, setMentionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load data
  useEffect(() => {
    listArticles({ limit: 200, sort_by: "updated_at", sort_order: "desc" })
      .then((d) => setArticles(d.articles))
      .catch(() => toast.error("Failed to load articles"));
    loadSessions();
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const d = await getDevConfig();
      setProviders(d.providers);
      setActiveProviderId(d.active_provider_id);
    } catch { /* ok — non-critical */ }
  };

  const activeProvider = providers.find((p) => p.id === activeProviderId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const d = await listSessions();
      setSessions(d.sessions);
    } catch { /* ok */ }
    finally { setLoadingSessions(false); }
  };

  const loadMessages = async (sessionId: number) => {
    setLoadingMessages(true);
    try {
      const d = await getSessionMessages(sessionId);
      const bubbles: BubbleData[] = d.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        citations: m.citations || undefined,
      }));
      setMessages(bubbles);
    } catch {
      setMessages([]);
    } finally { setLoadingMessages(false); }
  };

  const selectSession = (id: number) => {
    setActiveSessionId(id);
    setTaggedArticles([]);
    loadMessages(id);
  };

  const handleNewSession = async () => {
    try {
      const s = await createSession(translateUiText("New Chat", language));
      setSessions((prev) => [s, ...prev]);
      setActiveSessionId(s.id);
      setMessages([]);
      setTaggedArticles([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create session");
    }
  };

  const handleDeleteSession = async (id: number) => {
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        setTaggedArticles([]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete session");
    }
  };

  // ── @ mention handling ────────────────────────────────────────────────
  const handleInputChange = (value: string) => {
    setInput(value);
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      const textAfterAt = value.slice(lastAt);
      const spaceAfterAt = textAfterAt.indexOf(" ");
      if (spaceAfterAt === -1 || spaceAfterAt === 1) {
        setMentionOpen(true);
        setMentionQuery(spaceAfterAt === -1 ? afterAt : "");
        setMentionIdx(lastAt);
        return;
      }
    }
    setMentionOpen(false);
  };

  const selectArticle = (article: ArticleSummary) => {
    const before = input.slice(0, mentionIdx);
    const after = input.slice(mentionIdx).replace(/^@\S*/, "");
    setInput(before + after);
    setMentionOpen(false);
    setMentionQuery("");
    if (!taggedArticles.find((a) => a.id === article.id)) {
      setTaggedArticles((prev) => [...prev, article]);
    }
    inputRef.current?.focus();
  };

  const removeTaggedArticle = (id: number) => {
    setTaggedArticles((prev) => prev.filter((a) => a.id !== id));
  };

  // ── Send ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    // Auto-create session if needed
    let sid = activeSessionId;
    if (!sid) {
      try {
        const s = await createSession(translateUiText("New Chat", language));
        setSessions((prev) => [s, ...prev]);
        sid = s.id;
        setActiveSessionId(sid);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to create session");
        return;
      }
    }

    const articleIds = taggedArticles.map((a) => a.id);
    const userBubble: BubbleData = { role: "user", content: text };
    setMessages((prev) => [...prev, userBubble]);
    setInput("");
    setSending(true);

    try {
      const res = await sendSessionMessage(sid, text, articleIds);
      const assistantBubble: BubbleData = {
        role: "assistant",
        content: res.answer,
        citations: res.citations,
      };
      setMessages((prev) => [...prev, assistantBubble]);
      // Optimistically move active session to top — avoid full re-fetch
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === sid);
        if (idx <= 0) return prev;
        const [moved] = prev.splice(idx, 1);
        return [moved, ...prev];
      });
    } catch (err: unknown) {
      const errBubble: BubbleData = {
        role: "assistant",
        content: `❌ **Error:** ${err instanceof Error ? err.message : "Failed to get response"}`,
      };
      setMessages((prev) => [...prev, errBubble]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") setMentionOpen(false);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* ── Session Sidebar ─────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 flex flex-col border rounded-xl bg-card overflow-hidden"
          >
            <div className="p-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-primary" /> Chats
              </h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewSession}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {loadingSessions ? (
                <div className="p-3 space-y-2">
                  <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No chats yet.<br />Start one below!
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectSession(s.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group ${
                        activeSessionId === s.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent"
                      }`}
                    >
                      <span className="truncate flex-1">{s.title}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-all p-0.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main Chat Area ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                {activeSessionId
                  ? sessions.find((s) => s.id === activeSessionId)?.title || translateUiText("Chat", language)
                  : translateUiText("New Chat", language)}
              </h1>
              <p className="text-xs text-muted-foreground">
                {taggedArticles.length > 0
                  ? `${taggedArticles.length} article(s) tagged`
                  : "No articles tagged — AI will search your library"}
              </p>
            </div>
          </div>
          {/* Model selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setProviderMenuOpen(!providerMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-accent transition-colors text-sm"
            >
              <Brain className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="max-w-[140px] truncate font-medium">
                {activeProvider
                  ? `${activeProvider.name} · ${activeProvider.model || "default"}`
                  : providers.length === 0
                    ? "No provider"
                    : "Select model"}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${providerMenuOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {providerMenuOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40" onClick={() => setProviderMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 4 }}
                    className="absolute right-0 top-full mt-1 z-50 w-72 bg-card border rounded-xl shadow-xl overflow-hidden"
                  >
                    <div className="p-1.5">
                      <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Switch Model
                      </div>
                      {providers.length === 0 ? (
                        <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                          No providers configured.<br />
                          <a href="/settings" className="text-primary hover:underline">Add one in Settings →</a>
                        </div>
                      ) : (
                        providers.map((p) => (
                          <button
                            key={p.id}
                            onClick={async () => {
                              try {
                                await setActiveProvider(p.id);
                                setActiveProviderId(p.id);
                                toast.success(`Switched to ${p.name}`);
                              } catch { toast.error("Failed to switch provider"); }
                              setProviderMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent text-left transition-colors ${
                              activeProviderId === p.id ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                              activeProviderId === p.id ? "bg-primary/20" : "bg-muted"
                            }`}>
                              <Brain className={`h-3.5 w-3.5 ${activeProviderId === p.id ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{p.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {p.type}{p.protocol === "anthropic" ? " · Anthropic" : ""} — {p.model || "default model"}
                              </div>
                            </div>
                            {activeProviderId === p.id && (
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <Badge variant="secondary" className="gap-1.5 flex-shrink-0">
            <BookOpen className="h-3 w-3" /> {articles.length} articles
          </Badge>
        </div>

        {/* Tagged articles bar */}
        <AnimatePresence>
          {taggedArticles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 mb-3 flex-shrink-0"
            >
              {taggedArticles.map((a) => (
                <motion.span key={a.id}
                  initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium"
                >
                  <Hash className="h-3 w-3 text-primary" />
                  {a.title || a.original_filename}
                  <button onClick={() => removeTaggedArticle(a.id)} className="hover:text-destructive ml-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </motion.span>
              ))}
              <button onClick={() => setTaggedArticles([])}
                className="text-xs text-muted-foreground hover:text-destructive px-1.5 py-1">Clear all</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <Card className="flex-1 flex flex-col min-h-0 border-primary/10">
          <ScrollArea className="flex-1 p-4">
            {loadingMessages ? (
              <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
                <Skeleton className="h-12 w-3/4" /><Skeleton className="h-12 w-2/3 ml-auto" />
                <Skeleton className="h-20 w-1/2" />
              </motion.div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-center text-muted-foreground py-12">
                <div>
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Start a conversation</p>
                  <p className="text-xs mt-1 max-w-xs mx-auto">
                    Tag articles with <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">@</kbd> for
                    focused context, or just ask a question — the AI will search your library.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5" role="log" aria-live="polite">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                </AnimatePresence>
                {sending && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start">
                    <div className="bg-muted/60 border rounded-2xl px-5 py-3"><TypingDots /></div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="relative">
              <AnimatePresence>
                {mentionOpen && (
                  <MentionPopover show={mentionOpen} query={mentionQuery}
                    articles={articles} onSelect={selectArticle} onClose={() => setMentionOpen(false)} />
                )}
              </AnimatePresence>
              <div className="flex gap-2">
              <Input ref={inputRef} value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={translateUiText("Ask anything... Tag articles with @", language)}
                  className="h-12 text-base rounded-xl" disabled={sending} />
                <Button onClick={handleSend} disabled={sending || !input.trim()}
                  size="icon" className="h-12 w-12 rounded-xl flex-shrink-0">
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Type <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">@</kbd> to tag articles.
              Sessions auto-save and persist across refreshes.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
