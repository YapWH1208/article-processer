# REASONIX.md — Article Processing Application

## Stack
- **Backend:** Python 3.11+ / FastAPI / SQLAlchemy (async) / Pydantic v2 / Alembic
- **Frontend:** TypeScript / Next.js 16 (App Router) / React 18 / Tailwind CSS / Radix UI (shadcn/ui)
- **Database:** SQLite at `data/app.sqlite3`
- **AI:** OpenAI + Anthropic providers (optional), mock provider for offline dev (`USE_MOCK_AI=true`)

## Layout
- `services/api/` — FastAPI backend: routers, services, models, migrations, tests
- `apps/web/` — Next.js frontend (App Router); `@/*` alias → `src/*`
- `data/` — SQLite database files (gitignored)
- `storage/` — user uploads / markdown / exports / images (gitignored except `.gitkeep`)
- `.github/workflows/` — CI: backend pytest + frontend build on push/PR to master/main

## Commands

### Backend (`services/api/`)
```bash
pip install -e ".[dev]"          # install deps + pytest
alembic upgrade head             # run migrations (must be in services/api/)
uvicorn app.main:app --reload    # start dev server on :8000
python -m pytest app/tests/ -v --tb=short  # run tests
```

### Frontend (`apps/web/`)
```bash
npm install          # install deps
npm run dev          # start dev server on :3000
npm run build        # production build
npm run lint         # ESLint via next lint
```

## Conventions
- **Pydantic schemas** for all API request/response shapes (`schemas/` dir)
- **Alembic migrations** managed in `app/db/migrations/`; SQLite-compatible DDL required
- **Frontend path alias:** `@/` maps to `apps/web/src/` (tsconfig paths)
- **Frontend tests** use Node.js built-in `node:test` + `node:assert/strict`, colocated with source (e.g. `graphCanvasState.test.mjs`)
- **Backend tests** use pytest with `asyncio_mode = "auto"` (configured in `conftest.py`)
- **Mock AI** (`USE_MOCK_AI=true`) enables offline regex extraction — all AI features must work without real API keys
- **Project root detection:** `config.py` resolves paths relative to the repo root by walking up 4 levels from its own location

## Watch out for
- **Alembic CWD matters:** `alembic upgrade head` must run from `services/api/` — `.ini` uses relative paths
- **`.env` location:** backend `.env` lives at `services/api/.env`, NOT project root
- **Root `package.json` is a thin wrapper** (only has `recharts` dep) — the real frontend is `apps/web/`
- **SQLite path:** `./data/app.sqlite3` is relative to project root (resolved by `_resolve_path` in config)
- **Parser priority** controlled by `PARSER_PRIORITY` env var: `docling_first`, `pypdf`, or `ocr`
- **Dev server must be started separately** for backend and frontend (no monorepo orchestrator)
