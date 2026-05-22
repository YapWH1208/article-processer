"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText, MessageCircle, BarChart3, Info, ScrollText, Loader2, Send,
  RotateCw, Download, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sendChatMessage, getArticle, getArticleMarkdown, getArticleExtraction, getArticleGraph, reprocessArticle } from "@/lib/api";
import type { ExtractionResult } from "@/lib/types";
import { TypingDots, PulseDot, FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Article {
  id: number; title: string; status: string; original_filename: string;
  source_type: string; created_at: string; updated_at: string;
}

interface ChatMessage { role: string; content: string; citations_json?: string; }
interface Citation { chunk_id: number; section_title: string; snippet: string; page_start?: number; }

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const articleId = Number(id);

  const [article, setArticle] = useState<Article | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [graph, setGraph] = useState<{ entities: unknown[]; relationships: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("reader");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [chatting, setChatting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [art, mdResp, ext, gr] = await Promise.all([
        getArticle(articleId),
        getArticleMarkdown(articleId).catch(() => ({ markdown: "" })),
        getArticleExtraction(articleId).catch(() => null),
        getArticleGraph(articleId).catch(() => null),
      ]);
      setArticle(art);
      setMarkdown(mdResp.markdown || "");
      setExtraction(ext?.extraction || null);
      setGraph(gr);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, [articleId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleChat = async () => {
    if (!question.trim()) return;
    setChatting(true);
    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    try {
      const res = await sendChatMessage(articleId, userMsg.content);
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer, citations_json: JSON.stringify(res.citations) }]);
    } catch (e: unknown) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Chat failed"}` }]);
    } finally { setChatting(false); }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try { await reprocessArticle(articleId); } catch { }
    finally { setReprocessing(false); }
  };

  const statusVariant = (s: string) => {
    switch (s) {
      case "completed": return "default" as const;
      case "failed": return "destructive" as const;
      default: return "secondary" as const;
    }
  };

  const isProcessing = article && !["completed", "failed"].includes(article.status);
  const citations = (msg: ChatMessage): Citation[] => {
    try { return msg.citations_json ? JSON.parse(msg.citations_json) : []; }
    catch { return []; }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col items-center py-12 gap-3">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <CardTitle>Article not found</CardTitle>
          <CardDescription>ID {articleId} does not exist.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <FadeIn>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">{article.title}</h1>
            <div className="flex gap-2 items-center mt-1 text-sm text-muted-foreground">
              <span>{article.original_filename}</span>
              <span>·</span>
              <Badge variant={statusVariant(article.status)} className="gap-1.5">
                {isProcessing && <PulseDot color="bg-amber-500" />}
                {article.status}
              </Badge>
              <span>·</span>
              <span>{new Date(article.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleReprocess} disabled={reprocessing} className="gap-1">
              <RotateCw className={`h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`} />
              Reprocess
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="reader" className="gap-1.5"><ScrollText className="h-4 w-4"/>Reader</TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5"><FileText className="h-4 w-4"/>Summary</TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5"><MessageCircle className="h-4 w-4"/>Chat</TabsTrigger>
          <TabsTrigger value="graph" className="gap-1.5"><BarChart3 className="h-4 w-4"/>Graph</TabsTrigger>
          <TabsTrigger value="metadata" className="gap-1.5"><Info className="h-4 w-4"/>Metadata</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          {/* Reader */}
          {tab === "reader" && (
            <motion.div key="reader" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <TabsContent value="reader" forceMount>
                <Card>
                  <CardContent className="py-4">
                    {markdown ? (
                      <ScrollArea className="h-[60vh]">
                        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-sm">{markdown}</div>
                      </ScrollArea>
                    ) : (
                      <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                        <ScrollText className="h-10 w-10 opacity-30" />
                        <p>No parsed markdown available.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* Summary */}
          {tab === "summary" && (
            <motion.div key="summary" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <TabsContent value="summary" forceMount>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Extraction Summary</CardTitle>
                      <CardDescription>AI-extracted structured information</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {["json", "markdown", "bibtex"].map((fmt) => (
                        <a key={fmt} href={`${API_BASE}/articles/${articleId}/export/${fmt}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="gap-1"><Download className="h-3.5 w-3.5"/>{fmt}</Button>
                        </a>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {extraction ? (
                      <ScrollArea className="h-[60vh]">
                        <div className="space-y-4 text-sm">
                          {extraction.abstract && <div><h4 className="font-semibold mb-1">Abstract</h4><p className="text-muted-foreground">{extraction.abstract}</p></div>}
                          {Array.isArray(extraction.authors) && extraction.authors.length > 0 && (
                            <div><h4 className="font-semibold mb-1">Authors</h4>
                              <div className="flex flex-wrap gap-1">
                                {extraction.authors.map((a, i) => <Badge key={i} variant="secondary">{a}</Badge>)}
                              </div>
                            </div>
                          )}
                          <div className="grid sm:grid-cols-2 gap-3">
                            {[["Year", extraction.year], ["Venue", extraction.venue], ["DOI", extraction.doi], ["URL", extraction.url]].map(([l, v]) =>
                              v ? <div key={l}><h4 className="font-semibold mb-1">{l}</h4><p className="text-muted-foreground text-xs break-all">{String(v)}</p></div> : null
                            )}
                          </div>
                          {[["Background", extraction.background], ["Research Problem", extraction.research_problem], ["Methodology", extraction.methodology], ["Results", extraction.results], ["Limitations", extraction.limitations], ["Future Work", extraction.future_work]].map(([l, v]) =>
                            v ? <div key={l}><h4 className="font-semibold mb-1">{l}</h4><p className="text-muted-foreground">{String(v)}</p></div> : null
                          )}
                          {Array.isArray(extraction.key_claims) && extraction.key_claims.length > 0 && (
                            <div><h4 className="font-semibold mb-1">Key Claims</h4>
                              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                {extraction.key_claims.map((c, i) => <li key={i}>{c.claim}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                        <FileText className="h-10 w-10 opacity-30" /><p>No extraction data yet.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* Chat */}
          {tab === "chat" && (
            <motion.div key="chat" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <TabsContent value="chat" forceMount>
                <Card className="flex flex-col h-[65vh]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2"><MessageCircle className="h-4 w-4"/>Ask about this article</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col min-h-0 p-4">
                    <ScrollArea className="flex-1 mb-3">
                      <div className="space-y-3 pr-3">
                        {messages.length === 0 && (
                          <p className="text-muted-foreground text-sm text-center py-8">Ask a question about the article.</p>
                        )}
                        <AnimatePresence>
                          {messages.map((msg, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}
                              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                {msg.role === "assistant" && citations(msg).length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-xs font-medium mb-1">Sources:</p>
                                    {citations(msg).map((c, ci) => (
                                      <div key={ci} className="text-xs opacity-70 mt-0.5">§{c.section_title} {c.page_start ? `p.${c.page_start}` : ""} — &ldquo;{c.snippet?.slice(0, 80)}...&rdquo;</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {chatting && (
                          <div className="flex justify-start">
                            <div className="bg-muted rounded-lg"><TypingDots /></div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2 shrink-0">
                      <Input value={question} onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleChat()}
                        placeholder="Ask a question..." disabled={chatting} />
                      <Button size="icon" onClick={handleChat} disabled={chatting || !question.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* Graph */}
          {tab === "graph" && (
            <motion.div key="graph" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <TabsContent value="graph" forceMount>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Knowledge Graph</CardTitle>
                    <CardDescription>Entities and relationships</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {graph ? (
                      <div className="space-y-4">
                        <div><h4 className="font-semibold mb-2">Entities ({graph.entities.length})</h4>
                          <div className="flex flex-wrap gap-2">
                            {graph.entities.map((e: any, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{e.type}: {e.name}</Badge>
                            ))}
                          </div>
                        </div>
                        <Separator />
                        <div><h4 className="font-semibold mb-2">Relationships ({graph.relationships.length})</h4>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            {graph.relationships.map((r: any, i: number) => (
                              <div key={i} className="flex gap-1"><span className="font-medium">{r.source_name || r.source}</span><span className="text-primary">—[{r.type}]→</span><span className="font-medium">{r.target_name || r.target}</span></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-12 text-muted-foreground gap-2"><BarChart3 className="h-10 w-10 opacity-30"/><p>No graph data yet.</p></div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* Metadata */}
          {tab === "metadata" && (
            <motion.div key="metadata" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <TabsContent value="metadata" forceMount>
                <Card>
                  <CardHeader><CardTitle className="text-lg">Article Metadata</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {[["ID", article.id], ["Filename", article.original_filename], ["Source Type", article.source_type.toUpperCase()],
                        ["Status", article.status], ["Created", new Date(article.created_at).toLocaleString()],
                        ["Updated", new Date(article.updated_at).toLocaleString()],
                      ].map(([l, v]) => (
                        <div key={l as string} className="flex justify-between py-1.5 border-b border-border/50">
                          <span className="text-muted-foreground">{l}</span><span className="font-medium text-right max-w-[60%] truncate">{v}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
