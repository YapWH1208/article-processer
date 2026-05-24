"""fix_article_id_nullable

Revision ID: b1d2e3f4a5b6
Revises: a8c1d2e3f4b5
Create Date: 2026-05-24 12:00:00.000000

SQLite doesn't support ALTER COLUMN — the previous migration's batch_alter_table
may not have applied the nullable change. This migration rebuilds the table
to ensure article_id is nullable for session-based chat.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b1d2e3f4a5b6'
down_revision: Union[str, None] = 'a8c1d2e3f4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rebuild chat_messages to ensure article_id is nullable
    with op.batch_alter_table('chat_messages', recreate='always') as batch_op:
        batch_op.alter_column('article_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('chat_messages', recreate='always') as batch_op:
        batch_op.alter_column('article_id', existing_type=sa.Integer(), nullable=False)
