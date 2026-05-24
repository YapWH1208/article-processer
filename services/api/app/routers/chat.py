"""Chat router — article Q&A with full-text context, plus multi-article chat."""

import json
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ChatMessage, TokenUsage
from app.schemas.chat import (
    ChatRequest, ChatResponse, ChatHistoryResponse, ChatMessageResponse,
    Citation, MultiArticleChatRequest, MultiArticleChatResponse,
)
from app.services.ai.base import get_llm_provider
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{article_id}/chat", response_model=ChatResponse)
async def chat_with_article(
    article_id: int,
    request: ChatRequest,
    db: Session = Depends(get_db),
):
    """Ask a question about an article and get a cited answer.

    Sends the FULL article text to the LLM — no RAG retrieval step.
    """
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not article.markdown_text:
        raise HTTPException(status_code=400, detail="Article has not been processed yet")

    llm = get_llm_provider()

    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=article.title or article.original_filename,
        article_text=article.markdown_text,
    )

    # Use real token counts from LLM when available; fall back to estimate
    if llm.last_usage and llm.last_usage.total_tokens > 0:
        prompt_tokens = llm.last_usage.prompt_tokens
        completion_tokens = llm.last_usage.completion_tokens
    else:
        prompt_tokens = max(1, len(request.message) // 4)
        completion_tokens = max(1, len(answer) // 4)

    # Save message
    citations_json = json.dumps([c.model_dump() if hasattr(c, 'model_dump') else c for c in citations])
    user_msg = ChatMessage(
        article_id=article_id,
        role="user",
        content=request.message,
        prompt_tokens=prompt_tokens,
        completion_tokens=0,
    )
    assistant_msg = ChatMessage(
        article_id=article_id,
        role="assistant",
        content=answer,
        citations_json=citations_json,
        prompt_tokens=0,
        completion_tokens=completion_tokens,
    )
    db.add(user_msg)
    db.add(assistant_msg)

    # Record chat token usage
    if llm.last_usage and llm.last_usage.total_tokens > 0:
        db.add(TokenUsage(
            article_id=article_id,
            step="chat",
            model=llm.last_usage.model,
            provider=llm.last_usage.provider,
            prompt_tokens=llm.last_usage.prompt_tokens,
            completion_tokens=llm.last_usage.completion_tokens,
            total_tokens=llm.last_usage.total_tokens,
        ))

    db.commit()
    db.refresh(assistant_msg)

    return ChatResponse(
        answer=answer,
        citations=citations,
        message_id=assistant_msg.id,
        created_at=assistant_msg.created_at,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


@router.get("/{article_id}/chat", response_model=ChatHistoryResponse)
def get_chat_history(article_id: int, db: Session = Depends(get_db)):
    """Get chat history for an article."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.article_id == article_id)
        .order_by(ChatMessage.created_at)
        .all()
    )

    chat_messages = []
    for m in messages:
        citations = None
        if m.citations_json:
            try:
                citations = json.loads(m.citations_json)
            except json.JSONDecodeError:
                pass

        chat_messages.append(
            ChatMessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                citations=citations,
                prompt_tokens=m.prompt_tokens or 0,
                completion_tokens=m.completion_tokens or 0,
                created_at=m.created_at,
            )
        )

    return ChatHistoryResponse(article_id=article_id, messages=chat_messages)


# ── Multi-article chat ────────────────────────────────────────────────────

@router.post("/chat", response_model=MultiArticleChatResponse)
async def multi_article_chat(
    request: MultiArticleChatRequest,
    db: Session = Depends(get_db),
):
    """Chat across multiple articles with full-text context.

    If article_ids is empty, the LLM receives article summaries from the
    database and decides which articles to reference.

    Sends the FULL text of each article to the LLM — no RAG step.
    """
    llm = get_llm_provider()

    if not request.article_ids:
        # Chat without tagging — send all article summaries
        articles = db.query(Article).filter(
            Article.markdown_text.isnot(None),
            Article.markdown_text != "",
        ).all()

        if not articles:
            raise HTTPException(status_code=400, detail="No processed articles available")

        # Build a summary context
        summaries = []
        for a in articles:
            title = a.title or a.original_filename
            text_preview = (a.markdown_text or "")[:800]
            summaries.append(f"## {title} (ID: {a.id})\n{text_preview}...\n")

        context = (
            f"The user is asking about articles in the library. Below are summaries "
            f"of {len(articles)} available articles. Use these to answer the question; "
            f"cite which article(s) your answer draws from.\n\n"
            + "\n---\n".join(summaries)
        )

        answer, citations = await llm.answer_question(
            question=request.message,
            article_title=f"Library ({len(articles)} articles)",
            article_text=context,
        )

        return MultiArticleChatResponse(
            answer=answer,
            citations=citations,
            prompt_tokens=llm.last_usage.prompt_tokens if llm.last_usage else 0,
            completion_tokens=llm.last_usage.completion_tokens if llm.last_usage else 0,
            article_ids=[a.id for a in articles],
        )

    # Fetch all requested articles
    articles = (
        db.query(Article)
        .filter(Article.id.in_(request.article_ids))
        .all()
    )
    if not articles:
        raise HTTPException(status_code=404, detail="No articles found")

    article_map = {a.id: a for a in articles}

    # Combine full text of all articles
    combined_text_parts = []
    for article in articles:
        if not article.markdown_text:
            continue
        title = article.title or article.original_filename
        combined_text_parts.append(f"### Article: {title} (ID: {article.id})\n\n{article.markdown_text}")

    if not combined_text_parts:
        raise HTTPException(status_code=400, detail="None of the requested articles have been processed yet")

    combined_text = "\n\n---\n\n".join(combined_text_parts)

    primary_title = article_map[request.article_ids[0]].title or article_map[request.article_ids[0]].original_filename

    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=f"{len(articles)} articles including '{primary_title}'",
        article_text=combined_text,
    )

    # Token counts
    if llm.last_usage and llm.last_usage.total_tokens > 0:
        prompt_tokens = llm.last_usage.prompt_tokens
        completion_tokens = llm.last_usage.completion_tokens
    else:
        prompt_tokens = max(1, len(request.message) // 4)
        completion_tokens = max(1, len(answer) // 4)

    return MultiArticleChatResponse(
        answer=answer,
        citations=citations,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        article_ids=request.article_ids,
    )
