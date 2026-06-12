import uuid
from sqlalchemy import String, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class WBSLevelColor(Base):
    __tablename__ = "wbs_level_colors"
    __table_args__ = (
        UniqueConstraint("project_id", "level", name="uq_wbs_level_color"),
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
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    color_hex: Mapped[str] = mapped_column(String(7), nullable=False)
    background_hex: Mapped[str] = mapped_column(String(7), nullable=False)

    project: Mapped["Project"] = relationship(back_populates="wbs_colors")
