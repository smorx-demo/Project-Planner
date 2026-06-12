import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.envelope import ok
from app.limiter import limiter
from app.models.user import User, UserRole
from app.schemas.user import UserResponse
from app.services.auth_service import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class AdminUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


# ── Own profile ───────────────────────────────────────────────────────────────

@router.put("/me")
@limiter.limit("30/minute")
async def update_profile(
    request: Request,
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    changes = body.model_dump(exclude_unset=True)

    if "email" in changes and changes["email"] != current_user.email:
        existing = await db.execute(select(User).where(User.email == changes["email"]))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")

    for field, value in changes.items():
        setattr(current_user, field, value)
    await db.flush()
    await db.refresh(current_user)
    return ok(UserResponse.model_validate(current_user))


@router.put("/me/password")
@limiter.limit("10/minute")
async def change_password(
    request: Request,
    body: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    current_user.password_hash = hash_password(body.new_password)
    await db.flush()
    return ok({"message": "Password changed successfully"})


# ── Admin user management ─────────────────────────────────────────────────────

@router.get("/")
@limiter.limit("60/minute")
async def list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.name))
    users = result.scalars().all()
    return ok([UserResponse.model_validate(u) for u in users])


@router.patch("/{user_id}")
@limiter.limit("30/minute")
async def update_user(
    request: Request,
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return ok(UserResponse.model_validate(user))
