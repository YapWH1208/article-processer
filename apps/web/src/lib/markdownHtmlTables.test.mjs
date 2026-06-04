import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { normalizeHtmlTablesForMarkdown } from "./markdownHtmlTables.mjs";

const rendererOptions = {
  remarkPlugins: [remarkGfm, remarkMath],
  rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
};

function renderMarkdown(markdown) {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, {
      ...rendererOptions,
      children: normalizeHtmlTablesForMarkdown(markdown),
    })
  );
}

test("raw HTML tables render through the markdown table pipeline", () => {
  const markdown =
    "<table><tr><td></td><td>Baseline</td><td>w/ SWA</td></tr><tr><td>General Benchmarks</td><td></td><td></td></tr><tr><td>AIME 2025</td><td>86.7</td><td>86.7</td></tr><tr><td> $\\tau ^ { 2 } .$ Bench retail</td><td>62.3</td><td>67.5</td></tr></table>";

  const html = renderMarkdown(markdown);

  assert.match(html, /<table>/);
  assert.match(html, /<th>Baseline<\/th>/);
  assert.match(html, /<td>AIME 2025<\/td>/);
  assert.match(html, /Bench retail/);
  assert.doesNotMatch(html, /&lt;table&gt;/);
});

test("non-table raw HTML remains escaped by react-markdown", () => {
  const html = renderMarkdown("<script>alert(1)</script>");

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("raw HTML tables inside fenced code blocks are not normalized", () => {
  const markdown = "```html\n<table><tr><td>Code</td></tr></table>\n```";

  assert.equal(normalizeHtmlTablesForMarkdown(markdown), markdown);
});

test("markdown media stays contained in renderer boxes", async () => {
  const chatSource = await readFile(new URL("../app/chat/page.tsx", import.meta.url), "utf8");
  const articleSource = await readFile(new URL("../app/articles/[id]/page.tsx", import.meta.url), "utf8");
  const scrollAreaSource = await readFile(new URL("../components/ui/scroll-area.tsx", import.meta.url), "utf8");

  for (const source of [chatSource, articleSource]) {
    assert.match(source, /min-w-0/);
    assert.match(source, /block w-full min-w-0 max-w-full overflow-x-auto/);
    assert.match(source, /w-max min-w-full border-collapse/);
    assert.match(source, /block w-full max-w-full text-center/);
    assert.match(source, /prose[^\n"]*w-full[^\n"]*overflow-x-auto/);
    assert.match(source, /max-h-\[[^\]]+\]/);
    assert.match(source, /h-auto/);
    assert.match(source, /w-auto/);
    assert.match(source, /max-w-full/);
    assert.match(source, /object-contain/);
    assert.doesNotMatch(source, /prose[^\n"]*overflow-hidden/);
  }

  assert.match(scrollAreaSource, /<ScrollBar orientation="horizontal" \/>/);
});
