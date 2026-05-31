const DEFAULT_STATE = {
  search: "",
  searchContent: "",
  statusFilter: "all",
  includeArchived: false,
  page: 1,
  sortBy: "created_at",
  sortOrder: "desc",
};

const ALLOWED_SORTS = new Set(["created_at", "title", "status", "updated_at"]);
const ALLOWED_ORDERS = new Set(["asc", "desc"]);
const ALLOWED_STATUSES = new Set([
  "all",
  "completed",
  "uploaded",
  "parsing",
  "extracting",
  "indexing",
  "needs_review",
  "failed",
]);

function readString(params, key) {
  return (params.get(key) || "").trim();
}

function readPositivePage(params) {
  const page = Number(params.get("page") || DEFAULT_STATE.page);
  return Number.isInteger(page) && page > 0 ? page : DEFAULT_STATE.page;
}

export function parseArticleListQuery(params) {
  const statusFilter = readString(params, "status") || DEFAULT_STATE.statusFilter;
  const sortBy = readString(params, "sort");
  const sortOrder = readString(params, "order");

  return {
    search: readString(params, "search"),
    searchContent: readString(params, "q"),
    statusFilter: ALLOWED_STATUSES.has(statusFilter) ? statusFilter : DEFAULT_STATE.statusFilter,
    includeArchived: ["1", "true", "yes"].includes(readString(params, "archived").toLowerCase()),
    page: readPositivePage(params),
    sortBy: ALLOWED_SORTS.has(sortBy) ? sortBy : DEFAULT_STATE.sortBy,
    sortOrder: ALLOWED_ORDERS.has(sortOrder) ? sortOrder : DEFAULT_STATE.sortOrder,
  };
}

export function serializeArticleListQuery(state) {
  const params = new URLSearchParams();
  if (state.search) params.set("search", state.search);
  if (state.searchContent) params.set("q", state.searchContent);
  if (state.statusFilter && state.statusFilter !== DEFAULT_STATE.statusFilter) {
    params.set("status", state.statusFilter);
  }
  if (state.includeArchived) params.set("archived", "1");
  if (state.page && state.page !== DEFAULT_STATE.page) params.set("page", String(state.page));
  if (state.sortBy && state.sortBy !== DEFAULT_STATE.sortBy) params.set("sort", state.sortBy);
  if (state.sortOrder && state.sortOrder !== DEFAULT_STATE.sortOrder) params.set("order", state.sortOrder);
  return params.toString();
}

export function createArticleExportDownload(payload, date = new Date()) {
  return {
    filename: `articles-export-${date.toISOString().slice(0, 10)}.json`,
    content: JSON.stringify(payload, null, 2),
    count: Number(payload?.count ?? payload?.articles?.length ?? 0),
  };
}
