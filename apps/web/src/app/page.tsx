"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileText, Upload, Search, ArrowRight, Sparkles,
  Brain, BarChart3, MessageCircle, Zap, Shield, Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter, FadeIn, PulseDot } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setBackendOk(d.status === "ok"))
      .catch(() => setBackendOk(false));
    fetch(`${API_BASE}/articles?limit=1000`)
      .then((r) => r.json())
      .then((d) => {
        const arts = d.articles || [];
        setStats({
          total: arts.length,
          completed: arts.filter((a: { status: string }) => a.status === "completed").length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const features = [
    {
      icon: Upload,
      title: "Upload & Parse",
      desc: "Drag-and-drop PDF, HTML, Markdown, ZIP. Automatic parsing with MinerU, Docling, or pypdf.",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      icon: Brain,
      title: "AI Extraction",
      desc: "LLM-powered structured extraction: authors, methodology, claims, references, and more.",
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      icon: MessageCircle,
      title: "RAG Chat",
      desc: "Ask questions about your articles with cited answers. Select text to add context.",
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      icon: BarChart3,
      title: "Knowledge Graph",
      desc: "Auto-extracted entities and relationships. Explore connections across all your articles.",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      icon: Zap,
      title: "AI Skills",
      desc: "Run focused analysis: summarization, bias detection, methodology critique, and more.",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      icon: Layers,
      title: "Export & Integrate",
      desc: "Export to Markdown or JSON. Import/export your entire library with one click.",
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
  ];

  return (
    <div className="space-y-12">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-primary/10 to-blue-500/5 border p-8 md:p-12 lg:p-16">
          {/* Background orbs */}
          <motion.div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.7, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          />

          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-widest">
                  Research Intelligence Platform
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
                Transform Papers
                <br />
                <span className="text-primary">Into Knowledge</span>
              </h1>

              <p className="text-muted-foreground mt-4 max-w-xl text-base md:text-lg leading-relaxed">
                Upload research papers, extract structured insights with AI,
                chat with your documents, and explore an auto-generated
                knowledge graph — all in one place.
              </p>

              <div className="flex flex-wrap gap-3 mt-6">
                <Link href="/upload">
                  <Button size="lg" className="gap-2 shadow-lg shadow-primary/25">
                    <Upload className="h-4 w-4" />
                    Upload Your First Paper
                  </Button>
                </Link>
                <Link href="/articles">
                  <Button variant="outline" size="lg" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Browse Library
                  </Button>
                </Link>
              </div>

              {/* Search bar */}
              <div className="mt-6 max-w-lg">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={globalQuery}
                    onChange={(e) => setGlobalQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && globalQuery.trim()) {
                        router.push(`/articles?search_content=${encodeURIComponent(globalQuery.trim())}`);
                      }
                    }}
                    placeholder="Search across all article content..."
                    className="pl-10 h-11 text-base bg-background/80 backdrop-blur"
                  />
                </div>
              </div>

              {/* Status + quick stats */}
              <div className="flex flex-wrap items-center gap-4 mt-5">
                {backendOk === null ? (
                  <Skeleton className="h-6 w-36" />
                ) : (
                  <Badge variant={backendOk ? "default" : "destructive"} className="gap-2 text-sm px-3 py-1.5">
                    <PulseDot color={backendOk ? "bg-green-500" : "bg-red-500"} />
                    {backendOk ? "Backend connected" : "Backend offline"}
                  </Badge>
                )}
                {!loading && (
                  <span className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      <AnimatedCounter value={stats.total} duration={1} />
                    </span>{" "}
                    articles ·{" "}
                    <span className="font-semibold text-foreground">
                      <AnimatedCounter value={stats.completed} duration={1} />
                    </span>{" "}
                    processed
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </FadeIn>

      {/* ── Features Grid ─────────────────────────────────────── */}
      <FadeIn delay={0.1}>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Everything You Need</h2>
          <p className="text-muted-foreground mt-1">A complete pipeline for research document intelligence.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc, color, bg }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
            >
              <Card className="h-full hover:shadow-md hover:border-primary/30 transition-all duration-300 group">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </FadeIn>

      {/* ── How It Works ─────────────────────────────────────── */}
      <FadeIn delay={0.2}>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold tracking-tight">How It Works</h2>
          <p className="text-muted-foreground mt-1">From upload to insight in four steps.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: "01", title: "Upload", desc: "Drag-and-drop any PDF, HTML, or Markdown file. We handle ZIP archives too." },
            { step: "02", title: "Parse & Chunk", desc: "Automatic parsing with the best available engine. Smart chunking for RAG." },
            { step: "03", title: "AI Extraction", desc: "LLMs extract structured data: authors, methods, claims, entities, and relationships." },
            { step: "04", title: "Explore", desc: "Chat with citations, browse the knowledge graph, run AI skills, export results." },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
              className="text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">{item.step}</span>
              </div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </FadeIn>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <FadeIn delay={0.3}>
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-blue-600 p-8 md:p-10 text-primary-foreground text-center">
          <motion.div
            className="absolute inset-0 opacity-20"
            animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
            transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
            style={{ backgroundImage: "url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"20\" cy=\"20\" r=\"2\" fill=\"white\"/><circle cx=\"80\" cy=\"40\" r=\"1.5\" fill=\"white\"/><circle cx=\"50\" cy=\"80\" r=\"2\" fill=\"white\"/><circle cx=\"90\" cy=\"90\" r=\"1\" fill=\"white\"/></svg>')", backgroundSize: "200px 200px" }}
          />
          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-bold">Ready to process your research?</h2>
            <p className="mt-2 opacity-90 max-w-md mx-auto">
              Start uploading papers and unlock AI-powered insights in minutes.
            </p>
            <Link href="/upload" className="inline-block mt-5">
              <Button size="lg" variant="secondary" className="gap-2">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </FadeIn>

      {/* ── Footer note ──────────────────────────────────────── */}
      <p className="text-center text-xs text-muted-foreground pb-4">
        Built with FastAPI + Next.js · Open source · Supports OpenAI, Anthropic, DeepSeek, and more.
      </p>
    </div>
  );
}
