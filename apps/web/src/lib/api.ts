// API client for the backend

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try {
      const json = JSON.parse(body);
      detail = json.detail || body;
    } catch {
      // use raw text
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }

  // Check if response is JSON
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }
  return res.text() as unknown as T;
}

// ── Uploads ───────────────────────────────────────────────────────

export async function uploadFile(file: File, runAi = true) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("run_ai", String(runAi));
  return apiFetch<import("./types").UploadResponse>("/uploads", {
    method: "POST",
    body: formData,
  });
}

// ── Articles ──────────────────────────────────────────────────────

export async function restoreArticle(id: number) {
  return apiFetch<{ article_id: number; restored: boolean }>(
    `/articles/${id}/restore`,
    { method: "POST" }
  );
}

export async function listArticles(params?: {
  status?: string;
  search?: string;
  search_content?: string;
  sort_by?: string;
  sort_order?: string;
  include_deleted?: boolean;
  skip?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.search_content) searchParams.set("search_content", params.search_content);
  if (params?.include_deleted) searchParams.set("include_deleted", "true");
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params?.skip != null) searchParams.set("skip", String(params.skip));
  if (params?.limit != null) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  return apiFetch<import("./types").ArticleListResponse>(
    `/articles${qs ? `?${qs}` : ""}`
  );
}

/** Shorthand for full-text content search across article bodies. */
export async function searchArticles(query: string, limit = 50) {
  return listArticles({ search_content: query, limit });
}

export async function getArticle(id: number) {
  return apiFetch<import("./types").ArticleDetail>(`/articles/${id}`);
}

export async function updateArticle(id: number, data: { title?: string }) {
  return apiFetch<import("./types").ArticleDetail>(`/articles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getArticleMarkdown(id: number) {
  return apiFetch<{ markdown: string }>(`/articles/${id}/markdown`);
}

export async function getArticleExtraction(id: number) {
  return apiFetch<import("./types").ExtractionResponse>(
    `/articles/${id}/extraction`
  );
}

export async function getArticleGraph(id: number) {
  return apiFetch<import("./types").GraphResponse>(`/articles/${id}/graph`);
}

export async function getArticleJobs(id: number) {
  return apiFetch<import("./types").JobResponse[]>(`/articles/${id}/jobs`);
}

export async function getArticleActiveJob(id: number) {
  return apiFetch<{ job: import("./types").JobResponse | null; article_status: string }>(
    `/articles/${id}/jobs/active`
  );
}

export async function reprocessArticle(id: number, mode: "full" | "parse_only" | "extract_only" = "full") {
  return apiFetch<{ article_id: number; job_id: number; status: string }>(
    `/articles/${id}/reprocess?mode=${mode}`,
    { method: "POST" }
  );
}

// ── Chat ──────────────────────────────────────────────────────────

export async function sendChatMessage(articleId: number, message: string) {
  return apiFetch<import("./types").ChatResponse>(
    `/articles/${articleId}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );
}

/** Stream a chat answer token-by-token. Calls `onToken` for each token, `onDone` when complete. */
export async function streamChatMessage(
  articleId: number,
  message: string,
  onToken: (token: string) => void,
  onDone: (fullAnswer: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  const url = `${API_BASE}/articles/${articleId}/chat/stream`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const body = await res.text();
      let detail = body;
      try { detail = JSON.parse(body).detail || body; } catch {}
      throw new Error(detail || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullAnswer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              fullAnswer += data.token;
              onToken(data.token);
            } else if (data.done) {
              onDone(data.answer || fullAnswer);
            } else if (data.error) {
              onError(data.error);
            }
          } catch {}
        }
      }
    }
    // Final flush
    if (buffer.startsWith("data: ")) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.done) onDone(data.answer || fullAnswer);
      } catch {}
    }
  } catch (e: unknown) {
    onError(e instanceof Error ? e.message : "Stream failed");
  }
}

export async function getChatHistory(articleId: number) {
  return apiFetch<import("./types").ChatHistoryResponse>(
    `/articles/${articleId}/chat`
  );
}

export async function sendMultiArticleChatMessage(articleIds: number[], message: string) {
  return apiFetch<import("./types").MultiArticleChatResponse>(
    "/articles/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_ids: articleIds, message }),
    }
  );
}

// ── Chat Sessions ─────────────────────────────────────────────────

export async function listSessions() {
  return apiFetch<{ sessions: import("./types").ChatSession[] }>("/articles/sessions");
}

export async function createSession(title?: string) {
  return apiFetch<import("./types").ChatSession>("/articles/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title || "New Chat" }),
  });
}

export async function deleteSession(sessionId: number) {
  return apiFetch<{ ok: boolean }>(`/articles/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function getSessionMessages(sessionId: number) {
  return apiFetch<import("./types").ChatHistoryResponse>(`/articles/sessions/${sessionId}`);
}

export async function sendSessionMessage(sessionId: number, message: string, articleIds: number[] = []) {
  return apiFetch<import("./types").SessionMessageResponse>(
    `/articles/sessions/${sessionId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, article_ids: articleIds }),
    }
  );
}

// ── Export ────────────────────────────────────────────────────────

export function getExportJsonUrl(articleId: number): string {
  return `${API_BASE}/articles/${articleId}/export/json`;
}

export function getExportMarkdownUrl(articleId: number): string {
  return `${API_BASE}/articles/${articleId}/export/markdown`;
}

export async function exportArticles(articleIds: number[]) {
  return apiFetch<{ articles: unknown[]; count: number }>("/articles/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ article_ids: articleIds }),
  });
}

export async function importArticles(articles: unknown[]) {
  return apiFetch<{ imported: number; skipped: number; errors: string[] }>("/imports/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articles }),
  });
}

// ── Skills ────────────────────────────────────────────────────────

export async function listSkills() {
  return apiFetch<{ skills: import("./types").SkillDef[] }>("/skills");
}

export async function runSkill(skillName: string, articleId: number) {
  return apiFetch<{ skill: string; article_id: number; result: unknown }>(
    `/skills/${skillName}/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: articleId }),
    }
  );
}

// ── Parsers ──────────────────────────────────────────────────────

export async function listParsers() {
  return apiFetch<import("./types").ParserInfo[]>("/settings/parsers");
}

// ── Dashboard ─────────────────────────────────────────────────────

export async function getDashboardMetrics(days = 30) {
  return apiFetch<import("./types").DashboardMetrics>(
    `/dashboard/metrics?days=${days}`
  );
}

// ── Global Graph ───────────────────────────────────────────────────

export async function getGlobalGraph(limit = 200) {
  return apiFetch<import("./types").GlobalGraphData>(
    `/articles/graph/global?limit=${limit}`
  );
}

// ── Logs ──────────────────────────────────────────────────────────

export async function getArticleLogs(articleId: number) {
  return apiFetch<import("./types").ArticleLogs>(
    `/articles/${articleId}/logs`
  );
}

// ── Dev / Providers ──────────────────────────────────────────────

export async function getDevConfig() {
  return apiFetch<import("./types").DevConfig>("/dev");
}

export async function setActiveProvider(providerId: string) {
  return apiFetch<{ active_provider_id: string }>("/dev/providers/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId }),
  });
}

// ── Health ────────────────────────────────────────────────────────

export async function healthCheck() {
  return apiFetch<import("./types").HealthInfo>(
    "/health"
  );
}
