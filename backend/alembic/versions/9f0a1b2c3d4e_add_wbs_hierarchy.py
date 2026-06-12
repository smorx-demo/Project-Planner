"""add wbs hierarchy

Revision ID: 9f0a1b2c3d4e
Revises: 8e9f0a1b2c3d
Create Date: 2026-06-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '9f0a1b2c3d4e'
down_revision = '8e9f0a1b2c3d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Add WBS columns to activities ─────────────────────────────────────

    op.add_column('activities', sa.Column(
        'wbs_code', sa.String(50), nullable=True
    ))
    op.add_column('activities', sa.Column(
        'parent_id', postgresql.UUID(as_uuid=True), nullable=True
    ))
    op.add_column('activities', sa.Column(
        'wbs_level', sa.Integer(), nullable=False, server_default='1'
    ))
    op.add_column('activities', sa.Column(
        'is_wbs_summary', sa.Boolean(), nullable=False, server_default='false'
    ))
    op.add_column('activities', sa.Column(
        'wbs_color', sa.String(7), nullable=True
    ))

    # Self-referential FK: parent_id → activities.id (SET NULL on delete)
    op.create_foreign_key(
        'fk_activity_parent_id',
        'activities', 'activities',
        ['parent_id'], ['id'],
        ondelete='SET NULL',
    )

    op.create_index('ix_activities_wbs_code',  'activities', ['wbs_code'])
    op.create_index('ix_activities_parent_id', 'activities', ['parent_id'])

    # ── Create wbs_level_colors table ─────────────────────────────────────

    op.create_table(
        'wbs_level_colors',
        sa.Column('id',             postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id',     postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('level',          sa.Integer(),   nullable=False),
        sa.Column('color_hex',      sa.String(7),   nullable=False),
        sa.Column('background_hex', sa.String(7),   nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('project_id', 'level', name='uq_wbs_level_color'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_wbs_level_colors_project_id', 'wbs_level_colors', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_wbs_level_colors_project_id', table_name='wbs_level_colors')
    op.drop_table('wbs_level_colors')

    op.drop_index('ix_activities_parent_id', table_name='activities')
    op.drop_index('ix_activities_wbs_code',  table_name='activities')
    op.drop_constraint('fk_activity_parent_id', 'activities', type_='foreignkey')
    op.drop_column('activities', 'wbs_color')
    op.drop_column('activities', 'is_wbs_summary')
    op.drop_column('activities', 'wbs_level')
    op.drop_column('activities', 'parent_id')
    op.drop_column('activities', 'wbs_code')
