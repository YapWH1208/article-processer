"""Pydantic schemas for processing jobs."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class JobResponse(BaseModel):
    id: int
    article_id: int
    status: str
    current_step: Optional[str] = None
    logs: Optional[list[dict]] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JobQueueItem(BaseModel):
    job_id: int
    article_id: int
    article_title: str
    status: str
    queue_state: str
    current_step: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    locked_at: Optional[datetime] = None
    worker_id: Optional[str] = None
    age_seconds: int
    can_retry: bool


class JobQueueResponse(BaseModel):
    jobs: list[JobQueueItem]
    counts: dict[str, int]
