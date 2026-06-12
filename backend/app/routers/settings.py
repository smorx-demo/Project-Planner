from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Any
from app.database import get_db
from app.models.app_setting import AppSetting
from app.models.user import User
from app.dependencies import get_current_user, require_admin
from app.envelope import ok
from app.limiter import limiter

router = APIRouter(prefix="/settings", tags=["settings"])

ALLOWED_KEYS = {"departments", "designations"}


class SettingPayload(BaseModel):
    value: Any


@router.get("/")
@limiter.limit("200/minute")
async def list_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    return ok({r.key: r.value for r in rows})


@router.get("/{key}")
@limiter.limit("200/minute")
async def get_setting(
    request: Request,
    key: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail="Setting not found")
    row = await db.get(AppSetting, key)
    if not row:
        raise HTTPException(status_code=404, detail="Setting not found")
    return ok(row.value)


@router.put("/{key}")
@limiter.limit("50/minute")
async def update_setting(
    request: Request,
    key: str,
    payload: SettingPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=404, detail="Setting not found")
    if not isinstance(payload.value, list):
        raise HTTPException(status_code=422, detail="Value must be a list")
    cleaned = [str(v).strip() for v in payload.value if str(v).strip()]

    row = await db.get(AppSetting, key)
    if row:
        row.value = cleaned
    else:
        row = AppSetting(key=key, value=cleaned)
        db.add(row)
    await db.flush()
    return ok(cleaned)
