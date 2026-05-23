"""Pydantic schemas for Article API."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator


# Map internal parser class names to human-readable display names
_PARSER_DISPLAY: dict[str, str] = {
    "MinerUAdapter": "MinerU (magic-pdf)",
    "DoclingAdapter": "Docling",
    "PdfParser": "pypdf",
    "HtmlParser": "BeautifulSoup (HTML)",
    "MarkdownParser": "Markdown passthrough",
}


def _display_parser_name(raw: str | None) -> str | None:
    """Translate raw parser class name to a human-readable label."""
    if not raw:
        return None
    return _PARSER_DISPLAY.get(raw, raw)


class ArticleSummary(BaseModel):
    id: int
    title: str
    status: str
    original_filename: str
    source_type: str
    parser_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    needs_review: bool = False
    is_archived: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _translate_parser(self):
        self.parser_name = _display_parser_name(self.parser_name)
        return self


class ArticleDetail(BaseModel):
    id: int
    title: str
    status: str
    original_filename: str
    source_type: str
    parser_name: Optional[str] = None
    file_hash: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    processing_error: Optional[str] = None
    needs_review: bool = False
    is_archived: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def _translate_parser(self):
        self.parser_name = _display_parser_name(self.parser_name)
        return self


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
