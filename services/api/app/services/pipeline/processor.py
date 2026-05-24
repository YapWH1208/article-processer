"""Processing pipeline — orchestrates parsing, extraction, embedding, and graph steps."""

import json
import logging
import datetime
import traceback
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
from app.services.parsers.pdf import PdfParser
from app.services.parsers.html import HtmlParser
from app.services.parsers.markdown import MarkdownParser
from app.services.parsers.docling_adapter import DoclingAdapter
from app.services.parsers.mineru_adapter import MinerUAdapter
from app.services.pipeline.markdown_normalizer import normalize_markdown
from app.services.pipeline.chunking import chunk_markdown, estimate_tokens
from app.services.ai.base import get_llm_provider
from app.services.graph.builder import GraphBuilder
from app.core.config import settings

logger = logging.getLogger(__name__)
storage = LocalStorage()


# Parser registry — instantiate once, select at call time based on priority setting
_mineru = MinerUAdapter()
_docling = DoclingAdapter()
_pypdf = PdfParser()
_html = HtmlParser()
_md = MarkdownParser()

if _mineru.is_available:
    logger.info("MinerU detected — available for PDF parsing (default)")
elif _docling.is_available:
    logger.info("Docling detected — available for PDF parsing")
else:
    logger.info("Neither MinerU nor Docling installed — pypdf will be used for PDFs. "
                 "Install mineru for best results: pip install magic-pdf")


def _select_pdf_parser(priority: str):
    """Select PDF parser based on configured priority."""
    if priority == "pypdf":
        return _pypdf
    if priority == "ocr":
        return _pypdf  # PdfParser already has OCR fallback
    if priority == "docling":
        if _docling.is_available:
            return _docling
        logger.warning("docling requested but not installed, falling back")
    # mineru_first (default) or unknown — try MinerU first, then Docling, then pypdf
    if _mineru.is_available:
        return _mineru
    if _docling.is_available:
        return _docling
    return _pypdf


def _get_parsers():
    """Return parser dict using current settings priority."""
    return {
        "pdf": _select_pdf_parser(settings.parser_priority),
        "html": _html,
        "md": _md,
        "txt": _md,
    }


async def run_pipeline(article_id: int, run_ai: bool = True, start_step: str = "parse") -> None:
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

    try:
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            logger.error(f"Article {article_id} not found")
            return

        # Find or create the active job
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
            )
            db.add(job)
            db.flush()

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

            parser = _get_parsers().get(article.source_type)
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
            db.commit()
            return

        article.status = ArticleStatus.EXTRACTING.value
        db.commit()

        add_log("extracting", "Running AI extraction...")
        llm = get_llm_provider()

        extraction_result, validation_errors, confidence = await llm.extract_structured(
            markdown=markdown,
            article_title=article.title,
        )

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

        if validation_errors:
            add_log("extracting", f"Extraction complete with {len(validation_errors)} validation errors")
            article.needs_review = 1
        else:
            add_log("extracting", f"Extraction complete. Confidence: {confidence:.2f}")

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
            ))

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

            for entity in graph_entities:
                db.add(GraphEntity(
                    article_id=entity["article_id"],
                    type=entity["type"],
                    name=entity["name"],
                    canonical_name=entity.get("canonical_name"),
                    properties_json=json.dumps(entity.get("properties", {})),
                    evidence_json=json.dumps(entity.get("evidence", {})),
                    confidence=entity.get("confidence", 0.5),
                ))

            db.flush()

            for rel in graph_relationships:
                db.add(GraphRelationship(
                    article_id=rel["article_id"],
                    source_entity_id=rel["source_entity_id"],
                    target_entity_id=rel["target_entity_id"],
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
        add_log("completed", "Pipeline completed successfully")
        db.commit()

        logger.info(f"Pipeline completed for article {article_id}")

    except Exception as e:
        logger.error(f"Pipeline failed for article {article_id}: {e}")
        logger.error(traceback.format_exc())

        if job:
            job.status = JobStatus.FAILED.value
            job.error = str(e)
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


def run_pipeline_background(article_id: int, run_ai: bool = True, start_step: str = "parse") -> None:
    """Kick off pipeline in a background thread.

    start_step: "parse" (full pipeline) or "extract" (skip parse+chunk, start at extraction).
    """
    import asyncio
    import threading

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_pipeline(article_id, run_ai=run_ai, start_step=start_step))
        finally:
            loop.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    logger.info(f"Background pipeline started for article {article_id} (run_ai={run_ai}, start_step={start_step})")
