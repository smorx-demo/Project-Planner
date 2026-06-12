import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.activity import Activity
from app.models.project import Project
from app.models.user import User
from app.schemas.activity import ActivityCreate, ActivityResponse, ActivityUpdate, CreateChildActivityBody
from app.dependencies import get_current_user, require_manager, check_project_access
from app.services.status_service import StatusService
from app.services.wbs_service import WBSService
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(prefix="/activities", tags=["activities"])


async def _load(activity_id: uuid.UUID, db: AsyncSession) -> Activity:
    result = await db.execute(
        select(Activity)
        .where(Activity.id == activity_id)
        .options(selectinload(Activity.assignments))
    )
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


def _with_status(activity: Activity) -> dict:
    d = ActivityResponse.model_validate(activity).model_dump(mode='json')
    d['computed_status'] = StatusService.compute_status(activity)
    return d


@router.get("/project/{project_id}")
@limiter.limit("100/minute")
async def list_activities(
    request: Request,
    project_id: uuid.UUID,
    view: str = Query("flat", pattern="^(flat|tree)$"),
    include_rollup: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_project_access(project_id, current_user, db)
    result = await db.execute(
        select(Activity)
        .where(Activity.project_id == project_id)
        .order_by(Activity.sequence_no)
        .options(selectinload(Activity.assignments))
    )
    activities = result.scalars().all()

    if view == "tree":
        rollup_map = WBSService.build_rollup_map(activities) if include_rollup else None
        tree = WBSService.build_tree(activities, rollup_map=rollup_map)
        return ok(tree)

    return ok([_with_status(a) for a in activities])


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_activity(
    request: Request,
    activity_in: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await db.get(Project, activity_in.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = activity_in.model_dump()

    # Auto-compute wbs_level from wbs_code
    if data.get("wbs_code"):
        data["wbs_level"] = WBSService.compute_wbs_level(data["wbs_code"])

    activity = Activity(**data)
    db.add(activity)
    await db.flush()
    loaded = await _load(activity.id, db)

    # Re-sort by WBS after creation if this activity has a wbs_code
    if activity_in.wbs_code:
        await WBSService.reorder_by_wbs(activity_in.project_id, db)

    await audit(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="activity",
        entity_id=str(activity.id),
        project_id=activity_in.project_id,
        new_value=activity_in.model_dump(mode='json'),
    )
    return ok(_with_status(loaded))


@router.get("/{activity_id}")
@limiter.limit("100/minute")
async def get_activity(
    request: Request,
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    activity = await _load(activity_id, db)
    return ok(_with_status(activity))


@router.patch("/{activity_id}")
@limiter.limit("100/minute")
async def update_activity(
    request: Request,
    activity_id: uuid.UUID,
    activity_in: ActivityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    changes = activity_in.model_dump(exclude_unset=True)

    # Auto-recompute wbs_level if wbs_code is being changed
    if "wbs_code" in changes:
        changes["wbs_level"] = WBSService.compute_wbs_level(changes["wbs_code"])

    old_vals = {k: getattr(activity, k) for k in changes}
    for field, value in changes.items():
        setattr(activity, field, value)
    await db.flush()
    loaded = await _load(activity_id, db)

    # Re-sort by WBS if wbs_code changed
    if "wbs_code" in changes:
        await WBSService.reorder_by_wbs(activity.project_id, db)

    await audit(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="activity",
        entity_id=str(activity_id),
        project_id=activity.project_id,
        old_value={k: str(v) if v is not None else None for k, v in old_vals.items()},
        new_value={k: str(v) if v is not None else None for k, v in changes.items()},
    )
    return ok(_with_status(loaded))


@router.delete("/{activity_id}")
@limiter.limit("20/minute")
async def delete_activity(
    request: Request,
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    project_id = activity.project_id
    await audit(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="activity",
        entity_id=str(activity_id),
        project_id=project_id,
        old_value={"name": activity.name, "sequence_no": activity.sequence_no},
    )
    await db.delete(activity)
    return ok({"deleted": True, "id": str(activity_id)})


@router.post("/{activity_id}/children", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_child_activity(
    request: Request,
    activity_id: uuid.UUID,
    body: CreateChildActivityBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Create a child WBS activity under an existing parent."""
    parent = await _load(activity_id, db)

    # Find siblings to determine next WBS code
    sibling_result = await db.execute(
        select(Activity).where(Activity.parent_id == parent.id)
    )
    siblings = sibling_result.scalars().all()

    child_wbs = WBSService.next_child_wbs_code(parent.wbs_code, list(siblings))
    child_level = WBSService.compute_wbs_level(child_wbs)

    # Next sequence_no: place after all siblings
    seq_result = await db.execute(
        select(Activity)
        .where(Activity.project_id == parent.project_id)
        .order_by(Activity.sequence_no.desc())
    )
    last = seq_result.scalars().first()
    next_seq = (last.sequence_no + 1) if last else 1

    child = Activity(
        project_id=parent.project_id,
        sequence_no=next_seq,
        name=body.name,
        group_type=body.group_type or parent.group_type,
        plan_start_col=body.plan_start_col,
        plan_end_col=body.plan_end_col,
        is_wbs_summary=body.is_wbs_summary,
        remarks=body.remarks,
        bac=body.bac,
        bac_unit=body.bac_unit,
        wbs_code=child_wbs,
        parent_id=parent.id,
        wbs_level=child_level,
    )
    db.add(child)
    await db.flush()
    loaded = await _load(child.id, db)

    # Re-sort project by WBS
    await WBSService.reorder_by_wbs(parent.project_id, db)

    await audit(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="activity",
        entity_id=str(child.id),
        project_id=parent.project_id,
        new_value={
            "name": body.name,
            "parent_id": str(parent.id),
            "wbs_code": child_wbs,
        },
    )
    return ok(_with_status(loaded))


# ── Reorder (legacy flat reorder) ─────────────────────────────────────────

class ReorderItem(BaseModel):
    id: uuid.UUID
    sequence_no: int


class ReorderRequest(BaseModel):
    project_id: uuid.UUID
    order: List[ReorderItem]


@router.post("/reorder")
@limiter.limit("20/minute")
async def reorder_activities(
    request: Request,
    body: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    ids = [item.id for item in body.order]
    result = await db.execute(
        select(Activity).where(
            Activity.id.in_(ids),
            Activity.project_id == body.project_id,
        )
    )
    existing = {a.id: a for a in result.scalars().all()}
    if len(existing) != len(ids):
        raise HTTPException(status_code=400, detail="Some activities not found in project")

    for item in body.order:
        existing[item.id].sequence_no = item.sequence_no
    await db.flush()

    await audit(
        db,
        user_id=current_user.id,
        action="REORDER",
        entity_type="activity",
        entity_id=str(body.project_id),
        project_id=body.project_id,
        new_value={"order": [{"id": str(i.id), "sequence_no": i.sequence_no} for i in body.order]},
    )
    return ok({"reordered": len(body.order)})
