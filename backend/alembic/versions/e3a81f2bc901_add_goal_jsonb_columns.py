"""Add milestones and metadata_json to user_goals

Revision ID: e3a81f2bc901
Revises: d9f53540cbcd
Create Date: 2026-07-30

Adds the two JSONB columns that were in the ORM model but
missing from the initial user_goals migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e3a81f2bc901'
down_revision: Union[str, None] = 'd9f53540cbcd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add milestones JSONB column
    op.add_column(
        'user_goals',
        sa.Column('milestones', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # Add metadata_json JSONB column
    op.add_column(
        'user_goals',
        sa.Column('metadata_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('user_goals', 'metadata_json')
    op.drop_column('user_goals', 'milestones')
