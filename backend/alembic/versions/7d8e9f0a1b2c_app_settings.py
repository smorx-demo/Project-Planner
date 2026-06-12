"""app_settings

Revision ID: 7d8e9f0a1b2c
Revises: 6c7d8e9f0a1b
Create Date: 2026-06-11

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import json

revision: str = '7d8e9f0a1b2c'
down_revision: Union[str, None] = '6c7d8e9f0a1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_DEPARTMENTS = [
    "Engineering", "Procurement", "QC", "Production",
    "Welding", "Machining", "Surface Treatment", "Dispatch", "Management", "Other",
]

DEFAULT_DESIGNATIONS = [
    "Engineer", "Senior Engineer", "Lead Engineer",
    "Welder", "Senior Welder", "Welding Inspector",
    "Machinist", "CNC Operator",
    "QC Inspector", "QC Engineer",
    "Project Manager", "Site Supervisor",
    "Procurement Officer", "Store Keeper",
    "Dispatch Coordinator",
]


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', postgresql.JSONB(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    )
    dept_val = json.dumps(DEFAULT_DEPARTMENTS)
    desig_val = json.dumps(DEFAULT_DESIGNATIONS)
    op.execute(
        f"INSERT INTO app_settings (key, value) VALUES "
        f"('departments', '{dept_val}'::jsonb), "
        f"('designations', '{desig_val}'::jsonb)"
    )


def downgrade() -> None:
    op.drop_table('app_settings')
