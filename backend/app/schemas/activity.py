from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from app.models.activity import ActivityStatusOverride
from app.models.assignment import AssignmentRole


# ── Assignment ──────────────────────────────────────────────────────────────

class AssignmentBase(BaseModel):
    activity_id: UUID
    person_id: UUID
    role: AssignmentRole = AssignmentRole.MEMBER


class AssignmentCreate(AssignmentBase):
    pass


class AssignmentUpdate(BaseModel):
    role: Optional[AssignmentRole] = None


class AssignmentResponse(AssignmentBase):
    id: UUID
    assigned_at: datetime

    model_config = {"from_attributes": True}


# ── Activity ─────────────────────────────────────────────────────────────────

class ActivityBase(BaseModel):
    project_id: UUID
    sequence_no: int
    name: str
    group_type: Optional[str] = None
    plan_start_col: int
    plan_end_col: int
    actual_start_col: Optional[int] = None
    actual_end_col: Optional[int] = None
    status_override: Optional[ActivityStatusOverride] = None
    remarks: Optional[str] = None
    # EVM
    bac: Optional[float] = None
    bac_unit: str = "hours"
    planned_pct: Optional[float] = None
    actual_pct: Optional[float] = None
    actual_cost: Optional[float] = None
    # WBS hierarchy
    wbs_code: Optional[str] = None
    parent_id: Optional[UUID] = None
    wbs_level: int = 1
    is_wbs_summary: bool = False
    wbs_color: Optional[str] = None


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    sequence_no: Optional[int] = None
    name: Optional[str] = None
    group_type: Optional[str] = None
    plan_start_col: Optional[int] = None
    plan_end_col: Optional[int] = None
    actual_start_col: Optional[int] = None
    actual_end_col: Optional[int] = None
    status_override: Optional[ActivityStatusOverride] = None
    remarks: Optional[str] = None
    # EVM
    bac: Optional[float] = None
    bac_unit: Optional[str] = None
    planned_pct: Optional[float] = None
    actual_pct: Optional[float] = None
    actual_cost: Optional[float] = None
    # WBS hierarchy
    wbs_code: Optional[str] = None
    parent_id: Optional[UUID] = None
    wbs_level: Optional[int] = None
    is_wbs_summary: Optional[bool] = None
    wbs_color: Optional[str] = None


class ActivityResponse(ActivityBase):
    id: UUID
    assignments: list[AssignmentResponse] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── WBS child creation ────────────────────────────────────────────────────────

class CreateChildActivityBody(BaseModel):
    """Body for POST /activities/{id}/children"""
    name: str
    plan_start_col: int
    plan_end_col: int
    group_type: Optional[str] = None
    is_wbs_summary: bool = False
    remarks: Optional[str] = None
    bac: Optional[float] = None
    bac_unit: str = "hours"
