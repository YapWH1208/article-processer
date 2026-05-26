"""Dashboard router — aggregated metrics for the analytics dashboard."""

import datetime
import json
import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text

from app.db.session import get_db
from app.db.models import Article, ChatMessage, GraphEntity, GraphRelationship, ProcessingJob, TokenUsage

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
        ~Article.status.in_(["completed", "failed", "needs_review"])
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

    # ── Token stats (from TokenUsage table) ────────────────────────────
    token_agg = db.query(
        func.coalesce(func.sum(TokenUsage.prompt_tokens), 0).label("pt"),
        func.coalesce(func.sum(TokenUsage.completion_tokens), 0).label("ct"),
        func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("tt"),
        func.coalesce(func.sum(TokenUsage.cost), 0.0).label("cost"),
    ).join(Article).filter(
        Article.is_archived == 0,
        TokenUsage.created_at >= cutoff,
    ).first()

    total_prompt_tokens = int(token_agg.pt) if token_agg else 0
    total_completion_tokens = int(token_agg.ct) if token_agg else 0
    total_tokens = int(token_agg.tt) if token_agg else (total_prompt_tokens + total_completion_tokens)
    total_cost = round(float(token_agg.cost) if token_agg else 0.0, 4)

    # Also include chat-message estimates as a fallback for older data
    chat_q = db.query(ChatMessage).join(Article).filter(
        Article.is_archived == 0,
        ChatMessage.created_at >= cutoff,
    )
    total_chat_messages = chat_q.count()

    # ── Token usage by model (real model names from TokenUsage) ────────
    token_by_model_rows = (
        db.query(
            TokenUsage.model.label("model"),
            TokenUsage.provider.label("provider"),
            func.sum(TokenUsage.prompt_tokens).label("pt"),
            func.sum(TokenUsage.completion_tokens).label("ct"),
            func.sum(TokenUsage.total_tokens).label("tt"),
            func.count(TokenUsage.id).label("calls"),
        )
        .join(Article)
        .filter(
            Article.is_archived == 0,
            TokenUsage.created_at >= cutoff,
        )
        .group_by(TokenUsage.model, TokenUsage.provider)
        .order_by(text("tt DESC"))
        .all()
    )
    token_usage_by_model = [
        {
            "model": row.model or "unknown",
            "provider": row.provider or "unknown",
            "prompt_tokens": int(row.pt),
            "completion_tokens": int(row.ct),
            "total_tokens": int(row.tt),
            "call_count": row.calls,
        }
        for row in token_by_model_rows
    ]

    # ── Cost by model ────────────────────────────────────────────────
    cost_by_model_rows = (
        db.query(
            TokenUsage.model.label("model"),
            TokenUsage.provider.label("provider"),
            func.sum(TokenUsage.cost).label("cost"),
        )
        .join(Article)
        .filter(
            Article.is_archived == 0,
            TokenUsage.created_at >= cutoff,
        )
        .group_by(TokenUsage.model, TokenUsage.provider)
        .order_by(text("cost DESC"))
        .all()
    )
    cost_by_model = [
        {
            "model": row.model or "unknown",
            "provider": row.provider or "unknown",
            "cost": round(float(row.cost) if row.cost else 0.0, 4),
        }
        for row in cost_by_model_rows
    ]

    # ── Top articles by token usage (from TokenUsage) ─────────────────
    top_articles_rows = (
        db.query(
            Article.id,
            Article.title,
            func.coalesce(func.sum(TokenUsage.prompt_tokens), 0).label("pt"),
            func.coalesce(func.sum(TokenUsage.completion_tokens), 0).label("ct"),
            func.coalesce(func.sum(TokenUsage.total_tokens), 0).label("tt"),
        )
        .join(TokenUsage, Article.id == TokenUsage.article_id)
        .filter(TokenUsage.created_at >= cutoff)
        .group_by(Article.id)
        .order_by(text("tt DESC"))
        .limit(10)
        .all()
    )
    top_articles_by_tokens = [
        {
            "article_id": row.id,
            "title": row.title or f"Article #{row.id}",
            "prompt_tokens": int(row.pt),
            "completion_tokens": int(row.ct),
            "total_tokens": int(row.tt),
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
        "total_cost": total_cost,
        "token_usage_by_model": token_usage_by_model,
        "cost_by_model": cost_by_model,
        "top_articles_by_tokens": top_articles_by_tokens,
        "total_graph_entities": total_entities,
        "total_graph_relationships": total_relationships,
        "articles_with_graph": articles_with_graph,
        "avg_processing_seconds": avg_processing_seconds,
    }


@router.get("/logs")
def get_processing_logs(
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Return recent processing jobs with article info and token usage."""
    jobs = (
        db.query(ProcessingJob)
        .order_by(ProcessingJob.created_at.desc())
        .limit(limit)
        .all()
    )

    result = []
    for job in jobs:
        article = db.query(Article).filter(Article.id == job.article_id).first()
        token_rows = (
            db.query(TokenUsage)
            .filter(TokenUsage.article_id == job.article_id)
            .order_by(TokenUsage.created_at.asc())
            .all()
        )
        result.append({
            "job_id": job.id,
            "article_id": job.article_id,
            "article_title": article.title if article else "Unknown",
            "status": job.status,
            "current_step": job.current_step,
            "logs": json.loads(job.logs_json) if job.logs_json else [],
            "error": job.error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "token_usage": [
                {
                    "step": t.step,
                    "model": t.model,
                    "provider": t.provider,
                    "prompt_tokens": t.prompt_tokens,
                    "completion_tokens": t.completion_tokens,
                    "total_tokens": t.total_tokens,
                }
                for t in token_rows
            ],
        })

    return {"jobs": result, "count": len(result)}
