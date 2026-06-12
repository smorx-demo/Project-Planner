"""
XER (Primavera P6) router.

Endpoints:
  POST /projects/xer/import          — import XER file → create Project + Activities
  GET  /projects/{project_id}/xer/export — export project as XER file
  POST /projects/xer/audit           — audit an XER file, return quality issues
  POST /projects/xer/audit/export    — generate an XLSX audit report
"""
import uuid
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.activity import Activity
from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.schemas.project import ProjectResponse
from app.dependencies import get_current_user, require_manager
from app.services.xer_service import XERService
from app.services.wbs_service import WBSService
from app.envelope import ok, audit
from app.limiter import limiter

router = APIRouter(tags=["xer"])

# ── Constants ─────────────────────────────────────────────────────────────────
_MAX_XER_BYTES = 20 * 1024 * 1024  # 20 MB


async def _read_xer_upload(file: UploadFile) -> str:
    """Read, size-check, and decode an uploaded .xer file."""
    filename = file.filename or ""
    if not filename.lower().endswith(".xer"):
        raise HTTPException(status_code=400, detail="Only .xer files are supported")

    raw = await file.read()
    if len(raw) > _MAX_XER_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue

    raise HTTPException(status_code=422, detail="Could not decode XER file (tried utf-8, latin-1, cp1252)")


# ─────────────────────────────────────────────────────────────────────────────
# POST /projects/xer/import
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/projects/xer/import", status_code=201)
@limiter.limit("5/minute")
async def import_xer(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Import a Primavera P6 XER file.
    Creates a new Project and all Activities derived from the XER TASK table.
    Sets WBS parent_id links and re-orders activities by WBS code.
    """
    content = await _read_xer_upload(file)

    try:
        parsed = XERService.import_xer(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse XER file: {exc}")

    if not parsed.get("activities"):
        raise HTTPException(
            status_code=422,
            detail="No activities with valid dates found in the XER file",
        )

    # ── Create Project ────────────────────────────────────────────────────────
    proj_data = parsed["project_data"]
    project = Project(
        name=proj_data.get("name", "Imported Project"),
        status=ProjectStatus.ACTIVE,
        created_by_id=current_user.id,
    )
    db.add(project)
    await db.flush()  # get project.id

    # ── Create Activities ─────────────────────────────────────────────────────
    # We track the activity objects by sequence_no so we can set parent_id after
    created_activities: list[Activity] = []

    for act_data in parsed["activities"]:
        activity = Activity(
            project_id=project.id,
            sequence_no=act_data["sequence_no"],
            name=act_data["name"],
            plan_start_col=act_data["plan_start_col"],
            plan_end_col=act_data["plan_end_col"],
            actual_start_col=act_data.get("actual_start_col"),
            actual_end_col=act_data.get("actual_end_col"),
            wbs_code=act_data.get("wbs_code") or None,
            wbs_level=act_data.get("wbs_level", 1),
            is_wbs_summary=act_data.get("is_wbs_summary", False),
            remarks=act_data.get("remarks"),
        )
        db.add(activity)
        created_activities.append(activity)

    # Flush so activities get IDs and we can build a wbs_code → activity map
    await db.flush()

    # ── Set parent_id via WBS code hierarchy ──────────────────────────────────
    # Build map: wbs_code → Activity (prefer summary rows for the same code)
    code_to_activity: dict[str, Activity] = {}
    for act in created_activities:
        if act.wbs_code:
            existing = code_to_activity.get(act.wbs_code)
            # prefer the summary activity as the canonical node for that code
            if existing is None or (not existing.is_wbs_summary and act.is_wbs_summary):
                code_to_activity[act.wbs_code] = act

    for act in created_activities:
        if act.wbs_code and "." in act.wbs_code:
            parent_code = act.wbs_code.rsplit(".", 1)[0]
            parent_act  = code_to_activity.get(parent_code)
            if parent_act is not None and parent_act.id != act.id:
                act.parent_id = parent_act.id

    await db.flush()

    # ── Re-order activities by WBS code ──────────────────────────────────────
    await WBSService.reorder_by_wbs(project.id, db)

    await db.refresh(project)

    # ── Audit log ─────────────────────────────────────────────────────────────
    await audit(
        db,
        user_id=current_user.id,
        action="XER_IMPORT",
        entity_type="project",
        entity_id=str(project.id),
        project_id=project.id,
        new_value={
            "name":              project.name,
            "activities_count":  len(created_activities),
            "wbs_levels":        parsed["wbs_levels"],
            "resource_count":    parsed["resource_count"],
        },
    )

    return ok({
        "project":           ProjectResponse.model_validate(project),
        "activities_imported": len(created_activities),
        "wbs_levels":          parsed["wbs_levels"],
        "resource_count":      parsed["resource_count"],
        "audit_issues":        parsed["audit_issues"][:20],
        "audit_counts":        parsed["audit_counts"],
    })


# ─────────────────────────────────────────────────────────────────────────────
# GET /projects/{project_id}/xer/export
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/xer/export")
@limiter.limit("20/minute")
async def export_xer(
    request: Request,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export a project and its activities as a Primavera P6 XER file.
    """
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Activity)
        .where(Activity.project_id == project_id)
        .order_by(Activity.sequence_no)
    )
    activities = list(result.scalars().all())

    try:
        xer_content = XERService.export_xer(project, activities)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"XER export failed: {exc}")

    safe_name = "".join(
        c if c.isalnum() or c in "-_" else "_"
        for c in project.name
    ).strip("_") or "project"
    filename = f"{safe_name}.xer"

    return StreamingResponse(
        BytesIO(xer_content.encode("utf-8")),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /projects/xer/audit
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/projects/xer/audit")
@limiter.limit("20/minute")
async def audit_xer(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Audit a Primavera P6 XER file without importing it.
    Returns schedule quality issues with severity ratings.
    """
    content = await _read_xer_upload(file)

    try:
        issues, counts, total_tasks = XERService.audit_xer(content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not audit XER file: {exc}")

    return ok({
        "issues":      issues,
        "counts":      counts,
        "total_tasks": total_tasks,
    })


# ─────────────────────────────────────────────────────────────────────────────
# POST /projects/xer/audit/export
# ─────────────────────────────────────────────────────────────────────────────

class AuditReportRequest(BaseModel):
    project_name: str
    total_tasks:  int
    issues:       list[dict]
    counts:       dict


@router.post("/projects/xer/audit/export")
@limiter.limit("20/minute")
async def export_audit_report(
    request: Request,
    body: AuditReportRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Generate a colour-coded XLSX schedule audit report from a pre-computed
    audit result. Accepts the same payload returned by POST /projects/xer/audit.
    """
    try:
        xlsx_bytes = XERService.audit_report_xlsx(
            project_name=body.project_name,
            total_tasks=body.total_tasks,
            issues=body.issues,
            counts=body.counts,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}")

    safe_name = "".join(
        c if c.isalnum() or c in "-_" else "_"
        for c in body.project_name
    ).strip("_") or "audit"
    filename = f"{safe_name}_audit.xlsx"

    return StreamingResponse(
        BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
