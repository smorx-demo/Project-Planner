import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.activity import Activity
from app.models.user import User, UserRole
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.schemas.activity import ActivityResponse
from app.dependencies import get_current_user, require_manager, check_project_access
from app.services.status_service import StatusService
from app.services.conflict_service import ConflictService
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/")
@limiter.limit("100/minute")
async def list_projects(
    request: Request,
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Project).offset(skip).limit(limit).order_by(Project.created_at.desc())

    if current_user.role == UserRole.VIEWER:
        # VIEWERs only see projects they have been explicitly added to
        member_subq = select(ProjectMember.project_id).where(
            ProjectMember.user_id == current_user.id
        )
        query = query.where(Project.id.in_(member_subq))

    result = await db.execute(query)
    projects = result.scalars().all()
    return ok([ProjectResponse.model_validate(p) for p in projects])


@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_project(
    request: Request,
    project_in: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = Project(**project_in.model_dump(), created_by_id=current_user.id)
    db.add(project)
    await db.flush()
    await db.refresh(project)
    await audit(
        db,
        user_id=current_user.id,
        action="CREATE",
        entity_type="project",
        entity_id=str(project.id),
        project_id=project.id,
        new_value=project_in.model_dump(),
    )
    return ok(ProjectResponse.model_validate(project))


@router.get("/{project_id}")
@limiter.limit("100/minute")
async def get_project(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await check_project_access(project_id, current_user, db)
    return ok(ProjectResponse.model_validate(project))


@router.patch("/{project_id}")
@limiter.limit("100/minute")
async def update_project(
    request: Request,
    project_id: uuid.UUID,
    project_in: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    old_vals = {k: str(getattr(project, k)) for k in project_in.model_dump(exclude_unset=True)}
    for field, value in project_in.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.flush()
    await db.refresh(project)

    await audit(
        db,
        user_id=current_user.id,
        action="UPDATE",
        entity_type="project",
        entity_id=str(project.id),
        project_id=project.id,
        old_value=old_vals,
        new_value=project_in.model_dump(exclude_unset=True),
    )
    return ok(ProjectResponse.model_validate(project))


@router.delete("/{project_id}")
@limiter.limit("20/minute")
async def delete_project(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await audit(
        db,
        user_id=current_user.id,
        action="DELETE",
        entity_type="project",
        entity_id=str(project.id),
        project_id=project.id,
        old_value={"name": project.name},
    )
    await db.delete(project)
    return ok({"deleted": True, "id": str(project_id)})


@router.get("/{project_id}/status")
@limiter.limit("100/minute")
async def project_status_summary(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await check_project_access(project_id, current_user, db)

    result = await db.execute(
        select(Activity)
        .where(Activity.project_id == project_id)
        .order_by(Activity.sequence_no)
        .options(selectinload(Activity.assignments))
    )
    activities = result.scalars().all()

    activity_statuses = []
    for a in activities:
        a_dict = ActivityResponse.model_validate(a).model_dump(mode='json')
        a_dict['computed_status'] = StatusService.compute_status(a)
        activity_statuses.append(a_dict)

    summary = StatusService.compute_project_summary(activities)
    return ok({
        "project_id": str(project_id),
        "project_name": project.name,
        "project_status": project.status.value,
        "summary": summary,
        "activities": activity_statuses,
    })


@router.get("/{project_id}/conflicts")
@limiter.limit("100/minute")
async def project_conflicts(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await check_project_access(project_id, current_user, db)
    conflicts = await ConflictService.detect_person_conflicts(project_id, db)
    return ok(conflicts)


# ── Project members (viewer access management) ────────────────────────────

class AddMemberPayload(BaseModel):
    user_id: str


@router.get("/{project_id}/members")
@limiter.limit("100/minute")
async def list_project_members(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.name)
    )
    rows = result.all()
    return ok([
        {
            "user_id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role.value,
            "is_active": u.is_active,
            "added_at": str(m.added_at),
        }
        for m, u in rows
    ])


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
@limiter.limit("50/minute")
async def add_project_member(
    request: Request,
    project_id: uuid.UUID,
    payload: AddMemberPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        user_uuid = uuid.UUID(payload.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    target_user = await db.get(User, user_uuid)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for existing membership
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_uuid,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    member = ProjectMember(project_id=project_id, user_id=user_uuid)
    db.add(member)
    await db.flush()
    return ok({"project_id": str(project_id), "user_id": str(user_uuid)})


@router.delete("/{project_id}/members/{user_id}")
@limiter.limit("50/minute")
async def remove_project_member(
    request: Request,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return ok({"removed": True})
