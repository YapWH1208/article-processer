"""add_deleted_at_to_articles

Revision ID: 662f194a96b4
Revises: b1d2e3f4a5b6
Create Date: 2026-05-25 20:49:15.099424

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '662f194a96b4'
down_revision: Union[str, None] = 'b1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('articles', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('articles', 'deleted_at')
