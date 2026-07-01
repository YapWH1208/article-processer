# UX Remaining Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the remaining UX polish after the home/jobs/upload work by improving recovery paths and first actions on the core research screens.

**Architecture:** Keep changes frontend-only and reuse existing routes/API calls. Add small `.mjs` state helpers with Node tests, then wire those helpers into the existing Next.js pages.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, Node test runner.

---

### Task 1: Library Filter Recovery

**Files:**
- Modify: `apps/web/src/app/articles/articleListState.mjs`
- Test: `apps/web/src/app/articles/articleListState.test.mjs`
- Modify: `apps/web/src/app/articles/page.tsx`

**Behavior:**
Surface when filters/search are active, provide a single clear-filters action, and give empty states direct next actions: upload when the library is empty, clear filters when the current query has no matches.

**Verification:**
- Write failing tests for active-filter detection and empty-state derivation.
- Run `node --test src/app/articles/articleListState.test.mjs`.
- Run `npm.cmd test`.
- Commit as `feat: improve library recovery states`.

### Task 2: Actionable Article Status Banners

**Files:**
- Modify: `apps/web/src/app/articles/articleWorkspaceState.mjs`
- Test: `apps/web/src/app/articles/articleWorkspaceState.test.mjs`
- Modify: `apps/web/src/app/articles/[id]/page.tsx`

**Behavior:**
Replace passive failed/review banners with action-oriented callouts. Failed articles should offer retry and job-history actions; review-needed articles should offer review and rerun actions.

**Verification:**
- Write failing tests for callout derivation.
- Run `node --test src/app/articles/articleWorkspaceState.test.mjs`.
- Run `npm.cmd test`.
- Commit as `feat: add article recovery callouts`.

### Task 3: Chat Starter Guidance

**Files:**
- Create: `apps/web/src/app/chatStartState.mjs`
- Test: `apps/web/src/app/chatStartState.test.mjs`
- Modify: `apps/web/src/app/chat/page.tsx`

**Behavior:**
Turn the empty chat panel into a guided start state. With articles present, show a few one-click prompt starters; with no articles, route users to upload.

**Verification:**
- Write failing tests for starter prompt derivation.
- Run `node --test src/app/chatStartState.test.mjs`.
- Run `npm.cmd test`.
- Commit as `feat: add chat starter guidance`.

### Task 4: Docs And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Behavior:**
Document the new library recovery, article callouts, and chat starter guidance.

**Verification:**
- Run `npm.cmd test`.
- Run `npm.cmd run build`.
- Run `git diff --check`.
- Commit as `docs: document remaining UX polish`.
