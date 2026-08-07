# Source Card Markdown Rendering — Design

**Date:** 2026-08-07
**Status:** Approved

## Summary

Render the snippet shown in chat source cards (📎 Sources under assistant messages) through the same markdown pipeline already used for chat answer bubbles.

## Background

In `apps/web/src/app/chat/page.tsx`, `MessageBubble` renders the assistant answer via an inline `ReactMarkdown` config (remark-gfm, remark-math, rehype-katex, custom heading/img/table components). The citations block below it renders each source card's `snippet` — the first 200 chars of raw article chunk text — as a plain, italicized, 2-line-clamped, quoted excerpt. Snippet text can contain markdown (headings, lists, code, tables), which currently displays raw.

## Design

1. **Shared component** — `apps/web/src/components/chat-markdown.tsx`: default-exported, `React.memo`-wrapped `ChatMarkdown({ children: string })` that owns the ReactMarkdown config, styled components (h1-h6, img, table/thead/tr/th/td), and the `normalizeHtmlTablesForMarkdown` normalization, moved verbatim from `MessageBubble`. Includes the `katex.min.css` import.
2. **Answer bubble** — `MessageBubble` renders `<ChatMarkdown>{msg.content}</ChatMarkdown>` inside the unchanged `prose prose-sm` wrapper.
3. **Source cards** — snippet rendered through `<ChatMarkdown>` inside a `div` (not `<p>`, since markdown emits block children) that keeps: quote marks (`&ldquo;`/`&rdquo;`), `line-clamp-2`, `opacity-70`, italic, and the `[From ...]` prefix strip. First/last-child margin resets keep the card compact.

## Security

Snippet is untrusted article text. `react-markdown` does not render raw HTML without `rehypeRaw`; neither `rehypeRaw` nor `dangerouslySetInnerHTML` is added. An existing test (`markdownHtmlTables.test.mjs`) asserts script tags remain escaped.

## Out of Scope

- Article workspace chat (`apps/web/src/app/articles/[id]/page.tsx`) keeps its own inline ReactMarkdown — its sources are buttons, not cards.
- No backend changes.

## Verification

- `npm test` (from `apps/web/`) — including updated `markdownHtmlTables.test.mjs` media-containment targets and new `src/components/chat-markdown.test.mjs` source-assertion tests (Node's test runner cannot import `.tsx`, so tests read file source, matching the existing convention).
- `npx tsc --noEmit`
- `npm run build`
