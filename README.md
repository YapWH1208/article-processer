# Article Processing Application

[![CI](https://github.com/YapWH/article-processer/actions/workflows/ci.yml/badge.svg)](https://github.com/YapWH/article-processer/actions/workflows/ci.yml)

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
- **Automatic Parsing**: Convert documents to canonical Markdown with structure preservation — MinerU (best), Docling, or pypdf
- **AI Extraction**: Extract structured research information (authors, methodology, results, claims, etc.)
- **RAG Q&A**: Ask questions about articles with cited answers, side-by-side chat with citation sources, persistent chat history
- **Built-in AI Skills**: Research summary, methodology extraction, experiment extraction, literature review notes, reviewer critique — all with structured results. Create, edit, import, and export custom skills.
- **Graph Analysis**: Entity and relationship extraction with color-coded type visualization and directional relationship cards
- **Batch Operations**: Select multiple articles for bulk archive/restore, delete, or export
- **Global Search**: Full-text search across all article content from the dashboard
- **Export**: Markdown, JSON, BibTeX, and batch article export/import
- **Multi-Provider AI**: 9 LLM providers — OpenAI, Anthropic, DeepSeek, OpenRouter, GLM (Zhipu), MiniMax, Mimo (MiniMax-M1), Kimi (Moonshot), and Custom (any OpenAI/Anthropic-compatible endpoint)
- **PDF Original View**: Toggle between parsed Markdown and the original PDF inline in the Reader
- **Processing Progress**: Live step-by-step pipeline progress bar with auto-reload on completion
- **Settings**: Configure LLM/embedding providers, test connections, manage skills, import/export settings as JSON
- **Dark Mode**: Full light/dark theme with system preference detection and live OS theme switching
- **Pagination & Sort**: Server-side pagination with sort controls (newest, oldest, title, status)

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

See `.env.example` for all configuration options. Key variables:

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | LLM backend: `openai`, `anthropic`, `deepseek`, `openrouter`, `glm`, `minimax`, `mimo`, `kimi`, or `custom` |
| `LLM_CUSTOM_PROTOCOL` | `openai` | When custom: `openai` or `anthropic` |
| `LLM_CUSTOM_BASE_URL` | — | Custom endpoint URL |
| `LLM_CUSTOM_MODEL` | — | Custom model name |
| `OPENAI_API_KEY` | — | OpenAI key (shared by LLM + embeddings) |
| `OPENAI_MODEL` | `gpt-4.1-mini` | OpenAI model |
| `ANTHROPIC_API_KEY` | — | Anthropic key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Claude model |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek model |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `OPENROUTER_MODEL` | `openai/gpt-4.1-mini` | OpenRouter model |
| `GLM_API_KEY` | — | GLM (ZhipuAI) API key |
| `GLM_MODEL` | `glm-4-plus` | GLM model |
| `MINIMAX_API_KEY` | — | MiniMax API key |
| `MINIMAX_MODEL` | `MiniMax-Text-01` | MiniMax model |
| `MIMO_API_KEY` | — | Mimo (MiniMax-M1) API key |
| `MIMO_MODEL` | `MiniMax-M1` | Mimo model |
| `KIMI_API_KEY` | — | Kimi (Moonshot) API key |
| `KIMI_MODEL` | `moonshot-v1-8k` | Kimi model |
| `EMBEDDING_PROVIDER` | `openai` | Embeddings backend: `openai` or `custom` |
| `EMBEDDING_CUSTOM_BASE_URL` | — | Custom embeddings endpoint |
| `EMBEDDING_CUSTOM_MODEL` | — | Custom embeddings model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `USE_MOCK_AI` | `true` | Offline regex extraction (no API key needed) |
| `MAX_UPLOAD_MB` | `50` | Max file size |
| `PARSER_PRIORITY` | `mineru_first` | PDF parser: `mineru_first`, `docling`, `pypdf`, or `ocr` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend URL for frontend |

### LLM Provider Examples

**OpenAI** (default):
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

**Anthropic**:
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

**Custom — Ollama (OpenAI-compatible)**:
```env
LLM_PROVIDER=custom
LLM_CUSTOM_PROTOCOL=openai
LLM_CUSTOM_BASE_URL=http://localhost:11434/v1
LLM_CUSTOM_API_KEY=ollama
LLM_CUSTOM_MODEL=llama3.1:8b
```

**Custom — LiteLLM Proxy (Anthropic-compatible)**:
```env
LLM_PROVIDER=custom
LLM_CUSTOM_PROTOCOL=anthropic
LLM_CUSTOM_BASE_URL=https://your-proxy.example.com
LLM_CUSTOM_API_KEY=your-key
LLM_CUSTOM_MODEL=claude-sonnet-4-20250514
```

**DeepSeek**:
```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
```

**OpenRouter**:
```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4.1-mini
```

**GLM (ZhipuAI)**:
```env
LLM_PROVIDER=glm
GLM_API_KEY=...
GLM_MODEL=glm-4-plus
```

**Kimi (Moonshot)**:
```env
LLM_PROVIDER=kimi
KIMI_API_KEY=sk-...
KIMI_MODEL=moonshot-v1-8k
```

### Embedding Provider Examples

**Custom — Ollama**:
```env
EMBEDDING_PROVIDER=custom
EMBEDDING_CUSTOM_BASE_URL=http://localhost:11434/v1
EMBEDDING_CUSTOM_MODEL=nomic-embed-text
```

All settings can also be configured from the Settings page in the UI (`/settings`).

## Known Limitations

- SQLite does not support native vector search; embeddings use cosine similarity in Python
- Mock AI providers return deterministic but non-realistic extraction
- No authentication system in MVP
- Worker runs in-process via FastAPI BackgroundTasks
- No Redis/Celery; single-process execution
- MinerU image extraction requires `magic-pdf` package (optional, falls back to Docling/pypdf)

## Next Steps

- PostgreSQL + pgvector for production vector search
- Neo4j sync for graph analysis
- MCP server support for tool extensibility
- Multi-article comparison view
- Graph visualization (force-directed layout)
- Cloud object storage (S3)
- Real-time processing status (WebSocket/SSE)
- Authentication enforcement (currently optional)

## CI/CD

GitHub Actions runs on every push and PR:

- **Backend**: Python 3.12, `pip install -e ".[dev]"`, `pytest`
- **Frontend**: Node 22, `npm ci`, `npm run build`

See `.github/workflows/ci.yml`.
