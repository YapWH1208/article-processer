"""add_chat_sessions

Revision ID: a8c1d2e3f4b5
Revises: 6345f90bf14c
Create Date: 2026-05-24 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a8c1d2e3f4b5'
down_revision: Union[str, None] = '6345f90bf14c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create chat_sessions table
    op.create_table(
        'chat_sessions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # Add session_id to chat_messages (nullable, with FK)
    with op.batch_alter_table('chat_messages') as batch_op:
        batch_op.add_column(sa.Column('session_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_chat_messages_session_id',
            'chat_sessions',
            ['session_id'],
            ['id'],
            ondelete='CASCADE',
        )

    # Make article_id nullable in chat_messages (for session-based chats)
    with op.batch_alter_table('chat_messages') as batch_op:
        batch_op.alter_column('article_id', nullable=True)


def downgrade() -> None:
    # Make article_id non-nullable again
    with op.batch_alter_table('chat_messages') as batch_op:
        batch_op.alter_column('article_id', nullable=False)

    # Remove session_id FK and column
    with op.batch_alter_table('chat_messages') as batch_op:
        batch_op.drop_constraint('fk_chat_messages_session_id', type_='foreignkey')
        batch_op.drop_column('session_id')

    # Drop chat_sessions table
    op.drop_table('chat_sessions')
