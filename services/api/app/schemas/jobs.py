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
