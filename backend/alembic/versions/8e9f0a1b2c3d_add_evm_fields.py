"""add evm fields

Revision ID: 8e9f0a1b2c3d
Revises: 7d8e9f0a1b2c
Create Date: 2026-06-11 00:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '8e9f0a1b2c3d'
down_revision = '7d8e9f0a1b2c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add EVM columns to activities
    op.add_column('activities', sa.Column('bac', sa.Float(), nullable=True))
    op.add_column('activities', sa.Column('bac_unit', sa.String(20), nullable=False, server_default='hours'))
    op.add_column('activities', sa.Column('planned_pct', sa.Float(), nullable=True))
    op.add_column('activities', sa.Column('actual_pct', sa.Float(), nullable=True))
    op.add_column('activities', sa.Column('actual_cost', sa.Float(), nullable=True))

    # Create evm_snapshots table
    op.create_table(
        'evm_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('activity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('pv', sa.Float(), nullable=True),
        sa.Column('ev', sa.Float(), nullable=True),
        sa.Column('ac', sa.Float(), nullable=True),
        sa.Column('spi', sa.Float(), nullable=True),
        sa.Column('cpi', sa.Float(), nullable=True),
        sa.Column('sv', sa.Float(), nullable=True),
        sa.Column('cv', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['activity_id'], ['activities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_evm_snapshots_project_id', 'evm_snapshots', ['project_id'])
    op.create_index('ix_evm_snapshots_snapshot_date', 'evm_snapshots', ['snapshot_date'])


def downgrade() -> None:
    op.drop_index('ix_evm_snapshots_snapshot_date', table_name='evm_snapshots')
    op.drop_index('ix_evm_snapshots_project_id', table_name='evm_snapshots')
    op.drop_table('evm_snapshots')

    op.drop_column('activities', 'actual_cost')
    op.drop_column('activities', 'actual_pct')
    op.drop_column('activities', 'planned_pct')
    op.drop_column('activities', 'bac_unit')
    op.drop_column('activities', 'bac')
