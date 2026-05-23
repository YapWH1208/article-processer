"""Dashboard router — aggregated metrics for the analytics dashboard."""

import datetime
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text

from app.db.session import get_db
from app.db.models import Article, ChatMessage, GraphEntity, GraphRelationship, ProcessingJob

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/metrics")
def get_dashboard_metrics(
    days: int = Query(default=30, ge=1, le=3650, description="Time window in days. Use 3650 for all-time."),
    db: Session = Depends(get_db),
):
    """Return aggregated dashboard metrics with optional time filtering."""
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)

    # ── Article counts ────────────────────────────────────────────────
    base_q = db.query(Article).filter(Article.is_archived == 0)
    time_q = base_q.filter(Article.created_at >= cutoff)

    total_articles = time_q.count()
    total_completed = time_q.filter(Article.status == "completed").count()
    total_failed = time_q.filter(Article.status == "failed").count()
    total_processing = time_q.filter(
        ~Article.status.in_(["completed", "failed"])
    ).count()

    # ── Articles by day (time series) ─────────────────────────────────
    # SQLite-compatible date grouping
    articles_by_day_rows = (
        db.query(
            func.date(Article.created_at).label("date"),
            func.count(Article.id).label("count"),
        )
        .filter(Article.created_at >= cutoff)
        .filter(Article.is_archived == 0)
        .group_by(func.date(Article.created_at))
        .order_by("date")
        .all()
    )
    articles_by_day = [
        {"date": str(row.date), "count": row.count}
        for row in articles_by_day_rows
    ]

    # ── Articles by status (pie) ──────────────────────────────────────
    status_rows = (
        db.query(Article.status, func.count(Article.id))
        .filter(Article.is_archived == 0)
        .group_by(Article.status)
        .all()
    )
    articles_by_status = [
        {"status": s, "count": c} for s, c in status_rows
    ]

    # ── Chat / Token stats ────────────────────────────────────────────
    chat_q = db.query(ChatMessage).join(Article).filter(
        Article.is_archived == 0,
        ChatMessage.created_at >= cutoff,
    )

    total_chat_messages = chat_q.count()
    token_row = db.query(
        func.coalesce(func.sum(ChatMessage.prompt_tokens), 0).label("pt"),
        func.coalesce(func.sum(ChatMessage.completion_tokens), 0).label("ct"),
    ).join(Article).filter(
        Article.is_archived == 0,
        ChatMessage.created_at >= cutoff,
    ).first()

    total_prompt_tokens = int(token_row.pt) if token_row else 0
    total_completion_tokens = int(token_row.ct) if token_row else 0
    total_tokens = total_prompt_tokens + total_completion_tokens

    # ── Token usage by model (proxy: by article's parser_name for now) ──
    # Since we don't store model per message, aggregate by article parser as proxy
    token_by_model_rows = (
        db.query(
            func.coalesce(Article.parser_name, Article.source_type).label("model"),
            func.coalesce(func.sum(ChatMessage.prompt_tokens), 0).label("pt"),
            func.coalesce(func.sum(ChatMessage.completion_tokens), 0).label("ct"),
            func.count(ChatMessage.id).label("msg_count"),
        )
        .join(ChatMessage, Article.id == ChatMessage.article_id)
        .filter(ChatMessage.created_at >= cutoff)
        .group_by(func.coalesce(Article.parser_name, Article.source_type))
        .order_by(text("pt + ct DESC"))
        .all()
    )
    token_usage_by_model = [
        {
            "model": row.model or "unknown",
            "prompt_tokens": int(row.pt),
            "completion_tokens": int(row.ct),
            "total_tokens": int(row.pt) + int(row.ct),
            "message_count": row.msg_count,
        }
        for row in token_by_model_rows
    ]

    # ── Top articles by token usage ───────────────────────────────────
    top_articles_rows = (
        db.query(
            Article.id,
            Article.title,
            func.coalesce(func.sum(ChatMessage.prompt_tokens), 0).label("pt"),
            func.coalesce(func.sum(ChatMessage.completion_tokens), 0).label("ct"),
        )
        .join(ChatMessage, Article.id == ChatMessage.article_id)
        .filter(ChatMessage.created_at >= cutoff)
        .group_by(Article.id)
        .order_by(text("pt + ct DESC"))
        .limit(10)
        .all()
    )
    top_articles_by_tokens = [
        {
            "article_id": row.id,
            "title": row.title or f"Article #{row.id}",
            "prompt_tokens": int(row.pt),
            "completion_tokens": int(row.ct),
            "total_tokens": int(row.pt) + int(row.ct),
        }
        for row in top_articles_rows
    ]

    # ── Graph stats ───────────────────────────────────────────────────
    total_entities = (
        db.query(GraphEntity)
        .join(Article)
        .filter(Article.is_archived == 0)
        .count()
    )
    total_relationships = (
        db.query(GraphRelationship)
        .join(Article)
        .filter(Article.is_archived == 0)
        .count()
    )
    articles_with_graph = (
        db.query(func.count(func.distinct(GraphEntity.article_id)))
        .join(Article)
        .filter(Article.is_archived == 0)
        .scalar()
    ) or 0

    # ── Processing time avg ──────────────────────────────────────────
    avg_time_row = (
        db.query(
            func.avg(
                func.julianday(ProcessingJob.completed_at) - func.julianday(ProcessingJob.created_at)
            )
        )
        .filter(
            ProcessingJob.status == "completed",
            ProcessingJob.completed_at.isnot(None),
            ProcessingJob.created_at >= cutoff,
        )
        .scalar()
    )
    avg_processing_seconds = round((avg_time_row or 0) * 86400, 1)  # days → seconds

    return {
        "total_articles": total_articles,
        "total_completed": total_completed,
        "total_failed": total_failed,
        "total_processing": total_processing,
        "articles_by_day": articles_by_day,
        "articles_by_status": articles_by_status,
        "total_chat_messages": total_chat_messages,
        "total_prompt_tokens": total_prompt_tokens,
        "total_completion_tokens": total_completion_tokens,
        "total_tokens": total_tokens,
        "token_usage_by_model": token_usage_by_model,
        "top_articles_by_tokens": top_articles_by_tokens,
        "total_graph_entities": total_entities,
        "total_graph_relationships": total_relationships,
        "articles_with_graph": articles_with_graph,
        "avg_processing_seconds": avg_processing_seconds,
    }
