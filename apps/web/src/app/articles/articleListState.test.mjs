import assert from "node:assert/strict";
import test from "node:test";

import {
  createArticleExportDownload,
  parseArticleListQuery,
  serializeArticleListQuery,
} from "./articleListState.mjs";

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

test("article export download uses a stable dated filename and pretty JSON", () => {
  const download = createArticleExportDownload(
    { count: 2, articles: [{ id: 1 }, { id: 2 }] },
    new Date("2026-05-31T10:00:00Z")
  );

  assert.equal(download.filename, "articles-export-2026-05-31.json");
  assert.equal(download.count, 2);
  assert.equal(download.content, '{\n  "count": 2,\n  "articles": [\n    {\n      "id": 1\n    },\n    {\n      "id": 2\n    }\n  ]\n}');
});
