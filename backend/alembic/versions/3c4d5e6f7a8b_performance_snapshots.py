"""performance_snapshots

Revision ID: 3c4d5e6f7a8b
Revises: 2a3b4c5d6e7f
Create Date: 2026-06-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '3c4d5e6f7a8b'
down_revision: Union[str, None] = '2a3b4c5d6e7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'performance_snapshots',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('person_id', sa.UUID(), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('on_time_rate', sa.Float(), nullable=False),
        sa.Column('avg_delay_days', sa.Float(), nullable=False),
        sa.Column('total_tasks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_tasks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('delayed_tasks', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['person_id'], ['persons.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_perf_snap_person_id', 'performance_snapshots', ['person_id'])
    op.create_index('ix_perf_snap_date', 'performance_snapshots', ['snapshot_date'])


def downgrade() -> None:
    op.drop_index('ix_perf_snap_date', table_name='performance_snapshots')
    op.drop_index('ix_perf_snap_person_id', table_name='performance_snapshots')
    op.drop_table('performance_snapshots')
