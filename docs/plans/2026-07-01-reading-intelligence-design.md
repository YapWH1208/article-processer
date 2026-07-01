# Reading Intelligence Design

## Goal

Make the app more automated and helpful for understanding articles by adding a reading intelligence layer over the existing extraction, chunk, graph, related-article, and chat features.

## Product Shape

Reading Intelligence has two user-facing layers.

1. Article Intelligence gives each processed article a guided brief:
   - TL;DR
   - main contribution
   - method in plain language
   - key claims and results
   - limitations
   - terms and concepts to know
   - suggested sections to read first
   - suggested chat questions

2. Library Intelligence helps users decide what to read next across the library:
   - related articles
   - shared concepts
   - recommended reading order
   - comparison prompts
   - missing follow-up references

## Recommended V1

Start with deterministic insight packs derived from existing data instead of introducing a new agent orchestration layer.

The app already extracts structured fields, stores chunks with section titles, builds graph entities and relationships, supports related articles, and provides cited chat. V1 should compose those outputs into better reading guidance. This gives immediate user value while keeping the backend, queue, and UI changes small.

## Architecture

### Article Guide

Add pure helper logic that converts an `ExtractionResult`, markdown table of contents, graph/related metadata, and UI language into a normalized article guide model.

The guide should be available even when some data is missing. For example, if no extraction exists, the guide can still show a processing/recovery state and suggested next action. If no graph entities exist, it should hide the concepts section instead of showing empty panels.

### Library Guide

Add pure helper logic that ranks related articles and shared concepts into a compact "read next" model. V1 should use existing related-article similarity and shared entities. It should not add embeddings or a new database table yet.

### UI Integration

Reuse the article workspace instead of adding another top-level page. Add a `Guide` tab or upgrade the existing `Summary` tab with a guide-first layout. Include one-click actions that seed the existing chat composer with targeted questions.

On the library side, surface "Read next" and "Compare" actions where related articles already appear.

## Data Flow

1. Upload and processing continue through the existing pipeline.
2. Extraction, chunks, graph entities, and related articles are fetched by the article workspace.
3. Frontend state helpers derive the article guide and library guide.
4. The UI renders concise guidance and passes generated questions into the current chat flow.

## Error Handling

- Missing extraction: show an action to run extraction or review processing status.
- Failed article: reuse existing recovery callouts.
- Empty related articles: explain that more processed articles are needed.
- Low confidence extraction: show the guide but mark it as needing review.

## Testing Strategy

- Add Node tests for article guide derivation.
- Add Node tests for library reading-order derivation.
- Prefer pure `.mjs` state helpers so behavior is testable without browser mocks.
- Run frontend tests and production build before final completion.

## Not In V1

- New background agents
- New vector database
- Persistent insight tables
- Automatic external paper fetching
- Full citation-network analysis beyond existing references and related-article data

## Follow-Up

After V1, improve retrieval quality with hybrid FTS plus optional embeddings/reranking. That should make chat, related articles, and library-level recommendations more reliable without changing the user-facing workflow again.
