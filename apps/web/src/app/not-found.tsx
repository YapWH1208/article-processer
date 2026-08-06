import Link from "next/link";
import { FileSearch, FileUp, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <FileSearch className="h-8 w-8 text-primary" />
      </div>
      <p className="mt-6 font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance">This page is not in the library</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
        The page you are looking for was moved, renamed, or never extracted. Head back to your workspace to keep going.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/" className="gap-1.5">
            <Home className="h-4 w-4" />
            Back to Workspace
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/upload" className="gap-1.5">
            <FileUp className="h-4 w-4" />
            Upload an Article
          </Link>
        </Button>
      </div>
    </div>
  );
}
