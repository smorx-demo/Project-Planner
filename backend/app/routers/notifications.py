import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.envelope import ok
from app.limiter import limiter
from app.models.notification import Notification, NotificationRule, NotificationType
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    trigger_type: NotificationType
    project_id: Optional[uuid.UUID] = None
    threshold_days: int = 0
    channels: list[str] = ["IN_APP"]


class RuleUpdate(BaseModel):
    is_active: Optional[bool] = None
    threshold_days: Optional[int] = None
    channels: Optional[list[str]] = None


# ── Notification endpoints ────────────────────────────────────────────────────

@router.get("")
@limiter.limit("120/minute")
async def list_notifications(
    request: Request,
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712

    result = await db.execute(q)
    notifications = result.scalars().all()

    # Unread count (always full, not filtered)
    unread_result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    unread_count = len(unread_result.scalars().all())

    return ok({
        "notifications": [_serialize(n) for n in notifications],
        "unread_count": unread_count,
    })


@router.patch("/{notification_id}/read")
@limiter.limit("60/minute")
async def mark_read(
    request: Request,
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = await db.get(Notification, notification_id)
    if not notif or notif.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.flush()
    return ok(_serialize(notif))


@router.patch("/read-all")
@limiter.limit("30/minute")
async def mark_all_read(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    await db.flush()
    return ok({"message": "All notifications marked as read"})


# ── Rules endpoints ───────────────────────────────────────────────────────────

@router.get("/rules")
@limiter.limit("60/minute")
async def list_rules(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(NotificationRule)
        .where(NotificationRule.user_id == current_user.id)
        .order_by(NotificationRule.created_at.desc())
    )
    rules = result.scalars().all()
    return ok([_serialize_rule(r) for r in rules])


@router.post("/rules", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_rule(
    request: Request,
    rule_in: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid_channels = {"EMAIL", "IN_APP", "SMS"}
    bad = [c for c in rule_in.channels if c not in valid_channels]
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid channels: {bad}")

    rule = NotificationRule(
        user_id=current_user.id,
        project_id=rule_in.project_id,
        trigger_type=rule_in.trigger_type,
        threshold_days=rule_in.threshold_days,
        channels=rule_in.channels,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return ok(_serialize_rule(rule))


@router.put("/rules/{rule_id}")
@limiter.limit("30/minute")
async def update_rule(
    request: Request,
    rule_id: uuid.UUID,
    rule_in: RuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = await db.get(NotificationRule, rule_id)
    if not rule or rule.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Rule not found")

    if rule_in.is_active is not None:
        rule.is_active = rule_in.is_active
    if rule_in.threshold_days is not None:
        rule.threshold_days = rule_in.threshold_days
    if rule_in.channels is not None:
        valid_channels = {"EMAIL", "IN_APP", "SMS"}
        bad = [c for c in rule_in.channels if c not in valid_channels]
        if bad:
            raise HTTPException(status_code=400, detail=f"Invalid channels: {bad}")
        rule.channels = rule_in.channels

    await db.flush()
    await db.refresh(rule)
    return ok(_serialize_rule(rule))


@router.delete("/rules/{rule_id}")
@limiter.limit("20/minute")
async def delete_rule(
    request: Request,
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rule = await db.get(NotificationRule, rule_id)
    if not rule or rule.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.flush()
    return ok({"deleted": True, "id": str(rule_id)})


# ── Test email ────────────────────────────────────────────────────────────────

@router.post("/test-email")
@limiter.limit("5/minute")
async def send_test_email(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    from app.services.notification_service import NotificationService
    from app.config import settings
    recipient = settings.NOTIFICATION_TO or current_user.email
    await NotificationService._send_email(
        recipient,
        "IE Planner — Test Notification",
        f"""
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#1e3a5f;padding:20px;text-align:center;">
    <h2 style="color:white;margin:0;font-size:20px;">Ingenious Engineering</h2>
    <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">Project Planner — Test Email</p>
  </div>
  <div style="background:#22c55e;padding:12px 20px;">
    <p style="color:white;margin:0;font-size:15px;font-weight:bold;">✓ Email notifications are working</p>
  </div>
  <div style="padding:24px;">
    <p style="font-size:14px;color:#374151;">
      This is a test email triggered by <strong>{current_user.name}</strong> from the IE Planner settings page.
    </p>
    <p style="font-size:13px;color:#6b7280;">
      Sending to: <strong>{recipient}</strong><br/>
      Sent from: <strong>{settings.RESEND_FROM}</strong>
    </p>
  </div>
  <div style="background:#f3f4f6;padding:12px 20px;text-align:center;font-size:12px;color:#9ca3af;">
    Ingenious Engineering Pvt. Ltd. — Automated Alert System
  </div>
</body>
</html>""",
    )
    return ok({"sent_to": recipient})


# ── Serializers ───────────────────────────────────────────────────────────────

def _serialize(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "user_id": str(n.user_id),
        "project_id": str(n.project_id) if n.project_id else None,
        "activity_id": str(n.activity_id) if n.activity_id else None,
        "type": n.type.value,
        "title": n.title,
        "message": n.message,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def _serialize_rule(r: NotificationRule) -> dict:
    return {
        "id": str(r.id),
        "user_id": str(r.user_id),
        "project_id": str(r.project_id) if r.project_id else None,
        "trigger_type": r.trigger_type.value,
        "threshold_days": r.threshold_days,
        "channels": r.channels or [],
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
