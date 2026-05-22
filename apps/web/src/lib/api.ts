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

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<import("./types").UploadResponse>("/uploads", {
    method: "POST",
    body: formData,
  });
}

// ── Articles ──────────────────────────────────────────────────────

export async function listArticles(params?: {
  status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.skip != null) searchParams.set("skip", String(params.skip));
  if (params?.limit != null) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  return apiFetch<import("./types").ArticleListResponse>(
    `/articles${qs ? `?${qs}` : ""}`
  );
}

export async function getArticle(id: number) {
  return apiFetch<import("./types").ArticleDetail>(`/articles/${id}`);
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

export async function reprocessArticle(id: number) {
  return apiFetch<{ article_id: number; job_id: number; status: string }>(
    `/articles/${id}/reprocess`,
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

export async function getChatHistory(articleId: number) {
  return apiFetch<import("./types").ChatHistoryResponse>(
    `/articles/${articleId}/chat`
  );
}

// ── Export ────────────────────────────────────────────────────────

export function getExportJsonUrl(articleId: number): string {
  return `${API_BASE}/articles/${articleId}/export/json`;
}

export function getExportMarkdownUrl(articleId: number): string {
  return `${API_BASE}/articles/${articleId}/export/markdown`;
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

// ── Health ────────────────────────────────────────────────────────

export async function healthCheck() {
  return apiFetch<{ status: string; version: string; mock_ai: boolean }>(
    "/health"
  );
}
