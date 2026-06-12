import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from app.database import get_db
from app.models.assignment import Assignment
from app.models.activity import Activity
from app.models.person import Person
from app.models.user import User
from app.schemas.activity import AssignmentCreate, AssignmentResponse, AssignmentUpdate
from app.dependencies import get_current_user, require_manager
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.get("/activity/{activity_id}")
@limiter.limit("100/minute")
async def list_assignments(
    request: Request,
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Assignment).where(Assignment.activity_id == activity_id)
    )
    assignments = result.scalars().all()
    return ok([AssignmentResponse.model_validate(a) for a in assignments])


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_assignment(
    request: Request,
    assignment_in: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    activity = await db.get(Activity, assignment_in.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    person = await db.get(Person, assignment_in.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Check duplicate
    existing = await db.execute(
        select(Assignment).where(
            Assignment.activity_id == assignment_in.activity_id,
            Assignment.person_id == assignment_in.person_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Person already assigned to this activity")

    # Overlap check: count person's overlapping activities vs max_concurrent_tasks
    overlap_result = await db.execute(
        select(func.count(Assignment.id))
        .join(Activity, Activity.id == Assignment.activity_id)
        .where(
            Assignment.person_id == assignment_in.person_id,
            Activity.plan_start_col < activity.plan_end_col,
            Activity.plan_end_col > activity.plan_start_col,
        )
    )
    overlap_count = overlap_result.scalar_one()
    conflict_warning = None
    if overlap_count >= person.max_concurrent_tasks:
        conflict_warning = (
            f"{person.name} already has {overlap_count} overlapping tasks "
            f"(max_concurrent_tasks={person.max_concurrent_tasks})"
        )

    assignment = Assignment(**assignment_in.model_dump())
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)

    await audit(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="assignment",
        entity_id=str(assignment.id),
        project_id=activity.project_id,
        new_value={
            "activity_id": str(assignment_in.activity_id),
            "person_id": str(assignment_in.person_id),
            "role": assignment_in.role.value,
        },
    )

    response_data = AssignmentResponse.model_validate(assignment).model_dump(mode='json')
    if conflict_warning:
        response_data['conflict_warning'] = conflict_warning

    return ok(response_data)


@router.patch("/{assignment_id}")
@limiter.limit("100/minute")
async def update_assignment(
    request: Request,
    assignment_id: uuid.UUID,
    assignment_in: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    assignment = await db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    changes = assignment_in.model_dump(exclude_unset=True)
    old_vals = {k: str(getattr(assignment, k)) for k in changes}
    for field, value in changes.items():
        setattr(assignment, field, value)
    await db.flush()
    await db.refresh(assignment)

    # Get project_id via activity
    activity = await db.get(Activity, assignment.activity_id)

    await audit(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="assignment",
        entity_id=str(assignment_id),
        project_id=activity.project_id if activity else None,
        old_value=old_vals,
        new_value={k: str(v) if v is not None else None for k, v in changes.items()},
    )
    return ok(AssignmentResponse.model_validate(assignment))


@router.delete("/{assignment_id}")
@limiter.limit("20/minute")
async def delete_assignment(
    request: Request,
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    assignment = await db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    activity = await db.get(Activity, assignment.activity_id)

    await audit(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="assignment",
        entity_id=str(assignment_id),
        project_id=activity.project_id if activity else None,
        old_value={
            "activity_id": str(assignment.activity_id),
            "person_id": str(assignment.person_id),
        },
    )
    await db.delete(assignment)
    return ok({"deleted": True, "id": str(assignment_id)})
