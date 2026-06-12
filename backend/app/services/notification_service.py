import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.assignment import Assignment
from app.models.notification import Notification, NotificationRule, NotificationType
from app.models.person import Person
from app.models.project import Project, ProjectStatus
from app.models.user import User, UserRole
from app.services.status_service import StatusService

logger = logging.getLogger(__name__)

DAYS_PER_COL = 2
TODAY_COL = StatusService.TODAY_COL


class NotificationService:

    # ── helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    async def create_notification(
        *,
        user_id: uuid.UUID,
        type: NotificationType,
        title: str,
        message: str,
        db: AsyncSession,
        project_id: uuid.UUID | None = None,
        activity_id: uuid.UUID | None = None,
    ) -> Notification:
        notif = Notification(
            user_id=user_id,
            project_id=project_id,
            activity_id=activity_id,
            type=type,
            title=title,
            message=message,
        )
        db.add(notif)
        return notif

    @staticmethod
    async def _recent_notification_exists(
        user_id: uuid.UUID,
        type: NotificationType,
        db: AsyncSession,
        activity_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
    ) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        q = select(Notification).where(
            Notification.user_id == user_id,
            Notification.type == type,
            Notification.created_at >= cutoff,
        )
        if activity_id:
            q = q.where(Notification.activity_id == activity_id)
        elif project_id:
            q = q.where(Notification.project_id == project_id)
        result = await db.execute(q.limit(1))
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def _get_manager_users(db: AsyncSession) -> list[User]:
        result = await db.execute(
            select(User).where(
                User.is_active == True,  # noqa: E712
                User.role.in_([UserRole.ADMIN, UserRole.MANAGER]),
            )
        )
        return result.scalars().all()

    @staticmethod
    async def _get_user_rules(
        user_id: uuid.UUID,
        trigger_type: NotificationType,
        project_id: uuid.UUID | None,
        db: AsyncSession,
    ) -> list[NotificationRule]:
        q = select(NotificationRule).where(
            NotificationRule.user_id == user_id,
            NotificationRule.trigger_type == trigger_type,
            NotificationRule.is_active == True,  # noqa: E712
        )
        result = await db.execute(q)
        rules = result.scalars().all()
        # Keep rules that match the project or are global (project_id IS NULL)
        return [
            r for r in rules
            if r.project_id is None or r.project_id == project_id
        ]

    # ── email ────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_activity_email(notification: dict) -> tuple[str, str]:
        status = notification.get("status", "")
        activity_name = notification.get("activity_name", "Activity")
        project_name = notification.get("project_name", "")
        po_number = notification.get("po_number", "")
        part_number = notification.get("part_number", "")
        customer = notification.get("customer_name", "")
        plan_end_date = notification.get("plan_end_date", "")
        delay_days = notification.get("delay_days", 0)
        app_url = settings.APP_URL
        project_id = notification.get("project_id", "")

        banner_color = "#ef4444" if status == "DELAYED" else "#f97316"
        subject = f"[{status}] {activity_name} — {project_name}"
        body = f"""
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
  <div style="background:#1e3a5f;padding:20px;text-align:center;">
    <h2 style="color:white;margin:0;font-size:20px;">Ingenious Engineering</h2>
    <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">Project Planner Alert</p>
  </div>
  <div style="background:{banner_color};padding:12px 20px;">
    <p style="color:white;margin:0;font-size:15px;font-weight:bold;">⚠ Activity {status}</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:130px;">Activity</td>
          <td style="padding:8px 0;font-weight:600;">{activity_name}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px;">Project</td>
          <td style="padding:8px;">{po_number} — {part_number}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Customer</td>
          <td style="padding:8px 0;">{customer}</td></tr>
      <tr style="background:#f9fafb;"><td style="padding:8px;">Plan End</td>
          <td style="padding:8px;">{plan_end_date}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Delay</td>
          <td style="padding:8px 0;color:{banner_color};font-weight:bold;">{delay_days} days</td></tr>
    </table>
    <div style="margin-top:24px;text-align:center;">
      <a href="{app_url}/projects/{project_id}"
         style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;
                text-decoration:none;font-size:14px;font-weight:600;">
        View in Project Planner →
      </a>
    </div>
  </div>
  <div style="background:#f3f4f6;padding:12px 20px;text-align:center;font-size:12px;color:#9ca3af;">
    Ingenious Engineering Pvt. Ltd. — Automated Alert
  </div>
</body>
</html>"""
        return subject, body

    @staticmethod
    async def _send_email(to_email: str, subject: str, html_body: str) -> None:
        if not settings.RESEND_API_KEY:
            logger.warning("Resend API key not configured — skipping email to %s", to_email)
            return
        recipient = settings.NOTIFICATION_TO or to_email
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": settings.RESEND_FROM,
                        "to": [recipient],
                        "subject": subject,
                        "html": html_body,
                    },
                )
                resp.raise_for_status()
            logger.info("Email sent via Resend to %s: %s", recipient, subject)
        except Exception as exc:
            logger.error("Failed to send email via Resend to %s: %s", recipient, exc)

    @staticmethod
    async def send_email_alert(to_email: str, notification: dict) -> None:
        subject, body = NotificationService._build_activity_email(notification)
        await NotificationService._send_email(to_email, subject, body)

    # ── SMS ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def send_sms_alert(to_number: str, notification: dict) -> None:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            logger.warning("Twilio not configured — skipping SMS to %s", to_number)
            return
        activity_name = notification.get("activity_name", "Activity")
        status = notification.get("status", "")
        delay_days = notification.get("delay_days", 0)
        po_number = notification.get("po_number", "")
        body = (
            f"[IE Planner] {activity_name} is {status} by {delay_days} days. "
            f"Project: {po_number}. Login to review."
        )
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    url,
                    data={"From": settings.TWILIO_FROM_NUMBER, "To": to_number, "Body": body},
                    auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                )
            logger.info("SMS sent to %s", to_number)
        except Exception as exc:
            logger.error("Failed to send SMS to %s: %s", to_number, exc)

    # ── daily digest ─────────────────────────────────────────────────────────

    @staticmethod
    async def send_daily_digest(user_id: uuid.UUID, db: AsyncSession) -> None:
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            return

        projects_result = await db.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )
        projects = projects_result.scalars().all()

        rows = []
        for proj in projects:
            acts_result = await db.execute(
                select(Activity).where(Activity.project_id == proj.id)
            )
            activities = acts_result.scalars().all()
            for act in activities:
                status = StatusService.compute_status(act)
                if status in ("DELAYED", "SLOW"):
                    delay_cols = max(0, TODAY_COL - act.plan_end_col)
                    rows.append({
                        "project": proj.name,
                        "po": proj.po_number or "",
                        "activity": act.name,
                        "status": status,
                        "delay_days": delay_cols * DAYS_PER_COL,
                    })

        if not rows:
            return

        rows_html = "".join(
            f"<tr style='background:{'#fef2f2' if r['status']=='DELAYED' else '#fff7ed'};'>"
            f"<td style='padding:8px;border:1px solid #e5e7eb;'>{r['project']}</td>"
            f"<td style='padding:8px;border:1px solid #e5e7eb;'>{r['po']}</td>"
            f"<td style='padding:8px;border:1px solid #e5e7eb;'>{r['activity']}</td>"
            f"<td style='padding:8px;border:1px solid #e5e7eb;color:{'#ef4444' if r['status']=='DELAYED' else '#f97316'};font-weight:600;'>{r['status']}</td>"
            f"<td style='padding:8px;border:1px solid #e5e7eb;'>{r['delay_days']}d</td>"
            f"</tr>"
            for r in rows
        )
        html = f"""
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
  <div style="background:#1e3a5f;padding:20px;"><h2 style="color:white;margin:0;">Daily Digest — {datetime.now().strftime('%d %b %Y')}</h2></div>
  <div style="padding:20px;">
    <p style="color:#374151;">Hi {user.name}, here is today's project status summary.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#1e3a5f;color:white;">
        <th style="padding:10px;text-align:left;">Project</th>
        <th style="padding:10px;text-align:left;">PO</th>
        <th style="padding:10px;text-align:left;">Activity</th>
        <th style="padding:10px;text-align:left;">Status</th>
        <th style="padding:10px;text-align:left;">Delay</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    <div style="margin-top:20px;text-align:center;">
      <a href="{settings.APP_URL}/dashboard" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Open Project Planner →
      </a>
    </div>
  </div>
</body></html>"""

        await NotificationService._send_email(
            user.email,
            f"Daily Digest — {len(rows)} items need attention",
            html,
        )
        # Also create an in-app notification
        await NotificationService.create_notification(
            user_id=user_id,
            type=NotificationType.DAILY_DIGEST,
            title="Daily Digest",
            message=f"{len(rows)} activities need attention across {len(projects)} active projects.",
            db=db,
        )

    # ── hourly alert check ───────────────────────────────────────────────────

    @staticmethod
    async def check_and_fire_alerts(db: AsyncSession) -> None:
        managers = await NotificationService._get_manager_users(db)
        if not managers:
            return

        projects_result = await db.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )
        projects = projects_result.scalars().all()

        for proj in projects:
            acts_result = await db.execute(
                select(Activity).where(Activity.project_id == proj.id)
            )
            activities = acts_result.scalars().all()

            delayed_count = slow_count = 0

            for act in activities:
                status = StatusService.compute_status(act)
                if status not in ("DELAYED", "SLOW"):
                    continue

                trigger = (
                    NotificationType.ACTIVITY_DELAYED
                    if status == "DELAYED"
                    else NotificationType.ACTIVITY_SLOW
                )
                delay_cols = max(0, TODAY_COL - act.plan_end_col)
                delay_days = delay_cols * DAYS_PER_COL

                if status == "DELAYED":
                    delayed_count += 1
                else:
                    slow_count += 1

                notif_data = {
                    "activity_name": act.name,
                    "project_name": proj.name,
                    "project_id": str(proj.id),
                    "po_number": proj.po_number or "",
                    "part_number": proj.part_number or "",
                    "customer_name": proj.customer_name or "",
                    "status": status,
                    "delay_days": delay_days,
                    "plan_end_date": "",
                }

                for user in managers:
                    already_sent = await NotificationService._recent_notification_exists(
                        user.id, trigger, db, activity_id=act.id
                    )
                    if already_sent:
                        continue

                    await NotificationService.create_notification(
                        user_id=user.id,
                        type=trigger,
                        title=f"{act.name} is {status}",
                        message=(
                            f"Activity '{act.name}' in project '{proj.name}' "
                            f"is {status.lower()} by {delay_days} days."
                        ),
                        db=db,
                        project_id=proj.id,
                        activity_id=act.id,
                    )

                    # Check user rules for email/SMS channels
                    rules = await NotificationService._get_user_rules(
                        user.id, trigger, proj.id, db
                    )
                    for rule in rules:
                        threshold_met = delay_days >= rule.threshold_days
                        if not threshold_met:
                            continue
                        if "EMAIL" in (rule.channels or []):
                            await NotificationService.send_email_alert(user.email, notif_data)
                        if "SMS" in (rule.channels or []):
                            logger.info(
                                "SMS channel configured for user %s but no phone number field available",
                                user.email,
                            )

            # PROJECT_BEHIND: >30% activities delayed or slow
            total = len(activities)
            if total > 0 and (delayed_count + slow_count) / total > 0.30:
                for user in managers:
                    already_sent = await NotificationService._recent_notification_exists(
                        user.id, NotificationType.PROJECT_BEHIND, db, project_id=proj.id
                    )
                    if already_sent:
                        continue
                    await NotificationService.create_notification(
                        user_id=user.id,
                        type=NotificationType.PROJECT_BEHIND,
                        title=f"Project Behind Schedule: {proj.name}",
                        message=(
                            f"{delayed_count + slow_count}/{total} activities are delayed or slow "
                            f"in '{proj.name}'."
                        ),
                        db=db,
                        project_id=proj.id,
                    )

        # PERSON_OVERLOADED: 3+ concurrent active tasks
        persons_result = await db.execute(
            select(Person).where(Person.is_active == True)  # noqa: E712
        )
        persons = persons_result.scalars().all()

        for person in persons:
            active_acts = await db.execute(
                select(Activity)
                .join(Assignment, Assignment.activity_id == Activity.id)
                .where(
                    Assignment.person_id == person.id,
                    Activity.actual_start_col.isnot(None),
                    Activity.actual_end_col.is_(None),
                )
            )
            active_count = len(active_acts.scalars().all())
            if active_count < 3:
                continue

            for user in managers:
                already_sent = await NotificationService._recent_notification_exists(
                    user.id, NotificationType.PERSON_OVERLOADED, db
                )
                if already_sent:
                    continue
                await NotificationService.create_notification(
                    user_id=user.id,
                    type=NotificationType.PERSON_OVERLOADED,
                    title=f"{person.name} is overloaded",
                    message=(
                        f"{person.name} has {active_count} concurrent active tasks "
                        f"(max: {person.max_concurrent_tasks})."
                    ),
                    db=db,
                )

        await db.commit()
        logger.info("Alert check complete")
