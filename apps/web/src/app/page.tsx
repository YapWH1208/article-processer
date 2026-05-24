"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform, useInView } from "framer-motion";
import {
  FileText, Upload, Search, ArrowRight, Sparkles,
  Brain, BarChart3, MessageCircle, Zap, Layers,
  ChevronRight, Star, ArrowUpRight, Cpu, Globe, Database,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter, PulseDot } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Particle Canvas ──────────────────────────────────────────────────────

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Spawn particles
    const count = Math.min(60, Math.floor((canvas.width * canvas.height) / 12000));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1,
        a: Math.random() * 0.5 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(var(--primary), ${p.a})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(var(--primary), ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-60"
      style={{ maskImage: "linear-gradient(to bottom, black 30%, transparent 100%)" }}
    />
  );
}

// ── Typewriter ────────────────────────────────────────────────────────────

function Typewriter({ texts, className }: { texts: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [display, setDisplay] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = texts[index];
    let timer: ReturnType<typeof setTimeout>;

    if (!deleting) {
      if (display.length < current.length) {
        timer = setTimeout(() => setDisplay(current.slice(0, display.length + 1)), 60);
      } else {
        timer = setTimeout(() => setDeleting(true), 2000);
      }
    } else {
      if (display.length > 0) {
        timer = setTimeout(() => setDisplay(display.slice(0, -1)), 30);
      } else {
        setDeleting(false);
        setIndex((i) => (i + 1) % texts.length);
      }
    }
    return () => clearTimeout(timer);
  }, [display, deleting, index, texts]);

  return (
    <span className={className}>
      {display}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
        className="inline-block w-[3px] h-[0.8em] bg-primary ml-1 align-middle"
      />
    </span>
  );
}

// ── 3D Tilt Card ──────────────────────────────────────────────────────────

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(springY, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-8, 8]);

  const handleMouse = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left) / rect.width - 0.5;
    const my = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(mx);
    y.set(my);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 800 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Scroll Reveal ─────────────────────────────────────────────────────────

function ScrollReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Glow Button ───────────────────────────────────────────────────────────

function GlowButton({ href, children, variant = "primary" }: {
  href: string; children: React.ReactNode; variant?: "primary" | "secondary";
}) {
  const isSecondary = variant === "secondary";
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className={`relative inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-colors ${
          isSecondary
            ? "bg-card border text-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
        }`}
      >
        {!isSecondary && (
          <motion.div
            className="absolute inset-0 rounded-xl bg-primary"
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ filter: "blur(12px)", zIndex: -1 }}
          />
        )}
        {children}
      </motion.div>
    </Link>
  );
}

// ── Floating Orb ──────────────────────────────────────────────────────────

function FloatingOrb({
  className, size, color, delay, duration,
}: { className?: string; size: number; color: string; delay: number; duration: number }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl pointer-events-none ${className}`}
      style={{ width: size, height: size, background: color }}
      animate={{
        x: [0, 30, -20, 10, 0],
        y: [0, -40, 20, -10, 0],
        scale: [1, 1.15, 0.95, 1.1, 1],
        opacity: [0.3, 0.5, 0.35, 0.45, 0.3],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

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
    { icon: Upload, title: "Intelligent Upload & Parse", desc: "Drag-and-drop PDF, HTML, Markdown, ZIP files. Auto-detection with MinerU, Docling, or pypdf engines.", color: "text-blue-400", bg: "bg-blue-500/10", gradient: "from-blue-500/5 to-blue-600/5" },
    { icon: Brain, title: "Structured AI Extraction", desc: "LLM-powered extraction of authors, methodology, claims, entities, and references with confidence scoring.", color: "text-purple-400", bg: "bg-purple-500/10", gradient: "from-purple-500/5 to-purple-600/5" },
    { icon: MessageCircle, title: "Contextual RAG Chat", desc: "Ask questions with cited, source-linked answers. @-mention articles to chat across your entire library.", color: "text-green-400", bg: "bg-green-500/10", gradient: "from-green-500/5 to-green-600/5" },
    { icon: BarChart3, title: "Knowledge Graph Explorer", desc: "Auto-extracted entities and relationships. Pan and zoom through an interactive graph of your research.", color: "text-orange-400", bg: "bg-orange-500/10", gradient: "from-orange-500/5 to-orange-600/5" },
    { icon: Zap, title: "Pluggable AI Skills", desc: "Summarization, bias detection, methodology critique, claim verification — run focused analysis in one click.", color: "text-amber-400", bg: "bg-amber-500/10", gradient: "from-amber-500/5 to-amber-600/5" },
    { icon: Layers, title: "Export & API Access", desc: "Export to Markdown or JSON. Import/export your entire library. REST API for integration.", color: "text-cyan-400", bg: "bg-cyan-500/10", gradient: "from-cyan-500/5 to-cyan-600/5" },
  ];

  const steps = [
    { step: "01", icon: Upload, title: "Upload", desc: "Drop any PDF, HTML, or Markdown. ZIP archives are unpacked automatically with full structure preservation." },
    { step: "02", icon: Cpu, title: "Parse & Chunk", desc: "Best-available parser engine runs automatically. Smart semantic chunking optimizes retrieval quality." },
    { step: "03", icon: Brain, title: "AI Extraction", desc: "LLMs extract structured data with evidence trails. Every claim linked to its source chunk." },
    { step: "04", icon: Globe, title: "Explore & Integrate", desc: "Chat, graph, skills, export — turn papers into actionable knowledge with your whole toolkit." },
  ];

  const headlineTexts = ["Into Knowledge", "Into Insights", "Into Discovery", "Into Clarity"];

  return (
    <div className="space-y-20 pb-8">
      {/* ═══════════════════════════════════════════════════════════════ HERO */}
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-background via-primary/3 to-blue-500/5 p-6 sm:p-10 md:p-16 lg:p-20">
        <ParticleCanvas />

        {/* Floating orbs */}
        <FloatingOrb className="top-0 right-0" size={400} color="hsl(var(--primary) / 0.12)" delay={0} duration={8} />
        <FloatingOrb className="bottom-0 left-0" size={320} color="hsl(217 91% 60% / 0.1)" delay={2} duration={7} />
        <FloatingOrb className="top-1/2 left-1/3" size={200} color="hsl(271 91% 65% / 0.08)" delay={4} duration={9} />

        <div className="relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-6"
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </motion.div>
            Research Intelligence Platform
            <Star className="h-3 w-3 ml-1" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]"
          >
            Transform Papers
            <br />
            <Typewriter texts={headlineTexts} className="text-primary" />
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-muted-foreground mt-5 max-w-2xl text-base sm:text-lg leading-relaxed"
          >
            Upload research papers, extract structured insights with AI,
            chat with your documents using <span className="text-foreground font-medium">cited answers</span>,
            and explore an auto-generated knowledge graph — all in one place.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex flex-wrap gap-3 mt-7"
          >
            <GlowButton href="/upload">
              <Upload className="h-4 w-4" />
              Upload Your First Paper
              <ArrowRight className="h-4 w-4" />
            </GlowButton>
            <GlowButton href="/articles" variant="secondary">
              <FileText className="h-4 w-4" />
              Browse Library
              <ChevronRight className="h-4 w-4" />
            </GlowButton>
          </motion.div>

          {/* Global search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="mt-6 max-w-lg"
          >
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
                className="pl-10 h-12 text-base bg-background/70 backdrop-blur-sm border-primary/20 focus:border-primary/50 rounded-xl"
              />
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="flex flex-wrap items-center gap-5 mt-6"
          >
            {backendOk === null ? (
              <Skeleton className="h-7 w-36 rounded-full" />
            ) : (
              <Badge
                variant={backendOk ? "default" : "destructive"}
                className="gap-2 text-sm px-4 py-1.5 rounded-full"
              >
                <PulseDot color={backendOk ? "bg-green-500" : "bg-red-500"} />
                {backendOk ? "Backend Connected" : "Backend Offline"}
              </Badge>
            )}
            {!loading && (
              <div className="flex items-center gap-5 text-sm">
                <div className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">
                    <span className="font-bold text-foreground tabular-nums">
                      <AnimatedCounter value={stats.total} duration={1.2} />
                    </span>{" "}
                    articles
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-muted-foreground">
                    <span className="font-bold text-foreground tabular-nums">
                      <AnimatedCounter value={stats.completed} duration={1.2} />
                    </span>{" "}
                    processed
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ FEATURES */}
      <ScrollReveal>
        <section>
          <div className="text-center mb-10">
            <motion.span className="inline-block text-xs font-semibold text-primary uppercase tracking-widest mb-2">
              Capabilities
            </motion.span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">
              Everything You Need
            </h2>
            <p className="text-muted-foreground mt-3 max-w-lg mx-auto text-sm sm:text-base">
              A complete pipeline for turning raw research documents into structured, queryable, and visual knowledge.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc, color, bg, gradient }, i) => (
              <TiltCard key={title}>
                <Card className={`h-full bg-gradient-to-br ${gradient} border-primary/10 hover:border-primary/30 transition-colors duration-500 group cursor-default overflow-hidden`}>
                  <CardContent className="p-6 relative">
                    {/* Background glow on hover */}
                    <motion.div
                      className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-500"
                      style={{ background: color }}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                    <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`h-6 w-6 ${color}`} />
                    </div>
                    <h3 className="font-semibold text-base mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                    <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      Learn more <ArrowUpRight className="h-3 w-3" />
                    </div>
                  </CardContent>
                </Card>
              </TiltCard>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════════ HOW IT WORKS */}
      <ScrollReveal>
        <section>
          <div className="text-center mb-10">
            <motion.span className="inline-block text-xs font-semibold text-primary uppercase tracking-widest mb-2">
              Pipeline
            </motion.span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">
              From Upload to Insight
            </h2>
            <p className="text-muted-foreground mt-3 max-w-lg mx-auto text-sm sm:text-base">
              Four steps. Zero friction. Your research, supercharged.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ step, icon: Icon, title, desc }, i) => (
              <div key={step} className="relative text-center group">
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-9 left-[60%] w-[80%] h-[2px]">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary/40 to-transparent"
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: 0.3 + i * 0.15 }}
                      style={{ transformOrigin: "left" }}
                    />
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                >
                  <div className="relative mx-auto">
                    <motion.div
                      className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors"
                      whileHover={{ rotate: -5, scale: 1.08 }}
                    >
                      <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {step}
                      </span>
                      <Icon className="h-7 w-7 text-primary" />
                    </motion.div>
                  </div>
                  <h3 className="font-bold text-lg mb-1.5">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed px-2">{desc}</p>
                </motion.div>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════ STATS STRIP */}
      <ScrollReveal>
        <section>
          <Card className="border-primary/10 bg-gradient-to-r from-primary/5 via-background to-blue-500/5 overflow-hidden">
            <CardContent className="p-8 sm:p-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                {[
                  { label: "Parse Engines", value: "7+", icon: Cpu },
                  { label: "AI Providers", value: "8+", icon: Brain },
                  { label: "Output Formats", value: "3", icon: Layers },
                  { label: "Open Source", value: "MIT", icon: Star },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label}>
                    <Icon className="h-6 w-6 text-primary mx-auto mb-2" />
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground">{value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════════ CTA */}
      <ScrollReveal>
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-blue-600 p-8 sm:p-12 md:p-16 text-primary-foreground text-center">
          {/* Animated background dots */}
          <motion.div
            className="absolute inset-0 opacity-15"
            animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
            transition={{ duration: 15, repeat: Infinity, repeatType: "reverse" }}
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Glow orbs */}
          <motion.div
            className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white/10 blur-3xl"
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 7, repeat: Infinity, delay: 1 }}
          />

          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Ready to Process Your Research?
              </h2>
              <p className="mt-3 opacity-85 max-w-lg mx-auto text-sm sm:text-base">
                Start uploading papers and unlock AI-powered insights in minutes.
                No sign-up required — jump right in.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/upload">
                  <motion.div
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-primary font-bold text-sm shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-shadow"
                  >
                    Get Started <ArrowRight className="h-4 w-4" />
                  </motion.div>
                </Link>
                <Link href="/articles">
                  <motion.div
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white/15 backdrop-blur text-white font-semibold text-sm border border-white/20 hover:bg-white/25 transition-colors"
                  >
                    Browse Library <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════════ FOOTER */}
      <p className="text-center text-xs text-muted-foreground">
        Built with FastAPI + Next.js · Open source (MIT) · Supports OpenAI, Anthropic, DeepSeek, OpenRouter, GLM, MiniMax, Kimi, and custom endpoints.
      </p>
    </div>
  );
}
