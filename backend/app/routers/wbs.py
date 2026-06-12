"""
WBS (Work Breakdown Structure) routes.

GET  /projects/{project_id}/wbs/colors    — get 8-level color palette
PUT  /projects/{project_id}/wbs/colors    — upsert color overrides
PATCH /projects/{project_id}/wbs/reorder  — re-sort activities by wbs_code
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import List
from app.database import get_db
from app.models.user import User
from app.models.activity import Activity
from app.dependencies import get_current_user, require_manager, check_project_access
from app.models.project import Project
from app.services.wbs_service import WBSService
from app.envelope import ok

router = APIRouter(tags=["wbs"])


# ── Schemas ───────────────────────────────────────────────────────────────

class WBSColorItem(BaseModel):
    level:          int = Field(..., ge=1, le=8)
    color_hex:      str = Field(..., min_length=7, max_length=7)
    background_hex: str = Field(..., min_length=7, max_length=7)


class WBSColorsBody(BaseModel):
    colors: List[WBSColorItem]


# ── Helpers ───────────────────────────────────────────────────────────────

async def _require_project(project_id: uuid.UUID, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/wbs/colors")
async def get_wbs_colors(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_access(project_id, current_user, db)
    colors = await WBSService.get_project_colors(project_id, db)
    return ok(colors)


@router.put("/projects/{project_id}/wbs/colors")
async def set_wbs_colors(
    request: Request,
    project_id: uuid.UUID,
    body: WBSColorsBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    await _require_project(project_id, db)
    updated = await WBSService.set_project_colors(
        project_id,
        [c.model_dump() for c in body.colors],
        db,
    )
    return ok(updated)


@router.patch("/projects/{project_id}/wbs/reorder")
async def reorder_by_wbs(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    await _require_project(project_id, db)
    count = await WBSService.reorder_by_wbs(project_id, db)
    return ok({"reordered": count})
