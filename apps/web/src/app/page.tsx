"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Upload, CheckCircle2, AlertCircle, Clock, ArrowRight, Sparkles, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AnimatedCounter, StaggerContainer, StaggerItem, HoverCard, FadeIn, PulseDot } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Article {
  id: number; title: string; status: string;
  original_filename: string; created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json()).then((d) => setBackendOk(d.status === "ok"))
      .catch(() => setBackendOk(false));
    fetch(`${API_BASE}/articles`)
      .then((r) => r.json()).then((d) => setArticles(d.articles || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const stats = {
    total: articles.length,
    completed: articles.filter((a) => a.status === "completed").length,
    processing: articles.filter((a) => !["completed", "failed"].includes(a.status)).length,
    failed: articles.filter((a) => a.status === "failed").length,
  };

  const recent = [...articles]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const statusVariant = (s: string) => {
    switch (s) {
      case "completed": return "default" as const;
      case "failed": return "destructive" as const;
      default: return "secondary" as const;
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 via-primary/10 to-blue-500/5 border p-8 md:p-10 animate-gradient">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">
                Research Intelligence
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Your Article<br />
              <span className="text-primary">Processing Pipeline</span>
            </h1>
            <p className="text-muted-foreground mt-3 max-w-lg">
              Upload papers, extract insights, chat with your research, and
              build a knowledge graph — all in one place.
            </p>
            <div className="flex gap-3 mt-5">
              <Link href="/upload">
                <Button size="lg" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Article
                </Button>
              </Link>
              <Link href="/articles">
                <Button variant="outline" size="lg" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Browse Library
                </Button>
              </Link>
            </div>
            <div className="mt-4 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && globalQuery.trim()) {
                      router.push(`/articles?q=${encodeURIComponent(globalQuery.trim())}`);
                    }
                  }}
                  placeholder="Search across all article content..."
                  className="w-full h-10 pl-9 pr-4 rounded-lg border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            </div>
          </motion.div>

          {/* Background decoration */}
          <motion.div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/10 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </FadeIn>

      {/* ── Status ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {backendOk === null ? (
          <Skeleton className="h-6 w-36" />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Badge variant={backendOk ? "default" : "destructive"} className="gap-2 text-sm px-3 py-1.5">
              <PulseDot color={backendOk ? "bg-green-500" : "bg-red-500"} />
              {backendOk ? "Backend connected" : "Backend offline"}
            </Badge>
          </motion.div>
        )}
      </div>

      {/* ── Stat Cards ────────────────────────────────────────── */}
      <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Articles", value: stats.total, icon: FileText, color: "text-info", bg: "bg-info/10" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
          { label: "Processing", value: stats.processing, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Failed", value: stats.failed, icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
        ].map(({ label, value, icon: Icon, color, bg }, i) => (
          <StaggerItem key={label}>
            <HoverCard>
              <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                  <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">
                    {loading ? "—" : <AnimatedCounter value={value} duration={1} />}
                  </div>
                </CardContent>
              </Card>
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <Separator />

      {/* ── Recent Articles ───────────────────────────────────── */}
      <FadeIn delay={0.2}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Articles</h2>
          <Link href="/articles">
            <Button variant="ghost" size="sm" className="gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : recent.length === 0 ? (
        <FadeIn delay={0.3}>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
              </motion.div>
              <p className="text-muted-foreground">No articles yet. Start by uploading one.</p>
              <Link href="/upload" className="mt-3">
                <Button variant="outline" size="sm" className="gap-1">
                  Upload your first article <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </FadeIn>
      ) : (
        <StaggerContainer className="space-y-2">
          {recent.map((a) => (
            <StaggerItem key={a.id}>
              <Link href={`/articles/${a.id}`}>
                <HoverCard>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.original_filename} · {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={statusVariant(a.status)} className="ml-3 shrink-0">
                        {a.status === "processing" || !["completed", "failed"].includes(a.status) ? (
                          <span className="flex items-center gap-1.5">
                            <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
                            {a.status}
                          </span>
                        ) : (
                          a.status
                        )}
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
