import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from io import BytesIO
from typing import Optional

from app.database import get_db
from app.models.project import Project, ProjectStatus
from app.models.activity import Activity, ActivityStatusOverride
from app.models.user import User
from app.schemas.project import ProjectResponse
from app.dependencies import get_current_user, require_manager
from app.services.excel_service import ExcelService
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(tags=["import-export"])

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/projects/import")
@limiter.limit("10/minute")
async def import_project_excel(
    request: Request,
    file: UploadFile = File(...),
    project_name: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """Import a project from an Excel file."""
    filename = file.filename or ""
    if not any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    try:
        parsed = ExcelService.parse_excel(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse Excel file: {exc}")

    if not parsed.get("activities"):
        raise HTTPException(status_code=422, detail="No activities found in the uploaded file")

    proj_data = parsed["project"]
    name = project_name or proj_data.get("name") or "Imported Project"

    project = Project(
        name=name,
        po_number=proj_data.get("po_number"),
        part_number=proj_data.get("part_number"),
        customer_name=proj_data.get("customer_name"),
        status=ProjectStatus.ACTIVE,
        created_by_id=current_user.id,
    )
    db.add(project)
    await db.flush()

    for act_data in parsed["activities"]:
        status_val: Optional[ActivityStatusOverride] = None
        raw_status = act_data.get("status_override")
        if raw_status:
            try:
                status_val = ActivityStatusOverride(raw_status)
            except ValueError:
                pass

        activity = Activity(
            project_id=project.id,
            sequence_no=act_data["sequence_no"],
            name=act_data["name"],
            group_type=act_data.get("group_type"),
            plan_start_col=act_data["plan_start_col"],
            plan_end_col=act_data["plan_end_col"],
            actual_start_col=act_data.get("actual_start_col"),
            actual_end_col=act_data.get("actual_end_col"),
            status_override=status_val,
            remarks=act_data.get("remarks"),
        )
        db.add(activity)

    await db.flush()
    await db.refresh(project)

    await audit(
        db,
        user_id=current_user.id,
        action="IMPORT",
        entity_type="project",
        entity_id=str(project.id),
        project_id=project.id,
        new_value={"name": name, "activity_count": len(parsed["activities"])},
    )

    return ok({
        "project": ProjectResponse.model_validate(project),
        "activities_imported": len(parsed["activities"]),
    })


@router.get("/projects/{project_id}/export/excel")
@limiter.limit("20/minute")
async def export_project_excel(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Export a project as an Excel Gantt chart."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Activity)
        .where(Activity.project_id == project_id)
        .order_by(Activity.sequence_no)
        .options(selectinload(Activity.assignments))
    )
    activities = result.scalars().all()

    excel_bytes = ExcelService.generate_excel(project, list(activities))
    safe_name = project.name.replace(" ", "_").replace("/", "-")
    filename = f"{safe_name}_{project_id}.xlsx"

    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
