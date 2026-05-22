import "./globals.css";
import { Suspense } from "react";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata = {
  title: "Article Processor",
  description: "AI-powered article processing and analysis",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-pulse-dot h-4 w-4 rounded-full bg-primary" /></div>}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
