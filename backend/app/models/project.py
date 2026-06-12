import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ProjectStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ON_HOLD = "ON_HOLD"
    CANCELLED = "CANCELLED"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    po_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    part_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    product_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope_of_supply: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus, name="projectstatus"), default=ProjectStatus.ACTIVE, nullable=False
    )
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    activities: Mapped[list["Activity"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Activity.sequence_no",
    )
    created_by: Mapped[Optional["User"]] = relationship(back_populates="projects")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="project")
    wbs_colors: Mapped[list["WBSLevelColor"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
