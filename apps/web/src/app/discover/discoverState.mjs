export const DISCOVER_PAGE_SIZE = 20;

export const REQUIRED_CONFERENCE_COLLECTIONS = [
  { key: "iclr_2026", label: "ICLR 2026", year: 2026 },
  { key: "chi_2026", label: "CHI 2026", year: 2026 },
  { key: "cvpr_2026", label: "CVPR 2026", year: 2026 },
  { key: "neurips_2025", label: "NeurIPS 2025", year: 2025 },
  { key: "icml_2025", label: "ICML 2025", year: 2025 },
];

const SEARCH_SCOPES = new Set(["title", "abstract", "keywords"]);

export function normalizeDiscoverSearch({ query = "", scope = "title", page = 1 } = {}) {
  return {
    query: String(query || "").trim().slice(0, 200),
    scope: SEARCH_SCOPES.has(scope) ? scope : "title",
    page: Math.max(1, Number.parseInt(page, 10) || 1),
  };
}

export function createDiscoverRequest({ query, scope, page } = {}) {
  const state = normalizeDiscoverSearch({ query, scope, page });
  return {
    ...state,
    offset: (state.page - 1) * DISCOVER_PAGE_SIZE,
    limit: DISCOVER_PAGE_SIZE,
  };
}

export function getDiscoverEmptyState({ mode = "collection", query = "" } = {}) {
  if (mode === "arxiv" && !String(query).trim()) {
    return { title: "Search arXiv", detail: "Enter a query to search the public arXiv catalogue." };
  }
  return {
    title: "No papers found",
    detail: "Try another query or search scope. Conference collections only show imported local snapshots.",
  };
}

export function canAnalyseCandidate(candidate) {
  if (!candidate?.pdf_url) return false;
  if (candidate.source_provider === "conference_catalog") return Number.isInteger(candidate.id);
  return candidate.source_provider === "arxiv" && Boolean(candidate.landing_url && candidate.source_external_id);
}

export function createArxivProvenance(candidate) {
  if (!candidate || candidate.source_provider !== "arxiv" || !candidate.landing_url) return null;
  return {
    source_provider: "arxiv",
    source_external_id: candidate.source_external_id,
    source_landing_url: candidate.landing_url,
    source_pdf_url: candidate.pdf_url || null,
    source_retrieved_at: candidate.source_retrieved_at || null,
    source_payload: {
      id: candidate.source_external_id,
      title: candidate.title,
      authors: Array.isArray(candidate.authors) ? candidate.authors : [],
      abstract: candidate.abstract || null,
      keywords: Array.isArray(candidate.keywords) ? candidate.keywords : [],
    },
    title: candidate.title,
    authors: Array.isArray(candidate.authors) ? candidate.authors : [],
    abstract: candidate.abstract || null,
    venue: candidate.venue || null,
  };
}

export function getSourceAccessRecovery(error) {
  if (!error || typeof error !== "object" || Number(error.status) !== 409) return null;
  const detail = error.detail;
  if (!detail || typeof detail !== "object" || detail.code !== "source_access_blocked") return null;
  const source = detail.source;
  if (!source || typeof source !== "object") return null;
  const landingUrl = typeof source.landing_url === "string" ? source.landing_url : null;
  const catalogPaperId = Number.isInteger(source.catalog_paper_id) ? source.catalog_paper_id : null;
  if (!landingUrl || !catalogPaperId) return null;
  return {
    message: typeof detail.message === "string" ? detail.message : "The source blocked automatic PDF download.",
    landingUrl,
    catalogPaperId,
  };
}
