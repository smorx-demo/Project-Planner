import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, Float, Text, DateTime, Boolean, Enum as SAEnum,
    ForeignKey, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ActivityStatusOverride(str, enum.Enum):
    ON_TRACK = "ON_TRACK"
    SLOW = "SLOW"
    DELAYED = "DELAYED"
    DONE = "DONE"
    PENDING = "PENDING"


class Activity(Base):
    __tablename__ = "activities"
    __table_args__ = (
        UniqueConstraint("project_id", "sequence_no", name="uq_activity_project_seq"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    group_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    plan_start_col: Mapped[int] = mapped_column(Integer, nullable=False)
    plan_end_col: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_start_col: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_end_col: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status_override: Mapped[Optional[ActivityStatusOverride]] = mapped_column(
        SAEnum(ActivityStatusOverride, name="activitystatusoverride"), nullable=True
    )
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # EVM fields
    bac: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bac_unit: Mapped[str] = mapped_column(
        String(20), nullable=False, default="hours", server_default="hours"
    )
    planned_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # WBS hierarchy fields
    wbs_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    wbs_level: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    is_wbs_summary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    wbs_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="activities")
    assignments: Mapped[list["Assignment"]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
