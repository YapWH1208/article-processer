# Reading Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a guide-first reading intelligence layer that helps users understand one article and decide what related article to read next.

**Architecture:** Keep V1 frontend-first and deterministic. Add pure `.mjs` state helpers that derive article and library guidance from existing extraction, graph, and related-article data, then wire those helpers into the existing article workspace.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, Node test runner.

---

### Task 1: Article And Library Guide State

**Files:**
- Create: `apps/web/src/app/articles/readingGuideState.mjs`
- Test: `apps/web/src/app/articles/readingGuideState.test.mjs`
- Modify: `apps/web/package.json` only if the existing test glob does not include the new test file.

**Step 1: Write failing tests**

Cover:
- Article guide derives TL;DR, contribution, method, claims, limitations, concepts, read-first sections, and starter questions from a populated extraction and graph.
- Article guide returns a missing-extraction recovery state when extraction is absent.
- Library guide ranks related articles by similarity and creates compare/read-next prompts.

Run:

```bash
cd apps/web
node --test src/app/articles/readingGuideState.test.mjs
```

Expected: FAIL because `readingGuideState.mjs` does not exist.

**Step 2: Implement minimal helper**

Create:
- `createArticleReadingGuide(input)`
- `createLibraryReadingGuide(input)`
- small internal helpers for text coercion, truncation, and concept selection.

Keep outputs plain objects, no React, no browser APIs.

**Step 3: Verify focused test**

Run:

```bash
cd apps/web
node --test src/app/articles/readingGuideState.test.mjs
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/src/app/articles/readingGuideState.mjs apps/web/src/app/articles/readingGuideState.test.mjs apps/web/package.json
git commit -m "feat: derive reading intelligence guides"
```

### Task 2: Article Workspace Guide UI

**Files:**
- Modify: `apps/web/src/app/articles/[id]/page.tsx`
- Test: `apps/web/src/app/articles/readingGuideState.test.mjs`

**Step 1: Add UI-facing assertions if helper output needs adjustment**

If the UI needs a missing field, add the failing helper test first.

Run:

```bash
cd apps/web
node --test src/app/articles/readingGuideState.test.mjs
```

Expected: FAIL only if a new helper behavior is needed.

**Step 2: Wire the guide tab**

Add a `Guide` tab before `Reader`.

The guide tab should show:
- TL;DR
- method in plain language
- key claims
- limitations
- concepts
- read-first sections
- suggested questions that seed the existing chat composer
- related reading order and comparison prompt from existing `/articles/{id}/related`

Keep it compact and operational. Do not create a new route.

**Step 3: Verify focused and full frontend tests**

Run:

```bash
cd apps/web
node --test src/app/articles/readingGuideState.test.mjs
npm.cmd test
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/src/app/articles/[id]/page.tsx apps/web/src/app/articles/readingGuideState.mjs apps/web/src/app/articles/readingGuideState.test.mjs
git commit -m "feat: add reading guide to article workspace"
```

### Task 3: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Document the shipped feature**

Update feature bullets to mention article reading guides and related read-next prompts.

**Step 2: Run verification**

Run:

```bash
cd apps/web
npm.cmd test
npm.cmd run build
cd ..\..
git diff --check
```

Expected: all commands exit 0.

**Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document reading intelligence"
```
