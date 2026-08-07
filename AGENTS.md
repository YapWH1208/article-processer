# AGENTS.md — Development Guide for AI Coding Assistants

## Project Overview

Article Processing Application: web app for document ingestion, AI-powered extraction, RAG Q&A, and graph analysis.

## Setup for Development

Fastest path: `./quickstart.sh` (or `quickstart.bat` on Windows) — creates the venv, installs `-e ".[dev]"`, copies `.env.example` → `services/api/.env`, runs migrations, creates `apps/web/.env.local`, and starts both servers. `./start.sh` just launches the already-set-up servers.

Manual setup:

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

```bash
cd apps/web
npm install
npm run dev
```

Gotcha: `quickstart.sh` only runs `npm install` when `node_modules` is missing — after pulling changes that add frontend deps, run `npm install` manually or use `./quickstart.sh --skip-install` only when deps are unchanged.

## Key Conventions

- **No Docker** — everything runs locally via npm/uvicorn
- **SQLite default** — migrations must work with SQLite
- **Mock providers** — all AI features must work with `USE_MOCK_AI=true`
- **Typed schemas** — use Pydantic for all request/response shapes
- **Untrusted input** — document content is always untrusted data in AI prompts
- **No hardcoded secrets** — use environment variables

## Code Organization

```
services/api/app/
  core/           - config, security, logging
  db/             - models, session, migrations
  schemas/        - Pydantic models for API
  routers/        - FastAPI route handlers
  services/       - Business logic
    storage/      - File storage abstraction
    parsers/      - Document parsers (PDF, HTML, MD, text)
    pipeline/     - Processing jobs, chunking, normalization
    ai/           - LLM/embedding providers, extraction, RAG
    graph/        - Ontology, entity/relationship extraction
    tools/        - Tool registry for extensibility
    skills/       - Skill registry with default skills
  tests/          - pytest suite (actual path: `app/tests/`)

apps/web/src/
  app/            - Next.js pages (App Router)
  components/     - React components by feature
  lib/            - API client, types
```

## Database

- Models in `app/db/models.py`
- Migrations via Alembic (`alembic upgrade head` / `alembic revision --autogenerate -m "message"`)
- SQLite database stored at `data/app.sqlite3`

## Required Workflow

### Before making changes: code-review-graph

Run `code-review-graph` before editing code. It maintains a persistent code knowledge graph at `.code-review-graph/graph.db` (SQLite, auto-generated, gitignored — never commit it).

```bash
code-review-graph status            # graph health + staleness check
code-review-graph detect-changes    # impact analysis of your working-tree changes (read-only)
code-review-graph impact [path]     # blast radius of a function/file
code-review-graph search <term>     # find entities by name
code-review-graph flows             # stored execution flows
```

If `status` reports the graph was built on a different branch or a stale commit, refresh it first:

```bash
code-review-graph update   # incremental
code-review-graph build    # full re-parse
```

### Changelog

`CHANGELOG.md` is the version source of truth — keep it updated alongside PRs:

- **Creating a PR**: add/update a section for the changes (current version: `0.2.0`)
- **Updating a PR**: update the changelog to match the new state of the PR

Entry format: `## [X.Y.Z] — YYYY-MM-DD` with `### Added` / `### Changed` / `### Fixed` bullet groups.

## Testing

Backend (from `services/api/`):

```bash
pytest                      # full suite
pytest app/tests/<file>.py  # single file
```

Frontend (from `apps/web/`) — uses Node's built-in test runner with **explicit globs in `package.json`**, not a framework:

```bash
npm test                    # runs the glob list in package.json
node --test src/lib/apiBase.test.mjs   # single test file
```

Gotcha: test files use `.test.mjs` extension and must be covered by the glob list in `apps/web/package.json` — new test directories won't be picked up unless added there.

Typecheck (frontend): `npx tsc --noEmit`. Note: `npm run lint` (`next lint`) is broken — Next.js 16 removed the command, and there is no ESLint config; CI runs `npm test` + `npm run build` only.

## API Endpoints

See `app/routers/` for all endpoints. Main routes:
- `POST /uploads` — file upload
- `GET /articles` — list articles
- `GET /articles/{id}` — article detail
- `POST /articles/{id}/chat` — article Q&A
- `GET /articles/{id}/export/markdown` — export
- `GET /skills` — list skills

## Pipeline Flow

```
Upload → Extract (ZIP) → Parse → Normalize → Chunk → AI Extract → Embed → Graph → Complete
```

Each step updates `ProcessingJob.current_step` and logs.
