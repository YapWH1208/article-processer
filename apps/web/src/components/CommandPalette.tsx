"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, FileText, Home, FileUp, MessageCircle,
  GitBranch, BarChart3, Settings2, BookOpen, Sun, Moon,
  ArrowRight, CornerDownLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { translateUiText } from "@/lib/languageState.mjs";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface ArticleHit {
  id: number;
  title: string;
  original_filename: string;
  status: string;
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  keywords?: string[];
  onSelect?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<ArticleHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Static commands
  const staticCommands: CommandItem[] = [
    { id: "home", label: translateUiText("Go to Home", language), icon: Home, href: "/", keywords: ["home", "landing", "首页"] },
    { id: "library", label: translateUiText("Go to Library", language), icon: BookOpen, href: "/articles", keywords: ["articles", "library", "papers", "文库"] },
    { id: "upload", label: translateUiText("Go to Upload", language), icon: FileUp, href: "/upload", keywords: ["upload", "add", "import", "上传"] },
    { id: "chat", label: translateUiText("Go to Chat", language), icon: MessageCircle, href: "/chat", keywords: ["chat", "ask", "conversation", "聊天"] },
    { id: "graph", label: translateUiText("Go to Graph", language), icon: GitBranch, href: "/graph", keywords: ["graph", "knowledge", "entities", "图谱"] },
    { id: "dashboard", label: translateUiText("Go to Dashboard", language), icon: BarChart3, href: "/dashboard", keywords: ["dashboard", "metrics", "stats", "仪表盘"] },
    { id: "settings", label: translateUiText("Go to Settings", language), icon: Settings2, href: "/settings", keywords: ["settings", "config", "preferences", "设置"] },
  ];

  // Search articles
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setArticles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    fetch(`${API_BASE}/articles?search=${encodeURIComponent(query)}&limit=8`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setArticles(d.articles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setArticles([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allItems: (CommandItem & { article?: ArticleHit })[] = [
    ...staticCommands
      .filter((c) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return c.label.toLowerCase().includes(q) || (c.keywords || []).some((k) => k.includes(q));
      }),
    ...articles.map((a, i) => ({
      id: `article-${a.id}`,
      label: a.title || a.original_filename,
      icon: FileText,
      href: `/articles/${a.id}`,
      keywords: [a.original_filename],
      article: a,
    })),
  ];

  const execute = useCallback((item: CommandItem & { article?: ArticleHit }) => {
    if (item.href) {
      router.push(item.href);
    }
    if (item.onSelect) {
      item.onSelect();
    }
    onClose();
  }, [router, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (allItems[selectedIndex]) {
          execute(allItems[selectedIndex]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, allItems, selectedIndex, execute]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Palette */}
          <motion.div
            className="fixed inset-x-0 top-[15%] z-50 mx-auto w-full max-w-lg rounded-xl border bg-card shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                placeholder={translateUiText("Search articles or type a command…", language)}
                className="border-0 bg-transparent h-auto p-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
              />
              {loading && (
                <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              )}
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-80 overflow-y-auto py-2" role="listbox">
              {allItems.length === 0 && query.length >= 2 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {translateUiText(`No results found for “${query}”`, language)}
                </div>
              )}
              {allItems.map((item, i) => (
                <button
                  key={item.id}
                  role="option"
                  aria-selected={i === selectedIndex}
                  onClick={() => execute(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    i === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.article && (
                    <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                      {item.article.status}
                    </span>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                </button>
              ))}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-4 py-2 border-t text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> {translateUiText("select", language)}
              </span>
              <span className="flex items-center gap-1">
                <span className="font-medium">↑↓</span> {translateUiText("navigate", language)}
              </span>
              <span className="flex-1" />
              <span>{translateUiText("Esc to close", language)}</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
