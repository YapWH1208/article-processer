"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import {
  FileText, Sun, Moon, Home, FileUp, MessageCircle,
  GitBranch, BarChart3, Settings2, Search, X,
  PanelLeftClose, PanelLeftOpen, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// ── Theme toggle ──────────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const stored = localStorage.getItem("theme");
      if (stored === "dark" || (!stored && mq.matches)) {
        document.documentElement.classList.add("dark");
        setDark(true);
      } else {
        document.documentElement.classList.remove("dark");
        setDark(false);
      }
    };
    apply();
    const onChange = () => { if (!localStorage.getItem("theme")) apply(); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={dark ? "Light mode" : "Dark mode"}>
      <motion.div
        key={dark ? "sun" : "moon"}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </motion.div>
    </Button>
  );
}

// ── Nav link groups ───────────────────────────────────────────────────────

const primaryLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/articles", label: "Library", icon: BookOpen },
  { href: "/upload", label: "Upload", icon: FileUp },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/graph", label: "Graph", icon: GitBranch },
];

const secondaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

// ── Search command palette (simplified) ───────────────────────────────────

function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const allLinks = [...primaryLinks, ...secondaryLinks];

  const filtered = query
    ? allLinks.filter((l) => l.label.toLowerCase().includes(query.toLowerCase()))
    : allLinks;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-6 px-3 text-muted-foreground font-normal"
        onClick={() => setOpen(true)}>
        <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /> Search pages...</span>
        <kbd className="hidden sm:inline text-[10px] bg-muted px-1.5 py-0.5 rounded border font-mono">⌘K</kbd>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[20vh]"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md bg-card border rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center border-b px-3">
                <Search className="h-4 w-4 text-muted-foreground mr-2" />
                <Input ref={inputRef} value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a page..." className="border-0 shadow-none flex-1 h-12 focus-visible:ring-0 px-0" />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-1.5 max-h-64 overflow-y-auto">
                {filtered.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors">
                    <l.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{l.label}</span>
                  </Link>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">No pages found</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.aside
            className="fixed left-0 top-16 bottom-0 z-40 w-60 bg-card border-r flex flex-col shadow-lg"
            initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            {/* Mobile close */}
            <div className="lg:hidden flex justify-end p-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Primary links */}
            <nav className="flex-1 px-3 py-2 space-y-0.5">
              <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Main
              </p>
              {primaryLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={onClose}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive(href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive(href) && "text-primary")} />
                    {label}
                  </div>
                </Link>
              ))}

              {/* Secondary links */}
              <p className="px-3 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </p>
              {secondaryLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={onClose}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive(href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive(href) && "text-primary")} />
                    {label}
                  </div>
                </Link>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-3 border-t text-[10px] text-muted-foreground text-center">
              Article Processor
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────

function NavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        {/* Left: toggle + logo */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9"
            onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>

          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <motion.div
              whileHover={{ rotate: 15, scale: 1.15 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <FileText className="h-6 w-6 text-primary" />
            </motion.div>
            <span className="text-lg font-bold tracking-tight hidden sm:inline">
              Article Processor
            </span>
          </Link>
        </div>

        {/* Center: quick nav (desktop) */}
        <nav className="hidden lg:flex items-center gap-1 mx-4">
          {primaryLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={isActive(href) ? "secondary" : "ghost"}
                size="sm"
                className="gap-2 h-9"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block"><SearchBar /></div>
          <ThemeToggle />
        </div>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </header>
  );
}

// ── Page transition wrapper ────────────────────────────────────────────────

function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ── Provider root ──────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="container mx-auto px-4 py-6">
        <PageTransition>{children}</PageTransition>
      </main>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
          },
        }}
      />
    </>
  );
}
