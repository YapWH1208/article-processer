"""Pydantic schemas for graph data."""

from typing import Optional
from pydantic import BaseModel


class GraphEntityResponse(BaseModel):
    id: int
    article_id: int
    type: str
    name: str
    canonical_name: Optional[str] = None
    properties: Optional[dict] = None
    evidence: Optional[dict] = None
    confidence: float

    model_config = {"from_attributes": True}


class GraphRelationshipResponse(BaseModel):
    id: int
    article_id: int
    source_entity_id: int
    target_entity_id: int
    type: str
    properties: Optional[dict] = None
    evidence: Optional[dict] = None
    confidence: float

    model_config = {"from_attributes": True}


class GraphResponse(BaseModel):
    entities: list[GraphEntityResponse]
    relationships: list[GraphRelationshipResponse]
