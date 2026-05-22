"use client";

import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText, Upload, Settings, LogIn, LogOut, User, Menu, X,
  Sun, Moon, Home, ChevronDown, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ── Theme toggle ──────────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggle} title={dark ? "Light mode" : "Dark mode"}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

// ── Nav link helper ───────────────────────────────────────────────────────

const links = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/articles", label: "Articles", icon: BookOpen },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ mobile, onClick }: { mobile?: boolean; onClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} onClick={onClick}>
          <Button
            variant={pathname === href ? "secondary" : "ghost"}
            size={mobile ? "default" : "sm"}
            className={cn("gap-2", mobile && "w-full justify-start")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        </Link>
      ))}
    </>
  );
}

// ── User menu ─────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <Link href="/login">
        <Button variant="outline" size="sm" className="gap-2">
          <LogIn className="h-4 w-4" />
          Sign In
        </Button>
      </Link>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {(user.display_name || user.email).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline max-w-[120px] truncate">
            {user.display_name || user.email}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
          {user.email}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="gap-2 text-destructive cursor-pointer">
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      {open && (
        <div className="absolute top-16 left-0 right-0 bg-background border-b shadow-lg p-4 flex flex-col gap-1 z-50">
          <NavLinks mobile onClick={() => setOpen(false)} />
          <div className="mt-2 pt-2 border-t">
            <UserMenu />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Left: brand + nav */}
        <div className="flex items-center gap-1">
          <Link href="/" className="flex items-center gap-2 mr-4">
            <FileText className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight hidden sm:inline">
              Article Processor
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavLinks />
          </nav>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden md:block">
            <UserMenu />
          </div>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

// ── Provider wrapper ───────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavBar />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </AuthProvider>
  );
}
