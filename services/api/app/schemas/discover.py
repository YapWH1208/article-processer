"""Typed discovery and selected-source request/response contracts."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


SearchScope = Literal["title", "abstract", "keywords"]


class ConferenceCollectionResponse(BaseModel):
    key: str
    label: str
    year: int


class DiscoveryCandidate(BaseModel):
    id: int | None = None
    source_provider: str
    source_external_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    abstract: str | None = None
    keywords: list[str] = Field(default_factory=list)
    venue: str | None = None
    published_date: str | None = None
    landing_url: str | None = None
    pdf_url: str | None = None
    collection: str | None = None
    source_retrieved_at: datetime | None = None


class DiscoveryPage(BaseModel):
    items: list[DiscoveryCandidate] = Field(default_factory=list)
    total: int
    offset: int
    limit: int


class ArxivProvenanceRequest(BaseModel):
    """Ephemeral arXiv metadata supplied by the typed discovery response."""

    source_provider: Literal["arxiv"] = "arxiv"
    source_external_id: str = Field(..., min_length=1, max_length=128)
    source_landing_url: str = Field(..., min_length=8, max_length=2048)
    source_pdf_url: str | None = Field(default=None, max_length=2048)
    source_retrieved_at: datetime | None = None
    source_payload: dict[str, Any] | None = None
    title: str | None = Field(default=None, max_length=1024)
    authors: list[str] = Field(default_factory=list, max_length=100)
    abstract: str | None = None
    venue: str | None = Field(default=None, max_length=512)

    @field_validator("source_payload")
    @classmethod
    def _bound_source_payload(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None and len(json.dumps(value, ensure_ascii=False)) > 65_536:
            raise ValueError("Source payload must be at most 64 KiB")
        return value
