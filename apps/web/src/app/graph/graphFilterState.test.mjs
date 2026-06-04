import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultSelectedGraphTypes } from "./graphFilterState.mjs";

test("graph filters default to keyword nodes only when keywords are present", () => {
  const selectedTypes = getDefaultSelectedGraphTypes([
    { type: "Author" },
    { type: "Keyword" },
    { type: "Method" },
    { type: "Keyword" },
  ]);

  assert.deepEqual([...selectedTypes], ["Keyword"]);
});

