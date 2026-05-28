"""add baike_url to pois

Revision ID: a1b2c3d4e5f6
Revises: 39b141e69075
Create Date: 2026-05-28 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '39b141e69075'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pois', sa.Column('baike_url', sa.Text(), nullable=True))

    op.drop_column('pois', 'has_extended')
    op.execute(
        "ALTER TABLE pois ADD COLUMN has_extended boolean "
        "GENERATED ALWAYS AS ("
        "COALESCE(array_length(image_urls,1),0) > 0 "
        "OR website IS NOT NULL "
        "OR baike_url IS NOT NULL"
        ") STORED"
    )


def downgrade() -> None:
    op.drop_column('pois', 'has_extended')
    op.execute(
        "ALTER TABLE pois ADD COLUMN has_extended boolean "
        "GENERATED ALWAYS AS ("
        "COALESCE(array_length(image_urls,1),0) > 0 "
        "OR website IS NOT NULL"
        ") STORED"
    )
    op.drop_column('pois', 'baike_url')
