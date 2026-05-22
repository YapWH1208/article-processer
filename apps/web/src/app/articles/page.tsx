"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Filter, FileText, ArrowRight } from "lucide-react";
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
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filtered, setFiltered] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetch(`${API_BASE}/articles`)
      .then((r) => r.json())
      .then((d) => { setArticles(d.articles || []); setFiltered(d.articles || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = articles;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q) || a.original_filename.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") result = result.filter((a) => a.status === statusFilter);
    setFiltered(result);
  }, [search, statusFilter, articles]);

  const statusVariant = (s: string) => {
    if (s === "completed") return "default" as const;
    if (s === "failed") return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-3xl font-bold tracking-tight">Articles</h1>
        <p className="text-muted-foreground mt-1">{filtered.length} of {articles.length} articles</p>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search articles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
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
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <FadeIn delay={0.2}>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                {articles.length === 0 ? "No articles yet." : "No matching articles."}
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      ) : (
        <StaggerContainer className="space-y-2">
          {filtered.map((a) => (
            <StaggerItem key={a.id}>
              <Link href={`/articles/${a.id}`}>
                <HoverCard>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
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
                      <Badge variant={statusVariant(a.status)} className="shrink-0">
                        {!["completed", "failed"].includes(a.status) ? (
                          <span className="flex items-center gap-1.5">
                            <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
                            {a.status}
                          </span>
                        ) : a.status}
                      </Badge>
                    </CardContent>
                  </Card>
                </HoverCard>
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      )}
    </div>
  );
}
