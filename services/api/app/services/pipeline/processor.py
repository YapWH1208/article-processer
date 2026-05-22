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
    ArticleStatus,
    JobStatus,
)
from app.services.storage.local import LocalStorage
from app.services.parsers.pdf import PdfParser
from app.services.parsers.html import HtmlParser
from app.services.parsers.markdown import MarkdownParser
from app.services.parsers.docling_adapter import DoclingAdapter
from app.services.pipeline.markdown_normalizer import normalize_markdown
from app.services.pipeline.chunking import chunk_markdown, estimate_tokens
from app.services.ai.base import get_llm_provider
from app.services.ai.embeddings import get_embedding_provider
from app.services.graph.builder import GraphBuilder
from app.core.config import settings

logger = logging.getLogger(__name__)
storage = LocalStorage()


# Parser registry — instantiate once, select at call time based on priority setting
_docling = DoclingAdapter()
_pypdf = PdfParser()
_html = HtmlParser()
_md = MarkdownParser()

if _docling.is_available:
    logger.info("Docling detected — available for PDF parsing")
else:
    logger.info("Docling not installed — pypdf will be used for PDFs. "
                 "Install docling for better results: pip install docling")


def _select_pdf_parser(priority: str):
    """Select PDF parser based on configured priority."""
    if priority == "pypdf":
        return _pypdf
    if priority == "ocr":
        return _pypdf  # PdfParser already has OCR fallback
    # docling_first or unknown
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


async def run_pipeline(article_id: int, run_ai: bool = True) -> None:
    """Run the processing pipeline for an article.

    If run_ai=False, stops after Markdown normalization (parse-only mode).

    Steps:
    1. Parse document to Markdown
    2. Normalize Markdown
    3. Chunk
    4. AI extraction (skipped if run_ai=False)
    5. Embeddings (skipped if run_ai=False)
    6. Graph building
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

        # ── Step 1: Parse ──────────────────────────────────────────────
        add_log("parsing", "Starting document parsing...")
        article.status = ArticleStatus.PARSING.value
        db.commit()

        parser = _get_parsers().get(article.source_type)
        if not parser:
            raise ValueError(f"No parser for source type: {article.source_type}")

        # Track which parser was used
        article.parser_name = parser.__class__.__name__

        parse_result = await parser.parse(Path(article.storage_path))
        markdown = normalize_markdown(parse_result.markdown)
        article.title = parse_result.title or article.original_filename
        article.markdown_text = markdown

        # Also save to disk
        md_path = storage.save_markdown(article_id, markdown)
        article.markdown_path = str(md_path)

        add_log("parsing", f"Parsing complete. Title: {article.title}")
        db.commit()

        # ── Step 2: Chunking ───────────────────────────────────────────
        add_log("chunking", "Chunking document...")
        article.status = ArticleStatus.EXTRACTING.value
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
            add_log("extracting", "AI pipeline disabled — skipping extraction, embeddings, and graph")
            article.status = ArticleStatus.COMPLETED.value
            db.commit()
            job.status = JobStatus.COMPLETED.value
            db.commit()
            return

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

        db.commit()

        # ── Step 4: Embeddings ─────────────────────────────────────────
        add_log("indexing", "Generating embeddings...")
        article.status = ArticleStatus.INDEXING.value
        db.commit()

        embedding_provider = get_embedding_provider()

        for chunk in db.query(ArticleChunk).filter(
            ArticleChunk.article_id == article_id
        ).all():
            embedding = await embedding_provider.embed(chunk.text)
            chunk.embedding_json = json.dumps(embedding)

        add_log("indexing", f"Embeddings generated for {len(chunks)} chunks")
        db.commit()

        # ── Step 5: Graph Building ─────────────────────────────────────
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


def run_pipeline_background(article_id: int, run_ai: bool = True) -> None:
    """Kick off pipeline in a background thread via FastAPI BackgroundTasks equivalent.

    Since we can't use FastAPI's BackgroundTasks outside of a request context,
    we use a simple thread-based approach for the MVP.
    """
    import asyncio
    import threading

    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_pipeline(article_id, run_ai=run_ai))
        finally:
            loop.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    logger.info(f"Background pipeline started for article {article_id} (run_ai={run_ai})")
