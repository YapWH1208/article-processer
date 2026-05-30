"""queue_jobs_remove_auth

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b7
Create Date: 2026-05-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("processing_jobs", sa.Column("run_ai", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("processing_jobs", sa.Column("start_step", sa.String(length=32), nullable=False, server_default="parse"))
    op.add_column("processing_jobs", sa.Column("locked_at", sa.DateTime(), nullable=True))
    op.add_column("processing_jobs", sa.Column("worker_id", sa.String(length=128), nullable=True))
    op.execute("DROP TABLE IF EXISTS users")


def downgrade() -> None:
    with op.batch_alter_table("processing_jobs") as batch_op:
        batch_op.drop_column("worker_id")
        batch_op.drop_column("locked_at")
        batch_op.drop_column("start_step")
        batch_op.drop_column("run_ai")
