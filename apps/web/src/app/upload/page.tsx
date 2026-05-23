"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle2, AlertCircle, Inbox, Sparkles, Brain } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { uploadFile } from "@/lib/api";
import { FadeIn } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function UploadPage() {
  const router = useRouter();
  const [dragover, setDragover] = useState(false);
  const [runAI, setRunAI] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ filename: string; article_id: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSparkle, setShowSparkle] = useState(false);

  // BibTeX
  const [bibtexText, setBibtexText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number; skipped: number; total: number;
    articles: { article_id: number; title: string }[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true); setError(null); setProgress(0);
    const arr = Array.from(files);
    const res: { filename: string; article_id: number }[] = [];

    for (let i = 0; i < arr.length; i++) {
      try {
        const r = await uploadFile(arr[i], runAI);
        res.push({ filename: arr[i].name, article_id: r.article_id });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
      setProgress(Math.round(((i + 1) / arr.length) * 100));
    }
    setResults((prev) => [...prev, ...res]);
    setUploading(false);
    if (res.length > 0) { setShowSparkle(true); setTimeout(() => setShowSparkle(false), 2500); }
  }, [runAI]);

  const handleBibtexImport = async () => {
    if (!bibtexText.trim()) return;
    setImporting(true); setImportError(null);
    try {
      const fd = new FormData(); fd.append("bibtex_text", bibtexText);
      const res = await fetch(`${API_BASE}/imports/bibtex`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).detail || "Import failed");
      setImportResult(await res.json());
      setBibtexText("");
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally { setImporting(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <FadeIn>
        <h1 className="text-3xl font-bold tracking-tight">Upload</h1>
        <p className="text-muted-foreground mt-1">Drag and drop documents or paste BibTeX entries.</p>
      </FadeIn>

      {/* Drop Zone */}
      <FadeIn delay={0.1}>
        <Card
          className={`relative border-2 transition-all duration-300 ${
            dragover
              ? "border-primary bg-primary/5 scale-[1.01] shadow-lg"
              : "border-dashed border-muted-foreground/25 animate-border-breathe"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => { e.preventDefault(); setDragover(false); handleUpload(e.dataTransfer.files); }}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <motion.div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              animate={uploading ? { scale: [1, 1.1, 1] } : dragover ? { scale: 1.1 } : { y: [0, -4, 0] }}
              transition={uploading ? { duration: 0.8, repeat: Infinity } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {uploading ? (
                <Upload className="h-8 w-8 text-primary" />
              ) : (
                <Inbox className="h-8 w-8 text-primary" />
              )}
            </motion.div>
            <CardTitle className="text-lg mb-1">
              {uploading ? "Uploading..." : dragover ? "Drop files here" : "Drop files here"}
            </CardTitle>
            <CardDescription>PDF, ZIP, HTML, Markdown, TXT — up to 50 MB</CardDescription>
            <label className="mt-4 cursor-pointer">
              <Button variant="outline" size="sm" disabled={uploading} asChild>
                <span>Browse Files</span>
              </Button>
              <input type="file" className="hidden" multiple
                accept=".pdf,.zip,.html,.htm,.md,.txt,.markdown,.bib,.bibtex"
                onChange={(e) => e.target.files && handleUpload(e.target.files)} />
            </label>
            <div className="flex items-center gap-2 mt-3">
              <Switch id="run-ai" checked={runAI} onCheckedChange={setRunAI} disabled={uploading} />
              <Label htmlFor="run-ai" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Run AI pipeline (extraction, embeddings, graph)
              </Label>
            </div>
          </CardContent>

          {/* Sparkle overlay on success */}
          <AnimatePresence>
            {showSparkle && (
              <motion.div
                className="absolute inset-0 pointer-events-none flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                    animate={{
                      x: (Math.random() - 0.5) * 200,
                      y: (Math.random() - 0.5) * 200,
                      scale: [0, 1.5, 0],
                      opacity: [0, 1, 0],
                    }}
                    transition={{ duration: 1.5, delay: i * 0.1, ease: "easeOut" }}
                  >
                    <Sparkles className="h-5 w-5 text-primary" />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </FadeIn>

      {/* Upload progress */}
      <AnimatePresence>
        {uploading && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3 mb-2">
                  <Upload className="h-4 w-4 text-primary animate-pulse" />
                  <span className="text-sm font-medium">Uploading... {progress}%</span>
                </div>
                <Progress value={progress} className="animate-shimmer" />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Uploaded {results.length} file{results.length > 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {results.map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between py-2 px-3 rounded-md bg-accent/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{r.filename}</span>
                    </div>
                    <Button variant="link" size="sm" onClick={() => router.push(`/articles/${r.article_id}`)}>View →</Button>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Separator />

      {/* BibTeX */}
      <FadeIn delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📚 Import from BibTeX</CardTitle>
            <CardDescription>Paste BibTeX entries to import article metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={bibtexText} onChange={(e) => setBibtexText(e.target.value)}
              placeholder={`@article{example2024,\n  title = {An Example Paper},\n  ...\n}`}
              className="min-h-[140px] font-mono text-sm" />
            <div className="flex gap-3 items-center">
              <Button onClick={handleBibtexImport} disabled={importing || !bibtexText.trim()} size="sm">
                {importing ? "Importing..." : "Import BibTeX"}
              </Button>
            </div>
            {importError && <div className="p-3 rounded-md bg-destructive/10 text-sm text-destructive">{importError}</div>}
            {importResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm">
                <p className="font-medium text-primary">Imported {importResult.imported} articles</p>
                <div className="mt-2 space-y-1">
                  {importResult.articles.map((a) => (
                    <Button key={a.article_id} variant="link" size="sm" className="h-auto p-0 text-primary"
                      onClick={() => router.push(`/articles/${a.article_id}`)}>→ {a.title}</Button>
                  ))}
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Accepted Types */}
      <FadeIn delay={0.3}>
        <Card>
          <CardHeader><CardTitle className="text-base">Accepted File Types</CardTitle></CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              {[["PDF", "Papers, articles"], ["ZIP", "Archive of PDFs/HTML/MD"], ["HTML", "Web pages"],
                ["Markdown", ".md files"], ["Text", ".txt files"], ["BibTeX", ".bib citations"]]
                .map(([ext, desc]) => (
                  <div key={ext} className="flex gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono">{ext}</Badge><span>{desc}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
