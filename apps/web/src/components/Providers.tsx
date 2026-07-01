"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import {
  FileText, Sun, Moon, Home, FileUp, MessageCircle,
  GitBranch, BarChart3, Settings2, BookOpen, Menu, X, ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";
import { getLanguageButtonLabel } from "@/lib/languageState.mjs";
import { getJobQueue } from "@/lib/api";
import { summarizeNavQueue } from "./navQueueState.mjs";

// ── Theme toggle ──────────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const { copy } = useLanguage();

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
    <Button variant="ghost" size="icon" onClick={toggle} title={dark ? copy.lightMode : copy.darkMode}>
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

function LanguageToggle() {
  const { language, setLanguage, copy } = useLanguage();
  const isChinese = language === "zh";
  const title = isChinese ? copy.toggleToEnglish : copy.toggleToChinese;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 min-w-11 px-2 text-xs font-semibold"
      title={title}
      aria-label={title}
      onClick={() => setLanguage(isChinese ? "en" : "zh")}
    >
      {getLanguageButtonLabel(language)}
    </Button>
  );
}

// ── Nav link groups ───────────────────────────────────────────────────────

const navLinks = [
  { href: "/", labelKey: "home", icon: Home },
  { href: "/articles", labelKey: "library", icon: BookOpen },
  { href: "/upload", labelKey: "upload", icon: FileUp },
  { href: "/chat", labelKey: "chat", icon: MessageCircle },
  { href: "/logs", labelKey: "jobs", icon: ScrollText },
  { href: "/graph", labelKey: "graph", icon: GitBranch },
  { href: "/dashboard", labelKey: "dashboard", icon: BarChart3 },
] as const;

// ── Navbar ─────────────────────────────────────────────────────────────────

function NavBar() {
  const pathname = usePathname();
  const { copy } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [queueSummary, setQueueSummary] = useState(() => summarizeNavQueue([]));

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const closeMobile = () => setMobileOpen(false);

  // Keep the processing state visible without requiring users to visit logs.
  useEffect(() => {
    const poll = async () => {
      try {
        const queue = await getJobQueue(100);
        setQueueSummary(summarizeNavQueue(queue.jobs || []));
      } catch { /* ignore poll errors */ }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 md:hidden flex-shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label={copy.openNavigation}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0 ml-2 md:ml-0">
          <motion.div
            whileHover={{ rotate: 15, scale: 1.15 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <FileText className="h-6 w-6 text-primary" />
          </motion.div>
          <span className="text-lg font-bold tracking-tight hidden sm:inline">
            {copy.appName}
          </span>
        </Link>

        {/* Center: nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1 mx-4 overflow-x-auto">
          {navLinks.map(({ href, labelKey, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={isActive(href) ? "secondary" : "ghost"}
                size="sm"
                className="gap-2 h-9"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{copy.nav[labelKey]}</span>
              </Button>
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Processing indicator */}
          {queueSummary.shouldShowBadge && (
            <Link href="/logs">
              <Button
                variant="ghost"
                size="sm"
                className={`gap-1.5 h-8 text-xs ${
                  queueSummary.badgeTone === "destructive" ? "text-destructive hover:text-destructive" : ""
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      queueSummary.badgeTone === "destructive" ? "bg-destructive" : "bg-amber-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      queueSummary.badgeTone === "destructive" ? "bg-destructive" : "bg-amber-500"
                    }`}
                  />
                </span>
                <span className="hidden sm:inline">{queueSummary.badgeLabel}</span>
              </Button>
            </Link>
          )}
          <LanguageToggle />
          <Link href="/settings" className="hidden md:inline-flex">
            <Button variant="ghost" size="icon" className="h-9 w-9" title={copy.settings} aria-label={copy.settings}>
              <Settings2 className="h-5 w-5" />
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMobile}
            />
            {/* Drawer panel */}
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r shadow-2xl md:hidden flex flex-col"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between p-4 border-b">
                <span className="text-lg font-bold tracking-tight">{copy.appName}</span>
                <Button variant="ghost" size="icon" onClick={closeMobile} aria-label={copy.closeMenu}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navLinks.map(({ href, labelKey, icon: Icon }) => (
                  <Link key={href} href={href} onClick={closeMobile}>
                    <Button
                      variant={isActive(href) ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3 h-11"
                    >
                      <Icon className="h-5 w-5" />
                      <span>{copy.nav[labelKey]}</span>
                    </Button>
                  </Link>
                ))}
              </nav>

              {/* Drawer footer */}
              <div className="p-4 border-t">
                <Link href="/settings" onClick={closeMobile}>
                  <Button variant="outline" className="w-full justify-start gap-3 h-11">
                    <Settings2 className="h-5 w-5" />
                    <span>{copy.settings}</span>
                  </Button>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <LanguageProvider>
      <NavBar />
      <main className="container mx-auto px-4 py-6">
        <PageTransition>{children}</PageTransition>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
    </LanguageProvider>
  );
}
