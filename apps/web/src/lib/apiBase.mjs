export const DEFAULT_API_BASE_URL = "http://localhost:8000";

function normalizeApiBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\/+$/, "");
}

export function resolveApiBaseUrl(options = {}) {
  const envApiBaseUrl =
    options.envApiBaseUrl ??
    (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API_BASE_URL : undefined);
  const runtimeConfig =
    options.runtimeConfig ??
    (typeof globalThis !== "undefined" ? globalThis.__ARTICLE_PROCESSOR_CONFIG__ : undefined);

  return (
    normalizeApiBaseUrl(envApiBaseUrl) ||
    normalizeApiBaseUrl(runtimeConfig?.apiBaseUrl) ||
    DEFAULT_API_BASE_URL
  );
}
