"""Chat router — article Q&A with full-text context, plus multi-article chat."""

import json
import logging
import datetime
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article, ChatMessage, ChatSession, TokenUsage
from app.schemas.chat import (
    ChatRequest, ChatResponse, ChatHistoryResponse, ChatMessageResponse,
    Citation, MultiArticleChatRequest, MultiArticleChatResponse,
)
from app.services.ai.base import get_llm_provider
from app.services.ai.cost import compute_token_cost
from app.core.config import settings
from app.services.search import retrieve_relevant_chunks

logger = logging.getLogger(__name__)
router = APIRouter()

# ── History window ────────────────────────────────────────────────────────

# Maximum number of prior message pairs to include as conversation context.
# Each pair is one user message + one assistant response.
MAX_HISTORY_TURNS = 10
_INLINE_CITATION_RE = re.compile(
    r'\[Chunk\s+(\d+)(?:,\s*Section:\s*"([^"]*)")?(?:\s*\(Pages?\s*(\d+)(?:-(\d+))?\))?\]',
    re.IGNORECASE,
)


def _extract_inline_citations(answer: str) -> list[dict]:
    citations: list[dict] = []
    seen: set[int] = set()
    for match in _INLINE_CITATION_RE.finditer(answer or ""):
        chunk_id = int(match.group(1))
        if chunk_id in seen:
            continue
        seen.add(chunk_id)
        page_start = int(match.group(3)) if match.group(3) else None
        page_end = int(match.group(4)) if match.group(4) else page_start
        citations.append(
            {
                "chunk_id": chunk_id,
                "section_title": match.group(2),
                "page_start": page_start,
                "page_end": page_end,
                "snippet": None,
            }
        )
    return citations


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

    chunks = retrieve_relevant_chunks(db, request.message, article_ids=[article_id], limit=8)
    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=article.title or article.original_filename,
        article_text=None if chunks else article.markdown_text,
        chunks=chunks or None,
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
            cost=compute_token_cost(
                llm.last_usage.model,
                llm.last_usage.prompt_tokens,
                llm.last_usage.completion_tokens,
            ),
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


@router.post("/{article_id}/chat/stream")
async def chat_with_article_stream(
    article_id: int,
    request: ChatRequest,
    db: Session = Depends(get_db),
):
    """Stream a chat answer token-by-token via Server-Sent Events."""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not article.markdown_text:
        raise HTTPException(status_code=400, detail="Article has not been processed yet")

    llm = get_llm_provider()

    async def event_stream():
        full_answer = ""
        citations: list[dict] = []
        try:
            chunks = retrieve_relevant_chunks(db, request.message, article_ids=[article_id], limit=8)
            async for token in llm.stream_answer(
                question=request.message,
                article_title=article.title or article.original_filename,
                article_text=None if chunks else article.markdown_text,
                chunks=chunks or None,
            ):
                full_answer += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            # Compute citations for streamed answer so behavior matches non-streaming chat.
            try:
                _, citations = await llm.answer_question(
                    question=request.message,
                    article_title=article.title or article.original_filename,
                    article_text=None if chunks else article.markdown_text,
                    chunks=chunks or None,
                )
            except Exception as e:
                logger.warning(f"Failed to compute citations for streamed chat: {e}")
                citations = []

            # Send completion event with full answer + citations
            yield f"data: {json.dumps({'done': True, 'answer': full_answer, 'citations': citations})}\n\n"

        except Exception as e:
            logger.error(f"Streaming chat failed: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # Save messages to DB after streaming completes
        try:
            prompt_tokens = max(1, len(request.message) // 4)
            completion_tokens = max(1, len(full_answer) // 4)
            if llm.last_usage and llm.last_usage.total_tokens > 0:
                prompt_tokens = llm.last_usage.prompt_tokens
                completion_tokens = llm.last_usage.completion_tokens

            user_msg = ChatMessage(
                article_id=article_id, role="user", content=request.message,
                prompt_tokens=prompt_tokens, completion_tokens=0,
            )
            assistant_msg = ChatMessage(
                article_id=article_id, role="assistant", content=full_answer,
                citations_json=json.dumps(citations),
                prompt_tokens=0, completion_tokens=completion_tokens,
            )
            db.add(user_msg)
            db.add(assistant_msg)
            if llm.last_usage and llm.last_usage.total_tokens > 0:
                db.add(TokenUsage(
                    article_id=article_id, step="chat",
                    model=llm.last_usage.model, provider=llm.last_usage.provider,
                    prompt_tokens=llm.last_usage.prompt_tokens,
                    completion_tokens=llm.last_usage.completion_tokens,
                    total_tokens=llm.last_usage.total_tokens,
                    cost=compute_token_cost(
                        llm.last_usage.model,
                        llm.last_usage.prompt_tokens,
                        llm.last_usage.completion_tokens,
                    ),
                ))
            db.commit()
        except Exception as e:
            logger.error(f"Failed to save streamed chat messages: {e}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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

        chunks = retrieve_relevant_chunks(db, request.message, limit=10)
        if chunks:
            answer, citations = await llm.answer_question(
                question=request.message,
                article_title=f"Library ({len(articles)} articles)",
                chunks=chunks,
            )
            article_ids = sorted({chunk.article_id for chunk in chunks})
        else:
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
            article_ids = [a.id for a in articles]

        return MultiArticleChatResponse(
            answer=answer,
            citations=citations,
            prompt_tokens=llm.last_usage.prompt_tokens if llm.last_usage else 0,
            completion_tokens=llm.last_usage.completion_tokens if llm.last_usage else 0,
            article_ids=article_ids,
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

    chunks = retrieve_relevant_chunks(db, request.message, article_ids=request.article_ids, limit=10)
    combined_text_parts = []
    if not chunks:
        for article in articles:
            if not article.markdown_text:
                continue
            title = article.title or article.original_filename
            combined_text_parts.append(f"### Article: {title} (ID: {article.id})\n\n{article.markdown_text}")

    if not chunks and not combined_text_parts:
        raise HTTPException(status_code=400, detail="None of the requested articles have been processed yet")

    combined_text = "\n\n---\n\n".join(combined_text_parts) if combined_text_parts else None

    primary_title = article_map[request.article_ids[0]].title or article_map[request.article_ids[0]].original_filename

    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=f"{len(articles)} articles including '{primary_title}'",
        article_text=combined_text,
        chunks=chunks or None,
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


# ── Chat Sessions ─────────────────────────────────────────────────────────

from pydantic import BaseModel as PydanticBaseModel


class SessionResponse(PydanticBaseModel):
    id: int
    title: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class SessionListResponse(PydanticBaseModel):
    sessions: list[SessionResponse]


class SessionCreateRequest(PydanticBaseModel):
    title: str = "New Chat"


class SessionMessageRequest(PydanticBaseModel):
    message: str
    article_ids: list[int] = []


class SessionMessageResponse(PydanticBaseModel):
    answer: str
    citations: list[dict] = []
    prompt_tokens: int = 0
    completion_tokens: int = 0
    session_id: int


@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(db: Session = Depends(get_db)):
    """List all chat sessions, newest first."""
    sessions = (
        db.query(ChatSession)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        msg_count = db.query(ChatMessage).filter(ChatMessage.session_id == s.id).count()
        result.append(SessionResponse(
            id=s.id,
            title=s.title,
            created_at=s.created_at,
            updated_at=s.updated_at,
            message_count=msg_count,
        ))
    return SessionListResponse(sessions=result)


@router.post("/sessions", response_model=SessionResponse)
def create_session(request: SessionCreateRequest, db: Session = Depends(get_db)):
    """Create a new chat session."""
    session = ChatSession(title=request.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionResponse(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        message_count=0,
    )


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    """Delete a chat session and all its messages."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/sessions/{session_id}", response_model=ChatHistoryResponse)
def get_session_messages(session_id: int, db: Session = Depends(get_db)):
    """Get all messages in a chat session."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
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
        chat_messages.append(ChatMessageResponse(
            id=m.id, role=m.role, content=m.content,
            citations=citations,
            prompt_tokens=m.prompt_tokens or 0,
            completion_tokens=m.completion_tokens or 0,
            created_at=m.created_at,
        ))

    return ChatHistoryResponse(article_id=0, messages=chat_messages)


@router.post("/sessions/{session_id}/messages", response_model=SessionMessageResponse)
async def send_session_message(
    session_id: int,
    request: SessionMessageRequest,
    db: Session = Depends(get_db),
):
    """Send a message in a chat session. Uses multi-article or library-wide context."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    llm = get_llm_provider()
    chunks = []

    if request.article_ids:
        # Tagged articles — send full text
        articles = db.query(Article).filter(Article.id.in_(request.article_ids)).all()
        if not articles:
            raise HTTPException(status_code=404, detail="No articles found")

        chunks = retrieve_relevant_chunks(db, request.message, article_ids=request.article_ids, limit=10)
        combined_parts = []
        if not chunks:
            for a in articles:
                if a.markdown_text:
                    title = a.title or a.original_filename
                    combined_parts.append(f"### {title} (ID: {a.id})\n\n{a.markdown_text}")

        if not chunks and not combined_parts:
            raise HTTPException(status_code=400, detail="No processed articles found")

        article_text = "\n\n---\n\n".join(combined_parts) if combined_parts else None
        primary_title = articles[0].title or articles[0].original_filename
        context_title = f"{len(articles)} articles including '{primary_title}'"
    else:
        # No tags — send all article summaries
        articles = db.query(Article).filter(
            Article.markdown_text.isnot(None), Article.markdown_text != ""
        ).all()

        if not articles:
            raise HTTPException(status_code=400, detail="No processed articles available")

        chunks = retrieve_relevant_chunks(db, request.message, limit=10)
        if chunks:
            article_text = None
            request.article_ids = sorted({chunk.article_id for chunk in chunks})
        else:
            summaries = []
            for a in articles:
                title = a.title or a.original_filename
                preview = (a.markdown_text or "")[:800]
                summaries.append(f"## {title} (ID: {a.id})\n{preview}...\n")

            article_text = (
                f"The user is asking about articles in the library. Below are summaries "
                f"of {len(articles)} available articles. Use these to answer; cite which "
                f"article(s) your answer draws from.\n\n" + "\n---\n".join(summaries)
            )
            request.article_ids = [a.id for a in articles]
        context_title = f"Library ({len(articles)} articles)"

    # ── Load conversation history from this session ──────────────────
    prior_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_TURNS * 2)  # N user+assistant pairs
        .all()
    )
    # Reverse to chronological order (oldest first) for the LLM
    prior_messages.reverse()

    history: list[dict] = []
    for msg in prior_messages:
        history.append({
            "role": msg.role,
            "content": msg.content,
        })

    answer, citations = await llm.answer_question(
        question=request.message,
        article_title=context_title,
        article_text=article_text,
        chunks=chunks or None,
        history=history,
    )

    if llm.last_usage and llm.last_usage.total_tokens > 0:
        prompt_tokens = llm.last_usage.prompt_tokens
        completion_tokens = llm.last_usage.completion_tokens
    else:
        prompt_tokens = max(1, len(request.message) // 4)
        completion_tokens = max(1, len(answer) // 4)

    # Save messages
    citations_json = json.dumps(citations)
    user_msg = ChatMessage(
        session_id=session_id, role="user", content=request.message,
        prompt_tokens=prompt_tokens, completion_tokens=0,
    )
    assistant_msg = ChatMessage(
        session_id=session_id, role="assistant", content=answer,
        citations_json=citations_json, prompt_tokens=0, completion_tokens=completion_tokens,
    )
    db.add(user_msg)
    db.add(assistant_msg)
    session.updated_at = datetime.datetime.utcnow()

    # Auto-title: use first user message as title
    msg_count = db.query(ChatMessage).filter(ChatMessage.session_id == session_id, ChatMessage.role == "user").count()
    if msg_count <= 1:
        session.title = request.message[:80] + ("..." if len(request.message) > 80 else "")

    db.commit()

    return SessionMessageResponse(
        answer=answer, citations=citations,
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        session_id=session_id,
    )


@router.post("/sessions/{session_id}/messages/stream")
async def stream_session_message(
    session_id: int,
    request: SessionMessageRequest,
    db: Session = Depends(get_db),
):
    """Stream a chat answer token-by-token via SSE for a session.

    Loads conversation history from the session so the LLM has multi-turn
    context, then streams tokens as Server-Sent Events.
    """
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    llm = get_llm_provider()

    # ── Build article context ──────────────────────────────────────────
    if request.article_ids:
        articles = db.query(Article).filter(Article.id.in_(request.article_ids)).all()
        if not articles:
            raise HTTPException(status_code=404, detail="No articles found")
        chunks = retrieve_relevant_chunks(db, request.message, article_ids=request.article_ids, limit=10)
        combined_parts = []
        if not chunks:
            for a in articles:
                if a.markdown_text:
                    title = a.title or a.original_filename
                    combined_parts.append(f"### {title} (ID: {a.id})\n\n{a.markdown_text}")
        if not chunks and not combined_parts:
            raise HTTPException(status_code=400, detail="No processed articles found")
        article_text = "\n\n---\n\n".join(combined_parts) if combined_parts else None
        primary_title = articles[0].title or articles[0].original_filename
        context_title = f"{len(articles)} articles including '{primary_title}'"
    else:
        articles = db.query(Article).filter(
            Article.markdown_text.isnot(None), Article.markdown_text != ""
        ).all()
        if not articles:
            raise HTTPException(status_code=400, detail="No processed articles available")
        chunks = retrieve_relevant_chunks(db, request.message, limit=10)
        if chunks:
            article_text = None
            request.article_ids = sorted({chunk.article_id for chunk in chunks})
        else:
            summaries = []
            for a in articles:
                title = a.title or a.original_filename
                preview = (a.markdown_text or "")[:800]
                summaries.append(f"## {title} (ID: {a.id})\n{preview}...\n")
            article_text = (
                f"Below are summaries of {len(articles)} available articles:\n\n"
                + "\n---\n".join(summaries)
            )
            request.article_ids = [a.id for a in articles]
        context_title = f"Library ({len(articles)} articles)"

    # ── Load conversation history ──────────────────────────────────────
    prior_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_TURNS * 2)
        .all()
    )
    prior_messages.reverse()
    history = [{"role": m.role, "content": m.content} for m in prior_messages]

    async def event_stream():
        full_answer = ""
        try:
            async for token in llm.stream_answer(
                question=request.message,
                article_title=context_title,
                article_text=article_text,
                chunks=chunks or None,
                history=history,
            ):
                full_answer += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            citations = _extract_inline_citations(full_answer)

            yield f"data: {json.dumps({'done': True, 'answer': full_answer, 'citations': citations})}\n\n"

        except Exception as e:
            logger.error(f"Streaming session chat failed: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # Save messages after streaming
        try:
            prompt_tokens = max(1, len(request.message) // 4)
            completion_tokens = max(1, len(full_answer) // 4)
            if llm.last_usage and llm.last_usage.total_tokens > 0:
                prompt_tokens = llm.last_usage.prompt_tokens
                completion_tokens = llm.last_usage.completion_tokens

            citations_json = json.dumps(citations)
            db.add(ChatMessage(
                session_id=session_id, role="user", content=request.message,
                prompt_tokens=prompt_tokens, completion_tokens=0,
            ))
            db.add(ChatMessage(
                session_id=session_id, role="assistant", content=full_answer,
                citations_json=citations_json, prompt_tokens=0, completion_tokens=completion_tokens,
            ))
            session.updated_at = datetime.datetime.utcnow()
            msg_count = db.query(ChatMessage).filter(
                ChatMessage.session_id == session_id, ChatMessage.role == "user"
            ).count()
            if msg_count <= 1:
                session.title = request.message[:80] + ("..." if len(request.message) > 80 else "")
            db.commit()
        except Exception as e:
            logger.error(f"Failed to save streamed session messages: {e}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
