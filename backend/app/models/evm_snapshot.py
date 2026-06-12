import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import (
    Float, Date, DateTime, ForeignKey, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EVMSnapshot(Base):
    __tablename__ = "evm_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=True,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    pv: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ac: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cpi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sv: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cv: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped["Project"] = relationship(
        "Project", foreign_keys=[project_id]
    )
