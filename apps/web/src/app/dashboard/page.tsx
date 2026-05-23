"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  FileText, CheckCircle2, AlertCircle, Clock, MessageCircle,
  GitBranch, Zap, TrendingUp, Loader2, BarChart3 as BarChartIcon,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardMetrics } from "@/lib/api";
import type { DashboardMetrics } from "@/lib/types";
import { AnimatedCounter, FadeIn } from "@/components/ui/animated";

const TIME_RANGES = [
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
  { label: "1 Year", days: 365 },
  { label: "All Time", days: 3650 },
];

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  failed: "#ef4444",
  uploaded: "#3b82f6",
  parsing: "#f59e0b",
  extracting: "#a855f7",
  indexing: "#ec4899",
  needs_review: "#6b7280",
};

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function KpiCard({
  title, value, icon: Icon, color, bg, loading, suffix = "",
}: {
  title: string; value: number; icon: React.ElementType;
  color: string; bg: string; loading: boolean; suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${bg} shrink-0`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
          <div className="text-2xl font-bold tabular-nums mt-0.5">
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <AnimatedCounter value={value} duration={0.8} />
            )}
            {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    getDashboardMetrics(days)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const modelData = (metrics?.token_usage_by_model || []).map((m) => ({
    name: m.model.length > 20 ? m.model.slice(0, 20) + "..." : m.model,
    fullName: m.model,
    "Prompt Tokens": m.prompt_tokens,
    "Completion Tokens": m.completion_tokens,
    Messages: m.message_count,
  }));

  const statusData = (metrics?.articles_by_status || []).map((s) => ({
    name: s.status.replace(/_/g, " "),
    value: s.count,
    color: STATUS_COLORS[s.status] || "#6b7280",
  }));

  const articlesOverTime = (metrics?.articles_by_day || []).map((d) => ({
    date: d.date,
    Articles: d.count,
  }));

  const topArticles = metrics?.top_articles_by_tokens || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Analytics and metrics for your article processing pipeline.</p>
          </div>
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            {TIME_RANGES.map(({ label, days: d }) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  days === d
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Articles" value={metrics?.total_articles || 0} icon={FileText} color="text-blue-500" bg="bg-blue-500/10" loading={loading} />
        <KpiCard title="Completed" value={metrics?.total_completed || 0} icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" loading={loading} />
        <KpiCard title="Total Tokens" value={metrics?.total_tokens || 0} icon={Zap} color="text-amber-500" bg="bg-amber-500/10" loading={loading} suffix="tokens" />
        <KpiCard title="Graph Entities" value={metrics?.total_graph_entities || 0} icon={GitBranch} color="text-purple-500" bg="bg-purple-500/10" loading={loading} />
      </div>

      {/* Second row KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Processing" value={metrics?.total_processing || 0} icon={Clock} color="text-orange-500" bg="bg-orange-500/10" loading={loading} />
        <KpiCard title="Failed" value={metrics?.total_failed || 0} icon={AlertCircle} color="text-red-500" bg="bg-red-500/10" loading={loading} />
        <KpiCard title="Chat Messages" value={metrics?.total_chat_messages || 0} icon={MessageCircle} color="text-cyan-500" bg="bg-cyan-500/10" loading={loading} />
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 shrink-0">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Process Time</p>
              <div className="text-2xl font-bold tabular-nums mt-0.5">
                {loading ? <Skeleton className="h-7 w-20" /> : formatDuration(metrics?.avg_processing_seconds || 0)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Articles Over Time */}
        <FadeIn delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Articles Over Time
              </CardTitle>
              <CardDescription>New articles uploaded per day</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : articlesOverTime.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={articlesOverTime}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line type="monotone" dataKey="Articles" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {/* Token Usage by Model */}
        <FadeIn delay={0.1}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Token Usage by Parser
              </CardTitle>
              <CardDescription>Prompt vs completion tokens</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : modelData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No chat data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={modelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={formatTokens} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number) => formatTokens(value)}
                    />
                    <Legend />
                    <Bar dataKey="Prompt Tokens" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Completion Tokens" stackId="a" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {/* Second Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Articles by Status */}
        <FadeIn delay={0.15}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChartIcon className="h-4 w-4 text-muted-foreground" />
                Articles by Status
              </CardTitle>
              <CardDescription>Distribution across all articles</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : statusData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${name} (${value})`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        {/* Top Articles by Tokens */}
        <FadeIn delay={0.2}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                Top Articles by Chat Usage
              </CardTitle>
              <CardDescription>Most chatted articles by token count</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : topArticles.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No chat data yet</div>
              ) : (
                <div className="space-y-2">
                  {topArticles.map((a, i) => (
                    <div key={a.article_id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                        <span className="text-sm truncate">{a.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px]">
                          {formatTokens(a.total_tokens)} tokens
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
