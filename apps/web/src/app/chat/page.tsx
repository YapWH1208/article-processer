"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, MessageCircle, Hash, FileText, X, Loader2,
  Plus, Search, BookOpen, Sparkles, ArrowUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { listArticles, sendMultiArticleChatMessage } from "@/lib/api";
import type { ArticleSummary, Citation } from "@/lib/types";
import { TypingDots } from "@/components/ui/animated";

// ── Article Mention Popover ──────────────────────────────────────────────

function MentionPopover({
  show, query, articles, onSelect, onClose, position,
}: {
  show: boolean; query: string;
  articles: ArticleSummary[];
  onSelect: (a: ArticleSummary) => void;
  onClose: () => void;
  position: { top: number; left: number };
}) {
  const filtered = query
    ? articles.filter(
        (a) =>
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
      style={{ bottom: "100%", left: position.left, marginBottom: 8 }}
    >
      <div className="p-1.5">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tag Articles
        </div>
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">
            No articles found
          </div>
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
              <div className="text-sm font-medium truncate">
                {a.title || a.original_filename}
              </div>
              <div className="text-xs text-muted-foreground">
                {a.status === "completed" ? "✓ Processed" : "○ " + a.status}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="px-2.5 py-1.5 border-t bg-muted/30">
        <p className="text-[10px] text-muted-foreground">
          Type <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">@</kbd> to search articles
        </p>
      </div>
    </motion.div>
  );
}

// ── Main Chat Page ────────────────────────────────────────────────────────

interface ChatBubble {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  articleIds?: number[];
  articleNames?: string[];
}

export default function ChatPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [messages, setMessages] = useState<ChatBubble[]>([{
    role: "assistant",
    content: "Hello! I'm your research assistant. **Tag articles with `@`** to chat across your library — ask about methodology, compare findings, or explore connections.",
  }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [taggedArticles, setTaggedArticles] = useState<ArticleSummary[]>([]);

  // @ mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIdx, setMentionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load articles
  useEffect(() => {
    listArticles({ limit: 200, sort_by: "updated_at", sort_order: "desc" })
      .then((d) => setArticles(d.articles))
      .catch(() => toast.error("Failed to load articles"))
      .finally(() => setArticlesLoading(false));
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle @ mention detection
  const handleInputChange = (value: string) => {
    setInput(value);

    // Detect @ mention
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      // Only trigger if @ is at the end or followed by non-space chars
      const textAfterAt = value.slice(lastAt);
      const spaceAfterAt = textAfterAt.indexOf(" ");
      if (spaceAfterAt === -1) {
        // @ is active — still typing the query
        setMentionOpen(true);
        setMentionQuery(afterAt);
        setMentionIdx(lastAt);
      } else if (spaceAfterAt === 1) {
        // Just "@ " — show all articles
        setMentionOpen(true);
        setMentionQuery("");
        setMentionIdx(lastAt);
      } else {
        setMentionOpen(false);
      }
    } else {
      setMentionOpen(false);
    }
  };

  const selectArticle = (article: ArticleSummary) => {
    // Replace @query with article reference in input
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (taggedArticles.length === 0) {
      toast.error("Tag at least one article with @ to start chatting");
      return;
    }

    const articleIds = taggedArticles.map((a) => a.id);
    const articleNames = taggedArticles.map((a) => a.title || a.original_filename);

    const userMsg: ChatBubble = {
      role: "user",
      content: text,
      articleIds,
      articleNames,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await sendMultiArticleChatMessage(articleIds, text);
      const assistantMsg: ChatBubble = {
        role: "assistant",
        content: res.answer,
        citations: res.citations,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg: ChatBubble = {
        role: "assistant",
        content: `❌ **Error:** ${err instanceof Error ? err.message : "Failed to get response"}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-primary" />
            AI Chat
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chat across your articles — tag them with <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">@</kbd>
          </p>
        </div>
        {articlesLoading ? (
          <Skeleton className="h-6 w-24" />
        ) : (
          <Badge variant="secondary" className="gap-1.5">
            <BookOpen className="h-3 w-3" />
            {articles.length} articles available
          </Badge>
        )}
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
              <motion.span
                key={a.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium"
              >
                <Hash className="h-3 w-3 text-primary" />
                {a.title || a.original_filename}
                <button onClick={() => removeTaggedArticle(a.id)} className="hover:text-destructive ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}
            {taggedArticles.length > 1 && (
              <button
                onClick={() => setTaggedArticles([])}
                className="text-xs text-muted-foreground hover:text-destructive px-1.5 py-1"
              >
                Clear all
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <Card className="flex-1 flex flex-col min-h-0 border-primary/10">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 border"
                    }`}
                  >
                    {/* User message shows tagged articles */}
                    {msg.role === "user" && msg.articleNames && msg.articleNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {msg.articleNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-foreground/15 text-[11px]"
                          >
                            <Hash className="h-2.5 w-2.5" />
                            {name.length > 40 ? name.slice(0, 40) + "..." : name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                          📎 Sources
                        </p>
                        <div className="space-y-1.5">
                          {msg.citations.map((cit, ci) => (
                            <div key={ci} className="text-[11px] text-muted-foreground bg-background/50 rounded-lg px-2.5 py-1.5">
                              {cit.section_title && (
                                <span className="font-medium text-foreground/80">
                                  {cit.section_title}
                                </span>
                              )}
                              {cit.page_start != null && (
                                <span className="ml-1.5 text-[10px] opacity-60">
                                  p.{cit.page_start}{cit.page_end ? `-${cit.page_end}` : ""}
                                </span>
                              )}
                              {cit.snippet && (
                                <p className="mt-0.5 opacity-70 line-clamp-2 italic">
                                  &ldquo;{cit.snippet.replace(/^\[.*?\]\s*/, "")}&rdquo;
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {sending && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-muted/60 border rounded-2xl px-5 py-3">
                  <TypingDots />
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="p-4 border-t">
          <div className="relative">
            <AnimatePresence>
              {mentionOpen && (
                <MentionPopover
                  show={mentionOpen}
                  query={mentionQuery}
                  articles={articles}
                  onSelect={selectArticle}
                  onClose={() => setMentionOpen(false)}
                  position={{ top: 0, left: 0 }}
                />
              )}
            </AnimatePresence>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    taggedArticles.length === 0
                      ? "Type @ to tag articles, then ask a question..."
                      : "Ask a question about the tagged articles..."
                  }
                  className="pr-4 h-12 text-base rounded-xl"
                  disabled={sending}
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={sending || !input.trim() || taggedArticles.length === 0}
                size="icon"
                className="h-12 w-12 rounded-xl flex-shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowUp className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Tag articles with <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">@</kbd> to provide context.
            You can tag multiple articles and ask comparative questions.
          </p>
        </div>
      </Card>
    </div>
  );
}
