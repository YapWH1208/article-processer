"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<
    { article_id: number; job_id: number; filename: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const result = await uploadFile(file);
        setResults((prev) => [...prev, result]);
        // Navigate to article after a brief delay
        setTimeout(() => {
          router.push(`/articles/${result.article_id}`);
        }, 1500);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [router]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        handleUpload(file);
      }
    }
  };

  const allowedTypes = ".pdf,.zip,.html,.htm,.md,.markdown,.txt";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Upload Document</h1>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver
            ? "border-primary-500 bg-primary-50"
            : "border-gray-300 bg-white hover:border-primary-300"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="text-4xl mb-4">📎</div>
        <h3 className="text-lg font-semibold mb-2">
          Drop files here or click to browse
        </h3>
        <p className="text-gray-500 text-sm mb-4">
          Supports PDF, ZIP, HTML, Markdown, and plain text files
        </p>
        <label className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer">
          Choose Files
          <input
            type="file"
            className="hidden"
            accept={allowedTypes}
            onChange={onFileChange}
            multiple
          />
        </label>
        <p className="text-xs text-gray-400 mt-2">
          Maximum file size: 50 MB
        </p>
      </div>

      {uploading && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
          <span className="text-blue-700">Uploading and processing...</span>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold mb-3">Uploaded</h2>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className="p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center"
              >
                <span className="text-green-800 text-sm">{r.filename}</span>
                <a
                  href={`/articles/${r.article_id}`}
                  className="text-primary-600 text-sm hover:underline"
                >
                  View →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-medium mb-2">Accepted File Types</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• <strong>PDF</strong> — Research papers, articles, reports</li>
          <li>• <strong>ZIP</strong> — Archive containing PDFs, HTML, MD, or TXT files</li>
          <li>• <strong>HTML</strong> — Web pages or exported documents</li>
          <li>• <strong>Markdown</strong> — .md or .markdown files</li>
          <li>• <strong>Text</strong> — Plain .txt files</li>
        </ul>
      </div>

      {/* BibTeX Import */}
      <BibtexImportSection />
    </div>
  );
}

function BibtexImportSection() {
  const router = useRouter();
  const [bibtexText, setBibtexText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    total: number;
    articles: { article_id: number; title: string }[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
      const data = await res.json();
      setImportResult(data);
      setBibtexText("");
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-2">📚 Import from BibTeX</h2>
      <p className="text-sm text-gray-500 mb-4">
        Paste BibTeX entries to import article metadata. Each entry creates an article
        that can be processed and searched.
      </p>
      <textarea
        value={bibtexText}
        onChange={(e) => setBibtexText(e.target.value)}
        placeholder={`@article{example2024,
  title = {An Example Paper},
  author = {Alice Researcher and Bob Scientist},
  year = {2024},
  journal = {Journal of Examples},
  doi = {10.1234/example.1},
  abstract = {This is an example abstract.}
}`}
        className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <div className="mt-3 flex gap-3 items-center">
        <button
          onClick={handleBibtexImport}
          disabled={importing || !bibtexText.trim()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
        >
          {importing ? "Importing..." : "Import BibTeX"}
        </button>
        <span className="text-xs text-gray-400">
          Or upload a .bib file using the dropzone above
        </span>
      </div>

      {importError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {importError}
        </div>
      )}

      {importResult && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm">
          <p className="text-green-700 font-medium">
            Imported {importResult.imported} articles
            {importResult.skipped > 0 && ` (${importResult.skipped} duplicates skipped)`}
          </p>
          <div className="mt-2 space-y-1">
            {importResult.articles.map((a) => (
              <a
                key={a.article_id}
                href={`/articles/${a.article_id}`}
                className="block text-primary-600 hover:underline"
              >
                → {a.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
