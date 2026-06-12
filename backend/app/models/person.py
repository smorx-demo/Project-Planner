import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Integer, Float, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    skills: Mapped[list] = mapped_column(ARRAY(String()), server_default="'{}'", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    max_concurrent_tasks: Mapped[int] = mapped_column(Integer, default=3)
    avg_delay_days: Mapped[float] = mapped_column(Float, default=0.0)
    performance_score: Mapped[float] = mapped_column(Float, default=100.0)
    on_time_rate: Mapped[float] = mapped_column(Float, default=100.0)
    leave_schedule: Mapped[list] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    assignments: Mapped[list["Assignment"]] = relationship(back_populates="person")
    snapshots: Mapped[list["PerformanceSnapshot"]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )
