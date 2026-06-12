import logging
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.database import AsyncSessionLocal
from app.services.performance_service import PerformanceService
from app.services.conflict_service import ConflictService
from app.services.notification_service import NotificationService
from app.services.evm_service import EVMService

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

scheduler = AsyncIOScheduler(timezone=IST)


async def _daily_snapshot():
    logger.info("Running daily performance snapshot job")
    try:
        async with AsyncSessionLocal() as db:
            count = await PerformanceService.snapshot_all_persons(db)
        logger.info(f"Snapshot complete: {count} persons updated")
    except Exception as e:
        logger.error(f"Daily snapshot job failed: {e}")


async def _hourly_conflict_log():
    logger.info("Running hourly conflict check job")
    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            from app.models.project import Project, ProjectStatus
            result = await db.execute(
                select(Project).where(Project.status == ProjectStatus.ACTIVE)
            )
            projects = result.scalars().all()
            total_conflicts = 0
            for project in projects:
                conflicts = await ConflictService.detect_person_conflicts(project.id, db)
                total_conflicts += len(conflicts)
        logger.info(f"Conflict check done: {total_conflicts} conflict groups found across {len(projects)} active projects")
    except Exception as e:
        logger.error(f"Hourly conflict check job failed: {e}")


async def _hourly_alerts():
    logger.info("Running hourly notification alert job")
    try:
        async with AsyncSessionLocal() as db:
            await NotificationService.check_and_fire_alerts(db)
    except Exception as e:
        logger.error(f"Hourly alert job failed: {e}")


async def _daily_evm_snapshot():
    logger.info("Running daily EVM snapshot job")
    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            from app.models.project import Project, ProjectStatus
            result = await db.execute(
                select(Project).where(Project.status == ProjectStatus.ACTIVE)
            )
            projects = result.scalars().all()
            count = 0
            for project in projects:
                await EVMService.snapshot_project_evm(project.id, db)
                count += 1
            await db.commit()
        logger.info(f"EVM snapshot complete: {count} projects snapshotted")
    except Exception as e:
        logger.error(f"Daily EVM snapshot job failed: {e}")


async def _daily_digest_job():
    logger.info("Running daily digest job")
    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            from app.models.notification import NotificationRule, NotificationType
            result = await db.execute(
                select(NotificationRule).where(
                    NotificationRule.trigger_type == NotificationType.DAILY_DIGEST,
                    NotificationRule.is_active == True,  # noqa: E712
                )
            )
            rules = result.scalars().all()
            for rule in rules:
                await NotificationService.send_daily_digest(rule.user_id, db)
        logger.info(f"Daily digest sent to {len(rules)} users")
    except Exception as e:
        logger.error(f"Daily digest job failed: {e}")


def start_scheduler():
    scheduler.add_job(
        _daily_snapshot,
        trigger=CronTrigger(hour=0, minute=0, timezone=IST),
        id="daily_snapshot",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _hourly_conflict_log,
        trigger=IntervalTrigger(hours=1),
        id="hourly_conflict_check",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        _hourly_alerts,
        trigger=IntervalTrigger(minutes=60),
        id="hourly_alerts",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        _daily_digest_job,
        trigger=CronTrigger(hour=7, minute=0, timezone=IST),
        id="daily_digest",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _daily_evm_snapshot,
        trigger=CronTrigger(hour=0, minute=15, timezone=IST),
        id="daily_evm_snapshot",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info("APScheduler started (snapshots, conflict check, alerts, daily digest, evm snapshot)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
