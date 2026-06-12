import uuid
import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AssignmentRole(str, enum.Enum):
    LEAD = "LEAD"
    MEMBER = "MEMBER"


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("activity_id", "person_id", name="uq_assignment_activity_person"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[AssignmentRole] = mapped_column(
        SAEnum(AssignmentRole, name="assignmentrole"),
        default=AssignmentRole.MEMBER,
        nullable=False,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    activity: Mapped["Activity"] = relationship(back_populates="assignments")
    person: Mapped["Person"] = relationship(back_populates="assignments")
