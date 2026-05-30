// ── Article types ────────────────────────────────────────────────

export interface ArticleSummary {
  id: number;
  title: string;
  status: string;
  original_filename: string;
  source_type: string;
  created_at: string;
  updated_at: string;
  needs_review: boolean;
}

export interface ArticleDetail {
  id: number;
  title: string;
  status: string;
  original_filename: string;
  source_type: string;
  file_hash: string | null;
  created_at: string;
  updated_at: string;
  processing_error: string | null;
  needs_review: boolean;
  is_archived: number;
}

export interface ArticleListResponse {
  articles: ArticleSummary[];
  total: number;
}

export interface UploadResponse {
  article_id: number;
  job_id: number;
  filename: string;
  status: string;
}

export interface UrlImportResponse {
  article_id: number;
  job_id: number;
  filename: string;
  source_type: string;
  url: string;
}

// ── Extraction types ─────────────────────────────────────────────

export interface Evidence {
  source_section?: string | null;
  page_number?: number | null;
  chunk_id?: number | null;
  snippet?: string | null;
}

export interface KeyClaim {
  claim: string;
  evidence?: Evidence | null;
  confidence?: number | null;
}

export interface Reference {
  title?: string | null;
  authors?: string | null;
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  url?: string | null;
  citation_text?: string | null;
}

export interface GraphEntityItem {
  type: string;
  name: string;
  canonical_name?: string | null;
  properties?: Record<string, unknown> | null;
  evidence?: Evidence | null;
  confidence?: number | null;
}

export interface GraphRelationshipItem {
  source_name: string;
  source_type: string;
  target_name: string;
  target_type: string;
  type: string;
  properties?: Record<string, unknown> | null;
  evidence?: Evidence | null;
  confidence?: number | null;
}

export interface ExtractionResult {
  title?: string | null;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  arxiv_id?: string | null;
  url?: string | null;
  abstract?: string | null;
  background?: string | null;
  research_problem?: string | null;
  methodology?: string | null;
  datasets?: string[];
  experiments?: string[];
  metrics?: string[];
  results?: string | null;
  limitations?: string | null;
  future_work?: string | null;
  key_claims?: KeyClaim[];
  references?: Reference[];
  tags?: string[];
  graph_entities?: GraphEntityItem[];
  graph_relationships?: GraphRelationshipItem[];
}

export interface ExtractionResponse {
  article_id: number;
  schema_version: string;
  extraction: ExtractionResult | null;
  validation_errors: string[] | null;
  confidence: number;
  created_at: string | null;
}

// ── Graph types ───────────────────────────────────────────────────

export interface GraphEntity {
  id: number;
  article_id: number;
  type: string;
  name: string;
  canonical_name: string | null;
  properties: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  confidence: number;
}

export interface GraphRelationship {
  id: number;
  article_id: number;
  source_entity_id: number;
  target_entity_id: number;
  type: string;
  properties: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  confidence: number;
}

export interface GraphResponse {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

// ── Chat types ────────────────────────────────────────────────────

export interface Citation {
  article_id?: number | null;
  article_title?: string | null;
  chunk_id: number;
  section_title?: string | null;
  page_start?: number | null;
  page_end?: number | null;
  snippet?: string | null;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  message_id: number;
  created_at: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface ChatMessageResponse {
  id: number;
  role: string;
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

export interface ChatHistoryResponse {
  article_id: number;
  messages: ChatMessageResponse[];
}

export interface MultiArticleChatResponse {
  answer: string;
  citations: Citation[];
  prompt_tokens: number;
  completion_tokens: number;
  article_ids: number[];
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface SessionMessageResponse {
  answer: string;
  citations: Citation[];
  prompt_tokens: number;
  completion_tokens: number;
  session_id: number;
}

// ── Job types ─────────────────────────────────────────────────────

export interface JobResponse {
  id: number;
  article_id: number;
  status: string;
  current_step: string | null;
  logs: Record<string, unknown>[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface JobQueueItem {
  job_id: number;
  article_id: number;
  article_title: string;
  status: string;
  queue_state: "active" | "queued" | "failed" | "completed";
  current_step: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  locked_at: string | null;
  worker_id: string | null;
  age_seconds: number;
  can_retry: boolean;
}

export interface JobQueueResponse {
  jobs: JobQueueItem[];
  counts: Record<"active" | "queued" | "failed" | "completed", number>;
}

// ── Skill types ───────────────────────────────────────────────────

export interface SkillDef {
  name: string;
  purpose: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

// ── Dashboard types ──────────────────────────────────────────────

export interface DashboardMetrics {
  total_articles: number;
  total_completed: number;
  total_failed: number;
  total_processing: number;
  articles_by_day: { date: string; count: number }[];
  articles_by_status: { status: string; count: number }[];
  total_chat_messages: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  token_usage_by_model: {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    message_count: number;
  }[];
  cost_by_model: {
    model: string;
    provider: string;
    cost: number;
  }[];
  top_articles_by_tokens: {
    article_id: number;
    title: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }[];
  total_graph_entities: number;
  total_graph_relationships: number;
  articles_with_graph: number;
  avg_processing_seconds: number;
}

export interface GlobalGraphData {
  entities: {
    id: number;
    article_id: number;
    article_title: string;
    type: string;
    name: string;
    canonical_name: string | null;
    confidence: number;
  }[];
  relationships: {
    id: number;
    article_id: number;
    article_title: string;
    source_entity_id: number;
    target_entity_id: number;
    type: string;
    confidence: number;
  }[];
}

// ── Logs ───────────────────────────────────────────────────

export interface TokenUsageLog {
  id: number;
  step: string;
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string | null;
}

export interface JobLog {
  id: number;
  status: string;
  current_step: string | null;
  logs: { step: string; timestamp: string; message: string; error?: boolean }[];
  error: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface ArticleLogs {
  article_id: number;
  title: string;
  status: string;
  jobs: JobLog[];
  token_usage: TokenUsageLog[];
}

// ── Related Articles ──────────────────────────────────────────

export interface RelatedArticle {
  id: number;
  title: string;
  status: string;
  source_type: string;
  similarity: number;
  shared_entities: string[];
}

export interface RelatedArticlesResponse {
  article_id: number;
  related: RelatedArticle[];
}

// ── Health ──────────────────────────────────────────────────

export interface HealthInfo {
  status: string;
  version: string;
  mock_ai: boolean;
  llm_provider: string;
  llm_model: string;
  llm_custom_protocol?: string | null;
}

// ── Parsers ──────────────────────────────────────────────────

export interface ParserInfo {
  key: string;
  name: string;
  installed: boolean;
  version?: string | null;
  description: string;
  install_cmd?: string | null;
}

// ── Providers ─────────────────────────────────────────────────

export interface ProviderEntry {
  id: string;
  name: string;
  type: string;
  api_key: string;  // masked in responses
  base_url: string;
  model: string;
  protocol: string;
}

export interface DevConfig {
  temperature: number;
  top_p: number;
  max_tokens: number;
  frequency_penalty: number;
  presence_penalty: number;
  system_messages: Record<string, { content: string }>;
  input_templates: Record<string, { template: string; description: string }>;
  providers: ProviderEntry[];
  active_provider_id: string | null;
}
