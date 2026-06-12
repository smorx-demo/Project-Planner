import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.performance_service import PerformanceService
from app.envelope import ok
from app.limiter import limiter

router = APIRouter(prefix="/performance", tags=["performance"])


@router.get("/person/{person_id}")
@limiter.limit("60/minute")
async def get_person_performance(
    request: Request,
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await PerformanceService.compute_person_performance(person_id, db)
    if result is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return ok(result)


@router.get("/person/{person_id}/history")
@limiter.limit("60/minute")
async def get_person_history(
    request: Request,
    person_id: uuid.UUID,
    days: int = 90,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    history = await PerformanceService.get_person_history(person_id, db, days=days)
    return ok(history)


@router.get("/department/{department}")
@limiter.limit("60/minute")
async def get_department_performance(
    request: Request,
    department: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await PerformanceService.compute_department_performance(department, db)
    return ok(result)


@router.get("/leaderboard")
@limiter.limit("60/minute")
async def get_leaderboard(
    request: Request,
    department: Optional[str] = None,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if limit < 1 or limit > 50:
        limit = 10
    entries = await PerformanceService.compute_leaderboard(db, department=department, limit=limit)
    return ok(entries)


@router.get("/project/{project_id}")
@limiter.limit("60/minute")
async def get_project_performance(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await PerformanceService.compute_project_performance(project_id, db)
    return ok(result)
