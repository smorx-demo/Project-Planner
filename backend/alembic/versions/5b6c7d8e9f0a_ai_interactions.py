"""ai_interactions

Revision ID: 5b6c7d8e9f0a
Revises: 4a5b6c7d8e9f
Create Date: 2026-06-11

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '5b6c7d8e9f0a'
down_revision: Union[str, None] = '4a5b6c7d8e9f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE aiinteractiontype AS ENUM ('CHAT', 'PREDICTION', 'PERSON_INSIGHT')"
    )
    op.create_table(
        'ai_interactions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column(
            'interaction_type',
            postgresql.ENUM('CHAT', 'PREDICTION', 'PERSON_INSIGHT',
                            name='aiinteractiontype', create_type=False),
            nullable=False,
        ),
        sa.Column('prediction_type', sa.String(50), nullable=True),
        sa.Column('messages_json', postgresql.JSONB(), nullable=False,
                  server_default='[]'),
        sa.Column('response_text', sa.Text(), nullable=False),
        sa.Column('tokens_used', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duration_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ai_interactions_user_id', 'ai_interactions', ['user_id'])
    op.create_index('ix_ai_interactions_created_at', 'ai_interactions', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_ai_interactions_created_at', table_name='ai_interactions')
    op.drop_index('ix_ai_interactions_user_id', table_name='ai_interactions')
    op.drop_table('ai_interactions')
    op.execute("DROP TYPE aiinteractiontype")
