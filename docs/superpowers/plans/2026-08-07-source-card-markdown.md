# Markdown Rendering in Source Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the snippet in chat source cards (📎 Sources) through the same markdown pipeline as the answer bubbles.

**Architecture:** Extract the ReactMarkdown config + styled components currently inline in `chat/page.tsx`'s `MessageBubble` into a shared `ChatMarkdown` component used by both the answer bubble and each citation card's snippet. Snippets keep their quote marks and 2-line clamp.

**Tech Stack:** React 18, react-markdown v9, remark-gfm, remark-math, rehype-katex, Tailwind, Node's built-in test runner (`.test.mjs`).

## Global Constraints

- Snippet is untrusted article text — no `rehypeRaw`, no `dangerouslySetInnerHTML` (existing test `markdownHtmlTables.test.mjs` asserts script tags stay escaped).
- Apply `normalizeHtmlTablesForMarkdown` inside the shared component so both call sites get HTML-table support.
- Work from `apps/web/` for all commands. Verify with `npm test`, `npx tsc --noEmit`, `npm run build`.
- Run `code-review-graph` per AGENTS.md before editing; commit after each task (no amends).

---

### Task 1: Create shared `ChatMarkdown` component

**Files:**
- Create: `apps/web/src/components/chat-markdown.tsx`
- Create: `apps/web/src/components/chat-markdown.test.mjs`
- Modify: none yet (page still uses its inline config — stays green)

**Interfaces:**
- Consumes: `normalizeHtmlTablesForMarkdown(text: string): string` from `@/lib/markdownHtmlTables.mjs`
- Produces: `ChatMarkdown` — default export, `React.memo`-wrapped, props `{ children: string }`. Renders the snippet/answer through the same ReactMarkdown pipeline.

- [x] **Step 1: Write the failing test**

Create `apps/web/src/components/chat-markdown.test.mjs` (source-assertion pattern — `node:test` cannot import `.tsx`, so follow the existing `markdownHtmlTables.test.mjs` convention of reading file source):

```js
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test src/components/chat-markdown.test.mjs`
Expected: FAIL with `ENOENT` (component file doesn't exist).

- [x] **Step 3: Write the component**

Create `apps/web/src/components/chat-markdown.tsx` — move the config and components verbatim from `chat/page.tsx:115-142`:

```tsx
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { normalizeHtmlTablesForMarkdown } from "@/lib/markdownHtmlTables.mjs";

const components: any = {
  h1: ({ children, ...props }: any) => <h1 className="text-xl font-bold mt-5 mb-2 border-b pb-0.5" {...props}>{children}</h1>,
  h2: ({ children, ...props }: any) => <h2 className="text-lg font-bold mt-4 mb-1.5 border-b pb-0.5" {...props}>{children}</h2>,
  h3: ({ children, ...props }: any) => <h3 className="text-base font-semibold mt-3 mb-1" {...props}>{children}</h3>,
  h4: ({ children, ...props }: any) => <h4 className="text-sm font-semibold mt-2 mb-1" {...props}>{children}</h4>,
  h5: ({ children, ...props }: any) => <h5 className="text-xs font-semibold mt-2 mb-0.5" {...props}>{children}</h5>,
  h6: ({ children, ...props }: any) => <h6 className="text-[11px] font-semibold mt-2 mb-0.5 uppercase tracking-wide" {...props}>{children}</h6>,
  img: ({ src, alt, ...props }: any) => (
    <span className="my-3 mx-auto block w-[calc(100%-0.5rem)] max-w-[calc(100%-0.5rem)] text-center">
      <img {...props} src={src} alt={alt} className="inline-block h-auto max-h-[50vh] w-auto max-w-full rounded-lg object-contain align-middle" />
    </span>
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-3 mx-auto block w-[calc(100%-0.5rem)] min-w-0 max-w-[calc(100%-0.5rem)] rounded-md border font-sans">
      <table {...props} className="w-full max-w-full table-fixed border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: any) => <thead className="bg-muted/70" {...props}>{children}</thead>,
  tr: ({ children, ...props }: any) => <tr className="border-b last:border-b-0" {...props}>{children}</tr>,
  th: ({ children, ...props }: any) => <th className="border-r px-3 py-2 text-left align-top font-semibold [overflow-wrap:anywhere] break-words whitespace-normal last:border-r-0" {...props}>{children}</th>,
  td: ({ children, ...props }: any) => <td className="border-r px-3 py-2 align-top [overflow-wrap:anywhere] break-words whitespace-normal last:border-r-0" {...props}>{children}</td>,
};

function ChatMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
      components={components}
    >
      {normalizeHtmlTablesForMarkdown(String(children || ""))}
    </ReactMarkdown>
  );
}

export default memo(ChatMarkdown);
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test src/components/chat-markdown.test.mjs`
Expected: PASS (3 tests). Then run `npm test` — the full suite must still pass (page untouched).

- [x] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/components/chat-markdown.tsx apps/web/src/components/chat-markdown.test.mjs
git commit -m "feat(web): extract shared ChatMarkdown renderer component"
```

---

### Task 2: Refactor answer bubble to use `ChatMarkdown`

**Files:**
- Modify: `apps/web/src/app/chat/page.tsx:1-10` (imports), `:100`, `:115-142`
- Modify: `apps/web/src/lib/markdownHtmlTables.test.mjs:53-75`

**Interfaces:**
- Consumes: `ChatMarkdown` default export from `@/components/chat-markdown`
- Produces: nothing new — `MessageBubble` renders identically to before.

- [x] **Step 1: Update the media-containment test to target the new component**

In `apps/web/src/lib/markdownHtmlTables.test.mjs`, the test `"markdown media stays contained in renderer boxes"` currently asserts component-level class strings against `chatSource`. Replace it so:

- `chatSource` (page) keeps only page-level assertions: `/min-w-0/`, `/prose[^\n"]*w-full[^\n"]*\[overflow-wrap:anywhere\]/`, `/max-w-full/`, `assert.doesNotMatch(source, /overflow-x-auto/)`, `assert.doesNotMatch(source, /prose[^\n"]*overflow-hidden/)`.
- `chatMarkdownSource` (new file `../components/chat-markdown.tsx`) gets the component-level assertions currently on `chatSource`: table wrapper, `table-fixed border-collapse`, img wrapper, `max-h-\[[^\]]+\]`, `h-auto`, `w-auto`, `max-w-full`, `object-contain`, `\[overflow-wrap:anywhere\] break-words whitespace-normal`.
- `articleSource` keeps all its current assertions unchanged (article page is not refactored).

```js
test("markdown media stays contained in renderer boxes", async () => {
  const chatSource = await readFile(new URL("../app/chat/page.tsx", import.meta.url), "utf8");
  const chatMarkdownSource = await readFile(new URL("../components/chat-markdown.tsx", import.meta.url), "utf8");
  const articleSource = await readFile(new URL("../app/articles/[id]/page.tsx", import.meta.url), "utf8");
  const scrollAreaSource = await readFile(new URL("../components/ui/scroll-area.tsx", import.meta.url), "utf8");

  assert.match(articleSource, /<ScrollArea className="h-full w-full min-w-0 max-w-full">/);
  assert.match(articleSource, /className="relative w-full min-w-0 max-w-full"/);

  for (const source of [chatSource, articleSource]) {
    assert.match(source, /min-w-0/);
    assert.match(source, /prose[^\n"]*w-full[^\n"]*\[overflow-wrap:anywhere\]/);
    assert.match(source, /max-w-full/);
    assert.doesNotMatch(source, /overflow-x-auto/);
    assert.doesNotMatch(source, /prose[^\n"]*overflow-hidden/);
  }

  for (const source of [chatMarkdownSource, articleSource]) {
    assert.match(source, /mx-auto block w-\[calc\(100%-0\.5rem\)\] min-w-0 max-w-\[calc\(100%-0\.5rem\)\] rounded-md border/);
    assert.match(source, /w-full max-w-full table-fixed border-collapse/);
    assert.match(source, /mx-auto block w-\[calc\(100%-0\.5rem\)\] max-w-\[calc\(100%-0\.5rem\)\] text-center/);
    assert.match(source, /max-h-\[[^\]]+\]/);
    assert.match(source, /h-auto/);
    assert.match(source, /w-auto/);
    assert.match(source, /max-w-full/);
    assert.match(source, /object-contain/);
    assert.match(source, /\[overflow-wrap:anywhere\] break-words whitespace-normal/);
  }

  assert.doesNotMatch(scrollAreaSource, /<ScrollBar orientation="horizontal" \/>/);
  assert.match(scrollAreaSource, /\[&>div\]:!block/);
  assert.match(scrollAreaSource, /\[&>div\]:!w-full/);
  assert.match(scrollAreaSource, /\[&>div\]:!min-w-0/);
  assert.match(scrollAreaSource, /\[&>div\]:!max-w-full/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test src/lib/markdownHtmlTables.test.mjs`
Expected: FAIL — `../components/chat-markdown.tsx` read fails with ENOENT at the new assertion loop.

- [x] **Step 3: Refactor the bubble imports and rendering**

In `apps/web/src/app/chat/page.tsx`:

1. Replace the markdown imports (lines 6-10) with:
```tsx
import ChatMarkdown from "@/components/chat-markdown";
```
2. Remove `import { normalizeHtmlTablesForMarkdown } from "@/lib/markdownHtmlTables.mjs";` (line 30) and the `renderedContent` `useMemo` (line 100); render raw content:
```tsx
<div className="prose prose-sm dark:prose-invert w-full min-w-0 max-w-full [overflow-wrap:anywhere] break-words">
  <ChatMarkdown>{msg.content}</ChatMarkdown>
</div>
```
3. Delete the entire inline `<ReactMarkdown>...</ReactMarkdown>` block (lines 115-142) and its `components` — now handled by `ChatMarkdown`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS, including the updated media-containment test.

- [x] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (no unused-import errors — `useMemo` is still used elsewhere in the file; verify with tsc output).

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/chat/page.tsx apps/web/src/lib/markdownHtmlTables.test.mjs
git commit -m "refactor(web): render chat answer via shared ChatMarkdown"
```

---

### Task 3: Render source-card snippets through `ChatMarkdown`

**Files:**
- Modify: `apps/web/src/app/chat/page.tsx:144-162` (source card block)
- Modify: `apps/web/src/components/chat-markdown.test.mjs` (add card assertions)

**Interfaces:**
- Consumes: `ChatMarkdown` (same as Task 2)
- Produces: source cards render `section_title` + markdown-formatted snippet, quoted, clamped to 2 lines.

- [x] **Step 1: Add failing test assertions for the card**

Append to `apps/web/src/components/chat-markdown.test.mjs`:

```js
test("chat source cards render snippets through ChatMarkdown with quotes and clamp", async () => {
  const page = await readFile(new URL("../app/chat/page.tsx", import.meta.url), "utf8");

  assert.match(page, /<ChatMarkdown>/);
  assert.match(page, /line-clamp-2/);
  assert.match(page, /&ldquo;/);
  assert.match(page, /&rdquo;/);
  assert.match(page, /replace\(\/\^\\\[\.\*\?\\\]\\s\*\/\s*, ""\)/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test src/components/chat-markdown.test.mjs`
Expected: FAIL — `chat/page.tsx` card still renders `cit.snippet` in a plain `<p>`, no `<ChatMarkdown>` in the card block.

- [x] **Step 3: Rewrite the source card**

Replace the snippet `<p>` block in `apps/web/src/app/chat/page.tsx` (lines 153-157):

```tsx
{cit.snippet && (
  <div className="mt-0.5 opacity-70 line-clamp-2 italic [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    &ldquo;<ChatMarkdown>{String(cit.snippet).replace(/^\[.*?\]\s*/, "")}</ChatMarkdown>&rdquo;
  </div>
)}
```

Note: `<div>` instead of `<p>` — ReactMarkdown emits block elements (e.g. `<p>`, `<ul>`) that cannot nest inside a `<p>`. `line-clamp-2` clamps rendered block content the same way. The `[&>*:first-child]:mt-0 [&>*:last-child]:mb-0` variants trim leading/trailing margins from the first/last rendered block so the card stays compact. The `[From ...]` prefix strip and quote marks are preserved.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [x] **Step 5: Full verification**

Run: `npx tsc --noEmit` then `npm run build`
Expected: no type errors; production build succeeds (CI-equivalent).

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/chat/page.tsx apps/web/src/components/chat-markdown.test.mjs
git commit -m "feat(web): render source card snippets as markdown"
```

---

### Task 4: Update changelog

**Files:**
- Modify: `CHANGELOG.md` (root)

Per AGENTS.md, the changelog is the version source of truth. Add a `### Changed` entry under the current `## [0.2.0]` section (or bump per project convention):

```markdown
- Render source card snippets in chat with full markdown (headings, lists, code, tables, math) alongside the answer bubbles.
```

- [x] **Step 1: Edit `CHANGELOG.md`**

Read the current section header/format first, then add the entry matching the existing bullet style.

- [x] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog for source card markdown rendering"
```

---

**Self-review notes (done):** Spec coverage — full markdown (Task 3), clamp+quotes kept (Task 3), shared component (Tasks 1-2), security (Task 1 test + no rehypeRaw), existing test kept green via updated targets (Task 2). Type consistency — `ChatMarkdown` props `{ children: string }` used identically in Tasks 2 and 3. No placeholders.
