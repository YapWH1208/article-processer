"""add analysis_mode and deep report columns

Revision ID: 9852ca8a7eb0
Revises: e5f6a7b8c9d0
Create Date: 2026-08-11 20:27:41.675063

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9852ca8a7eb0'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('article_extractions', sa.Column('report_json', sa.Text(), nullable=True))
    op.add_column('article_extractions', sa.Column('report_confidence', sa.Float(), nullable=True))
    op.add_column('processing_jobs', sa.Column('analysis_mode', sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column('processing_jobs', 'analysis_mode')
    op.drop_column('article_extractions', 'report_confidence')
    op.drop_column('article_extractions', 'report_json')
