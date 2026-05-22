"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Upload, CheckCircle2, AlertCircle, Clock, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Article {
  id: number;
  title: string;
  status: string;
  original_filename: string;
  created_at: string;
}

export default function DashboardPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setBackendOk(d.status === "ok"))
      .catch(() => setBackendOk(false));

    fetch(`${API_BASE}/articles`)
      .then((r) => r.json())
      .then((d) => setArticles(d.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    total: articles.length,
    completed: articles.filter((a) => a.status === "completed").length,
    processing: articles.filter((a) => !["completed", "failed"].includes(a.status)).length,
    failed: articles.filter((a) => a.status === "failed").length,
  };

  const recent = [...articles].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5);

  const statusVariant = (s: string) => {
    switch (s) {
      case "completed": return "default" as const;
      case "failed": return "destructive" as const;
      case "uploaded": case "parsing": case "extracting": case "indexing":
        return "secondary" as const;
      default: return "outline" as const;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your article processing pipeline.
        </p>
      </div>

      {/* Backend Status */}
      {backendOk === null ? (
        <Skeleton className="h-10 w-48" />
      ) : (
        <Badge variant={backendOk ? "default" : "destructive"} className="text-sm px-3 py-1">
          {backendOk ? (
            <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Backend connected</>
          ) : (
            <><AlertCircle className="h-3.5 w-3.5 mr-1.5" /> Backend offline</>
          )}
        </Badge>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: FileText, color: "text-blue-600" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-green-600" },
          { label: "Processing", value: stats.processing, icon: Clock, color: "text-amber-600" },
          { label: "Failed", value: stats.failed, icon: AlertCircle, color: "text-red-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link href="/upload">
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Article
          </Button>
        </Link>
        <Link href="/articles">
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Browse Articles
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Recent Articles */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Articles</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : recent.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <CardDescription>No articles yet.</CardDescription>
              <Link href="/upload" className="mt-2">
                <Button variant="outline" size="sm" className="gap-1">
                  Upload your first article <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((a) => (
              <Link key={a.id} href={`/articles/${a.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.original_filename} · {new Date(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={statusVariant(a.status)} className="ml-3 shrink-0">
                      {a.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
