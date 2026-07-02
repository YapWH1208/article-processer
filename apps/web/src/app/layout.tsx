import "./globals.css";
import { Suspense } from "react";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Article Processor",
  description: "AI-powered article processing and analysis",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/desktop-config.js" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-pulse-dot h-4 w-4 rounded-full bg-primary" /></div>}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
