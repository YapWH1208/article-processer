"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle2, AlertCircle, Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { uploadFile } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function UploadPage() {
  const router = useRouter();
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ filename: string; article_id: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // BibTeX import state
  const [bibtexText, setBibtexText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number; skipped: number; total: number;
    articles: { article_id: number; title: string }[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    setProgress(0);
    const arr = Array.from(files);
    const res: { filename: string; article_id: number }[] = [];

    for (let i = 0; i < arr.length; i++) {
      try {
        const result = await uploadFile(arr[i]);
        res.push({ filename: arr[i].name, article_id: result.article_id });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
      setProgress(Math.round(((i + 1) / arr.length) * 100));
    }

    setResults((prev) => [...prev, ...res]);
    setUploading(false);
  }, []);

  const handleBibtexImport = async () => {
    if (!bibtexText.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("bibtex_text", bibtexText);
      const res = await fetch(`${API_BASE}/imports/bibtex`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Import failed");
      }
      setImportResult(await res.json());
      setBibtexText("");
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload</h1>
        <p className="text-muted-foreground mt-1">
          Drag and drop documents or paste BibTeX entries.
        </p>
      </div>

      {/* Drop Zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          dragover ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => { e.preventDefault(); setDragover(false); handleUpload(e.dataTransfer.files); }}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {uploading ? (
              <Upload className="h-8 w-8 text-primary animate-bounce" />
            ) : (
              <Inbox className="h-8 w-8 text-primary" />
            )}
          </div>
          <CardTitle className="text-lg mb-1">
            {uploading ? "Uploading..." : "Drop files here"}
          </CardTitle>
          <CardDescription>
            PDF, ZIP, HTML, Markdown, TXT — up to 50 MB
          </CardDescription>
          <label className="mt-4 cursor-pointer">
            <Button variant="outline" size="sm" disabled={uploading} asChild>
              <span>Browse Files</span>
            </Button>
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.zip,.html,.htm,.md,.txt,.markdown,.bib,.bibtex"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
            />
          </label>
        </CardContent>
      </Card>

      {/* Upload progress */}
      {uploading && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Upload className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-sm font-medium">Uploading... {progress}%</span>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Uploaded {results.length} file{results.length > 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-md bg-accent/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{r.filename}</span>
                </div>
                <Button variant="link" size="sm" onClick={() => router.push(`/articles/${r.article_id}`)}>
                  View →
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* BibTeX Import */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📚 Import from BibTeX</CardTitle>
          <CardDescription>
            Paste BibTeX entries to import article metadata. Each entry creates a searchable article record.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={bibtexText}
            onChange={(e) => setBibtexText(e.target.value)}
            placeholder={`@article{example2024,\n  title = {An Example Paper},\n  author = {Alice Researcher and Bob Scientist},\n  year = {2024},\n  journal = {Journal of Examples},\n  doi = {10.1234/example.1},\n}`}
            className="min-h-[140px] font-mono text-sm"
          />
          <div className="flex gap-3 items-center">
            <Button
              onClick={handleBibtexImport}
              disabled={importing || !bibtexText.trim()}
              size="sm"
            >
              {importing ? "Importing..." : "Import BibTeX"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Or upload a .bib file using the dropzone above
            </span>
          </div>

          {importError && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {importError}
            </div>
          )}
          {importResult && (
            <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm">
              <p className="font-medium text-primary">
                Imported {importResult.imported} articles
                {importResult.skipped > 0 && ` (${importResult.skipped} duplicates skipped)`}
              </p>
              <div className="mt-2 space-y-1">
                {importResult.articles.map((a) => (
                  <Button
                    key={a.article_id}
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-primary"
                    onClick={() => router.push(`/articles/${a.article_id}`)}
                  >
                    → {a.title}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accepted Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accepted File Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
            {[
              ["PDF", "Research papers, articles, reports"],
              ["ZIP", "Archive of PDFs, HTML, MD, TXT"],
              ["HTML", "Web pages or exported documents"],
              ["Markdown", ".md or .markdown files"],
              ["Text", "Plain .txt files"],
              ["BibTeX", ".bib or .bibtex citation files"],
            ].map(([ext, desc]) => (
              <div key={ext} className="flex gap-2">
                <Badge variant="outline" className="shrink-0 font-mono">{ext}</Badge>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
