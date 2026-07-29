"""add conference catalog and article provenance

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("article_metadata", sa.Column("source_provider", sa.String(length=64), nullable=True))
    op.add_column("article_metadata", sa.Column("source_external_id", sa.String(length=512), nullable=True))
    op.add_column("article_metadata", sa.Column("source_landing_url", sa.String(length=2048), nullable=True))
    op.add_column("article_metadata", sa.Column("source_pdf_url", sa.String(length=2048), nullable=True))
    op.add_column("article_metadata", sa.Column("source_collection", sa.String(length=64), nullable=True))
    op.add_column("article_metadata", sa.Column("source_retrieved_at", sa.DateTime(), nullable=True))
    op.add_column("article_metadata", sa.Column("source_payload_json", sa.Text(), nullable=True))

    op.create_table(
        "conference_catalog_papers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conference_key", sa.String(length=64), nullable=False),
        sa.Column("source_external_id", sa.String(length=512), nullable=False),
        sa.Column("title", sa.String(length=2048), nullable=False),
        sa.Column("authors_json", sa.Text(), nullable=True),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("keywords_json", sa.Text(), nullable=True),
        sa.Column("published_date", sa.String(length=64), nullable=True),
        sa.Column("venue", sa.String(length=512), nullable=True),
        sa.Column("landing_url", sa.String(length=2048), nullable=True),
        sa.Column("pdf_url", sa.String(length=2048), nullable=True),
        sa.Column("raw_payload_json", sa.Text(), nullable=False),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conference_key", "source_external_id", name="uq_conference_catalog_papers_source"),
    )
    op.create_index(
        "ix_conference_catalog_papers_collection_title",
        "conference_catalog_papers",
        ["conference_key", "title"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_conference_catalog_papers_collection_title", table_name="conference_catalog_papers")
    op.drop_table("conference_catalog_papers")
    with op.batch_alter_table("article_metadata") as batch_op:
        batch_op.drop_column("source_payload_json")
        batch_op.drop_column("source_retrieved_at")
        batch_op.drop_column("source_collection")
        batch_op.drop_column("source_pdf_url")
        batch_op.drop_column("source_landing_url")
        batch_op.drop_column("source_external_id")
        batch_op.drop_column("source_provider")
