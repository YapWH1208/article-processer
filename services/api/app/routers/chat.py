"""Chat router — article Q&A with RAG citations."""

import json
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ChatMessage, ArticleChunk, TokenUsage
from app.schemas.chat import ChatRequest, ChatResponse, ChatHistoryResponse, ChatMessageResponse, Citation
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
