export function slugifyWorkspaceText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function createCitationReaderTarget(citation) {
  const label = citation?.section_title || `Chunk ${citation?.chunk_id ?? ""}`.trim();
  const anchorId =
    citation?.chunk_id != null
      ? `chunk-${citation.chunk_id}`
      : slugifyWorkspaceText(citation?.section_title);

  const metaParts = [];
  if (citation?.article_title) metaParts.push(citation.article_title);
  if (citation?.page_start) {
    const page =
      citation.page_end && citation.page_end !== citation.page_start
        ? `p.${citation.page_start}-${citation.page_end}`
        : `p.${citation.page_start}`;
    metaParts.push(page);
  }

  return {
    anchorId,
    label: label || "Source",
    meta: metaParts.join(", "),
  };
}

export function shouldUseWorkspaceSplit(width) {
  return Number(width) >= 1024;
}
