export function formatExtractionForReview(extraction) {
  return JSON.stringify(extraction || {}, null, 2);
}

export function parseReviewedExtraction(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}
