import assert from "node:assert/strict";
import test from "node:test";

import {
  formatExtractionForReview,
  parseReviewedExtraction,
} from "./extractionReviewState.mjs";

test("formats extraction JSON for review editing", () => {
  assert.equal(
    formatExtractionForReview({ title: "Paper", tags: ["review"] }),
    '{\n  "title": "Paper",\n  "tags": [\n    "review"\n  ]\n}'
  );
});

test("parses reviewed extraction JSON and reports invalid input", () => {
  assert.deepEqual(parseReviewedExtraction('{"title":"Paper"}'), {
    ok: true,
    value: { title: "Paper" },
  });

  const invalid = parseReviewedExtraction("{bad json");
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /JSON/);
});
