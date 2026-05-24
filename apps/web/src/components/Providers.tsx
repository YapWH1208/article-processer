"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import {
  FileText, Upload, Settings, Menu, X,
  Sun, Moon, Home, BookOpen, BarChart3, GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

// ── Nav links ─────────────────────────────────────────────────────────────

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/articles", label: "Articles", icon: BookOpen },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/graph", label: "Graph", icon: GitBranch },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ mobile, onClick }: { mobile?: boolean; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };
  return (
    <>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onClick}>
          <Button
            variant={isActive(href) ? "secondary" : "ghost"}
            size={mobile ? "default" : "sm"}
            className={cn("gap-2 relative", mobile && "w-full justify-start")}
          >
            <Icon className="h-4 w-4" />
            {label}
            {isActive(href) && (
              <motion.div
                layoutId="nav-active"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-6 bg-primary rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </Button>
        </Link>
      ))}
    </>
  );
}

// ── Mobile menu ────────────────────────────────────────────────────────────

function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 left-0 right-0 bg-background border-b shadow-lg p-4 flex flex-col gap-1 z-50 overflow-hidden"
          >
            <NavLinks mobile onClick={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <Link href="/" className="flex items-center gap-2 mr-4 group">
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
          <nav className="hidden md:flex items-center gap-1">
            <NavLinks />
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MobileMenu />
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
