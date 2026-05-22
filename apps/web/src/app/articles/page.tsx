"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listArticles } from "@/lib/api";
import type { ArticleSummary } from "@/lib/types";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await listArticles({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setArticles(data.articles);
      setTotal(data.total);
    } catch {
      // handled by error state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const statuses = [
    "uploaded",
    "parsing",
    "extracting",
    "indexing",
    "completed",
    "failed",
    "needs_review",
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Articles ({total})</h1>
        <Link
          href="/upload"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
        >
          Upload New
        </Link>
      </div>

      <div className="flex gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or filename..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm"
          >
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No articles found</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                  Title
                </th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                  Type
                </th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {articles.map((article) => (
                <tr key={article.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      href={`/articles/${article.id}`}
                      className="text-primary-700 hover:underline font-medium"
                    >
                      {article.title || article.original_filename}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {article.original_filename}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {article.source_type}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`status-badge status-${article.status}`}>
                      {article.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(article.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
