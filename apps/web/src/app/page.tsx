"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform, useInView, AnimatePresence } from "framer-motion";
import {
  FileText, Upload, Search, ArrowRight, Sparkles,
  Brain, BarChart3, MessageCircle, Zap, Layers,
  ChevronRight, Star, ArrowUpRight, Cpu, Globe, Database,
  GitBranch, Scissors, Workflow, Bot, Lightbulb,
  PanelRight, FileSearch, Network,
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
    const particles: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 8000));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2.5 + 1,
        a: Math.random() * 0.45 + 0.1,
      });
    }

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(var(--primary), ${p.a})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(var(--primary), ${0.07 * (1 - dist / 140)})`;
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
      className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
      style={{ maskImage: "linear-gradient(to bottom, black 25%, transparent 100%)" }}
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
        timer = setTimeout(() => setDisplay(current.slice(0, display.length + 1)), 55);
      } else {
        timer = setTimeout(() => setDeleting(true), 2200);
      }
    } else {
      if (display.length > 0) {
        timer = setTimeout(() => setDisplay(display.slice(0, -1)), 28);
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
        transition={{ duration: 0.55, repeat: Infinity, repeatType: "reverse" }}
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
  const rotateX = useTransform(springY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-10, 10]);

  const handleMouse = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Scroll Reveal ─────────────────────────────────────────────────────────

function ScrollReveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Floating Orb ──────────────────────────────────────────────────────────

function FloatingOrb({ className, size, color, delay, duration, blur = "3xl" }: {
  className?: string; size: number; color: string; delay: number; duration: number; blur?: string;
}) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none blur-${blur} ${className}`}
      style={{ width: size, height: size, background: color }}
      animate={{
        x: [0, 40, -25, 15, 0],
        y: [0, -50, 30, -15, 0],
        scale: [1, 1.18, 0.93, 1.12, 1],
        opacity: [0.25, 0.5, 0.3, 0.48, 0.25],
      }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ── Animated Pipeline Stage ───────────────────────────────────────────────

function PipelineStage({
  step, icon: Icon, title, desc, delay, isLast,
}: {
  step: string; icon: React.ElementType; title: string; desc: string;
  delay: number; isLast: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      className="relative flex flex-col items-center text-center group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Connector line */}
      {!isLast && (
        <div className="hidden lg:block absolute top-10 left-[58%] w-[84%] h-[2px]">
          <motion.div
            className="h-full bg-gradient-to-r from-primary/50 via-primary/30 to-transparent"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: delay + 0.3, ease: "easeOut" }}
            style={{ transformOrigin: "left" }}
          />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay, ease: "easeOut" }}
        className="w-full"
      >
        {/* Icon ring */}
        <motion.div
          className="relative mx-auto mb-5"
          animate={hovered ? { rotate: [0, -8, 8, 0] } : {}}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto group-hover:bg-primary/20 transition-colors duration-300"
            whileHover={{ scale: 1.1 }}
          >
            <span className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shadow-lg shadow-primary/30">
              {step}
            </span>
            <Icon className="h-9 w-9 text-primary" />
          </motion.div>

          {/* Pulse ring on hover */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                className="absolute inset-0 rounded-2xl border-2 border-primary/30"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 1.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
              />
            )}
          </AnimatePresence>
        </motion.div>

        <h3 className="font-bold text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[220px] mx-auto">{desc}</p>

        {/* Expand hint on hover */}
        <motion.div
          className="mt-2 flex items-center justify-center gap-1 text-[11px] text-primary/60"
          animate={hovered ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
        >
          <Lightbulb className="h-3 w-3" /> hover for details
        </motion.div>
      </motion.div>
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
            style={{ filter: "blur(14px)", zIndex: -1 }}
          />
        )}
        {children}
      </motion.div>
    </Link>
  );
}

// ── Feature Card ──────────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon, title, desc, color, bg, gradient, highlights,
}: {
  icon: React.ElementType; title: string; desc: string;
  color: string; bg: string; gradient: string;
  highlights?: string[];
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <TiltCard>
      <Card
        className={`h-full bg-gradient-to-br ${gradient} border-primary/10 hover:border-primary/40 transition-all duration-500 group cursor-default overflow-hidden`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <CardContent className="p-6 relative">
          {/* Background glow */}
          <motion.div
            className="absolute -top-12 -right-12 w-28 h-28 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-500"
            style={{ background: color }}
            animate={hovered ? { scale: [1, 1.25, 1] } : {}}
            transition={{ duration: 2.5, repeat: Infinity }}
          />

          <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}
            style={{ boxShadow: hovered ? `0 0 20px ${color}40` : "none" }}
          >
            <Icon className={`h-6 w-6 ${color}`} />
          </div>

          <h3 className="font-semibold text-base mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>

          {/* Highlight tags */}
          <AnimatePresence>
            {hovered && highlights && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 flex flex-wrap gap-1.5 overflow-hidden"
              >
                {highlights.map((h) => (
                  <span key={h} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {h}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Learn more <ArrowUpRight className="h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </TiltCard>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, completed: 0, reviewed: 0 });
  const [loading, setLoading] = useState(true);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; title: string; original_filename: string; status: string }[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Health check
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((d) => setBackendOk(d.status === "ok"))
      .catch(() => setBackendOk(false));

    // Stats
    fetch(`${API_BASE}/articles?limit=1000`)
      .then((r) => r.json())
      .then((d) => {
        const arts = d.articles || [];
        setStats({
          total: arts.length,
          completed: arts.filter((a: { status: string }) => a.status === "completed").length,
          reviewed: arts.filter((a: { needs_review?: boolean }) => a.needs_review).length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced instant search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!globalQuery.trim() || globalQuery.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_BASE}/articles?search=${encodeURIComponent(globalQuery.trim())}&limit=5`);
        if (res.ok) {
          const d = await res.json();
          setSearchResults(d.articles || []);
          setShowResults(true);
        }
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 250);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [globalQuery]);

  const features = [
    {
      icon: FileSearch, title: "Multi-Engine Parsing",
      desc: "Intelligent PDF parsing with MinerU, Docling, and pypdf. Auto-detects HTML, Markdown, TXT and unpacks ZIP archives preserving structure.",
      color: "text-blue-400", bg: "bg-blue-500/10", gradient: "from-blue-500/5 to-blue-600/5",
      highlights: ["MinerU", "Docling", "pypdf", "ZIP unpacking"],
    },
    {
      icon: Scissors, title: "Smart Semantic Chunking",
      desc: "Section-aware chunking with heading boundaries, configurable token windows, and overlapping context for high-quality retrieval.",
      color: "text-teal-400", bg: "bg-teal-500/10", gradient: "from-teal-500/5 to-teal-600/5",
      highlights: ["Heading-aware", "1000-token windows", "200-token overlap"],
    },
    {
      icon: Brain, title: "LLM-Powered Extraction",
      desc: "Structured extraction of authors, methodology, claims, entities, and references. Evidence trails link every claim to its source chunk.",
      color: "text-purple-400", bg: "bg-purple-500/10", gradient: "from-purple-500/5 to-purple-600/5",
      highlights: ["Evidence trails", "Confidence scores", "Validation"],
    },
    {
      icon: Network, title: "Knowledge Graph",
      desc: "Auto-extracted entities and relationships form an interactive graph. Pan, zoom, and explore connections across your research library.",
      color: "text-orange-400", bg: "bg-orange-500/10", gradient: "from-orange-500/5 to-orange-600/5",
      highlights: ["Entities", "Relationships", "Cross-article"],
    },
    {
      icon: MessageCircle, title: "Full-Context Chat",
      desc: "Ask questions with cited, source-linked answers drawn from complete article text. @-mention articles for focused context, or let AI search your entire library.",
      color: "text-green-400", bg: "bg-green-500/10", gradient: "from-green-500/5 to-green-600/5",
      highlights: ["Cited answers", "Multi-article", "Sessions"],
    },
    {
      icon: Zap, title: "Pluggable AI Skills",
      desc: "Run focused analysis: summarization, bias detection, methodology critique, claim verification — extensible with your own custom skills.",
      color: "text-amber-400", bg: "bg-amber-500/10", gradient: "from-amber-500/5 to-amber-600/5",
      highlights: ["Summarize", "Bias check", "Verify claims"],
    },
  ];

  const pipelineSteps = [
    { step: "1", icon: Upload, title: "Upload", desc: "Drop PDFs, HTML, Markdown, TXT, or ZIP archives. Files are unpacked and queued automatically." },
    { step: "2", icon: FileSearch, title: "Parse", desc: "Best-available engine runs first. PDFs: MinerU → Docling → pypdf. Outputs clean, normalized Markdown." },
    { step: "3", icon: Scissors, title: "Chunk", desc: "Smart semantic chunking by headings with 1000-token windows and 200-token overlap for retrieval quality." },
    { step: "4", icon: Brain, title: "Extract", desc: "LLM extracts structured data: authors, claims, methods, entities, references — all with evidence trails." },
    { step: "5", icon: Network, title: "Graph", desc: "Entities and relationships become an interactive knowledge graph. Explore connections across articles." },
  ];

  const headlineTexts = ["Into Knowledge", "Into Insights", "Into Discovery", "Into Clarity"];

  return (
    <div className="space-y-24 pb-10">
      {/* ═══════════════════════════════════════════════════════════════ HERO */}
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-background via-primary/4 to-blue-500/6 p-6 sm:p-10 md:p-16 lg:p-20">
        <ParticleCanvas />

        <FloatingOrb className="top-0 right-0" size={420} color="hsl(var(--primary) / 0.10)" delay={0} duration={8} blur="3xl" />
        <FloatingOrb className="bottom-0 left-10" size={340} color="hsl(217 91% 60% / 0.08)" delay={2.5} duration={7.5} blur="3xl" />
        <FloatingOrb className="top-1/3 left-1/2" size={220} color="hsl(271 91% 65% / 0.07)" delay={4.5} duration={9.5} blur="3xl" />
        <FloatingOrb className="bottom-10 right-1/3" size={160} color="hsl(160 84% 45% / 0.06)" delay={6} duration={10} blur="2xl" />

        <div className="relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-8"
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </motion.div>
            AI-Powered Research Intelligence
            <Star className="h-3 w-3 ml-1" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.04]"
          >
            Transform Papers
            <br />
            <Typewriter texts={headlineTexts} className="text-primary" />
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-muted-foreground mt-6 max-w-2xl text-base sm:text-lg leading-relaxed"
          >
            Upload research papers and watch AI
            <span className="text-foreground font-semibold"> parse, chunk, extract, and graph </span>
            them into structured, queryable knowledge —
            with <span className="text-foreground font-medium">cited answers</span> you can trust.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35, ease: "easeOut" }}
            className="flex flex-wrap gap-3 mt-8"
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
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.48, ease: "easeOut" }}
            className="mt-6 max-w-lg"
          >
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                type="text"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && globalQuery.trim()) {
                    router.push(`/articles?search_content=${encodeURIComponent(globalQuery.trim())}`);
                    setShowResults(false);
                  }
                  if (e.key === "Escape") setShowResults(false);
                }}
                placeholder="Search across all article content..."
                className="pl-10 h-12 text-base bg-background/70 backdrop-blur-sm border-primary/20 focus:border-primary/50 rounded-xl transition-shadow focus:shadow-lg focus:shadow-primary/10"
              />
              {/* Instant results dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-card border rounded-xl shadow-xl overflow-hidden">
                  {searchResults.map((a) => (
                    <Link
                      key={a.id}
                      href={`/articles/${a.id}`}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => setShowResults(false)}
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{a.title || a.original_filename}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    </Link>
                  ))}
                  <Link
                    href={`/articles?search_content=${encodeURIComponent(globalQuery.trim())}`}
                    className="flex items-center justify-center gap-1 px-4 py-2 text-xs text-primary hover:bg-accent border-t transition-colors"
                    onClick={() => setShowResults(false)}
                  >
                    View all results <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {showResults && searching && searchResults.length === 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-card border rounded-xl shadow-xl px-4 py-3 text-sm text-muted-foreground text-center">
                  Searching…
                </div>
              )}
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex flex-wrap items-center gap-5 mt-7"
          >
            {backendOk === null ? (
              <Skeleton className="h-7 w-36 rounded-full" />
            ) : (
              <Badge variant={backendOk ? "default" : "destructive"} className="gap-2 text-sm px-4 py-1.5 rounded-full">
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
                      <AnimatedCounter value={stats.total} duration={1.5} />
                    </span>{" "}articles
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-muted-foreground">
                    <span className="font-bold text-foreground tabular-nums">
                      <AnimatedCounter value={stats.completed} duration={1.5} />
                    </span>{" "}processed
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ PIPELINE (moved up — it's the core workflow) */}
      <ScrollReveal>
        <section>
          <div className="text-center mb-12">
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-widest mb-3"
            >
              <Workflow className="h-3.5 w-3.5" />
              Processing Pipeline
            </motion.span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">
              From Upload to Insight in 5 Steps
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto text-sm sm:text-base">
              Every paper flows through the same battle-tested pipeline — fully automated, zero configuration.
            </p>
          </div>

          <Card className="border-primary/10 bg-gradient-to-b from-background to-primary/3 overflow-hidden">
            <CardContent className="p-6 sm:p-10">
              <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
                {pipelineSteps.map((step, i) => (
                  <PipelineStage
                    key={step.step}
                    step={step.step}
                    icon={step.icon}
                    title={step.title}
                    desc={step.desc}
                    delay={i * 0.1}
                    isLast={i === pipelineSteps.length - 1}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════ FEATURES */}
      <ScrollReveal>
        <section>
          <div className="text-center mb-12">
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-widest mb-3"
            >
              <Bot className="h-3.5 w-3.5" />
              AI Capabilities
            </motion.span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">
              Everything Your Research Needs
            </h2>
            <p className="text-muted-foreground mt-3 max-w-lg mx-auto text-sm sm:text-base">
              Hover each card to reveal specific capabilities. A complete pipeline from raw document to structured, queryable intelligence.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════ INTEGRATIONS STRIP */}
      <ScrollReveal>
        <section>
          <Card className="border-primary/10 bg-gradient-to-r from-primary/5 via-background to-blue-500/5 overflow-hidden">
            <CardContent className="p-8 sm:p-10">
              <div className="text-center mb-8">
                <h3 className="text-lg font-bold">Bring Your Own AI</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect to any LLM provider. OpenAI, Anthropic, DeepSeek, OpenRouter, GLM, MiniMax, Kimi, or your own custom endpoint.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                {[
                  { label: "Parse Engines", value: "7+", icon: Cpu, sub: "MinerU, Docling, pypdf…" },
                  { label: "LLM Providers", value: "8+", icon: Brain, sub: "OpenAI, Anthropic, custom…" },
                  { label: "Output Formats", value: "3", icon: Layers, sub: "JSON, Markdown, Graph" },
                  { label: "License", value: "MIT", icon: Star, sub: "Open source, self-hosted" },
                ].map(({ label, value, icon: Icon, sub }) => (
                  <motion.div key={label} whileHover={{ y: -4 }} className="transition-transform">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-3xl font-extrabold text-foreground">{value}</div>
                    <div className="text-sm font-medium mt-1">{label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════ QUICK LINKS */}
      <ScrollReveal>
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold">Jump Right In</h2>
            <p className="text-sm text-muted-foreground mt-2">Explore every part of the platform.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/upload", icon: Upload, label: "Upload Papers", desc: "Start processing", color: "text-blue-400", bg: "bg-blue-500/10" },
              { href: "/articles", icon: PanelRight, label: "Library", desc: "Browse & search", color: "text-purple-400", bg: "bg-purple-500/10" },
              { href: "/chat", icon: MessageCircle, label: "Chat", desc: "Ask your papers", color: "text-green-400", bg: "bg-green-500/10" },
              { href: "/graph", icon: GitBranch, label: "Graph", desc: "Explore connections", color: "text-orange-400", bg: "bg-orange-500/10" },
            ].map(({ href, icon: Icon, label, desc, color, bg }) => (
              <Link key={href} href={href}>
                <motion.div
                  whileHover={{ scale: 1.03, y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  className="p-5 rounded-xl border bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group"
                >
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <h3 className="font-semibold text-sm">{label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </motion.div>
              </Link>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════ CTA */}
      <ScrollReveal>
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-blue-600 p-8 sm:p-12 md:p-16 text-primary-foreground text-center">
          {/* Dot grid */}
          <motion.div
            className="absolute inset-0 opacity-10"
            animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
            transition={{ duration: 18, repeat: Infinity, repeatType: "reverse" }}
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
          />

          <motion.div
            className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-white/8 blur-3xl"
            animate={{ scale: [1, 1.35, 1], opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 7, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-white/8 blur-3xl"
            animate={{ scale: [1, 1.3, 1], opacity: [0.35, 0.55, 0.35] }}
            transition={{ duration: 8, repeat: Infinity, delay: 1.5 }}
          />

          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Ready to Process Your Research?
              </h2>
              <p className="mt-3 opacity-85 max-w-lg mx-auto text-sm sm:text-base">
                Upload your first paper and watch the full pipeline in action.
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
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white/15 backdrop-blur-sm text-white font-semibold text-sm border border-white/20 hover:bg-white/25 transition-colors"
                  >
                    Browse Library <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </ScrollReveal>

      {/* ═══════════════════════════════════════════════════════ FOOTER */}
      <footer className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">
          Built with FastAPI + Next.js · Open source (MIT) ·
          Supports OpenAI, Anthropic, DeepSeek, OpenRouter, GLM, MiniMax, Kimi, and custom endpoints.
        </p>
        <p className="text-[10px] text-muted-foreground/60">
          Self-hosted. Your data stays on your machine.
        </p>
      </footer>
    </div>
  );
}
