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

- **Immersive Landing Page**: Particle canvas, floating orbs, typewriter headline, animated stats, and accurate 5-step pipeline diagram (Upload → Parse → Chunk → Extract → Graph) with hover interactions
- **Document Ingestion**: Upload PDF, ZIP (containing PDFs/HTML/MD/TXT), HTML, Markdown, or plain text — with live LLM model badge
- **Automatic Parsing**: Convert documents to canonical Markdown with structure preservation — MinerU v3.x (best), Docling, or pypdf
- **5-Step Processing Pipeline**: Parse → Semantic Chunk → AI Extract → Build Graph → Complete. Live progress bar with step-by-step status.
- **AI Extraction**: Extract structured research information (authors, methodology, results, claims, entities, references) with evidence trails and confidence scoring
- **Retrieval-Based Chat**: Ask questions about articles with cited, source-linked answers drawn from relevant chunks. @-mention articles for focused context or let AI search your entire library. Multi-turn sessions persist across refreshes.
- **Model Selector**: Switch LLM providers on-the-fly from the Chat page — no reload required
- **Built-in AI Skills**: Research summary, methodology extraction, experiment extraction, literature review notes, reviewer critique — with structured results. Create, edit, import, and export custom skills.
- **Global Knowledge Graph**: Interactive canvas-based force-directed graph of all entities and relationships across articles (Obsidian-style), with zoom/pan, type filtering, and click-to-navigate
- **Metrics Dashboard**: Professional analytics with time-range filter, KPI cards, charts (line, bar, donut), and top articles table — track token usage, article throughput, and processing metrics
- **Batch Operations**: Select multiple articles for bulk archive/restore, delete, or export
- **Global Search**: Full-text search across all article content from the home page
- **Export**: Individual article export (JSON, Markdown) and unified export/import (settings + articles + skills) from Settings
- **Multi-Provider AI**: 9 LLM providers — OpenAI, Anthropic, DeepSeek, OpenRouter, GLM (Zhipu), MiniMax, Kimi (Moonshot), and Custom (any OpenAI/Anthropic-compatible endpoint). Configure in Settings → Providers.
- **PDF Original View**: Toggle between parsed Markdown and the original PDF inline in the Reader
- **Unified Settings Page**: Single `/settings` page with 5 tabs — Providers, System Messages, Input Templates, Model Params, and General (parsers, mock AI, limits, data export/import)
- **Dark Mode**: Full light/dark theme with system preference detection and live OS theme switching
- **Inline Title Editing**: Click any article title to rename it inline — defaults to the original filename
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
- **AI**: Multi-provider LLM (OpenAI, Anthropic, DeepSeek, custom endpoints) with mock fallback for offline development

## Environment Variables

See `.env.example` for all configuration options. Key variables:

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `openai` | LLM backend: `openai`, `anthropic`, `deepseek`, `openrouter`, `glm`, `minimax`, `kimi`, or `custom` |
| `LLM_CUSTOM_PROTOCOL` | `openai` | When custom: `openai` or `anthropic` |
| `LLM_CUSTOM_BASE_URL` | — | Custom endpoint URL |
| `LLM_CUSTOM_MODEL` | — | Custom model name |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4.1-mini` | OpenAI model |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Claude model |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek model |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `OPENROUTER_MODEL` | `openai/gpt-4.1-mini` | OpenRouter model |
| `GLM_API_KEY` | — | GLM (ZhipuAI) API key |
| `GLM_MODEL` | `glm-4-plus` | GLM model |
| `MINIMAX_API_KEY` | — | MiniMax API key |
| `MINIMAX_MODEL` | `MiniMax-Text-01` | MiniMax model |
| `KIMI_API_KEY` | — | Kimi (Moonshot) API key |
| `KIMI_MODEL` | `moonshot-v1-8k` | Kimi model |
| `USE_MOCK_AI` | `true` | Offline regex extraction (no API key needed) |
| `MAX_UPLOAD_MB` | `50` | Max file size |
| `PARSER_PRIORITY` | `mineru_first` | PDF parser: `mineru_first`, `docling`, `pypdf`, or `ocr` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Backend URL for frontend |

> **Note:** Multiple providers can also be configured from Settings → Providers in the UI. Providers configured in the UI take precedence over `.env` variables.

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

All settings can also be configured from the Settings page in the UI (`/settings`).

## Known Limitations

- Chat uses lexical chunk retrieval; semantic embeddings can be added later for deeper recall
- Mock AI providers return deterministic but non-realistic extraction
- Local-first app without user accounts
- Worker runs as a local SQLite-backed queue inside the API process
- No Redis/Celery; single-process execution
- MinerU image extraction requires `mineru` package (optional, falls back to Docling/pypdf)
- Embeddings and vector search removed in v0.4.0

## Next Steps

- PostgreSQL for production database
- Neo4j sync for graph analysis
- MCP server support for tool extensibility
- Multi-article comparison view
- Cloud object storage (S3)
- Real-time processing status (WebSocket/SSE)

## CI/CD

GitHub Actions runs on every push and PR:

- **Backend**: Python 3.12, `pip install -e ".[dev]"`, `pytest`
- **Frontend**: Node 22, `npm ci`, `npm run build`

See `.github/workflows/ci.yml`.
