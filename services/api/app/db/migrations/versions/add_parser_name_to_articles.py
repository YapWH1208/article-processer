"""add parser_name to articles

Revision ID: add_parser_name_001
Revises: 9dea4a8d09de
Create Date: 2025-07-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_parser_name_001"
down_revision: Union[str, None] = "9dea4a8d09de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("articles", sa.Column("parser_name", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("articles", "parser_name")
