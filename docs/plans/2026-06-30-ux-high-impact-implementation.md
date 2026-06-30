# UX High Impact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the app's highest-friction entry points into a more operational research workspace.

**Architecture:** Keep the work frontend-first and reuse existing API endpoints. Add small state helpers for testable decision logic, then wire them into existing Next.js pages and shared shell components.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, Node test runner.

---

### Task 1: Operational Home Cockpit

**Files:**
- Create: `apps/web/src/app/homeCockpitState.mjs`
- Test: `apps/web/src/app/homeCockpitState.test.mjs`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/package.json`

**Behavior:**
Replace the marketing-heavy home page with a compact cockpit: backend/provider status, library totals, active/failed/needs-review counts, quick actions, upload/import entry points, and recent article search.

**Verification:**
- Write tests for home health/status derivation before wiring the page.
- Run `npm.cmd test` in `apps/web`.
- Commit as `feat: add operational home cockpit`.

### Task 2: Jobs Navigation And Status Center

**Files:**
- Create: `apps/web/src/components/navStatusState.mjs`
- Test: `apps/web/src/components/navStatusState.test.mjs`
- Modify: `apps/web/src/components/Providers.tsx`
- Modify: `apps/web/package.json`

**Behavior:**
Expose `/logs` as `Jobs` in the top navigation and route the processing indicator to the queue. Summarize active, queued, and failed job counts from the existing job queue endpoint instead of polling article statuses one by one.

**Verification:**
- Write tests for queue-count summary and badge labels before modifying the nav.
- Run `npm.cmd test` in `apps/web`.
- Commit as `feat: promote jobs navigation`.

### Task 3: First-Run Setup Guidance

**Files:**
- Create: `apps/web/src/app/upload/setupChecklistState.mjs`
- Test: `apps/web/src/app/upload/setupChecklistState.test.mjs`
- Modify: `apps/web/src/app/upload/page.tsx`
- Modify: `apps/web/package.json`

**Behavior:**
Add a setup checklist near upload showing backend connectivity, active provider/mock mode, selected model, AI pipeline toggle state, and parser/action guidance. Keep it concise and operational.

**Verification:**
- Write tests for checklist item derivation before rendering.
- Run `npm.cmd test` in `apps/web`.
- Commit as `feat: add first-run setup checklist`.

### Task 4: Docs And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Behavior:**
Update repo-facing docs for the new cockpit, jobs nav, and setup checklist.

**Verification:**
- Run `npm.cmd test` in `apps/web`.
- Run `npm.cmd run build` in `apps/web`.
- Run `git diff --check`.
- Commit as `docs: document UX cockpit improvements`.
