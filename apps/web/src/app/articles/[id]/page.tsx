"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getArticle,
  getArticleMarkdown,
  getArticleExtraction,
  getArticleGraph,
  getArticleJobs,
  sendChatMessage,
  getChatHistory,
  reprocessArticle,
  listSkills,
  runSkill,
} from "@/lib/api";
import type {
  ArticleDetail,
  ExtractionResult,
  GraphEntity,
  GraphRelationship,
  JobResponse,
  Citation,
  ChatMessageResponse,
  SkillDef,
} from "@/lib/types";

type Tab =
  | "reader"
  | "summary"
  | "chat"
  | "graph"
  | "metadata"
  | "logs";

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = Number(params.id);

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [skills, setSkills] = useState<SkillDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("reader");

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessageResponse[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatCitations, setChatCitations] = useState<Citation[]>([]);

  // Poll for status updates
  const [polling, setPolling] = useState(false);

  const loadArticle = useCallback(async () => {
    try {
      const [articleData, extractionData, graphData, jobsData, skillsData] =
        await Promise.all([
          getArticle(articleId),
          getArticleExtraction(articleId).catch(() => null),
          getArticleGraph(articleId).catch(() => ({ entities: [], relationships: [] })),
          getArticleJobs(articleId).catch(() => []),
          listSkills().catch(() => ({ skills: [] })),
        ]);

      setArticle(articleData);
      if (extractionData) {
        setExtraction(extractionData.extraction);
      }
      setEntities(graphData.entities || []);
      setRelationships(graphData.relationships || []);
      setJobs(Array.isArray(jobsData) ? jobsData : []);
      setSkills(skillsData.skills || []);

      // Poll if article is still processing
      const processing = ["uploaded", "parsing", "extracting", "indexing"].includes(
        articleData.status
      );
      if (processing) {
        setPolling(true);
      }

      // Load markdown for reader
      try {
        const mdData = await getArticleMarkdown(articleId);
        setMarkdown(mdData.markdown || "");
      } catch {
        // Markdown may not be ready yet
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load article");
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    loadArticle();
  }, [loadArticle]);

  // Polling for status updates
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const data = await getArticle(articleId);
        setArticle(data);
        const done = ["completed", "failed", "needs_review"].includes(data.status);
        if (done) {
          setPolling(false);
          // Reload full data
          loadArticle();
        }
      } catch {
        setPolling(false);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, articleId, loadArticle]);

  // Chat handlers
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setChatAnswer(null);
    setChatCitations([]);
    try {
      const response = await sendChatMessage(articleId, chatInput.trim());
      setChatAnswer(response.answer);
      setChatCitations(response.citations);
      // Reload history
      const history = await getChatHistory(articleId);
      setChatMessages(history.messages);
    } catch (e: unknown) {
      setChatAnswer(
        `Error: ${e instanceof Error ? e.message : "Failed to get answer"}`
      );
    } finally {
      setChatLoading(false);
      setChatInput("");
    }
  };

  const loadChatHistory = async () => {
    try {
      const history = await getChatHistory(articleId);
      setChatMessages(history.messages);
    } catch {
      // no history yet
    }
  };

  useEffect(() => {
    if (activeTab === "chat") {
      loadChatHistory();
    }
  }, [activeTab]);

  const handleReprocess = async () => {
    try {
      await reprocessArticle(articleId);
      setPolling(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Reprocess failed");
    }
  };

  const handleRunSkill = async (skillName: string) => {
    try {
      const result = await runSkill(skillName, articleId);
      alert(JSON.stringify(result.result, null, 2));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Skill execution failed");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-500">Loading article...</p>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-red-700 font-semibold">Error</h2>
        <p className="text-red-600">{error || "Article not found"}</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "reader", label: "📖 Reader" },
    { key: "summary", label: "📊 Summary" },
    { key: "chat", label: "💬 Chat" },
    { key: "graph", label: "🔗 Graph" },
    { key: "metadata", label: "📋 Metadata" },
    { key: "logs", label: "📝 Logs" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              {extraction?.title || article.title || article.original_filename}
            </h1>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              {extraction?.authors && extraction.authors.length > 0 && (
                <span>✍️ {extraction.authors.join(", ")}</span>
              )}
              {extraction?.year && <span>📅 {extraction.year}</span>}
              {extraction?.venue && <span>🏛️ {extraction.venue}</span>}
              <span className={`status-badge status-${article.status}`}>
                {article.status.replace("_", " ")}
              </span>
              {article.needs_review && (
                <span className="status-badge status-needs_review">
                  Needs Review
                </span>
              )}
            </div>
            {extraction?.tags && extraction.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {extraction.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReprocess}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              🔄 Reprocess
            </button>
          </div>
        </div>

        {polling && (
          <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent" />
            Processing... The page will update automatically.
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "border-primary-500 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Reader Tab */}
        {activeTab === "reader" && (
          <div>
            {markdown ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {markdown}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                {article.status === "uploaded" || article.status === "parsing"
                  ? "Markdown is being generated..."
                  : "No Markdown available"}
              </div>
            )}
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div className="space-y-6">
            {!extraction ? (
              <p className="text-gray-500">
                No extraction data available yet.
                {article.status === "uploaded" ||
                article.status === "parsing" ||
                article.status === "extracting"
                  ? " Still processing..."
                  : ""}
              </p>
            ) : (
              <>
                {extraction.abstract && (
                  <Section title="Abstract">{extraction.abstract}</Section>
                )}
                {extraction.background && (
                  <Section title="Background">{extraction.background}</Section>
                )}
                {extraction.research_problem && (
                  <Section title="Research Problem">
                    {extraction.research_problem}
                  </Section>
                )}
                {extraction.methodology && (
                  <Section title="Methodology">
                    {extraction.methodology}
                  </Section>
                )}
                {extraction.datasets && extraction.datasets.length > 0 && (
                  <Section title="Datasets">
                    <ul className="list-disc list-inside">
                      {extraction.datasets.map((ds, i) => (
                        <li key={i}>{ds}</li>
                      ))}
                    </ul>
                  </Section>
                )}
                {extraction.experiments && extraction.experiments.length > 0 && (
                  <Section title="Experiments">
                    <ul className="list-disc list-inside">
                      {extraction.experiments.map((exp, i) => (
                        <li key={i}>{exp}</li>
                      ))}
                    </ul>
                  </Section>
                )}
                {extraction.results && (
                  <Section title="Results">{extraction.results}</Section>
                )}
                {extraction.limitations && (
                  <Section title="Limitations">
                    {extraction.limitations}
                  </Section>
                )}
                {extraction.future_work && (
                  <Section title="Future Work">
                    {extraction.future_work}
                  </Section>
                )}
                {extraction.key_claims && extraction.key_claims.length > 0 && (
                  <Section title="Key Claims">
                    <ul className="space-y-2">
                      {extraction.key_claims.map((claim, i) => (
                        <li key={i} className="border-l-2 border-primary-300 pl-3">
                          <p>{claim.claim}</p>
                          {claim.evidence?.snippet && (
                            <p className="text-xs text-gray-400 mt-1 italic">
                              &ldquo;{claim.evidence.snippet}&rdquo;
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            )}
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div>
            <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${
                    msg.role === "user"
                      ? "bg-primary-50 ml-8"
                      : "bg-gray-100 mr-8"
                  }`}
                >
                  <p className="text-xs text-gray-400 mb-1">
                    {msg.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      Sources:{" "}
                      {msg.citations.map((c, i) => (
                        <span key={i} className="mr-2">
                          [Chunk {c.chunk_id}
                          {c.section_title ? `, ${c.section_title}` : ""}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {chatAnswer && (
                <div className="p-3 rounded-lg bg-green-50 mr-8">
                  <p className="text-xs text-gray-400 mb-1">Assistant</p>
                  <p className="text-sm whitespace-pre-wrap">{chatAnswer}</p>
                  {chatCitations.length > 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      Sources:{" "}
                      {chatCitations.map((c, i) => (
                        <span key={i} className="mr-2">
                          [Chunk {c.chunk_id}
                          {c.section_title ? `, ${c.section_title}` : ""}
                          {c.page_start != null ? `, p.${c.page_start}` : ""}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {chatLoading && (
                <div className="p-3 rounded-lg bg-gray-100 mr-8 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent" />
                  <span className="text-sm text-gray-500">Thinking...</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Ask a question about this article..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={chatLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Graph Tab */}
        {activeTab === "graph" && (
          <div>
            {entities.length === 0 ? (
              <p className="text-gray-500">No graph data available yet.</p>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">
                    Entities ({entities.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2">Type</th>
                          <th className="text-left px-4 py-2">Name</th>
                          <th className="text-left px-4 py-2">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {entities.map((e) => (
                          <tr key={e.id}>
                            <td className="px-4 py-2">
                              <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-xs">
                                {e.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-medium">{e.name}</td>
                            <td className="px-4 py-2">
                              {(e.confidence * 100).toFixed(0)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {relationships.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">
                      Relationships ({relationships.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-2">Type</th>
                            <th className="text-left px-4 py-2">Source</th>
                            <th className="text-left px-4 py-2">Target</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {relationships.map((r) => {
                            const src = entities.find(
                              (e) => e.id === r.source_entity_id
                            );
                            const tgt = entities.find(
                              (e) => e.id === r.target_entity_id
                            );
                            return (
                              <tr key={r.id}>
                                <td className="px-4 py-2">
                                  <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                    {r.type}
                                  </span>
                                </td>
                                <td className="px-4 py-2">
                                  {src?.name || `ID ${r.source_entity_id}`}
                                </td>
                                <td className="px-4 py-2">
                                  {tgt?.name || `ID ${r.target_entity_id}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Metadata Tab */}
        {activeTab === "metadata" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Article Info</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-gray-500">ID</dt>
                <dd>{article.id}</dd>
                <dt className="text-gray-500">Filename</dt>
                <dd>{article.original_filename}</dd>
                <dt className="text-gray-500">Source Type</dt>
                <dd>{article.source_type}</dd>
                <dt className="text-gray-500">File Hash</dt>
                <dd className="font-mono text-xs truncate">
                  {article.file_hash || "N/A"}
                </dd>
                <dt className="text-gray-500">Created</dt>
                <dd>{new Date(article.created_at).toLocaleString()}</dd>
                <dt className="text-gray-500">Updated</dt>
                <dd>{new Date(article.updated_at).toLocaleString()}</dd>
                <dt className="text-gray-500">Needs Review</dt>
                <dd>{article.needs_review ? "Yes" : "No"}</dd>
              </dl>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Export</h3>
              <div className="flex gap-2">
                <a
                  href={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/articles/${articleId}/export/json`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                >
                  Export JSON
                </a>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/articles/${articleId}/export/markdown`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                >
                  Export Markdown
                </a>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/articles/${articleId}/export/bibtex`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800"
                >
                  Export BibTeX
                </a>
              </div>
            </div>

            {skills.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <button
                      key={skill.name}
                      onClick={() => handleRunSkill(skill.name)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
                    >
                      {skill.purpose}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {extraction && (
              <div>
                <h3 className="font-semibold mb-2">Raw Extraction</h3>
                <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-x-auto max-h-96 overflow-y-auto">
                  {JSON.stringify(extraction, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === "logs" && (
          <div>
            {jobs.length === 0 ? (
              <p className="text-gray-500">No processing jobs found.</p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span
                        className={`status-badge ${
                          job.status === "completed"
                            ? "status-completed"
                            : job.status === "failed"
                              ? "status-failed"
                              : "status-extracting"
                        }`}
                      >
                        {job.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(job.created_at).toLocaleString()}
                      </span>
                    </div>
                    {job.error && (
                      <div className="bg-red-50 border border-red-200 rounded p-3 mb-2 text-sm text-red-700">
                        {job.error}
                      </div>
                    )}
                    {job.logs && job.logs.length > 0 && (
                      <div className="space-y-1 text-sm">
                        {job.logs.map((log, i) => (
                          <div
                            key={i}
                            className={`flex gap-3 ${
                              (log as Record<string, unknown>).error
                                ? "text-red-600"
                                : "text-gray-600"
                            }`}
                          >
                            <span className="text-gray-400 shrink-0">
                              {(log as Record<string, unknown>).step as string}
                            </span>
                            <span>
                              {(log as Record<string, unknown>).message as string}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <div className="text-sm text-gray-700 whitespace-pre-wrap">{children}</div>
    </div>
  );
}
