import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, Integer, DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AIInteractionType(str, enum.Enum):
    CHAT = "CHAT"
    PREDICTION = "PREDICTION"
    PERSON_INSIGHT = "PERSON_INSIGHT"


class AIInteraction(Base):
    __tablename__ = "ai_interactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    interaction_type: Mapped[AIInteractionType] = mapped_column(
        SAEnum(AIInteractionType, name="aiinteractiontype", create_type=False),
        nullable=False,
    )
    prediction_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    messages_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    response_text: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
