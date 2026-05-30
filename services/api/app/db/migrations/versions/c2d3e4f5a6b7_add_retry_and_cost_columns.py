"""add_retry_and_cost_columns

Revision ID: c2d3e4f5a6b7
Revises: 662f194a96b4
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = '662f194a96b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add retry columns to processing_jobs
    op.add_column("processing_jobs", sa.Column("retry_count", sa.Integer(), default=0))
    op.add_column("processing_jobs", sa.Column("last_error", sa.Text(), nullable=True))

    # Add cost column to token_usage
    op.add_column("token_usage", sa.Column("cost", sa.Float(), default=0.0))


def downgrade() -> None:
    # SQLite doesn't support DROP COLUMN natively, but alembic batch mode handles it
    with op.batch_alter_table("processing_jobs") as batch_op:
        batch_op.drop_column("last_error")
        batch_op.drop_column("retry_count")

    with op.batch_alter_table("token_usage") as batch_op:
        batch_op.drop_column("cost")
