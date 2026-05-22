# Changelog

All notable changes to the Article Processor project.

---

## [0.2.3] — 2025-07-22

### Changed

- **Complete frontend redesign with shadcn/ui** — replaced all hand-rolled Tailwind components with polished shadcn/ui (Radix UI + Tailwind) across every page.
- **Dark mode** — full light/dark theme toggle in navbar, persisted to localStorage, with CSS variable-driven theming.
- **Navbar** — sticky header with backdrop blur, icon-based navigation, responsive mobile hamburger menu, user dropdown with avatar, dark mode toggle.
- **Dashboard** — stat cards (Total / Completed / Processing / Failed) with icons, quick-action buttons, recent articles list with status badges, skeleton loading states.
- **Articles list** — search input with icon, status filter dropdown, card list with hover transitions, empty state with CTA.
- **Upload page** — drag-and-drop zone with animated icon, progress bar, result cards, BibTeX import section, accepted-types card.
- **Article detail** — shadcn Tabs (Reader / Summary / Chat / Graph / Metadata), chat with message bubbles and citation sources, extraction summary with authors badges, graph entity/relationship display, export buttons.
- **Login / Register** — centered card layout with icon, form inputs with labels, error display, footer links.
- **Settings** — radio-card provider selector, shadcn Select/Input/Switch, consistent card sections.

### Added

- 16 shadcn/ui components: Button, Card, Input, Textarea, Tabs, Badge, Dialog, Select, Switch, Label, Separator, Skeleton, Progress, ScrollArea, Avatar, DropdownMenu
- `components.json` — shadcn/ui configuration
- `lib/utils.ts` — `cn()` utility for Tailwind class merging
- `tailwindcss-animate` + Radix UI primitives

---

## [0.2.2] — 2025-07-22

### Added

- **Custom AI provider support** — select from 4 provider types: OpenAI, Anthropic, Custom (OpenAI-compatible), Custom (Anthropic-compatible).
- **Custom endpoint configuration** — set API base URL, key, and model name for any OpenAI-compatible endpoint (Ollama, vLLM, LocalAI, Groq, OpenRouter, LiteLLM proxy) or Anthropic-compatible endpoint.
- **Anthropic provider** (`anthropic_provider.py`) — Claude Sonnet/Haiku/Opus via official SDK, plus `CustomAnthropicProvider` for proxies.
- **Custom OpenAI provider** (`CustomOpenAIProvider`) — reuses the OpenAI SDK pointed at a custom `base_url`.
- **Provider factory dispatch** — `get_llm_provider()` and `get_embedding_provider()` route based on `AI_PROVIDER` env var.
- **Settings UI redesigned** — radio-card provider selector with conditional fields that appear based on the chosen provider. Added reusable `ApiKeyField`, `SelectField`, `TextField` components.
- **New `.env` fields** — `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `CUSTOM_API_BASE`, `CUSTOM_API_KEY`, `CUSTOM_MODEL`.

### Changed

- Settings router (`settings_page.py`) now handles all 11 writable fields with proper masking and validation.
- `.env.example` restructured with provider sections.

---

## [0.2.1] — 2025-07-22

### Added

- **Settings page** (`GET /settings`, `PUT /settings`) — view and update application configuration from the UI without editing `.env` manually. Supports OpenAI API key, model selection, embedding model, mock AI toggle, and max upload size. Changes persist to `.env` and take effect immediately.
- **Settings UI** (`apps/web/src/app/settings/page.tsx`) — form with masked API key field, model/embedding dropdowns, mock AI checkbox, upload limit input, save/reset buttons, and live success/error feedback.
- **Settings nav link** — added to the navbar in `Providers.tsx`.

### Fixed

- **Path resolution** — `config.py` now resolves all relative paths (`./data`, `./storage`, `.env`) against the project root computed from the config file's own location. The app can now be started from any working directory.
- **Alembic path** — `alembic.ini` `script_location` changed to `app/db/migrations` (relative to `services/api/`), matching the workflow where alembic is run from inside the backend directory.

---

## [0.2.0] — 2025-07-17

### Added

- **Quick-start scripts** (`start.sh` / `start.bat`) — single-command launchers with OS detection, prerequisite checks, venv setup, migration, and dual-server startup.
- **Docling PDF parser** — high-quality layout-aware PDF → Markdown conversion with table extraction, figure placeholders, and heading hierarchy preservation. Auto-detects and prefers Docling over pypdf; falls back gracefully.
- **OCR adapter** — Tesseract-based OCR for scanned/image-based PDFs. PDF → image → OCR → Markdown pipeline. Auto-detects textless pages and routes them through OCR in the default PDF parser.
- **BibTeX import** — `POST /imports/bibtex` endpoint. Parses `.bib` files or pasted BibTeX via `bibtexparser` (with pure-Python regex fallback). Creates article records, deduplicates by hash, and starts the processing pipeline.
- **BibTeX export** — `GET /articles/{id}/export/bibtex` endpoint. Generates proper BibTeX entries from extraction metadata with auto-generated citation keys.
- **BibTeX UI** — Paste textarea on the Upload page; "Export BibTeX" button in the Article detail → Metadata tab.
- **JWT authentication** — `User` model with Alembic migration. `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET /auth/verify`. JWT via `python-jose` + bcrypt via `passlib`. Falls back to a simple signed-token format when optional dependencies are absent — auth works with zero extra installs.
- **Auth frontend** — `AuthProvider` context, `useAuth()` hook, Login + Register pages, user indicator in navbar with Sign Out. Auth is entirely optional.
- **Optional dependency groups** in `pyproject.toml`: `[docling]`, `[ocr]`, `[bibtex]`, `[auth]`, `[all]`.

### Changed

- `PdfParser` now auto-detects textless PDF pages and attempts OCR fallback before leaving them empty.
- Pipeline parser registry prefers `DoclingAdapter` when Docling is installed.
- Navigation bar split into a client `Providers` component wrapping `AuthProvider`.

---

## [0.1.0] — 2025-07-16

### Added

- **Project scaffold** — FastAPI backend + Next.js frontend monorepo structure.
- **Document ingestion** — Upload PDF, ZIP, HTML, Markdown, or plain text files with type/size validation.
- **ZIP safety** — Path traversal prevention, zip bomb detection (file count and compression ratio checks).
- **Deduplication** — SHA-256 file hash dedup on upload.
- **Parsing pipeline** — Pluggable parser architecture with PDF (pypdf), HTML (BeautifulSoup), Markdown/text passthrough. Adapter placeholders for Docling, Marker, GROBID, and OCR.
- **Markdown normalization** — Whitespace cleanup, heading spacing, control character removal.
- **Section-aware chunking** — Headings-first split with overlap, page marker extraction, token estimation.
- **AI provider abstraction** — `BaseLLMProvider` + `BaseEmbeddingProvider` interfaces with factory functions.
- **Mock AI provider** — Deterministic extraction using regex/heuristics and keyword-based Q&A. Works without any API key.
- **OpenAI provider** — Structured extraction, Q&A, and skill execution via OpenAI chat completions. Embeddings via `text-embedding-3-small`.
- **Structured extraction schema** — 21-field JSON schema with evidence pointers (source section, page number, chunk ID, snippet).
- **Schema validation + retry** — Validates extraction JSON; retries once with a correction prompt; saves partial output and marks `needs_review` on second failure.
- **RAG Q&A** — Cosine similarity retrieval against SQLite-stored embedding JSON; keyword fallback when embeddings are unavailable. Cited answers with section/page/chunk references.
- **Processing pipeline** — Background thread orchestrator: parse → normalize → chunk → extract → embed → graph → complete. Step-by-step logging with error tracking.
- **Manual worker** — `python -m app.worker --article-id N` for independent processing.
- **Database models** — `Article`, `ArticleMetadata`, `ArticleChunk`, `ArticleExtraction`, `GraphEntity`, `GraphRelationship`, `ProcessingJob`, `ChatMessage` with SQLAlchemy + Alembic migrations.
- **Graph ontology** — 15 entity types (Article, Author, Method, Dataset, Experiment, Metric, Result, Claim, Task, Domain, Tool, Model, Citation, Keyword, Institution) and 10 relationship types.
- **Graph builder** — Converts extraction JSON into entities and relationships with confidence scoring and evidence pointers.
- **Skill registry** — 5 default skills: Research Paper Summary, Methodology Extraction, Experiment Extraction, Literature Review Notes, Reviewer Critique.
- **Tool registry** — 5 internal tools: `searchArticles`, `getArticle`, `queryArticleChunks`, `compareArticles` (placeholder), `exportArticleSummary`.
- **Export** — JSON and Markdown export endpoints for article summaries.
- **REST API** — `GET /health`, `POST /uploads`, `GET /articles`, `GET /articles/{id}`, `GET /articles/{id}/markdown`, `GET /articles/{id}/extraction`, `GET /articles/{id}/graph`, `POST /articles/{id}/chat`, `POST /articles/{id}/reprocess`, `GET /articles/{id}/export/json`, `GET /articles/{id}/export/markdown`, `GET /skills`, `POST /skills/{name}/run`.
- **Frontend** — Dashboard with backend health indicator, drag-and-drop upload page, articles list with search/status filter, article detail with 6 tabs (Reader, Summary, Chat, Graph, Metadata, Logs).
- **Tests** — 38 pytest tests covering ZIP safety, schema validation, chunking, and mock AI extraction + Q&A + embeddings.
- **Documentation** — `README.md` with setup instructions, `.env.example`, `AGENTS.md` with development guide.
