import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ChatMarkdown component contains the full markdown pipeline", async () => {
  const src = await readFile(new URL("./chat-markdown.tsx", import.meta.url), "utf8");

  assert.match(src, /ReactMarkdown/);
  assert.match(src, /remarkGfm/);
  assert.match(src, /remarkMath/);
  assert.match(src, /rehypeKatex/);
  assert.match(src, /normalizeHtmlTablesForMarkdown/);
  assert.match(src, /memo\(/);
});

test("ChatMarkdown keeps untrusted content escaped", async () => {
  const src = await readFile(new URL("./chat-markdown.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(src, /rehypeRaw/);
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
});

test("ChatMarkdown carries the styled heading and media components", async () => {
  const src = await readFile(new URL("./chat-markdown.tsx", import.meta.url), "utf8");

  assert.match(src, /mx-auto block w-\[calc\(100%-0\.5rem\)\] min-w-0 max-w-\[calc\(100%-0\.5rem\)\] rounded-md border/);
  assert.match(src, /w-full max-w-full table-fixed border-collapse/);
  assert.match(src, /mx-auto block w-\[calc\(100%-0\.5rem\)\] max-w-\[calc\(100%-0\.5rem\)\] text-center/);
  assert.match(src, /max-h-\[50vh\]/);
  assert.match(src, /object-contain/);
  assert.match(src, /\[overflow-wrap:anywhere\] break-words whitespace-normal/);
  assert.match(src, /text-xl font-bold mt-5 mb-2 border-b pb-0\.5/);
});

test("chat source cards render snippets through ChatMarkdown with quotes and clamp", async () => {
  const page = await readFile(new URL("../app/chat/page.tsx", import.meta.url), "utf8");

  assert.match(page, /<ChatMarkdown compact>/);
  assert.match(page, /line-clamp-2/);
  assert.match(page, /\\u201C/);
  assert.match(page, /\\u201D/);
  assert.match(page, /stripCitationPrefix/);
  assert.match(page, /startsWithBlockElement/);
  assert.match(page, /hasVisibleCompactContent/);
  assert.match(page, /\[&>\*:first-child\]:mt-0 \[&>\*:last-child\]:mb-0/);
});

test("ChatMarkdown compact mode drops images and tables for clamped excerpts", async () => {
  const src = await readFile(new URL("./chat-markdown.tsx", import.meta.url), "utf8");

  assert.match(src, /compact/);
  assert.match(src, /img: \(\) => null/);
  assert.match(src, /table: \(\) => null/);
});

