"""Processing pipeline — orchestrates parsing, extraction, embedding, and graph steps."""

import json
import logging
import datetime
import traceback
import asyncio
import threading
import uuid
from pathlib import Path

from app.db.session import SessionLocal
from app.db.models import (
    Article,
    ArticleChunk,
    ArticleExtraction,
    GraphEntity,
    GraphRelationship,
    ProcessingJob,
    TokenUsage,
    ArticleStatus,
    JobStatus,
)
from app.services.storage.local import LocalStorage
from app.services.pipeline.markdown_normalizer import normalize_markdown
from app.services.pipeline.chunking import chunk_markdown, estimate_tokens
from app.services.ai.base import get_llm_provider
from app.services.ai.cost import compute_token_cost
from app.services.ai.prompts import normalize_output_language
from app.services.graph.builder import GraphBuilder
from app.core.config import settings

logger = logging.getLogger(__name__)
storage = LocalStorage()


# ── Pipeline Retry ─────────────────────────────────────────────────────────

_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds


def _retry_delay(attempt: int) -> float:
    """Jittered exponential backoff: base * 2^attempt with ±25% jitter."""
    import random
    base = _RETRY_BASE_DELAY * (2 ** attempt)
    return base * (0.75 + random.random() * 0.5)


# Parser registry. Optional PDF engines are intentionally lazy: importing
# Docling/MinerU can take tens of seconds, so startup should not probe them.
_mineru = None
_docling = None
_pypdf = None
_html = None
_md = None
_pdf_parser_notice_logged_messages: set[str] = set()


def _get_mineru():
    global _mineru
    if _mineru is None:
        from app.services.parsers.mineru_adapter import MinerUAdapter
        _mineru = MinerUAdapter()
    return _mineru


def _get_docling():
    global _docling
    if _docling is None:
        from app.services.parsers.docling_adapter import DoclingAdapter
        _docling = DoclingAdapter()
    return _docling


def _get_pypdf():
    global _pypdf
    if _pypdf is None:
        from app.services.parsers.pdf import PdfParser
        _pypdf = PdfParser()
    return _pypdf


def _get_html():
    global _html
    if _html is None:
        from app.services.parsers.html import HtmlParser
        _html = HtmlParser()
    return _html


def _get_markdown():
    global _md
    if _md is None:
        from app.services.parsers.markdown import MarkdownParser
        _md = MarkdownParser()
    return _md


def _log_pdf_parser_notice(message: str, *, warning: bool = False) -> None:
    if message in _pdf_parser_notice_logged_messages:
        return
    if warning:
        logger.warning(message)
    else:
        logger.info(message)
    _pdf_parser_notice_logged_messages.add(message)


def _select_pdf_parser(priority: str):
    """Select PDF parser based on configured priority."""
    if priority == "pypdf":
        return _get_pypdf()
    if priority == "ocr":
        return _get_pypdf()  # PdfParser already has OCR fallback
    if priority == "docling":
        docling = _get_docling()
        if docling.is_available:
            _log_pdf_parser_notice("Docling detected - available for PDF parsing")
            return docling
        _log_pdf_parser_notice("docling requested but not installed, falling back", warning=True)
    # mineru_first (default) or unknown: try MinerU first, then Docling, then pypdf
    mineru = _get_mineru()
    if mineru.is_available:
        _log_pdf_parser_notice("MinerU detected - available for PDF parsing (default)")
        return mineru
    if priority != "docling":
        docling = _get_docling()
        if docling.is_available:
            _log_pdf_parser_notice("Docling detected - available for PDF parsing")
            return docling
    _log_pdf_parser_notice(
        "Neither MinerU nor Docling installed - pypdf will be used for PDFs. "
        "Install mineru for best results: pip install magic-pdf"
    )
    return _get_pypdf()


def _get_parser(source_type: str):
    """Return the parser for one source type without loading unrelated parsers."""
    if source_type == "pdf":
        return _select_pdf_parser(settings.parser_priority)
    if source_type == "html":
        return _get_html()
    if source_type in {"md", "txt"}:
        return _get_markdown()
    return None


async def run_pipeline(
    article_id: int,
    run_ai: bool = True,
    start_step: str = "parse",
    job_id: int | None = None,
    output_language: str = "en",
) -> None:
    """Run the processing pipeline for an article.

    run_ai=False: stops after chunking (parse-only mode).
    start_step="extract": skips parse + chunk, starts at AI extraction (requires existing markdown_text).

    Steps:
    1. Parse document to Markdown
    2. Normalize Markdown
    3. Chunk
    4. AI extraction
    5. Graph building
    """
    db = SessionLocal()
    job: ProcessingJob | None = None
    output_language = normalize_output_language(output_language)

    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            logger.error(f"Article {article_id} not found")
            return

        # Find or create the active job
        if job_id is not None:
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        else:
            job = (
                db.query(ProcessingJob)
                .filter(ProcessingJob.article_id == article_id)
                .order_by(ProcessingJob.created_at.desc())
                .first()
            )
        if not job:
            job = ProcessingJob(
                article_id=article_id,
                status=JobStatus.RUNNING.value,
                current_step="started",
                logs_json="[]",
                run_ai=1 if run_ai else 0,
                start_step=start_step,
                output_language=output_language,
            )
            db.add(job)
            db.flush()
        else:
            job.status = JobStatus.RUNNING.value
            job.run_ai = 1 if run_ai else 0
            job.start_step = start_step
            job.output_language = output_language
            job.locked_at = datetime.datetime.utcnow()
            db.commit()

        logs: list[dict] = json.loads(job.logs_json) if job.logs_json else []

        def add_log(step: str, message: str, error: bool = False):
            entry = {
                "step": step,
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "message": message,
                "error": error,
            }
            logs.append(entry)
            job.current_step = step
            job.logs_json = json.dumps(logs)
            if error:
                job.error = message
            db.commit()

        # ── Steps 1-2: Parse + Chunk (skipped in extraction-only mode) ─
        if start_step == "extract":
            # Use existing markdown — must already be parsed
            markdown = article.markdown_text
            if not markdown:
                raise ValueError("Cannot run extraction-only: article has no markdown_text. Run full pipeline first.")
            add_log("parsing", "Skipped — using existing markdown")
            add_log("chunking", "Skipped — using existing chunks (or re-chunking below)")
            # Re-chunk from existing markdown to ensure fresh chunks
            chunks = chunk_markdown(markdown)
            db.query(ArticleChunk).filter(ArticleChunk.article_id == article_id).delete()
            for c in chunks:
                db.add(ArticleChunk(
                    article_id=article_id,
                    chunk_index=c.chunk_index,
                    section_title=c.section_title,
                    page_start=c.page_start,
                    page_end=c.page_end,
                    text=c.text,
                    token_count=c.token_count,
                ))
            db.commit()
            add_log("chunking", f"Re-chunked: {len(chunks)} chunks from existing markdown")
        else:
            # ── Step 1: Parse ──────────────────────────────────────────
            add_log("parsing", "Starting document parsing...")
            article.status = ArticleStatus.PARSING.value
            db.commit()

            parser = _get_parser(article.source_type)
            if not parser:
                raise ValueError(f"No parser for source type: {article.source_type}")

            # Track which parser was used (human-readable name)
            _PARSER_DISPLAY_NAMES = {
                "MinerUAdapter": "MinerU (magic-pdf)",
                "DoclingAdapter": "Docling",
                "PdfParser": "pypdf",
                "HtmlParser": "BeautifulSoup (HTML)",
                "MarkdownParser": "Markdown passthrough",
            }
            cls_name = parser.__class__.__name__
            article.parser_name = _PARSER_DISPLAY_NAMES.get(cls_name, cls_name)

            parse_result = await parser.parse(Path(article.storage_path))
            markdown = normalize_markdown(parse_result.markdown)
            # Title stays as the filename from upload (user can edit via PATCH /articles/{id})
            article.markdown_text = markdown

            # Also save to disk
            md_path = storage.save_markdown(article_id, markdown)
            article.markdown_path = str(md_path)

            add_log("parsing", f"Parsing complete. Title: {article.title}")
            db.commit()

            # ── Step 2: Chunking ───────────────────────────────────────
            add_log("chunking", "Chunking document...")
            db.commit()

            chunks = chunk_markdown(markdown)

            # Delete old chunks
            db.query(ArticleChunk).filter(ArticleChunk.article_id == article_id).delete()

            for c in chunks:
                db.add(ArticleChunk(
                    article_id=article_id,
                    chunk_index=c.chunk_index,
                    section_title=c.section_title,
                    page_start=c.page_start,
                    page_end=c.page_end,
                    text=c.text,
                    token_count=c.token_count,
                ))

            add_log("chunking", f"Created {len(chunks)} chunks")
            db.commit()

        # ── Step 3: AI Extraction ──────────────────────────────────────
        if not run_ai:
            add_log("parse_complete", "AI pipeline disabled — skipping extraction and graph. Article ready for reading.")
            article.status = ArticleStatus.COMPLETED.value
            db.commit()
            job.status = JobStatus.COMPLETED.value
            job.completed_at = datetime.datetime.utcnow()
            job.locked_at = None
            job.worker_id = None
            db.commit()
            from app.services.search import upsert_article_search_index
            upsert_article_search_index(db, article_id)
            return

        article.status = ArticleStatus.EXTRACTING.value
        db.commit()

        # ── AI Extraction with retry ───────────────────────────────────
        extraction_result = None
        validation_errors = None
        confidence = 0.0

        for attempt in range(_MAX_RETRIES + 1):
            add_log("extracting", f"Running AI extraction... (attempt {attempt + 1})")
            llm = get_llm_provider()

            try:
                extraction_result, validation_errors, confidence = await llm.extract_structured(
                    markdown=markdown,
                    article_title=article.title,
                    output_language=output_language,
                )
            except Exception as extract_err:
                validation_errors = [str(extract_err)]
                extraction_result = None

            if extraction_result is not None and (validation_errors is None or len(validation_errors) == 0):
                break  # success

            if attempt < _MAX_RETRIES:
                delay = _retry_delay(attempt)
                logger.warning(
                    f"Extraction attempt {attempt + 1} failed for article {article_id} "
                    f"(errors: {validation_errors}). Retrying in {delay:.1f}s..."
                )
                import asyncio
                await asyncio.sleep(delay)
                # Reset job error for retry
                job.error = None
                job.retry_count = attempt + 1
                db.commit()

        # Delete old extractions
        db.query(ArticleExtraction).filter(
            ArticleExtraction.article_id == article_id
        ).delete()

        extraction = ArticleExtraction(
            article_id=article_id,
            schema_version="1.0",
            extraction_json=json.dumps(extraction_result) if extraction_result else None,
            confidence=confidence,
            validation_errors=json.dumps(validation_errors) if validation_errors else None,
        )
        db.add(extraction)

        # Record extraction token usage
        if llm.last_usage and llm.last_usage.total_tokens > 0:
            db.add(TokenUsage(
                article_id=article_id,
                step="extraction",
                model=llm.last_usage.model,
                provider=llm.last_usage.provider,
                prompt_tokens=llm.last_usage.prompt_tokens,
                completion_tokens=llm.last_usage.completion_tokens,
                total_tokens=llm.last_usage.total_tokens,
                cost=compute_token_cost(
                    llm.last_usage.model,
                    llm.last_usage.prompt_tokens,
                    llm.last_usage.completion_tokens,
                ),
            ))

        if extraction_result is None:
            failure_message = "; ".join(validation_errors or ["AI extraction returned no result"])
            article.needs_review = 1
            article.status = ArticleStatus.FAILED.value
            article.processing_error = failure_message
            job.status = JobStatus.FAILED.value
            job.last_error = failure_message
            job.retry_count = _MAX_RETRIES
            job.completed_at = datetime.datetime.utcnow()
            job.locked_at = None
            job.worker_id = None
            add_log("extracting", failure_message, error=True)
            logger.warning(f"Pipeline extraction failed for article {article_id}: {failure_message}")
            return

        if validation_errors:
            add_log("extracting", f"Extraction complete with {len(validation_errors)} validation errors")
            article.needs_review = 1
        else:
            add_log("extracting", f"Extraction complete. Confidence: {confidence:.2f}")

        db.commit()

        # ── Step 4: Graph Building ─────────────────────────────────────
        add_log("graph", "Building graph entities...")
        if extraction_result:
            builder = GraphBuilder()
            graph_entities, graph_relationships = builder.build_from_extraction(
                article_id=article_id,
                extraction=extraction_result,
            )

            # Delete old graph data
            db.query(GraphRelationship).filter(
                GraphRelationship.article_id == article_id
            ).delete()
            db.query(GraphEntity).filter(
                GraphEntity.article_id == article_id
            ).delete()

            temp_to_db_id: dict[int, int] = {}
            for index, entity in enumerate(graph_entities, start=1):
                graph_entity = GraphEntity(
                    article_id=entity["article_id"],
                    type=entity["type"],
                    name=entity["name"],
                    canonical_name=entity.get("canonical_name"),
                    properties_json=json.dumps(entity.get("properties", {})),
                    evidence_json=json.dumps(entity.get("evidence", {})),
                    confidence=entity.get("confidence", 0.5),
                )
                db.add(graph_entity)
                db.flush()
                temp_id = int(entity.get("temp_id") or index)
                temp_to_db_id[temp_id] = graph_entity.id

            for rel in graph_relationships:
                source_entity_id = temp_to_db_id.get(rel["source_entity_id"])
                target_entity_id = temp_to_db_id.get(rel["target_entity_id"])
                if source_entity_id is None or target_entity_id is None:
                    logger.warning(
                        "Skipping graph relationship with unknown temp ids: %s -> %s",
                        rel.get("source_entity_id"),
                        rel.get("target_entity_id"),
                    )
                    continue
                db.add(GraphRelationship(
                    article_id=rel["article_id"],
                    source_entity_id=source_entity_id,
                    target_entity_id=target_entity_id,
                    type=rel["type"],
                    properties_json=json.dumps(rel.get("properties", {})),
                    evidence_json=json.dumps(rel.get("evidence", {})),
                    confidence=rel.get("confidence", 0.5),
                ))

            add_log("graph", f"Graph built: {len(graph_entities)} entities, {len(graph_relationships)} relationships")

        # ── Complete ───────────────────────────────────────────────────
        article.status = ArticleStatus.COMPLETED.value
        if article.needs_review:
            article.status = ArticleStatus.NEEDS_REVIEW.value

        job.status = JobStatus.COMPLETED.value
        job.completed_at = datetime.datetime.utcnow()
        job.locked_at = None
        job.worker_id = None
        add_log("completed", "Pipeline completed successfully")
        db.commit()
        from app.services.search import upsert_article_search_index
        upsert_article_search_index(db, article_id)

        logger.info(f"Pipeline completed for article {article_id}")

    except Exception as e:
        logger.error(f"Pipeline failed for article {article_id}: {e}")
        logger.error(traceback.format_exc())

        if job:
            job.status = JobStatus.FAILED.value
            job.error = str(e)
            job.locked_at = None
            job.worker_id = None
            logs = json.loads(job.logs_json) if job.logs_json else []
            logs.append({
                "step": "error",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "message": str(e),
                "error": True,
            })
            job.logs_json = json.dumps(logs)

        article = db.query(Article).filter(Article.id == article_id).first()
        if article:
            article.status = ArticleStatus.FAILED.value
            article.processing_error = str(e)

        db.commit()
    finally:
        db.close()


_WORKER_LOCK = threading.Lock()
_WORKER_THREAD: threading.Thread | None = None
_WORKER_ID = f"pipeline-{uuid.uuid4()}"
_WORKER_POLL_INTERVAL_S = 1.0


async def run_queued_pipeline_job_once() -> bool:
    """Claim and run the oldest pending processing job.

    Returns True when a job was processed, False when the queue was empty.
    """
    db = SessionLocal()
    job: ProcessingJob | None = None
    try:
        job = (
            db.query(ProcessingJob)
            .filter(ProcessingJob.status == JobStatus.PENDING.value)
            .order_by(ProcessingJob.created_at.asc(), ProcessingJob.id.asc())
            .first()
        )
        if not job:
            return False

        job.status = JobStatus.RUNNING.value
        job.locked_at = datetime.datetime.utcnow()
        job.worker_id = _WORKER_ID
        run_ai = bool(job.run_ai)
        start_step = job.start_step or "parse"
        output_language = normalize_output_language(job.output_language)
        article_id = job.article_id
        job_id = job.id
        db.commit()
    finally:
        db.close()

    await run_pipeline(
        article_id,
        run_ai=run_ai,
        start_step=start_step,
        job_id=job_id,
        output_language=output_language,
    )
    return True


async def _worker_loop() -> None:
    while True:
        processed = await run_queued_pipeline_job_once()
        if not processed:
            await asyncio.sleep(_WORKER_POLL_INTERVAL_S)


def ensure_pipeline_worker_started() -> None:
    """Start the singleton local worker that drains persisted pending jobs."""
    global _WORKER_THREAD
    with _WORKER_LOCK:
        if _WORKER_THREAD and _WORKER_THREAD.is_alive():
            return

        def _run():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(_worker_loop())
            finally:
                loop.close()

        _WORKER_THREAD = threading.Thread(target=_run, daemon=True, name="pipeline-worker")
        _WORKER_THREAD.start()
        logger.info("Pipeline worker started")


def resume_incomplete_pipeline_jobs() -> None:
    """Return interrupted running jobs to the durable pending queue on startup."""
    db = SessionLocal()
    try:
        jobs = (
            db.query(ProcessingJob)
            .filter(ProcessingJob.status == JobStatus.RUNNING.value)
            .all()
        )
        for job in jobs:
            job.status = JobStatus.PENDING.value
            job.locked_at = None
            job.worker_id = None
        db.commit()
        if jobs:
            logger.info("Re-queued %s interrupted processing jobs", len(jobs))
    finally:
        db.close()


def run_pipeline_background(
    article_id: int,
    run_ai: bool = True,
    start_step: str = "parse",
    job_id: int | None = None,
    output_language: str = "en",
) -> None:
    """Persist pipeline job options and wake the local queue worker."""
    output_language = normalize_output_language(output_language)
    db = SessionLocal()
    try:
        if job_id is not None:
            job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
        else:
            job = (
                db.query(ProcessingJob)
                .filter(
                    ProcessingJob.article_id == article_id,
                    ProcessingJob.status == JobStatus.PENDING.value,
                )
                .order_by(ProcessingJob.created_at.desc())
                .first()
            )
        if job:
            job.run_ai = 1 if run_ai else 0
            job.start_step = start_step
            job.output_language = output_language
            job.status = JobStatus.PENDING.value
            job.locked_at = None
            job.worker_id = None
            db.commit()
    finally:
        db.close()

    ensure_pipeline_worker_started()
    logger.info(
        "Pipeline job queued for article %s (run_ai=%s, start_step=%s, output_language=%s, job_id=%s)",
        article_id,
        run_ai,
        start_step,
        output_language,
        job_id,
    )
