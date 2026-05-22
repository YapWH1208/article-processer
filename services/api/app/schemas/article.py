"""Pydantic schemas for Article API."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ArticleSummary(BaseModel):
    id: int
    title: str
    status: str
    original_filename: str
    source_type: str
    created_at: datetime
    updated_at: datetime
    needs_review: bool = False
    is_archived: int = 0

    model_config = {"from_attributes": True}


class ArticleDetail(BaseModel):
    id: int
    title: str
    status: str
    original_filename: str
    source_type: str
    file_hash: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    processing_error: Optional[str] = None
    needs_review: bool = False
    is_archived: int = 0

    model_config = {"from_attributes": True}


class ArticleListResponse(BaseModel):
    articles: list[ArticleSummary]
    total: int


class UploadResponse(BaseModel):
    article_id: int
    job_id: int
    filename: str
    status: str


class ReprocessResponse(BaseModel):
    article_id: int
    job_id: int
    status: str
