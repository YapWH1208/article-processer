"use client";

import { AuthProvider, useAuth } from "@/lib/auth";
import Link from "next/link";

function NavBar() {
  const { user, logout } = useAuth();

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <a href="/" className="text-xl font-bold text-primary-700 shrink-0">
            📄 Article Processor
          </a>
          <div className="flex gap-3 text-sm items-center">
            <a href="/" className="text-gray-600 hover:text-primary-600">Dashboard</a>
            <a href="/upload" className="text-gray-600 hover:text-primary-600">Upload</a>
            <a href="/articles" className="text-gray-600 hover:text-primary-600">Articles</a>
            <a href="/settings" className="text-gray-600 hover:text-primary-600">Settings</a>
            <span className="text-gray-300">|</span>
            {user ? (
              <>
                <span className="text-gray-500 text-xs">{user.display_name || user.email}</span>
                <button
                  onClick={logout}
                  className="text-gray-500 hover:text-red-600 text-xs"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/login" className="text-gray-500 hover:text-primary-600">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </AuthProvider>
  );
}
