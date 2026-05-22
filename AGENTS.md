# AGENTS.md — Development Guide for AI Coding Assistants

## Project Overview

Article Processing Application: web app for document ingestion, AI-powered extraction, RAG Q&A, and graph analysis.

## Setup for Development

### Backend

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

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
  tests/          - pytest suite

apps/web/src/
  app/            - Next.js pages (App Router)
  components/     - React components by feature
  lib/            - API client, types
```

## Database

- Models in `app/db/models.py`
- Migrations via Alembic (`alembic upgrade head` / `alembic revision --autogenerate -m "message"`)
- SQLite database stored at `data/app.sqlite3`

## Testing

```bash
cd services/api
pytest
```

Tests cover: ZIP safety, schema validation, chunking, mock AI extraction.

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
