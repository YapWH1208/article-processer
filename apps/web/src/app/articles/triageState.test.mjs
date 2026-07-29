import assert from "node:assert/strict";
import test from "node:test";

import {
  createTriageComparison,
  createTriageEvidenceTarget,
  getTriageWorkspaceState,
} from "./triageState.mjs";

test("Triage is the initial workspace tab only when a triage brief exists", () => {
  assert.equal(getTriageWorkspaceState({ triage: { verdict: { text: "Useful" } } }).defaultTab, "triage");
  assert.equal(getTriageWorkspaceState({ methodology: "Legacy extraction" }).defaultTab, "guide");
});

test("Triage evidence maps to the existing reader citation contract", () => {
  const target = createTriageEvidenceTarget({ source_section: "Results", chunk_id: 7, page_number: 4, snippet: "score improved" });
  assert.equal(target.available, true);
  assert.deepEqual(target.citation, {
    section_title: "Results", chunk_id: 7, page_start: 4, page_end: 4, snippet: "score improved",
  });
  assert.equal(createTriageEvidenceTarget(null).label, "Source unavailable");
  assert.equal(createTriageEvidenceTarget({ chunk_id: 7 }).available, false);
});

test("Triage comparison needs two unique related papers and preserves the current article", () => {
  assert.equal(createTriageComparison({ articleId: 1, selectedArticleIds: [2] }), null);
  const comparison = createTriageComparison({ articleId: 1, articleTitle: "Evidence", selectedArticleIds: [2, 2, 3, 1] });
  assert.deepEqual(comparison.articleIds, [1, 2, 3]);
  assert.match(comparison.prompt, /research task, method, results, and limitations/);
});
