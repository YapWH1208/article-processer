"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import {
  FileText, Sun, Moon, Home, FileUp, MessageCircle,
  GitBranch, BarChart3, Settings2, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4">
        {/* Logo */}
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

        {/* Center: nav links */}
        <nav className="flex items-center gap-1 mx-4 overflow-x-auto">
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
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="h-9 w-9" title="Settings">
              <Settings2 className="h-5 w-5" />
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
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
