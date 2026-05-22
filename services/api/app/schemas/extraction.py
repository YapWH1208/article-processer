"""Pydantic schemas for AI extraction results."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Evidence(BaseModel):
    source_section: Optional[str] = None
    page_number: Optional[int] = None
    chunk_id: Optional[int] = None
    snippet: Optional[str] = None


class KeyClaim(BaseModel):
    claim: str
    evidence: Optional[Evidence] = None
    confidence: Optional[float] = None


class Reference(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    citation_text: Optional[str] = None


class GraphEntityItem(BaseModel):
    type: str  # EntityType
    name: str
    canonical_name: Optional[str] = None
    properties: Optional[dict] = None
    evidence: Optional[Evidence] = None
    confidence: Optional[float] = None


class GraphRelationshipItem(BaseModel):
    source_name: str
    source_type: str
    target_name: str
    target_type: str
    type: str  # RelationshipType
    properties: Optional[dict] = None
    evidence: Optional[Evidence] = None
    confidence: Optional[float] = None


class ExtractionResult(BaseModel):
    """Schema for structured article extraction."""
    title: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    year: Optional[int] = None
    venue: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    url: Optional[str] = None
    abstract: Optional[str] = None
    background: Optional[str] = None
    research_problem: Optional[str] = None
    methodology: Optional[str] = None
    datasets: list[str] = Field(default_factory=list)
    experiments: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    results: Optional[str] = None
    limitations: Optional[str] = None
    future_work: Optional[str] = None
    key_claims: list[KeyClaim] = Field(default_factory=list)
    references: list[Reference] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    graph_entities: list[GraphEntityItem] = Field(default_factory=list)
    graph_relationships: list[GraphRelationshipItem] = Field(default_factory=list)


class ExtractionResponse(BaseModel):
    article_id: int
    schema_version: str
    extraction: Optional[ExtractionResult] = None
    validation_errors: Optional[list[str]] = None
    confidence: float
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
