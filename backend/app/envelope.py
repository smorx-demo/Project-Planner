import uuid
from typing import Any, Optional
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog


def ok(data: Any) -> dict:
    return {"success": True, "data": jsonable_encoder(data)}


def err(message: str, detail: Any = None, status_code: int = 400) -> dict:
    return {"success": False, "error": message, "detail": detail}


async def audit(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: str,
    project_id: Optional[uuid.UUID] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
) -> None:
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        project_id=project_id,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(log)
