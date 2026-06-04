"""add_output_language_to_processing_jobs

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "processing_jobs",
        sa.Column("output_language", sa.String(length=16), nullable=False, server_default="en"),
    )


def downgrade() -> None:
    with op.batch_alter_table("processing_jobs") as batch_op:
        batch_op.drop_column("output_language")
