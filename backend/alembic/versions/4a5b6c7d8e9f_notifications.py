"""notifications

Revision ID: 4a5b6c7d8e9f
Revises: 3c4d5e6f7a8b
Create Date: 2026-06-10

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '4a5b6c7d8e9f'
down_revision: Union[str, None] = '3c4d5e6f7a8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE notificationtype AS ENUM ("
        "'ACTIVITY_DELAYED', 'ACTIVITY_SLOW', 'PERSON_OVERLOADED', "
        "'PROJECT_BEHIND', 'DAILY_DIGEST', 'CONFLICT_DETECTED')"
    )

    op.create_table(
        'notification_rules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('trigger_type',
                  postgresql.ENUM('ACTIVITY_DELAYED', 'ACTIVITY_SLOW', 'PERSON_OVERLOADED',
                                  'PROJECT_BEHIND', 'DAILY_DIGEST', 'CONFLICT_DETECTED',
                                  name='notificationtype', create_type=False),
                  nullable=False),
        sa.Column('threshold_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('channels', postgresql.ARRAY(sa.String(10)),
                  server_default=sa.text("ARRAY['IN_APP']::varchar[]"), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notif_rules_user_id', 'notification_rules', ['user_id'])
    op.create_index('ix_notif_rules_trigger', 'notification_rules', ['trigger_type'])

    op.create_table(
        'notifications',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('activity_id', sa.UUID(), nullable=True),
        sa.Column('type',
                  postgresql.ENUM('ACTIVITY_DELAYED', 'ACTIVITY_SLOW', 'PERSON_OVERLOADED',
                                  'PROJECT_BEHIND', 'DAILY_DIGEST', 'CONFLICT_DETECTED',
                                  name='notificationtype', create_type=False),
                  nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['activity_id'], ['activities.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_is_read', 'notifications', ['user_id', 'is_read'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_notifications_created_at', table_name='notifications')
    op.drop_index('ix_notifications_is_read', table_name='notifications')
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')

    op.drop_index('ix_notif_rules_trigger', table_name='notification_rules')
    op.drop_index('ix_notif_rules_user_id', table_name='notification_rules')
    op.drop_table('notification_rules')

    op.execute("DROP TYPE notificationtype")
