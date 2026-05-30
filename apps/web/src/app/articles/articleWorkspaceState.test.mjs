import assert from "node:assert/strict";
import test from "node:test";

import {
  createCitationReaderTarget,
  shouldUseWorkspaceSplit,
} from "./articleWorkspaceState.mjs";

test("citation target prefers a stable chunk anchor", () => {
  assert.deepEqual(
    createCitationReaderTarget({
      article_id: 12,
      article_title: "A Study",
      chunk_id: 4,
      section_title: "Findings",
      page_start: 8,
    }),
    {
      anchorId: "chunk-4",
      label: "Findings",
      meta: "A Study, p.8",
    }
  );
});

test("citation target falls back to a section anchor when chunk id is missing", () => {
  assert.deepEqual(
    createCitationReaderTarget({
      section_title: "Related Work & Methods",
    }),
    {
      anchorId: "related-work-methods",
      label: "Related Work & Methods",
      meta: "",
    }
  );
});

test("article workspace split remains desktop-only", () => {
  assert.equal(shouldUseWorkspaceSplit(1280), true);
  assert.equal(shouldUseWorkspaceSplit(760), false);
});
