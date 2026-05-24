"""add_token_usage_table

Revision ID: 6345f90bf14c
Revises: 5ce40c704544
Create Date: 2026-05-23 22:33:22.313501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import datetime


# revision identifiers, used by Alembic.
revision: str = '6345f90bf14c'
down_revision: Union[str, None] = '5ce40c704544'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "token_usage",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("article_id", sa.Integer(), nullable=False),
        sa.Column("step", sa.String(64), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), default=0),
        sa.Column("completion_tokens", sa.Integer(), default=0),
        sa.Column("total_tokens", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(), default=datetime.datetime.utcnow),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_token_usage_article_id", "token_usage", ["article_id"])


def downgrade() -> None:
    op.drop_index("ix_token_usage_article_id", "token_usage")
    op.drop_table("token_usage")
