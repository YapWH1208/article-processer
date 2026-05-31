import assert from "node:assert/strict";
import test from "node:test";

import { parseArticleListQuery, serializeArticleListQuery } from "./articleListState.mjs";

test("article list query state round-trips active filters and paging", () => {
  const state = parseArticleListQuery(
    new URLSearchParams("search=transformer&q=attention&status=failed&archived=1&page=3&sort=title&order=asc")
  );

  assert.deepEqual(state, {
    search: "transformer",
    searchContent: "attention",
    statusFilter: "failed",
    includeArchived: true,
    page: 3,
    sortBy: "title",
    sortOrder: "asc",
  });

  assert.equal(
    serializeArticleListQuery(state),
    "search=transformer&q=attention&status=failed&archived=1&page=3&sort=title&order=asc"
  );
});

test("article list query state normalizes invalid and default values", () => {
  const state = parseArticleListQuery(
    new URLSearchParams("status=unknown&archived=false&page=-2&sort=unknown&order=sideways")
  );

  assert.deepEqual(state, {
    search: "",
    searchContent: "",
    statusFilter: "all",
    includeArchived: false,
    page: 1,
    sortBy: "created_at",
    sortOrder: "desc",
  });
  assert.equal(serializeArticleListQuery(state), "");
});
