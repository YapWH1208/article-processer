"""Repair direct-PDF links saved by the first conference catalogue import."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0c7d1f2a3b4e"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE conference_catalog_papers
            SET pdf_url = replace(pdf_url, '/hash/', '/file/')
            WHERE conference_key = 'neurips_2025'
              AND pdf_url LIKE '%/paper_files/paper/2025/hash/%-Paper-Conference.pdf'
            """
        )
    )
    bind.execute(
        sa.text(
            """
            UPDATE conference_catalog_papers
            SET pdf_url = replace(replace(landing_url, '/html/', '/papers/'), '.html', '.pdf')
            WHERE conference_key = 'cvpr_2026'
              AND (pdf_url IS NULL OR trim(pdf_url) = '')
              AND landing_url LIKE '%/content/CVPR2026/html/%_paper.html'
            """
        )
    )


def downgrade() -> None:
    # This data repair has no safe inverse: a correct URL can be refreshed or
    # manually edited after upgrade, so reconstructing the old malformed/null
    # value would delete valid catalogue data. The revision has no schema
    # change, therefore downgrade intentionally preserves repaired values.
    pass
