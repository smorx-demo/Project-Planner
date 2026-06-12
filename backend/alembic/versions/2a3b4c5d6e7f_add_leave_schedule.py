"""add_leave_schedule_to_persons

Revision ID: 2a3b4c5d6e7f
Revises: 171151e8690d
Create Date: 2026-06-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '2a3b4c5d6e7f'
down_revision: Union[str, None] = '171151e8690d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'persons',
        sa.Column(
            'leave_schedule',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default='[]',
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('persons', 'leave_schedule')
