# UX Top Priorities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the research workspace experience around reading, cited chat, extraction review, and job visibility.

**Architecture:** Start with thin frontend slices over the backend that already exists. Add backend fields only when the UI needs stable IDs or queue-level data that the current API does not expose.

**Tech Stack:** Next.js App Router, React, Tailwind, FastAPI, SQLAlchemy, SQLite, pytest, Node test runner.

---

### Task 1: Source-Linked Citations

**Files:**
- Modify: `services/api/app/schemas/chat.py`
- Modify: `services/api/app/services/ai/openai_provider.py`
- Modify: `services/api/app/services/ai/anthropic_provider.py`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/app/articles/[id]/page.tsx`
- Test: `services/api/app/tests/test_chat_citations.py`
- Test: `apps/web/src/app/articles/articleWorkspaceState.test.mjs`

**Behavior:**
Chat citations should include enough metadata to render as clickable source chips. On article pages, clicking a source chip should switch to the reader and scroll to the matching chunk or section anchor when available.

### Task 2: Article Workspace Polish

**Files:**
- Modify: `apps/web/src/app/articles/[id]/page.tsx`
- Test: `apps/web/src/app/articles/articleWorkspaceState.test.mjs`

**Behavior:**
Make the article detail page a stable two-pane workspace: reader stays primary, the right pane uses tabs for chat, extraction, graph, jobs, and related articles. The layout should remain usable on mobile via tabs instead of hidden content.

### Task 3: Extraction Review Surface

**Files:**
- Modify: `services/api/app/routers/articles.py`
- Modify: `services/api/app/schemas/extraction.py`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/articles/[id]/page.tsx`
- Test: `services/api/app/tests/test_extraction_review.py`

**Behavior:**
Users can edit extracted structured fields and save reviewed extraction JSON back to the article. Saving marks the article as reviewed and refreshes search/graph-derived surfaces where appropriate.

### Task 4: Global Job Queue UI

**Files:**
- Modify: `services/api/app/routers/dashboard.py`
- Modify: `services/api/app/schemas/jobs.py`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/logs/page.tsx`
- Test: `services/api/app/tests/test_job_queue_api.py`

**Behavior:**
Expose active, queued, failed, and recently completed jobs in one queue endpoint. The UI should show queue state, current step, age, article title, error, and retry/reprocess entry points.

### Task 5: Verification And Cleanup

Run:
- `python -m pytest app/tests -q -p no:cacheprovider`
- `npm.cmd test`
- `npm.cmd run build`
- `git diff --check`

Commit each completed task separately.
