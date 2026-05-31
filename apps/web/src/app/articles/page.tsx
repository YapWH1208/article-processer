"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Filter, FileText, ArrowRight, Archive, ChevronLeft, ChevronRight, ArrowUpDown, CheckSquare, Square, Trash2, ArchiveRestore, X, FileType, Globe, FileCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { StaggerContainer, StaggerItem, HoverCard, FadeIn } from "@/components/ui/animated";
import { deleteArticle, toggleArchiveArticle, restoreArticle } from "@/lib/api";
import { parseArticleListQuery, serializeArticleListQuery } from "./articleListState.mjs";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const TERMINAL_ARTICLE_STATUSES = new Set(["completed", "failed", "needs_review"]);

interface Article {
  id: number; title: string; status: string;
  original_filename: string; source_type: string; created_at: string;
  is_archived: number;
}

const PAGE_SIZE = 20;

function getInitialListState() {
  if (typeof window === "undefined") {
    return parseArticleListQuery(new URLSearchParams());
  }
  return parseArticleListQuery(new URLSearchParams(window.location.search));
}

export default function ArticlesPage() {
  const [initialListState] = useState(getInitialListState);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialListState.search);
  const [searchContent, setSearchContent] = useState(initialListState.searchContent);
  const [statusFilter, setStatusFilter] = useState(initialListState.statusFilter);
  const [includeArchived, setIncludeArchived] = useState(initialListState.includeArchived);
  const [page, setPage] = useState(initialListState.page);
  const [sortBy, setSortBy] = useState(initialListState.sortBy);
  const [sortOrder, setSortOrder] = useState(initialListState.sortOrder);
  const didMountFiltersRef = useRef(false);

  // Force-refetch counter (setPage(1) is a no-op when already on page 1)
  const [refreshKey, setRefreshKey] = useState(0);

  // Batch selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchAction, setBatchAction] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === articles.length) { setSelected(new Set()); }
    else { setSelected(new Set(articles.map((a) => a.id))); }
  };

  const handleBatchArchive = async () => {
    setBatchAction("archive");
    let ok = 0;
    let failed = 0;
    for (const id of selected) {
      try {
        const a = articles.find((x) => x.id === id);
        const url = a?.is_archived ? "unarchive" : "archive";
        await toggleArchiveArticle(id, Boolean(a?.is_archived));
        ok++;
      } catch (e) {
        failed++;
        console.error(`Failed to update article ${id}:`, e);
      }
    }
    if (failed > 0) {
      toast.warning(`${ok} archived, ${failed} failed`);
    } else {
      toast.success(`${ok} article(s) archived`);
    }
    setSelected(new Set());
    setBatchAction(null);
    setRefreshKey((k) => k + 1);
  };

  const handleBatchDelete = async () => {
    setDeleteOpen(false);
    setBatchAction("delete");
    const deletedIds: number[] = [];
    let failed = 0;
    for (const id of selected) {
      try {
        const result = await deleteArticle(id);
        if (result?.deleted) {
          deletedIds.push(id);
        } else {
          failed++;
          console.error(`Delete API returned deleted=false for article ${id}`);
        }
      } catch (e) {
        failed++;
        console.error(`Failed to delete article ${id}:`, e);
      }
    }
    const count = deletedIds.length;
    const msg = failed > 0 ? `${count} trashed, ${failed} failed` : `${count} article(s) trashed`;
    if (failed > 0) {
      toast.warning(msg, {
        action: count > 0 ? { label: "Undo", onClick: async () => {
          let restored = 0;
          for (const id of deletedIds) {
            try { await restoreArticle(id); restored++; } catch {}
          }
          if (restored > 0) { toast.success(`${restored} article(s) restored`); setRefreshKey((k) => k + 1); }
        }} : undefined,
      });
    } else {
      toast.success(msg, {
        action: count > 0 ? { label: "Undo", onClick: async () => {
          let restored = 0;
          for (const id of deletedIds) {
            try { await restoreArticle(id); restored++; } catch {}
          }
          if (restored > 0) { toast.success(`${restored} article(s) restored`); setRefreshKey((k) => k + 1); }
        }} : undefined,
      });
    }
    setSelected(new Set());
    setBatchAction(null);
    setRefreshKey((k) => k + 1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (includeArchived) params.set("include_archived", "true");
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (searchContent) params.set("search_content", searchContent);
    params.set("sort_by", sortBy);
    params.set("sort_order", sortOrder);
    params.set("skip", String((page - 1) * PAGE_SIZE));
    params.set("limit", String(PAGE_SIZE));
    fetch(`${API_BASE}/articles?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setArticles(d.articles || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter, includeArchived, search, searchContent, sortBy, sortOrder, refreshKey]);

  // Reset to page 1 when filters change after the initial URL-backed render.
  useEffect(() => {
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }
    setPage(1);
  }, [search, statusFilter, includeArchived, searchContent, sortBy, sortOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = serializeArticleListQuery({
      search,
      searchContent,
      statusFilter,
      includeArchived,
      page,
      sortBy,
      sortOrder,
    });
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [search, searchContent, statusFilter, includeArchived, page, sortBy, sortOrder]);

  // Keyboard navigation: j/k to move through articles, Enter to open
  const router = useRouter();
  const [focusedIdx, setFocusedIdx] = useState(-1);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIdx((prev) => Math.min(prev + 1, articles.length - 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusedIdx >= 0 && focusedIdx < articles.length) {
        e.preventDefault();
        router.push(`/articles/${articles[focusedIdx].id}`);
      } else if (e.key === "Escape") {
        setFocusedIdx(-1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [articles, focusedIdx, router]);

  const statusVariant = (s: string) => {
    if (s === "completed") return "default" as const;
    if (s === "failed") return "destructive" as const;
    return "secondary" as const;
  };

  const isProcessingStatus = (s: string) => !TERMINAL_ARTICLE_STATUSES.has(s);

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-3xl font-bold tracking-tight">Articles</h1>
        <p className="text-muted-foreground mt-1">{total} article{total !== 1 ? "s" : ""}{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}</p>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search titles & filenames..." value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearchContent(search)}
              className="pl-9" />
          </div>
          <Button
            variant={searchContent ? "secondary" : "outline"}
            size="sm" className="gap-1.5"
            onClick={() => {
              if (searchContent) { setSearchContent(""); setSearch(""); }
              else setSearchContent(search || "");
            }}
            title="Search inside article content">
            <Search className="h-3.5 w-3.5"/>
            {searchContent ? "Content search on" : "Search content"}
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
              <SelectItem value="parsing">Parsing</SelectItem>
              <SelectItem value="extracting">Extracting</SelectItem>
              <SelectItem value="indexing">Indexing</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={includeArchived ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setIncludeArchived(!includeArchived)}
          >
            <Archive className="h-3.5 w-3.5" />
            {includeArchived ? "Hide Archived" : "Show Archived"}
          </Button>
          <Select value={`${sortBy}:${sortOrder}`} onValueChange={(v) => { const [by, ord] = v.split(":"); setSortBy(by); setSortOrder(ord); }}>
            <SelectTrigger className="w-[170px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at:desc">Newest first</SelectItem>
              <SelectItem value="created_at:asc">Oldest first</SelectItem>
              <SelectItem value="title:asc">Title A–Z</SelectItem>
              <SelectItem value="title:desc">Title Z–A</SelectItem>
              <SelectItem value="status:asc">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FadeIn>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <FadeIn>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 flex-wrap">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button variant="outline" size="sm" className="gap-1" onClick={handleBatchArchive} disabled={!!batchAction}>
              <ArchiveRestore className="h-3.5 w-3.5"/> Archive/Restore
            </Button>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 text-destructive hover:bg-destructive/10" disabled={!!batchAction}>
                  <Trash2 className="h-3.5 w-3.5"/> Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete {selected.size} article(s)?</DialogTitle>
                  <DialogDescription>This permanently deletes all selected articles and their data. This cannot be undone.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleBatchDelete}>Delete Permanently</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="ml-auto gap-1">
              <X className="h-3.5 w-3.5"/> Clear
            </Button>
          </div>
        </FadeIn>
      )}

      {/* Select all checkbox */}
      {articles.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Select all articles on page">
            {selected.size === articles.length ? <CheckSquare className="h-4 w-4 text-primary"/> : <Square className="h-4 w-4"/>}
          </button>
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : articles.length === 0 ? (
        <FadeIn delay={0.2}>
          <Card className="border-dashed overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50" />
              <motion.div
                animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <div className="p-4 rounded-full bg-primary/10 mb-3">
                  <FileText className="h-10 w-10 text-primary/50" />
                </div>
              </motion.div>
              <p className="text-muted-foreground text-lg font-medium">
                {total === 0 ? "No articles yet" : "No matching articles"}
              </p>
              <p className="text-muted-foreground/60 text-sm mt-1">
                {total === 0 ? "Upload a paper to get started." : "Try adjusting your search or filters."}
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      ) : (
        <StaggerContainer className="space-y-2">
          {articles.map((a, idx) => (
            <StaggerItem key={a.id}>
              <HoverCard>
                <Card className={`hover:bg-accent/50 transition-colors group ${a.is_archived === 1 ? "opacity-60" : ""} ${selected.has(a.id) ? "ring-2 ring-primary/30 bg-primary/5" : ""} ${idx === focusedIdx ? "ring-2 ring-primary/50 bg-accent" : ""}`}>
                  <CardContent className="flex items-center py-4 gap-3">
                    {/* Checkbox */}
                    <button onClick={(e) => { e.preventDefault(); toggleSelect(a.id); }}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" aria-label={`Select ${a.title || a.original_filename}`}>
                      {selected.has(a.id) ? <CheckSquare className="h-4 w-4 text-primary"/> : <Square className="h-4 w-4"/>}
                    </button>
                    {/* Content */}
                    <Link href={`/articles/${a.id}`} className="flex-1 min-w-0 flex items-center justify-between cursor-pointer" onClick={(e) => { if (selected.size > 0) e.preventDefault(); }}>
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-medium truncate group-hover:text-primary transition-colors">
                          {a.title}
                        </p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-1 items-center">
                          <SourceIcon type={a.source_type} />
                          <span className="uppercase font-medium text-[10px]">{a.source_type}</span>
                          <span>·</span>
                          <span>{a.original_filename}</span>
                          <span>·</span>
                          <span>{new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {a.is_archived === 1 && <Badge variant="outline" className="text-muted-foreground text-[10px]">Archived</Badge>}
                        <Badge variant={statusVariant(a.status)}>
                          {isProcessingStatus(a.status) ? (
                            <span className="flex items-center gap-1.5">
                              <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
                              {a.status}
                            </span>
                          ) : a.status}
                        </Badge>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              </HoverCard>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <FadeIn delay={0.3}>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4"/> Prev
            </Button>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button key={p} variant={p === page ? "default" : "outline"} size="sm"
                  className="w-9 h-9 p-0" onClick={() => setPage(p)}>
                  {p}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="gap-1">
              Next <ChevronRight className="h-4 w-4"/>
            </Button>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

function SourceIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  const cls = "h-3.5 w-3.5";
  if (t === "pdf") return <FileType className={cls} />;
  if (t === "html" || t === "htm") return <Globe className={cls} />;
  if (t === "md" || t === "markdown") return <FileCode className={cls} />;
  return <FileText className={cls} />;
}
