"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listArticles, healthCheck } from "@/lib/api";
import type { ArticleSummary } from "@/lib/types";

export default function DashboardPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState<string>("checking...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const health = await healthCheck();
        setBackendStatus(
          `Connected (${health.mock_ai ? "Mock AI" : "OpenAI"})`
        );

        const data = await listArticles({ limit: 10 });
        setArticles(data.articles);
      } catch (e) {
        setError(
          `Cannot connect to backend at ${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}`
        );
        setBackendStatus("Disconnected");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Article Processor</h1>
        <p className="text-gray-600">
          Upload research papers and extract structured knowledge with AI.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              backendStatus === "checking..."
                ? "bg-yellow-400"
                : backendStatus === "Disconnected"
                  ? "bg-red-500"
                  : "bg-green-500"
            }`}
          />
          <span className="text-sm text-gray-500">Backend: {backendStatus}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-700">{error}</p>
          <p className="text-red-600 text-sm mt-1">
            Make sure the backend is running:{" "}
            <code className="bg-red-100 px-1 rounded">
              cd services/api && uvicorn app.main:app --reload
            </code>
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Link
          href="/upload"
          className="block p-6 bg-white rounded-lg border-2 border-dashed border-primary-300 hover:border-primary-500 transition-colors text-center"
        >
          <div className="text-3xl mb-2">📤</div>
          <h3 className="font-semibold text-primary-700">Upload Document</h3>
          <p className="text-sm text-gray-500 mt-1">
            PDF, HTML, Markdown, Text, or ZIP
          </p>
        </Link>
        <Link
          href="/articles"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-primary-300 transition-colors"
        >
          <div className="text-3xl mb-2">📚</div>
          <h3 className="font-semibold">Browse Articles</h3>
          <p className="text-sm text-gray-500 mt-1">
            Search and filter processed articles
          </p>
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Articles</h2>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">No articles yet</p>
            <Link
              href="/upload"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Upload your first document
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-primary-300 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-primary-700 truncate max-w-md">
                      {article.title || article.original_filename}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {article.original_filename} • {article.source_type}
                    </p>
                  </div>
                  <span className={`status-badge status-${article.status}`}>
                    {article.status.replace("_", " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
