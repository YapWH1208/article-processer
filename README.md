# Article Processing Application

A web-based article processing application that converts uploaded documents (PDF, HTML, Markdown, text, ZIP) into clean Markdown, extracts structured research information using AI, supports in-app reading with AI Q&A, and provides a graph/tagging layer for article connection analysis.

## Quick Start

### Prerequisites

- Node.js 18+ with npm
- Python 3.11+
- SQLite (built into Python)

### Backend Setup

```bash
cd services/api
python -m venv .venv

# macOS/Linux:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

The API runs at http://localhost:8000.

### Frontend Setup

```bash
cd apps/web
npm install
npm run dev
```

The frontend runs at http://localhost:3000.

### Environment Variables

Copy `.env.example` to `services/api/.env` and `apps/web/.env.local`:

```bash
cp .env.example services/api/.env
cp .env.example apps/web/.env.local
```

## Features

- **Document Ingestion**: Upload PDF, ZIP (containing PDFs/HTML/MD/TXT), HTML, Markdown, or plain text
- **Automatic Parsing**: Convert documents to canonical Markdown with structure preservation
- **AI Extraction**: Extract structured research information (authors, methodology, results, claims, etc.)
- **RAG Q&A**: Ask questions about articles with cited answers
- **Graph Analysis**: Entity and relationship extraction for article connections
- **Export**: Export summaries as Markdown or JSON

## Testing

```bash
cd services/api
pytest
```

## Architecture

```
apps/web/          - Next.js frontend
services/api/      - FastAPI backend
storage/           - Local file storage
data/              - SQLite database
```

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Python FastAPI, SQLAlchemy, Pydantic
- **Database**: SQLite (default), PostgreSQL optional
- **AI**: OpenAI provider with mock fallback for offline development

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `DATABASE_URL` - SQLite by default (`sqlite:///./data/app.sqlite3`)
- `OPENAI_API_KEY` - Optional; mock AI used if empty
- `USE_MOCK_AI=true` - Force mock providers for offline development
- `NEXT_PUBLIC_API_BASE_URL` - Backend URL for frontend

## Known Limitations

- SQLite does not support native vector search; embeddings use cosine similarity in Python
- Mock AI providers return deterministic but non-realistic extraction
- No authentication system in MVP
- Worker runs in-process via FastAPI BackgroundTasks
- No Redis/Celery; single-process execution

## Next Steps

- Integrate Docling / Marker / GROBID for improved PDF parsing
- Add OCR support (Tesseract/PaddleOCR)
- PostgreSQL + pgvector for production vector search
- Neo4j sync for graph analysis
- MCP server support for tool extensibility
- Multi-article comparison
- Zotero/BibTeX import/export
- Production authentication
- Cloud object storage (S3)
