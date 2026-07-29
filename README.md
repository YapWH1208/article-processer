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

- **Operational Home Cockpit**: The home page opens directly into workspace status, full-text search, AI/provider health, queue attention, recent articles, and primary actions
- **Document Ingestion**: Upload PDF, ZIP (containing PDFs/HTML/MD/TXT), HTML, Markdown, or plain text, with setup readiness checks and upload/import progress that resumes after refresh
- **Automatic Parsing**: Convert documents to canonical Markdown with structure preservation — MinerU v3.x (best), Docling, or pypdf
- **5-Step Processing Pipeline**: Parse → Semantic Chunk → AI Extract → Build Graph → Complete. Live progress bar with step-by-step status.
- **Global Job Queue**: Jobs navigation and the Logs page show active, queued, failed, and completed processing jobs with current step, age, worker, errors, article links, and retry for failed jobs
- **AI Extraction**: Extract structured research information (authors, methodology, results, claims, entities, references) with evidence trails and confidence scoring
- **Extraction Review**: Edit and save reviewed structured extraction JSON from the article workspace before using it for search and analysis
- **Article Workspace**: Reader-first article detail page with a tabbed side panel for Chat, Jobs, and Context, source chips that jump back to cited reader chunks or sections, and recovery callouts for failed or review-needed processing
- **Reading Intelligence Guide**: Article pages open with a guide-first brief that turns extraction, graph entities, and related-article overlap into TL;DR, read-first sections, key claims, concepts, suggested questions, and read-next recommendations
- **Paper Discovery**: Search arXiv metadata or browse local conference catalogue snapshots for ICLR 2026, CHI 2026, CVPR 2026, NeurIPS 2025, and ICML 2025; papers remain external until a user explicitly selects Analyse and read
- **Evidence-Linked Triage**: When extraction provides a triage brief, article pages open with a concise verdict/problem/method/results/limitations view whose source controls jump to the cited reader section, plus paper-stated code availability and provenance
- **Retrieval-Based Chat**: Ask questions about articles with cited, source-linked answers drawn from relevant chunks. @-mention articles for focused context or use starter prompts for library-wide questions. Multi-turn sessions persist across refreshes.
- **Model Selector**: Switch LLM providers on-the-fly from the Chat page — no reload required
- **Built-in AI Skills**: Research summary, methodology extraction, experiment extraction, literature review notes, reviewer critique — with structured results. Create, edit, import, and export custom skills.
- **Global Knowledge Graph**: Interactive canvas-based force-directed graph of all entities and relationships across articles (Obsidian-style), with zoom/pan, type filtering, and click-to-navigate
- **Metrics Dashboard**: Professional analytics with time-range filter, KPI cards, charts (line, bar, donut), and top articles table — track token usage, article throughput, and processing metrics
- **Batch Operations**: Select multiple articles for bulk archive/restore, delete, or JSON export
- **Shareable Article Lists**: Search, content search, status filter, archived toggle, sort, and page state are preserved in the URL, with clear-filter and upload recovery actions for empty states
- **Global Search**: Full-text search across all article content from the home page
- **Export**: Individual article export (JSON, Markdown) and unified export/import (settings + articles + skills) from Settings
- **Multi-Provider AI**: 9 LLM providers — OpenAI, Anthropic, DeepSeek, OpenRouter, GLM (Zhipu), MiniMax, Kimi (Moonshot), and Custom (any OpenAI/Anthropic-compatible endpoint). Configure in Settings → Providers.
- **PDF Original View**: Toggle between parsed Markdown and the original PDF inline in the Reader
- **Unified Settings Page**: Single `/settings` page with 5 tabs — Providers, System Messages, Input Templates, Model Params, and General (parsers, mock AI, limits, data export/import)
- **Locale-backed bilingual UI**: Header language button switches the app shell, pages, placeholders, generated chat prompts, and AI output-language instructions between English and Chinese using per-language locale files for future expansion
- **Dark Mode**: Full light/dark theme with system preference detection and live OS theme switching
- **Inline Title Editing**: Click any article title to rename it inline — defaults to the original filename
- **Pagination & Sort**: Server-side pagination with sort controls (newest, oldest, title, status)

## Local Conference Catalogue

Conference discovery is deliberately local-first. The app does not crawl conference sites at request time and does not bundle a stale conference dataset. A maintainer refreshes a JSONL snapshot into the local SQLite catalogue; users can then search, preview, open the public source/PDF, and explicitly select a paper for analysis from `/discover`.

Supported collection keys:

- `iclr_2026`
- `chi_2026`
- `cvpr_2026`
- `neurips_2025`
- `icml_2025`

The API applies Alembic migrations at startup, including upgrades to an existing SQLite file. To refresh one of the supported public proceedings sources and import it into the local catalogue, run:

```bash
cd services/api
python -m app.commands.scrape_conference_catalog --conference cvpr_2026
```

The command writes an auditable JSONL snapshot under `data/conference-snapshots/` before it updates SQLite. Use `--output path/to/snapshot.jsonl` to choose a destination or `--no-import` to inspect/review the snapshot before importing it. The adapters are bounded, sequential requests: ICLR reads its official public oral/poster program feed (without querying OpenReview reviews, profiles, or discussions); CVPR, NeurIPS, and ICML read their public proceedings indexes. CHI uses its ACM proceedings index, with Crossref's public metadata for the CHI 2026 proceedings as a fallback when the publisher blocks an automated request.

To import a separately prepared Paper Insight-compatible JSONL snapshot instead:

```bash
cd services/api
python -m app.commands.import_conference_catalog --conference iclr_2026 --input path/to/iclr_2026.jsonl
```

Each JSONL row follows the Paper Insight-style crawler record, including an external `id` and `content.<field>.value` entries (for example title, authors, abstract, keywords, landing URL, and PDF URL). The importer stores the normalized fields and raw source row, upserts by collection and external ID, and reports imported/skipped/invalid rows. It does not delete records omitted from a partial snapshot.

Catalogue browsing never creates an Article or queues processing. A user must choose **Analyse and read**; the server then resolves its stored provenance and passes the PDF through the existing safe URL import checks. Candidates without a usable PDF remain browseable but cannot be analysed. arXiv metadata follows the same explicit-selection rule and retains the source metadata with the resulting Article.

## Testing

```bash
cd services/api
pytest
```

Frontend state helpers and production build:

```bash
cd apps/web
npm test
npm run build
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
