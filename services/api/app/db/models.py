"""SQLAlchemy ORM models for articles, extractions, graph, and jobs."""

import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, ForeignKey, JSON, Index, Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from app.db.session import Base
import enum


# ── Enums ────────────────────────────────────────────────────────────────────

class ArticleStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PARSING = "parsing"
    EXTRACTING = "extracting"
    INDEXING = "indexing"
    COMPLETED = "completed"
    FAILED = "failed"
    NEEDS_REVIEW = "needs_review"


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class EntityType(str, enum.Enum):
    ARTICLE = "Article"
    AUTHOR = "Author"
    INSTITUTION = "Institution"
    METHOD = "Method"
    DATASET = "Dataset"
    EXPERIMENT = "Experiment"
    METRIC = "Metric"
    RESULT = "Result"
    CLAIM = "Claim"
    TASK = "Task"
    DOMAIN = "Domain"
    TOOL = "Tool"
    MODEL = "Model"
    CITATION = "Citation"
    KEYWORD = "Keyword"


class RelationshipType(str, enum.Enum):
    USES_METHOD = "USES_METHOD"
    EVALUATES_ON = "EVALUATES_ON"
    REPORTS_RESULT = "REPORTS_RESULT"
    USES_METRIC = "USES_METRIC"
    CITES = "CITES"
    SUPPORTED_BY = "SUPPORTED_BY"
    ADDRESSES_TASK = "ADDRESSES_TASK"
    IMPROVES_ON = "IMPROVES_ON"
    HAS_LIMITATION = "HAS_LIMITATION"
    HAS_KEYWORD = "HAS_KEYWORD"


# ── Models ───────────────────────────────────────────────────────────────────

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(1024), default="")
    status = Column(String(32), default=ArticleStatus.UPLOADED.value)
    original_filename = Column(String(1024), nullable=False)
    file_hash = Column(String(64), nullable=True, index=True)
    source_type = Column(String(16), nullable=False)  # pdf, zip, html, md, txt
    parser_name = Column(String(64), nullable=True)   # e.g. PdfParser, DoclingAdapter, HtmlParser
    storage_path = Column(String(2048), nullable=False)
    markdown_path = Column(String(2048), nullable=True)
    markdown_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    processing_error = Column(Text, nullable=True)
    needs_review = Column(Integer, default=0)
    is_archived = Column(Integer, default=0)  # 0 = active, 1 = archived

    # Relationships
    metadata_items = relationship("ArticleMetadata", back_populates="article", uselist=False, cascade="all, delete-orphan")
    chunks = relationship("ArticleChunk", back_populates="article", cascade="all, delete-orphan")
    extractions = relationship("ArticleExtraction", back_populates="article", cascade="all, delete-orphan")
    entities = relationship("GraphEntity", back_populates="article", cascade="all, delete-orphan")
    relationships_graph = relationship("GraphRelationship", back_populates="article", cascade="all, delete-orphan")
    jobs = relationship("ProcessingJob", back_populates="article", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="article", cascade="all, delete-orphan")
    token_usage = relationship("TokenUsage", cascade="all, delete-orphan")


class ArticleMetadata(Base):
    __tablename__ = "article_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), unique=True, nullable=False)
    authors = Column(Text, nullable=True)  # JSON array
    year = Column(Integer, nullable=True)
    venue = Column(String(512), nullable=True)
    doi = Column(String(256), nullable=True)
    arxiv_id = Column(String(128), nullable=True)
    url = Column(String(2048), nullable=True)
    abstract = Column(Text, nullable=True)
    raw_metadata_json = Column(Text, nullable=True)  # Full raw metadata

    article = relationship("Article", back_populates="metadata_items")


class ArticleChunk(Base):
    __tablename__ = "article_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    section_title = Column(String(1024), nullable=True)
    page_start = Column(Integer, nullable=True)
    page_end = Column(Integer, nullable=True)
    text = Column(Text, nullable=False)
    token_count = Column(Integer, default=0)
    embedding_json = Column(Text, nullable=True)  # JSON array of floats

    article = relationship("Article", back_populates="chunks")

    __table_args__ = (
        Index("ix_article_chunks_article", "article_id"),
    )


class ArticleExtraction(Base):
    __tablename__ = "article_extractions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    schema_version = Column(String(16), default="1.0")
    extraction_json = Column(Text, nullable=True)  # Full extraction JSON
    confidence = Column(Float, default=0.0)
    validation_errors = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    article = relationship("Article", back_populates="extractions")


class GraphEntity(Base):
    __tablename__ = "graph_entities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(64), nullable=False)  # EntityType
    name = Column(String(512), nullable=False)
    canonical_name = Column(String(512), nullable=True)
    properties_json = Column(Text, nullable=True)
    evidence_json = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)

    article = relationship("Article", back_populates="entities")

    # Relationships where this entity is source or target
    outgoing = relationship(
        "GraphRelationship",
        foreign_keys="GraphRelationship.source_entity_id",
        back_populates="source_entity",
        cascade="all, delete-orphan",
    )
    incoming = relationship(
        "GraphRelationship",
        foreign_keys="GraphRelationship.target_entity_id",
        back_populates="target_entity",
        cascade="all, delete-orphan",
    )


class GraphRelationship(Base):
    __tablename__ = "graph_relationships"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    source_entity_id = Column(Integer, ForeignKey("graph_entities.id", ondelete="CASCADE"), nullable=False)
    target_entity_id = Column(Integer, ForeignKey("graph_entities.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(64), nullable=False)  # RelationshipType
    properties_json = Column(Text, nullable=True)
    evidence_json = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)

    article = relationship("Article", back_populates="relationships_graph")
    source_entity = relationship("GraphEntity", foreign_keys=[source_entity_id], back_populates="outgoing")
    target_entity = relationship("GraphEntity", foreign_keys=[target_entity_id], back_populates="incoming")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(32), default=JobStatus.PENDING.value)
    current_step = Column(String(64), nullable=True)
    logs_json = Column(Text, nullable=True)  # JSON array of log entries
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    article = relationship("Article", back_populates="jobs")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(256), default="New Chat")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=True)
    role = Column(String(32), nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    citations_json = Column(Text, nullable=True)  # JSON array of citation objects
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    article = relationship("Article", back_populates="messages")
    session = relationship("ChatSession", back_populates="messages")


class TokenUsage(Base):
    """Per-step LLM / embedding token usage for cost tracking and analytics."""

    __tablename__ = "token_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    step = Column(String(64), nullable=False)  # extraction / embedding / chat / skill
    model = Column(String(128), nullable=False)
    provider = Column(String(64), nullable=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    article = relationship("Article", back_populates="token_usage")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(256), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    display_name = Column(String(256), nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
