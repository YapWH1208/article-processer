# Changelog

All notable changes to the Article Processor project.

---

## [Unreleased] - 2026-05-31

### Added

- **Local-first article workspace** - Article detail pages now use a two-pane workspace with reader-first content and a tabbed side panel for Chat, Jobs, and Context. Source chips in chat answers link back to reader chunks or sections when citation metadata is available.
- **Extraction review editor** - Structured AI extraction JSON can be edited and saved from the article detail page. Saving reviewed extraction data updates review status and refreshes search-derived data.
- **Global job queue visibility** - Logs now include a queue overview with active, queued, failed, and completed jobs, current step, age, article title, worker information, and errors.
- **Retry failed jobs from Logs** - Failed queue items expose a retry action that requeues full article processing from the global queue surface.
- **Article-list URL state** - Article list search, content search, status filter, archived toggle, sorting, and pagination are reflected in the URL for refresh-safe and shareable views.
- **Batch JSON export from article list** - Selected articles can be exported directly from the batch action bar.
- **Persistent upload queue** - Upload/import processing progress is stored locally and resumed after refresh for active jobs.
- **Bilingual UI toggle** - Header language button switches the app shell, pages, placeholders, and generated chat prompts between English and Chinese.
- **Frontend state tests** - Node test coverage now includes article-list URL/export state, upload queue persistence, job queue action state, graph canvas state, extraction review parsing, and article workspace helpers.

### Changed

- **Backend startup** - PDF parser imports are lazy-loaded to reduce API startup time when optional parser packages are not installed.
- **Chat retrieval** - Local retrieval uses chunk-aware source metadata so generated answers can carry article, section, page, and chunk references back to the UI.
- **Functional/QOL polish** - Article list, upload, logs, and article detail workflows now favor recoverable local state, direct queue actions, and clearer operational feedback.

### Removed

- **Authentication surfaces** - Login/register/account-related routes and UI are removed. The app is local-first and runs without user accounts.

---

## [0.4.0] — 2026-05-24

### Changed (breaking)

- **RAG removed — full-context chat instead** — Embedding generation, vector search, and chunk retrieval have been removed. The chat feature now sends complete article text directly to the LLM. This eliminates the embedding pipeline step and simplifies the architecture. All embedding-related env vars (`EMBEDDING_PROVIDER`, `EMBEDDING_CUSTOM_*`, `OPENAI_EMBEDDING_MODEL`) are deprecated.
- **System messages & input templates split** — The old monolithic `prompts` block in `dev_config.json` has been split into `system_messages` (behavioral persona prompts) and `input_templates` (pure data-injection wrappers with `{document}`, `{question}`, `{title}` placeholders). The Developer page lets you edit both independently.
- **Developer page merged into Settings** — `/dev` now redirects to `/settings`. All configuration lives in one place: Providers, System Messages, Input Templates, Model Params, General (parsers, limits, mock AI), and Data import/export.
- **Search command palette removed** — The ⌘K search bar in the navbar has been replaced with a Settings gear icon for quicker access.

### Added

- **Multi-provider configuration system** — Configure multiple LLM providers with independent API keys, base URLs, models, and protocols. Set an active provider from the Settings → Providers tab, or switch on-the-fly from the Chat page. Providers persist to `data/dev_config.json`.
- **Provider CRUD API** — `GET/POST/PUT/DELETE /dev/providers`, `PUT /dev/providers/active`. Full management from the UI.
- **Protocol selector for custom providers** — When adding a Custom Endpoint provider, choose between OpenAI-compatible (`/v1/chat/completions`) and Anthropic-compatible (`/v1/messages`) protocol.
- **Chat model selector** — A dropdown in the chat page header shows the active provider/model and lets you switch between all configured providers in one click. Fetches from `GET /dev` and switches via `PUT /dev/providers/active`.
- **Chat sessions** — Multi-turn conversations persist across page refreshes. Sessions are listed in a sidebar, can be created/deleted, and support @-mention article tagging for focused context. Backend: `chat_sessions` + `chat_messages.session_id` (Alembic migration).
- **No-tag chat** — Chat works without tagging any articles. The AI searches your full library and answers with context from all available articles.
- **Landing page redesign** — Fully immersive hero with particle canvas, floating orbs, typewriter headline, animated stats. Accurate 5-step pipeline diagram (Upload → Parse → Chunk → Extract → Graph) with hover pulse animations. Feature cards with hover-expand highlight tags. Quick-links grid. Integration stats strip.

### Changed

- **Landing page** — Pipeline now shows the actual 5-step workflow matching `processor.py`. Feature cards renamed ("Full-Context Chat" instead of "Contextual RAG Chat"). Immersive micro-interactions: 3D tilt, scroll reveals with cubic-bezier easing, hover pulse rings, highlight tags on cards.
- **Upload page** — Embedding model badge removed. LLM provider badge simplified to show provider name, model, and protocol.
- **Navbar** — Removed `/dev` link. Search bar replaced with Settings gear icon.
- **Settings page** — Now contains 5 tabs: Providers, System Messages, Templates, Model Params, General (combining old /dev + /settings functionality). Parser listing and priority selector are in the General tab.

### Fixed

- **`chat_messages.article_id` nullable** — SQLite silently ignored Alembic's `ALTER COLUMN ... NULLABLE`. Fixed with a manual table rebuild and safety-net migration (`b1d2e3f4a5b6`) using `recreate='always'`.
- **`_load_dev_config` KeyError on `"prompts"`** — The deep-merge logic referenced the old `"prompts"` key, which was renamed to `system_messages` and `input_templates`. Now deep-merges both independently from defaults.

---

## [0.3.0] — 2026-05-23

### Added

- **Metrics dashboard** (`/dashboard`) — Professional analytics page with time-range filter (7d/30d/90d/1y/All), KPI cards (total articles, completed, tokens, graph entities, processing, failed, chat messages, avg process time), line chart for articles over time, stacked bar chart for token usage by model, donut chart for articles by status, and top articles table by chat token usage. Backend: `GET /dashboard/metrics` with configurable `?days=` param.
- **Global knowledge graph** (`/graph`) — Lightweight canvas-based force-directed graph (Obsidian-style), with zoom/pan/drag, entity type color coding, toggleable type filter, hover tooltips, and click-to-navigate to article. Backend: `GET /articles/graph/global`.
- **Model display on upload page** — Current LLM provider and model shown as a badge on the upload page, fetched from the enhanced `GET /health` endpoint.
- **Token usage tracking in chat** — `ChatMessage` model now tracks `prompt_tokens` and `completion_tokens`. Chat UI shows per-message token counts and cumulative token usage in the chat header. Backend estimates tokens from text length (~4 chars/token).
- **Enhanced health endpoint** — `GET /health` now returns `llm_provider`, `llm_model`, `embedding_provider`, and `embedding_model`.

### Changed

- **Home page redesign** — Dashboard page refactored into an attractive landing page at `/` with hero section, features grid, how-it-works steps, and CTA. NavBar link renamed from "Dashboard" to "Home".
- **Graph tab removed from article detail** — Per-article graph view removed; knowledge graph is now a global page (`/graph`).

### Fixed

- **MinerU adapter updated for v3.x** — The package is now `mineru` (not `magic-pdf`). Adapter detects via CLI (`shutil.which`), Python module (`import mineru`), `do_parse` API, and legacy `magic_pdf` UNIPipe — with graceful fallback to pypdf. Install instruction updated to `pip install -U "mineru[all]"`.

---

## [0.2.9] — 2025-07-22

### Changed (breaking)

- **BibTeX removed entirely** — BibTeX import endpoint, export endpoint, parser module, and all UI references deleted.
- **Unified export/import** — `GET /settings/export` now bundles settings + all articles (full data with extraction, graph, markdown) + skills into one JSON file. `POST /settings/import` restores everything. Backwards-compatible with older settings-only exports.
- **Standalone export/import removed** — Article export/import buttons removed from articles page. Skills export/import buttons removed from SkillManager. Everything is now unified under Settings → "Export All" / "Import All".
- **Human-readable parser names** — API responses display "MinerU (magic-pdf)", "Docling", "pypdf", "BeautifulSoup (HTML)", "Markdown passthrough" instead of raw class names. Applies retroactively to all articles via schema `@model_validator`.

### Added

- **Inline article title editing** — Click the title in the article detail header to edit; Enter saves (`PATCH /articles/{id}`), Escape cancels. Title defaults to the original filename and is never overwritten by parsing.

### Fixed

- **BibTeX import crash** — would trigger pipeline processing with a fake `storage_path`, causing failures. Removed along with BibTeX entirely.

---

## [0.2.8] — 2025-07-22

### Added

- **MinerU PDF parser** — state-of-the-art PDF-to-Markdown with layout preservation, image/figure extraction, table detection, and formula recognition. Auto-detected and preferred over Docling/pypdf when installed (`pip install magic-pdf`). Extracted images persisted to `storage/images/` and served via `/storage/images`.
- **Progress bar for processing** — live step-by-step pipeline progress bar with animated step indicators (Queued → Parsing → Chunking → AI Extraction → Embeddings → Graph → Done). Polls job status every 2s; auto-reloads article data when processing completes.
- **PDF original view toggle** — Reader tab now has a Markdown/PDF toggle button group (PDF source types only). The PDF view embeds the original file inline via `GET /articles/{id}/file`.
- **Skills management (CRUD)** — create, edit, delete, import, and export AI skills from the Settings → Skills tab. File-persisted to `data/skills.json`; built-in defaults preserved as fallbacks. New endpoints: `POST /skills`, `PUT /skills/{name}`, `DELETE /skills/{name}`, `GET /skills/export`, `POST /skills/import`.
- **6 new LLM providers** — DeepSeek (deepseek-chat, deepseek-coder, deepseek-reasoner), OpenRouter (200+ models), GLM/Zhipu (GLM-4 Plus/Flash/Long/Air), MiniMax (MiniMax-Text-01, abab6.5s), Mimo/MiniMax-M1, Kimi/Moonshot (v1-8k/32k/128k). All with preset base URLs, model dropdowns, optional coding/reasoning model fields, and connection test support. Full settings UI with radio cards and conditional fields.
- **Article batch export/import** — `POST /articles/export` exports selected articles as JSON (markdown + extraction + graph); `POST /imports/articles` recreates full articles from exported JSON. Export/Import buttons in the articles list page with file download/upload.

### Fixed

- **AI extraction toggle bug** — Upload page `useCallback` closure captured `runAI` at initial `true` value due to empty dependency array `[]`. Changed to `[runAI]` so the toggle state is respected. Backend hardened with explicit string-to-bool parsing for the `run_ai` form field.
- **PDF inline display** — `GET /articles/{id}/file` removed `filename` param from `FileResponse` to prevent `Content-Disposition: attachment`, allowing PDFs to render inline in the iframe instead of downloading.
- **Chat panel alignment** — Chat sidebar now starts below the tabs row (added `pt-10`) so it aligns vertically with the tab content area.
- **Pipeline skip path** — When `run_ai=False`, the article status no longer passes through `EXTRACTING`; the job records `parse_complete` instead of `extracting` for the skipped step; `completed_at` timestamp properly set.

### Changed

- **Skill management moved** — Skill CRUD UI moved from article detail Skills tab to Settings → Skills tab.
- **Parser priority default** — Changed from `docling_first` to `mineru_first` (MinerU → Docling → pypdf fallback chain).
- **Settings page tabs** — Added 5th tab: Skills (alongside LLM, Embeddings, General, Parsers).

---

## [0.2.7] — 2025-07-22

### UX Enhancements

- **Server-side pagination** — Article list loads 20 per page with page controls (Prev/Next + page numbers), replacing unbounded scroll.
- **Global content search** — Dashboard hero search bar searches across all article Markdown bodies via `?q=` param, with full-text SQLite matching.
- **Chat history persistence** — Chat messages saved server-side and reloaded on page refresh.
- **Processing error display** — Failed articles show a red callout with the error message directly in the Reader tab.
- **ReactMarkdown rendering** — Reader tab now renders formatted headings, bold, links, tables, and code blocks.
- **Skills tab** — Built-in AI skills (summary, methodology, experiment extraction, literature review, reviewer critique) with Run button and inline results.
- **Breadcrumb navigation** — `← Articles > Title` on article detail header.
- **Sort controls** — Article list sort dropdown: Newest/Oldest first, Title A–Z/Z–A, Status. Backend `sort_by`/`sort_order` params with safe allowlist.
- **Test Connection** — Settings page button validates LLM + embedding provider configs via minimal API calls before saving.
- **Batch operations** — Checkbox selection, Select All, batch archive/restore, and batch delete with confirmation dialog on articles list.
- **Processing job history** — Collapsible job list in Metadata tab showing steps, timestamps, and errors.

### Visual Design

- **Semantic color tokens** — `--success`, `--warning`, `--info` CSS vars with dark-mode variants; dashboard stat cards use theme-safe tokens.
- **Nav prefix matching** — Navigation highlights parent route for sub-pages (e.g. `/articles/123` highlights Articles).
- **Graph tab upgrade** — Entities grouped by type with color-coded badges; relationships rendered as directional cards with type badges.
- **Custom fonts** — Inter (sans) + Source Serif 4 (serif for Reader prose) via `next/font/google`.
- **Formal type scale** — `h1`–`h4`, `body`, `caption` font size tokens in Tailwind config.
- **Dark mode OS listener** — App reacts to OS theme changes in real time when no explicit preference is set.
- **CSS transition tokens** — `--ease-default`/`--ease-in`/`--ease-out` and duration tokens mapped to Tailwind.
- **Favicon** — Custom SVG favicon (blue document icon).
- **Empty state animations** — Gradient backgrounds, larger floating icons, better typography on empty dashboard/articles.
- **Metadata tab icons** — Contextual icons per metadata field (Calendar, FileText, Archive, etc.).
- **Source-type badges** — Article list rows show PDF/HTML/MD icon badges.
- **Skills structured results** — Key-value card layout replaces raw JSON output.
- **Suspense loading** — Root layout Suspense boundary with pulsing dot fallback for every route transition.

### Fixed

- **CI** — Changed `pip install -e ".[test]"` to `.[dev]` to match pyproject.toml extras definition.
- **Syntax error** — `_SORT_COLUMNS` dict moved above `@router.get` decorator in `articles.py`.
- **Missing import** — `settings` singleton imported in `settings_page.py` for Test Connection endpoint.
- **Type mismatch** — `JobInfo.logs` field type corrected for API response compatibility.

---

## [0.2.6] — 2025-07-22

### Added

- **Article archive/delete** — soft-archive articles to hide them from the default list, or permanently delete with storage cleanup.
- **Side-by-side chat** — the article detail page now shows content (Reader/Summary/Graph/Metadata) on the left and chat on the right, always visible. Collapsible on desktop, slide-out on mobile.
- **Add to Chat** — select text in the Reader and click "Add to Chat" to inject context; click "Ask" buttons on summary sections to ask targeted questions about specific claims, methodology, etc.
- **Settings export/import** — download all settings as JSON for cross-platform transfer; upload a previously exported JSON to restore configuration.

### Changed

- Article detail layout: chat is now always visible (side-by-side) instead of hidden behind a tab.
- Articles list: "Show Archived" toggle button to include/exclude archived articles.
- Archived articles show an "Archived" badge and reduced opacity in lists.

### Backend

- `is_archived` column added to Article model (Alembic migration).
- `POST /articles/{id}/archive`, `POST /articles/{id}/unarchive`, `DELETE /articles/{id}` endpoints.
- `GET /articles?include_archived=true` query param.
- `GET /settings/export`, `POST /settings/import` endpoints.
- `ArticleSummary` and `ArticleDetail` schemas now include `is_archived`.

---

## [0.2.5] — 2025-07-22

### Changed (breaking)

- **Split AI provider into separate LLM and Embedding providers** — you can now use different backends for chat/extraction and embeddings (e.g. Anthropic for LLM + OpenAI for embeddings, or Ollama for LLM + OpenAI cloud for embeddings).
- **Merged custom provider options** — the two `custom_openai` / `custom_anthropic` options are now a single "Custom" provider with a protocol selector (OpenAI-compatible / Anthropic-compatible).
- **Renamed env vars**: `AI_PROVIDER` → `LLM_PROVIDER`; `CUSTOM_API_BASE` → `LLM_CUSTOM_BASE_URL`; etc. Old vars are auto-migrated on save.
- **Settings page** now has tabbed subpages: **LLM** / **Embeddings** / **General** for clear separation of concerns.

### Added

- **GitHub Actions CI** (`.github/workflows/ci.yml`) — backend pytest + frontend build on push/PR.
- **CI badge** in README.
- **Provider documentation** in README with examples for Ollama, LiteLLM, OpenAI, Anthropic.

### Fixed

- Custom providers now read from the correct split config fields.
- `CustomEmbeddingProvider` added for custom embedding endpoints.

---

## [0.2.4] — 2025-07-22

### Added

- **Animations & micro-interactions** — the UI now feels alive with framer-motion and CSS keyframes.
- **Animated count-up** — stat card numbers animate from 0 on scroll into view (ease-out cubic).
- **Staggered list entrances** — article cards appear one-by-one with fade-up animation.
- **Hover lift** — cards elevate with spring physics on hover.
- **Page transitions** — route changes animate with smooth crossfade.
- **Tab transitions** — article detail tabs slide in/out.
- **Chat animations** — messages appear with scale+fade, typing indicator with 3 bouncing dots.
- **Upload sparkle** — confetti-like particles on successful upload.
- **Pulse dot** — live status indicators (backend health, processing state).
- **Animated drop zone** — breathing border animation + floating icon.
- **Sonner toasts** — notifications replace inline success/error boxes (settings, upload).
- **Hero section** — dashboard has an animated gradient hero with floating background blob.
- **Navbar flourishes** — logo rotates on hover, active nav has animated underline (layoutId), theme toggle spins.
- **Mobile menu** — slides open/closed with AnimatePresence.

### Changed

- Dashboard, Articles, Upload, Article Detail, Settings — all pages now use framer-motion primitives.
- Removed static success/error divs in favor of sonner toast notifications.

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
