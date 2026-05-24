"""Chat router — article Q&A with RAG citations, plus multi-article chat."""

import json
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ChatMessage, ArticleChunk, TokenUsage
from app.schemas.chat import (
    ChatRequest, ChatResponse, ChatHistoryResponse, ChatMessageResponse,
    Citation, MultiArticleChatRequest, MultiArticleChatResponse,
)
from app.services.ai.rag import RagService
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
    """Ask a question about an article and get a cited answer."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not article.markdown_text:
        raise HTTPException(status_code=400, detail="Article has not been processed yet")

    # Get chunks for retrieval
    chunks = (
        db.query(ArticleChunk)
        .filter(ArticleChunk.article_id == article_id)
        .order_by(ArticleChunk.chunk_index)
        .all()
    )

    if not chunks:
        raise HTTPException(status_code=400, detail="Article has not been chunked yet")

    # Run RAG
    rag = RagService()
    llm = get_llm_provider()

    relevant_chunks = rag.retrieve(
        query=request.message,
        chunks=chunks,
        top_k=5,
    )

    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=article.title or article.original_filename,
        chunks=relevant_chunks,
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
    """Chat across multiple articles with combined RAG context.

    Accepts a list of article_ids and returns a single answer with
    citations that include the source article_id in the snippet prefix.
    """
    if not request.article_ids:
        raise HTTPException(status_code=400, detail="At least one article_id is required")

    # Fetch all requested articles
    articles = (
        db.query(Article)
        .filter(Article.id.in_(request.article_ids))
        .all()
    )
    if not articles:
        raise HTTPException(status_code=404, detail="No articles found")

    article_map = {a.id: a for a in articles}

    # Collect all chunks from all articles
    all_chunks: list[tuple[ArticleChunk, str]] = []  # (chunk, article_title)
    for article in articles:
        if not article.markdown_text:
            continue
        chunks = (
            db.query(ArticleChunk)
            .filter(ArticleChunk.article_id == article.id)
            .order_by(ArticleChunk.chunk_index)
            .all()
        )
        title = article.title or article.original_filename
        for c in chunks:
            all_chunks.append((c, title))

    if not all_chunks:
        raise HTTPException(status_code=400, detail="None of the requested articles have been processed yet")

    # Run RAG across combined chunks
    rag = RagService()
    llm = get_llm_provider()

    # Extract just the chunk objects for retrieval
    chunk_objects = [c for c, _ in all_chunks]
    relevant = rag.retrieve(query=request.message, chunks=chunk_objects, top_k=5)

    # Build context with article attribution
    context_chunks = []
    chunk_to_title = {c.id: t for c, t in all_chunks}
    for c in relevant:
        title = chunk_to_title.get(c.id, "Unknown")
        context_chunks.append((c, title))

    # Use the first article's title as the "primary" context identifier
    primary_title = article_map[request.article_ids[0]].title or article_map[request.article_ids[0]].original_filename

    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=f"{len(articles)} articles including '{primary_title}'",
        chunks=[c for c, _ in context_chunks],
    )

    # Enrich citations with article attribution
    for cit in citations:
        for c, title in context_chunks:
            if c.id == cit.chunk_id:
                cit.snippet = f"[{title}] {cit.snippet or ''}"
                break

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
