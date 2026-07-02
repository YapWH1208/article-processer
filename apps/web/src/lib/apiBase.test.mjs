import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from "./apiBase.mjs";

test("API base URL defaults to local backend", () => {
  assert.equal(resolveApiBaseUrl(), DEFAULT_API_BASE_URL);
});

test("API base URL trims trailing slashes", () => {
  assert.equal(resolveApiBaseUrl({ envApiBaseUrl: "http://localhost:9000///" }), "http://localhost:9000");
});

test("explicit environment API base URL wins", () => {
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: "http://localhost:8001",
      runtimeConfig: { apiBaseUrl: "http://localhost:8002" },
    }),
    "http://localhost:8001"
  );
});

test("desktop runtime config is used when env is absent", () => {
  assert.equal(
    resolveApiBaseUrl({
      runtimeConfig: { apiBaseUrl: "http://127.0.0.1:4101/" },
    }),
    "http://127.0.0.1:4101"
  );
});

test("blank configured values fall back to default", () => {
  assert.equal(
    resolveApiBaseUrl({
      envApiBaseUrl: " ",
      runtimeConfig: { apiBaseUrl: "" },
    }),
    DEFAULT_API_BASE_URL
  );
});
