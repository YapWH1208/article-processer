# Changelog

All notable changes to the Article Processor project.

---

## [0.3.0] — 2026-08-11

### Added

- **Deep Analysis mode** - Processing now supports two AI modes alongside parse-only: **Quick Read** (the existing full pipeline — parse, extraction, knowledge graph — now the default) and **Deep Analysis** (Quick Read plus a comprehensive AI report). The report covers background, research problem, methodology deep-dive, datasets and setup, results interpretation, key findings, critical evaluation, reproducibility, limitations, and future work, with evidence pointers per section. Upload and URL import expose a three-way mode selector (Deep Analysis / Quick Read / Parse Only); article detail gains a Deep Analysis tab with a run action, and reprocess accepts `quick`/`deep` modes. The report is stored on the extraction record (`report_json`), exposed via `GET /articles/{id}/deep-report`, tracked as `deep_report` token usage, and editable as a new `deep_report` system message/input template in Settings. Mock AI generates a deterministic report so the feature works offline.
- **Release workflow changelog notes** - The desktop release workflow now derives the version from the tag and reads the matching `## [X.Y.Z]` section from `CHANGELOG.md` as the GitHub Release notes (via `scripts/release_notes.py`); a missing entry fails the release step instead of publishing static placeholder notes.

### Fixed

- **Deep mode token double-counting** - `deep_report` token usage rows included the extraction tokens because provider usage is accumulative and never reset; the pipeline now snapshots usage after extraction and records only the incremental report tokens, so dashboard metrics no longer double-count (and a failed report writes no stale row).
- **Deep report lost on re-extract** - Reprocessing in quick/extract-only mode deleted the old extraction row and silently wiped an existing Deep Analysis report; the report is now carried over to the new extraction record (and only replaced when a new report is actually generated).
- **Article stuck in `needs_review`** - A failed deep report set `needs_review`, which no later successful run cleared; a clean extraction re-run now resets the flag instead of leaving the article in review forever.
- **Completed jobs showing errors** - A `COMPLETED` job retained the `error` marker from a step-level failure (e.g. failed deep report), showing a red error line in the logs page; the marker is now cleared on completion while the failure stays visible in the log entries.
- **Mock vs real deep report divergence** - The mock provider skipped `validate_deep_report`, so sparse documents produced an empty report in mock mode that real providers would reject; the mock now validates identically.
- **Deep tab not tracking background jobs** - Reloading the article page during a running deep job showed the "No Deep Analysis report yet" empty state and allowed queueing a duplicate job; jobs now expose `analysis_mode`, and the Deep tab shows the in-progress state (and disables re-run) while a deep job is pending or running.
- **Raw step labels on upload page** - `chunking` and `deep_report` steps fell through to the raw internal step name; both now have human-readable labels.

### Fixed

- **Pipeline `asyncio` scoping bug** - An inner `import asyncio` shadowed the module import inside `run_pipeline`, breaking retry paths that call `asyncio.sleep` after a first-attempt success; the shadowing import is removed.

---

## [0.2.1] — 2026-08-08

### Changed

- **Source card markdown rendering** - Chat source cards now render snippet content through the same markdown pipeline as answers (headings, lists, code, math), while keeping the quoted, clamped excerpt look. A compact mode drops heavy media (images, tables) so the excerpt stays readable inside the two-line clamp, and the shared `ChatMarkdown` renderer replaces the duplicated inline config in the chat page. Snippets that open with a block-level element (headings, lists, quotes, code, tables) render without wrapping quotes so no stray quote mark dangles above the block, and excerpts containing only dropped media are skipped instead of showing an empty card.

### Fixed

- **Source card snippet quotes** - Quote marks now wrap the snippet inside the markdown content so they stay inline with the text; previously they were detached text nodes that rendered a dangling opening quote and a clipped closing quote under the two-line clamp.
- **Source card media clipping** - Images and tables no longer render at full size inside the clamped source excerpt (which showed only a top sliver); the compact markdown mode skips them so the quoted excerpt look holds for any snippet.

---

## [0.2.0] — 2026-08-07

### Added

- **Custom 404 page and skip link** - Branded not-found page, plus a skip-to-content link for keyboard and screen-reader users.
- **Ambient background glow and grain** - Subtle radial primary-tinted glow and a fixed grain overlay across the app shell for depth.
- **Self-hosted variable fonts** - Geist, Source Serif 4, and JetBrains Mono now ship via `@fontsource-variable`, removing the Google Fonts runtime dependency.
- **Redesign skill for AI assistants** - Local `.agents/skills/redesign-existing-projects` skill guiding AI coding assistants through premium UI redesigns.

### Changed

- **Split quick-start and run scripts** - `quickstart.sh`/`quickstart.bat` handle one-time setup (venv, installs, migrations) plus launch; `start.sh`/`start.bat` launch the services only. Stale root dependencies dropped; quick-start tests updated.
- **Design polish pass** - Cleaned color palette with tinted shadows, press feedback and refined hover states on buttons/cards/badges, and softer radii.
- **Standardized page headers** - Consistent header treatments across all pages; mobile layouts now use stable viewport heights instead of overflowing.
- **Graph visual palette** - Knowledge graph canvas redrawn in muted, theme-consistent colors.

### Fixed

- **Keyboard delete of chat sessions** - Enter/Space on the delete button was swallowed by the session-row keydown handler, so keyboard deletion never fired; keydown from child elements is now ignored.
- **Logs live indicator** - Paused polling correctly shows "Paused" instead of "Live".

---

## [0.1.1] — 2026-07-02

### Fixed

- **Desktop release publishing** - Set `GH_REPO` for desktop release publishing and upload release assets one at a time to avoid rate-limit failures.

---

## [0.1.0] — 2026-07-02

First tagged release — the local-first, desktop-capable application. The untagged development milestones (0.2.0–0.2.9, 0.3.0, 0.4.0) are merged into this entry.

### Added

- **Project scaffold** - FastAPI backend + Next.js frontend monorepo structure.
- **Document ingestion** - Upload PDF, ZIP, HTML, Markdown, or plain text files with type/size validation.
- **ZIP safety** - Path traversal prevention, zip bomb detection (file count and compression ratio checks).
- **Deduplication** - SHA-256 file hash dedup on upload.
- **Parsing pipeline** - Pluggable parser architecture with PDF (pypdf), HTML (BeautifulSoup), Markdown/text passthrough, MinerU, and Docling adapters with graceful fallback.
- **MinerU PDF parser** - State-of-the-art PDF-to-Markdown with layout preservation, image/figure extraction, table detection, and formula recognition. Extracted images persisted to `storage/images/` and served via `/storage/images`.
- **Docling PDF parser** - High-quality layout-aware PDF → Markdown conversion with table extraction, figure placeholders, and heading hierarchy preservation.
- **OCR adapter** - Tesseract-based OCR for scanned/image-based PDFs. PDF → image → OCR → Markdown pipeline with automatic textless-page detection.
- **Markdown normalization** - Whitespace cleanup, heading spacing, control character removal.
- **Section-aware chunking** - Headings-first split with overlap, page marker extraction, token estimation.
- **AI provider abstraction** - `BaseLLMProvider` + `BaseEmbeddingProvider` interfaces with factory functions.
- **Mock AI provider** - Deterministic extraction using regex/heuristics and keyword-based Q&A. Works without any API key.
- **Provider support** - OpenAI, Anthropic, Custom (OpenAI-compatible / Anthropic-compatible), plus DeepSeek, OpenRouter, GLM/Zhipu, MiniMax, Mimo/MiniMax-M1, and Kimi/Moonshot presets with base URLs, model dropdowns, and connection test support.
- **Multi-provider configuration system** - Configure multiple LLM providers with independent API keys, base URLs, models, and protocols; set an active provider or switch on the fly. Providers persist to `data/dev_config.json`. Full provider CRUD API (`GET/POST/PUT/DELETE /dev/providers`).
- **Protocol selector for custom providers** - OpenAI-compatible (`/v1/chat/completions`) or Anthropic-compatible (`/v1/messages`) protocol.
- **Chat model selector** - Dropdown in the chat page header switches between configured providers/models in one click.
- **Structured extraction schema** - 21-field JSON schema with evidence pointers (source section, page number, chunk ID, snippet).
- **Schema validation + retry** - Validates extraction JSON; retries once with a correction prompt; saves partial output and marks `needs_review` on second failure.
- **Processing pipeline** - Background thread orchestrator: parse → normalize → chunk → extract → graph → complete. Step-by-step logging with error tracking, plus manual worker (`python -m app.worker --article-id N`).
- **Progress bar for processing** - Live step-by-step pipeline progress bar with animated step indicators; polls job status every 2s and auto-reloads on completion.
- **Database models** - `Article`, `ArticleMetadata`, `ArticleChunk`, `ArticleExtraction`, `GraphEntity`, `GraphRelationship`, `ProcessingJob`, `ChatMessage` with SQLAlchemy + Alembic migrations.
- **Graph ontology** - 15 entity types (Article, Author, Method, Dataset, Experiment, Metric, Result, Claim, Task, Domain, Tool, Model, Citation, Keyword, Institution) and 10 relationship types.
- **Graph builder** - Converts extraction JSON into entities and relationships with confidence scoring and evidence pointers.
- **Global knowledge graph** (`/graph`) - Lightweight canvas-based force-directed graph (Obsidian-style) with zoom/pan/drag, entity type color coding, type filter, hover tooltips, and click-to-navigate. Backend: `GET /articles/graph/global`.
- **Metrics dashboard** (`/dashboard`) - Analytics page with time-range filter, KPI cards, line chart for articles over time, stacked bar chart for token usage by model, donut chart for articles by status, and top articles by chat token usage. Backend: `GET /dashboard/metrics` with configurable `?days=` param.
- **Token usage tracking in chat** - `ChatMessage` tracks `prompt_tokens` and `completion_tokens`; chat UI shows per-message counts and cumulative usage. Backend estimates tokens from text length (~4 chars/token).
- **Enhanced health endpoint** - `GET /health` now returns `llm_provider`, `llm_model`, `embedding_provider`, and `embedding_model`.
- **Skill registry** - 5 default skills: Research Paper Summary, Methodology Extraction, Experiment Extraction, Literature Review Notes, Reviewer Critique.
- **Skills management (CRUD)** - Create, edit, delete, import, and export skills from Settings → Skills tab. File-persisted to `data/skills.json`; built-in defaults preserved as fallbacks. New endpoints: `POST /skills`, `PUT /skills/{name}`, `DELETE /skills/{name}`, `GET /skills/export`, `POST /skills/import`.
- **Tool registry** - 5 internal tools: `searchArticles`, `getArticle`, `queryArticleChunks`, `compareArticles` (placeholder), `exportArticleSummary`.
- **Export** - JSON and Markdown export endpoints for article summaries; article batch export/import (`POST /articles/export`, `POST /imports/articles`); selected-article JSON export from the list batch action bar; unified settings export bundling settings + all articles + skills (`GET /settings/export`, `POST /settings/import`).
- **REST API** - `GET /health`, `POST /uploads`, `GET /articles`, `GET /articles/{id}`, `GET /articles/{id}/markdown`, `GET /articles/{id}/extraction`, `GET /articles/{id}/graph`, `POST /articles/{id}/chat`, `POST /articles/{id}/reprocess`, `GET /articles/{id}/export/json`, `GET /articles/{id}/export/markdown`, `GET /skills`, `POST /skills/{name}/run`, plus archive/restore, settings, jobs, and dashboard routes.
- **Frontend** - Dashboard, drag-and-drop upload page, articles list with search/status filter, article detail with 6 tabs (Reader, Summary, Chat, Graph, Metadata, Logs).
- **Complete frontend redesign with shadcn/ui** - All hand-rolled Tailwind components replaced with polished shadcn/ui (Radix UI + Tailwind) across every page; 16 shadcn/ui components; `components.json`; `lib/utils.ts` `cn()` utility.
- **Dark mode** - Full light/dark theme toggle in navbar, persisted to localStorage, with CSS variable-driven theming and OS theme listener.
- **Animations & micro-interactions** - framer-motion and CSS keyframes: animated count-up stats, staggered list entrances, hover lift, page and tab transitions, chat message animations, upload sparkle, pulse dots, animated drop zone, sonner toasts, navbar flourishes, mobile menu.
- **Visual design system** - Semantic color tokens, formal type scale (`h1`–`h4`, `body`, `caption`), CSS transition tokens, Inter + Source Serif 4 fonts, custom SVG favicon.
- **Server-side pagination** - Article list loads 20 per page with page controls (Prev/Next + page numbers), replacing unbounded scroll.
- **Global content search** - Search across all article Markdown bodies via `?q=` param with full-text SQLite matching, plus landing-page search dropdown.
- **Chat history persistence** - Chat messages saved server-side and reloaded on page refresh.
- **Chat sessions** - Multi-turn conversations persist across refreshes; sessions listed in a sidebar with create/delete and @-mention article tagging. Backend: `chat_sessions` + `chat_messages.session_id` (Alembic migration).
- **No-tag chat** - Chat works without tagging articles; the AI searches the full library and answers with context from all articles.
- **Chat starter guidance** - Empty chats show upload guidance for empty libraries and one-click starter prompts for library-wide or tagged-article questions.
- **Processing error display** - Failed articles show a red callout with the error message directly in the Reader tab.
- **ReactMarkdown rendering** - Reader tab renders headings, bold, links, tables, and code blocks.
- **Skills tab** - Built-in AI skills with Run button and inline structured results.
- **Breadcrumb navigation** - `← Articles > Title` on article detail header.
- **Sort controls** - Article list sort dropdown (Newest/Oldest, Title A–Z/Z–A, Status) with safe-allowlist backend params.
- **Test Connection** - Settings button validates LLM + embedding provider configs via minimal API calls.
- **Batch operations** - Checkbox selection, Select All, batch archive/restore, and batch delete with confirmation dialog.
- **Processing job history** - Collapsible job list in Metadata tab showing steps, timestamps, and errors.
- **Article archive/delete** - Soft-archive articles to hide them from the default list, or permanently delete with storage cleanup. `is_archived` column, `POST /articles/{id}/archive`, `POST /articles/{id}/unarchive`, `DELETE /articles/{id}`, `GET /articles?include_archived=true`.
- **Side-by-side chat** - Article detail shows content (Reader/Summary/Graph/Metadata) on the left and chat on the right, always visible; collapsible on desktop, slide-out on mobile.
- **Add to Chat** - Select text in the Reader and click "Add to Chat" to inject context; "Ask" buttons on summary sections ask targeted questions about specific claims or methodology.
- **Settings page** - `GET /settings`, `PUT /settings` for configuration from the UI (API keys, models, mock AI toggle, upload limits), persisting to `.env`. Later tabbed into Providers, System Messages, Templates, Model Params, and General (Parsers + Data import/export).
- **Inline article title editing** - Click the title in the article detail header to edit; Enter saves (`PATCH /articles/{id}`), Escape cancels.
- **PDF original view toggle** - Reader tab has a Markdown/PDF toggle for PDF source types, embedding the original file inline.
- **Extraction review editor** - Structured AI extraction JSON can be edited and saved from the article detail page; saving updates review status and refreshes search-derived data.
- **Global job queue visibility** - Logs include a queue overview with active, queued, failed, and completed jobs, current step, age, article title, worker information, and errors.
- **Retry failed jobs from Logs** - Failed queue items expose a retry action that requeues full article processing.
- **Operational home cockpit** - Home page prioritizes workspace status, content search, AI/provider health, queue attention, recent articles, and primary actions.
- **Jobs navigation and queue badge** - `/logs` exposed as Jobs in navigation and command palette, with a queue badge linking to active or failed work.
- **Upload setup checklist** - Upload shows backend, AI pipeline, and local queue readiness before file drop, with provider setup guidance.
- **Library recovery states** - Article list empty states distinguish an empty library from filtered no-results views and expose upload or clear-filter actions.
- **Article recovery callouts** - Failed and review-needed article detail states include retry, review, and job-history actions in the status banner.
- **Local-first article workspace** - Article detail uses a two-pane workspace with reader-first content and a tabbed side panel for Chat, Jobs, and Context; source chips link back to chunks or sections.
- **Reading Intelligence Guide** - Article detail opens with a guide-first brief derived from extraction, graph entities, and related-article overlap: TL;DR, read-first sections, key claims, limitations, concepts, suggested chat questions, and read-next recommendations.
- **Article-list URL state** - Search, content search, status filter, archived toggle, sorting, and pagination reflected in the URL for refresh-safe and shareable views.
- **Persistent upload queue** - Upload/import processing progress stored locally and resumed after refresh for active jobs.
- **Locale-backed bilingual UI toggle** - Header language button switches the app shell, pages, placeholders, generated chat prompts, and AI output-language instructions between English and Chinese, with per-language locale files.
- **Frontend state tests** - Node test coverage for article-list URL/export state, upload queue persistence, job queue action state, graph canvas state, extraction review parsing, and article workspace helpers.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) - Backend pytest + frontend build on push/PR.
- **Optional dependency groups** in `pyproject.toml`: `[docling]`, `[ocr]`, `[bibtex]`, `[auth]`, `[all]`.
- **Quick-start scripts** - `start.sh`/`start.bat` single-command launchers with OS detection, prerequisite checks, venv setup, migration, and dual-server startup.
- **Cross-platform desktop release packaging** - Desktop build with data-dir startup refactor.
- **Tests** - 38 pytest tests covering ZIP safety, schema validation, chunking, and mock AI extraction + Q&A + embeddings.
- **Documentation** - `README.md` with setup instructions, `.env.example`, `AGENTS.md` with development guide.

### Changed

- **RAG removed — full-context chat instead** - Embedding generation, vector search, and chunk retrieval removed; chat sends complete article text directly to the LLM. Embedding-related env vars (`EMBEDDING_PROVIDER`, `EMBEDDING_CUSTOM_*`, `OPENAI_EMBEDDING_MODEL`) deprecated.
- **System messages & input templates split** - The monolithic `prompts` block in `dev_config.json` split into `system_messages` (personas) and `input_templates` (data-injection wrappers with `{document}`, `{question}`, `{title}` placeholders), both editable from Settings.
- **Developer page merged into Settings** - `/dev` redirects to `/settings`; all configuration lives in one place.
- **Split AI provider into separate LLM and Embedding providers** - Different backends for chat/extraction and embeddings (e.g. Anthropic for LLM + OpenAI for embeddings). Custom provider options merged into a single "Custom" provider with protocol selector; env vars renamed (`AI_PROVIDER` → `LLM_PROVIDER`, `CUSTOM_API_BASE` → `LLM_CUSTOM_BASE_URL`, etc.) with auto-migration on save.
- **Settings page tabs** - Tabbed subpages (LLM / Embeddings / General, later Providers / System Messages / Templates / Model Params / General) for clear separation of concerns.
- **Unified export/import** - `GET /settings/export` bundles settings + all articles (full data with extraction, graph, markdown) + skills into one JSON file; `POST /settings/import` restores everything. Backwards-compatible with older settings-only exports. Standalone article and skills export/import buttons removed.
- **Human-readable parser names** - API responses display "MinerU (magic-pdf)", "Docling", "pypdf", "BeautifulSoup (HTML)", "Markdown passthrough" instead of raw class names, applied retroactively via schema `@model_validator`.
- **Graph tab removed from article detail** - Per-article graph view removed; knowledge graph is now the global page (`/graph`).
- **Landing page** - Immersive hero with particle canvas, floating orbs, typewriter headline, animated stats, accurate 5-step pipeline diagram matching `processor.py`, feature cards with hover-expand highlight tags, quick-links grid, integration stats strip, 3D tilt and scroll reveals.
- **Upload page** - Embedding model badge removed; LLM provider badge simplified to provider name, model, and protocol.
- **Navbar** - Removed `/dev` link; search bar replaced with Settings gear icon.
- **Parser priority default** - Changed from `docling_first` to `mineru_first` (MinerU → Docling → pypdf fallback chain).
- **Skill management moved** - Skill CRUD UI moved from article detail Skills tab to Settings → Skills tab.
- **Article detail layout** - Chat is always visible (side-by-side) instead of hidden behind a tab; archived articles show a badge and reduced opacity; "Show Archived" toggle on the list.
- **PdfParser OCR fallback** - Auto-detects textless PDF pages and attempts OCR before leaving them empty.
- **Backend startup** - PDF parser imports are lazy-loaded to reduce API startup time when optional parser packages are not installed.
- **Chat retrieval** - Local retrieval uses chunk-aware source metadata so generated answers can carry article, section, page, and chunk references back to the UI.
- **Functional/QOL polish** - Article list, upload, logs, and article detail workflows favor recoverable local state, direct queue actions, and clearer operational feedback.
- **Navbar** - Split into a client `Providers` component wrapping `AuthProvider`; later restructured into a header with sidebar layout.

### Fixed

- **AI extraction toggle bug** - Upload page `useCallback` closure captured `runAI` at initial `true` due to empty dependency array; changed to `[runAI]`. Backend hardened with explicit string-to-bool parsing.
- **PDF inline display** - `GET /articles/{id}/file` removed `filename` from `FileResponse` so PDFs render inline in the iframe instead of downloading.
- **Chat panel alignment** - Chat sidebar now starts below the tabs row (`pt-10`) so it aligns with the tab content area.
- **Pipeline skip path** - When `run_ai=False`, status no longer passes through `EXTRACTING`; the job records `parse_complete`, and `completed_at` is properly set.
- **MinerU adapter updated for v3.x** - Package is now `mineru` (not `magic-pdf`); adapter detects via CLI, module import, `do_parse` API, and legacy `magic_pdf` UNIPipe, with graceful fallback to pypdf.
- **`chat_messages.article_id` nullable** - SQLite silently ignored Alembic's `ALTER COLUMN ... NULLABLE`; fixed with a manual table rebuild and safety-net migration (`b1d2e3f4a5b6`) using `recreate='always'`.
- **`_load_dev_config` KeyError on `"prompts"`** - Deep-merge logic referenced the old `"prompts"` key; now deep-merges `system_messages` and `input_templates` independently from defaults.
- **CI** - Changed `pip install -e ".[test]"` to `.[dev]` to match pyproject.toml extras definition.
- **Syntax error** - `_SORT_COLUMNS` dict moved above `@router.get` decorator in `articles.py`.
- **Missing import** - `settings` singleton imported in `settings_page.py` for Test Connection endpoint.
- **Type mismatch** - `JobInfo.logs` field type corrected for API response compatibility.
- **Custom providers** - Now read from the correct split config fields; `CustomEmbeddingProvider` added for custom embedding endpoints.
- **Path resolution** - `config.py` resolves all relative paths (`./data`, `./storage`, `.env`) against the project root computed from the config file's own location.
- **Alembic path** - `alembic.ini` `script_location` changed to `app/db/migrations` (relative to `services/api/`).

### Removed

- **BibTeX entirely** - Import endpoint, export endpoint, parser module, and all UI references deleted.
- **Authentication surfaces** - Login/register/account-related routes and UI removed; the app is local-first and runs without user accounts.
- **Search command palette** - The ⌘K search bar in the navbar replaced with a Settings gear icon for quicker access.

---
