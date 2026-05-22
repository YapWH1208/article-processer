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

// ── Skill types ───────────────────────────────────────────────────

export interface SkillDef {
  name: string;
  purpose: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}
