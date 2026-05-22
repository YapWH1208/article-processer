import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Article Processor",
  description: "AI-powered article processing and analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
