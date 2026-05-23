"""Pydantic schemas for chat and Q&A."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Citation(BaseModel):
    chunk_id: int
    section_title: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    snippet: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    message_id: int
    created_at: datetime
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    citations: Optional[list[Citation]] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    article_id: int
    messages: list[ChatMessageResponse]
