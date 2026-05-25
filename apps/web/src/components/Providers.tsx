"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import {
  FileText, Sun, Moon, Home, FileUp, MessageCircle,
  GitBranch, BarChart3, Settings2, BookOpen, Menu, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";

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

const navLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/articles", label: "Library", icon: BookOpen },
  { href: "/upload", label: "Upload", icon: FileUp },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/graph", label: "Graph", icon: GitBranch },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

// ── Navbar ─────────────────────────────────────────────────────────────────

function NavBar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 md:hidden flex-shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
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
            Article Processor
          </span>
        </Link>

        {/* Center: nav links — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1 mx-4 overflow-x-auto">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={isActive(href) ? "secondary" : "ghost"}
                size="sm"
                className="gap-2 h-9"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </Link>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/settings" className="hidden md:inline-flex">
            <Button variant="ghost" size="icon" className="h-9 w-9" title="Settings">
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
                <span className="text-lg font-bold tracking-tight">Article Processor</span>
                <Button variant="ghost" size="icon" onClick={closeMobile} aria-label="Close menu">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navLinks.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={closeMobile}>
                    <Button
                      variant={isActive(href) ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3 h-11"
                    >
                      <Icon className="h-5 w-5" />
                      <span>{label}</span>
                    </Button>
                  </Link>
                ))}
              </nav>

              {/* Drawer footer */}
              <div className="p-4 border-t">
                <Link href="/settings" onClick={closeMobile}>
                  <Button variant="outline" className="w-full justify-start gap-3 h-11">
                    <Settings2 className="h-5 w-5" />
                    <span>Settings</span>
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
    <>
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
    </>
  );
}
