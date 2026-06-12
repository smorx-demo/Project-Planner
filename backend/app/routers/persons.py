import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from app.database import get_db
from app.models.person import Person
from app.models.assignment import Assignment
from app.models.activity import Activity
from app.models.user import User
from app.schemas.person import PersonCreate, PersonResponse, PersonUpdate
from app.schemas.activity import ActivityResponse
from app.dependencies import get_current_user, require_manager
from app.services.status_service import StatusService
from app.services.conflict_service import ConflictService
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(prefix="/persons", tags=["persons"])


@router.get("/available")
@limiter.limit("100/minute")
async def available_persons(
    request: Request,
    col_start: Optional[int] = None,
    col_end: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    List persons available for assignment.
    If project_id + col range given, uses project-specific conflict + leave checks.
    Otherwise uses global max_concurrent_tasks check.
    """
    if col_start is None or col_end is None:
        result = await db.execute(
            select(Person).where(Person.is_active == True).order_by(Person.name)  # noqa: E712
        )
        persons = result.scalars().all()
        return ok([PersonResponse.model_validate(p) for p in persons])

    if project_id is not None:
        persons = await ConflictService.get_available_persons(
            project_id, col_start, col_end, db
        )
    else:
        # Global check: sum of overlapping tasks across ALL projects
        overlap_subq = (
            select(Assignment.person_id, func.count(Assignment.id).label("cnt"))
            .join(Activity, Activity.id == Assignment.activity_id)
            .where(
                Activity.plan_start_col <= col_end,
                Activity.plan_end_col >= col_start,
            )
            .group_by(Assignment.person_id)
            .subquery()
        )
        result = await db.execute(
            select(Person)
            .outerjoin(overlap_subq, Person.id == overlap_subq.c.person_id)
            .where(
                Person.is_active == True,  # noqa: E712
                func.coalesce(overlap_subq.c.cnt, 0) < Person.max_concurrent_tasks,
            )
            .order_by(Person.name)
        )
        persons = result.scalars().all()

        # Also filter leave schedule
        available = []
        for p in persons:
            on_leave = any(
                e.get("start_col", 999) <= col_end and e.get("end_col", -1) >= col_start
                for e in (p.leave_schedule or [])
            )
            if not on_leave:
                available.append(p)
        persons = available

    return ok([PersonResponse.model_validate(p) for p in persons])


@router.get("/")
@limiter.limit("100/minute")
async def list_persons(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Person).offset(skip).limit(limit).order_by(Person.name)
    if active_only:
        query = query.where(Person.is_active == True)  # noqa: E712
    result = await db.execute(query)
    persons = result.scalars().all()
    return ok([PersonResponse.model_validate(p) for p in persons])


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_person(
    request: Request,
    person_in: PersonCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    person = Person(**person_in.model_dump())
    db.add(person)
    await db.flush()
    await db.refresh(person)
    await audit(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="person",
        entity_id=str(person.id),
        new_value={"name": person.name, "employee_id": person.employee_id},
    )
    return ok(PersonResponse.model_validate(person))


@router.get("/{person_id}/workload")
@limiter.limit("100/minute")
async def person_workload(
    request: Request,
    person_id: uuid.UUID,
    project_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return a person's workload: their activities, metrics, and conflicts."""
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    # Get assigned activities (filtered by project if provided)
    query = (
        select(Activity)
        .join(Assignment, Assignment.activity_id == Activity.id)
        .where(Assignment.person_id == person_id)
        .options(selectinload(Activity.assignments))
        .order_by(Activity.project_id, Activity.sequence_no)
    )
    if project_id:
        query = query.where(Activity.project_id == project_id)

    result = await db.execute(query)
    activities = result.scalars().all()

    activity_data = []
    for a in activities:
        d = ActivityResponse.model_validate(a).model_dump(mode="json")
        d["computed_status"] = StatusService.compute_status(a)
        activity_data.append(d)

    # active_now: started but not yet ended
    active_now = sum(
        1 for a in activities
        if a.actual_start_col is not None and a.actual_end_col is None
    )

    # Conflicts for this person within the project
    person_conflicts: list[dict] = []
    if project_id:
        all_conflicts = await ConflictService.detect_person_conflicts(project_id, db)
        for c in all_conflicts:
            if c["person_id"] == str(person_id):
                person_conflicts = c["conflicts"]
                break

    utilization_pct = (
        round(active_now / person.max_concurrent_tasks * 100, 1)
        if person.max_concurrent_tasks > 0 else 0.0
    )

    return ok({
        "person": PersonResponse.model_validate(person),
        "assigned_activities": activity_data,
        "total_activities": len(activity_data),
        "active_now": active_now,
        "conflicts": person_conflicts,
        "utilization_pct": utilization_pct,
    })


@router.get("/{person_id}/check-conflict")
@limiter.limit("100/minute")
async def check_assignment_conflict(
    request: Request,
    person_id: uuid.UUID,
    activity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Check if adding person_id to activity_id creates a scheduling conflict."""
    conflict = await ConflictService.check_assignment_conflict(person_id, activity_id, db)
    return ok(conflict)


@router.get("/{person_id}/activities")
@limiter.limit("100/minute")
async def person_activities(
    request: Request,
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    result = await db.execute(
        select(Activity)
        .join(Assignment, Assignment.activity_id == Activity.id)
        .where(Assignment.person_id == person_id)
        .options(selectinload(Activity.assignments))
        .order_by(Activity.project_id, Activity.sequence_no)
    )
    activities = result.scalars().all()

    activity_data = []
    for a in activities:
        d = ActivityResponse.model_validate(a).model_dump(mode="json")
        d["computed_status"] = StatusService.compute_status(a)
        activity_data.append(d)

    return ok(activity_data)


@router.get("/{person_id}")
@limiter.limit("100/minute")
async def get_person(
    request: Request,
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return ok(PersonResponse.model_validate(person))


@router.post("/{person_id}/leave")
@limiter.limit("30/minute")
async def add_leave(
    request: Request,
    person_id: uuid.UUID,
    leave_in: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Append a leave entry to person.leave_schedule."""
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    start_col = leave_in.get("start_col")
    end_col = leave_in.get("end_col")
    reason = leave_in.get("reason", "")
    if start_col is None or end_col is None:
        raise HTTPException(status_code=400, detail="start_col and end_col are required")
    if not isinstance(start_col, int) or not isinstance(end_col, int) or start_col > end_col:
        raise HTTPException(status_code=400, detail="Invalid leave range")

    entry = {"start_col": start_col, "end_col": end_col, "reason": str(reason)}
    current = list(person.leave_schedule or [])
    current.append(entry)
    person.leave_schedule = current
    await db.flush()
    await db.refresh(person)

    await audit(
        db,
        user_id=current_user.id,
        action="ADD_LEAVE",
        entity_type="person",
        entity_id=str(person_id),
        new_value=entry,
    )
    return ok(PersonResponse.model_validate(person))


@router.delete("/{person_id}/leave/{leave_index}")
@limiter.limit("30/minute")
async def delete_leave(
    request: Request,
    person_id: uuid.UUID,
    leave_index: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Remove a leave entry by index from person.leave_schedule."""
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    current = list(person.leave_schedule or [])
    if leave_index < 0 or leave_index >= len(current):
        raise HTTPException(status_code=404, detail="Leave entry not found")

    removed = current.pop(leave_index)
    person.leave_schedule = current
    await db.flush()
    await db.refresh(person)

    await audit(
        db,
        user_id=current_user.id,
        action="REMOVE_LEAVE",
        entity_type="person",
        entity_id=str(person_id),
        old_value=removed,
    )
    return ok(PersonResponse.model_validate(person))


@router.patch("/{person_id}")
@limiter.limit("100/minute")
async def update_person(
    request: Request,
    person_id: uuid.UUID,
    person_in: PersonUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    changes = person_in.model_dump(exclude_unset=True)
    old_vals = {k: str(getattr(person, k)) for k in changes}
    for field, value in changes.items():
        setattr(person, field, value)
    await db.flush()
    await db.refresh(person)

    await audit(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="person",
        entity_id=str(person_id),
        old_value=old_vals,
        new_value={k: str(v) if v is not None else None for k, v in changes.items()},
    )
    return ok(PersonResponse.model_validate(person))


@router.delete("/{person_id}")
@limiter.limit("20/minute")
async def delete_person(
    request: Request,
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    person.is_active = False
    await db.flush()

    await audit(
        db,
        user_id=current_user.id,
        action="DEACTIVATE",
        entity_type="person",
        entity_id=str(person_id),
        old_value={"is_active": True},
        new_value={"is_active": False},
    )
    return ok({"deactivated": True, "id": str(person_id)})
