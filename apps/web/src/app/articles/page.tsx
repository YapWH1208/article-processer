"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Filter, FileText, ArrowRight, Archive, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaggerContainer, StaggerItem, HoverCard, FadeIn } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Article {
  id: number; title: string; status: string;
  original_filename: string; source_type: string; created_at: string;
  is_archived: number;
}

const PAGE_SIZE = 20;

function getUrlParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) || "";
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchContent, setSearchContent] = useState(getUrlParam("q"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (includeArchived) params.set("include_archived", "true");
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (searchContent) params.set("search_content", searchContent);
    params.set("skip", String((page - 1) * PAGE_SIZE));
    params.set("limit", String(PAGE_SIZE));
    fetch(`${API_BASE}/articles?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setArticles(d.articles || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter, includeArchived, search, searchContent]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, includeArchived, searchContent]);

  const statusVariant = (s: string) => {
    if (s === "completed") return "default" as const;
    if (s === "failed") return "destructive" as const;
    return "secondary" as const;
  };

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
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : articles.length === 0 ? (
        <FadeIn delay={0.2}>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                {total === 0 ? "No articles yet." : "No matching articles."}
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      ) : (
        <StaggerContainer className="space-y-2">
          {articles.map((a) => (
            <StaggerItem key={a.id}>
              <Link href={`/articles/${a.id}`}>
                <HoverCard>
                  <Card className={`hover:bg-accent/50 transition-colors cursor-pointer group ${a.is_archived === 1 ? "opacity-60" : ""}`}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-medium truncate group-hover:text-primary transition-colors">
                          {a.title}
                        </p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                          <span>{a.original_filename}</span>
                          <span>·</span>
                          <span className="uppercase">{a.source_type}</span>
                          <span>·</span>
                          <span>{new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {a.is_archived === 1 && <Badge variant="outline" className="text-muted-foreground text-[10px]">Archived</Badge>}
                        <Badge variant={statusVariant(a.status)}>
                          {!["completed", "failed"].includes(a.status) ? (
                            <span className="flex items-center gap-1.5">
                              <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
                              {a.status}
                            </span>
                          ) : a.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </HoverCard>
              </Link>
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
