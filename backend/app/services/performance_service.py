import uuid
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.person import Person
from app.models.activity import Activity, ActivityStatusOverride
from app.models.assignment import Assignment
from app.models.performance_snapshot import PerformanceSnapshot
from app.services.status_service import StatusService

TODAY_COL = StatusService.TODAY_COL


class PerformanceService:

    @staticmethod
    def _score_from_counts(done: int, on_track: int, slow: int, delayed: int, total: int) -> float:
        if total == 0:
            return 100.0
        raw = (done * 100 + on_track * 90 + slow * 60 + delayed * 20) / total
        return round(raw, 2)

    @staticmethod
    def _on_time_rate(done: int, on_time_done: int, total: int) -> float:
        if total == 0:
            return 100.0
        return round(on_time_done / total * 100, 2)

    @staticmethod
    def _classify_activities(activities: list[Activity]) -> dict:
        done = on_track = slow = delayed = pending = 0
        on_time_done = 0
        total_delay_cols = 0
        delayed_count = 0

        for act in activities:
            status = StatusService.compute_status(act)
            if status == ActivityStatusOverride.DONE.value:
                done += 1
                delay = (act.actual_end_col or act.plan_end_col) - act.plan_end_col
                if delay <= 0:
                    on_time_done += 1
                else:
                    total_delay_cols += delay
                    delayed_count += 1
            elif status == ActivityStatusOverride.ON_TRACK.value:
                on_track += 1
            elif status == ActivityStatusOverride.SLOW.value:
                slow += 1
            elif status == ActivityStatusOverride.DELAYED.value:
                delayed += 1
                total_delay_cols += max(0, TODAY_COL - act.plan_end_col)
                delayed_count += 1
            else:
                pending += 1

        avg_delay = round(total_delay_cols * 2 / max(delayed_count, 1), 2)  # cols * 2 days/col
        total = done + on_track + slow + delayed + pending

        return {
            "total": total,
            "done": done,
            "on_track": on_track,
            "slow": slow,
            "delayed": delayed,
            "pending": pending,
            "on_time_done": on_time_done,
            "avg_delay_days": avg_delay if delayed_count > 0 else 0.0,
        }

    @staticmethod
    async def _get_person_activities(person_id: uuid.UUID, db: AsyncSession) -> list[Activity]:
        result = await db.execute(
            select(Activity)
            .join(Assignment, Assignment.activity_id == Activity.id)
            .where(Assignment.person_id == person_id)
        )
        return result.scalars().all()

    @staticmethod
    async def _get_last_snapshot(person_id: uuid.UUID, db: AsyncSession) -> PerformanceSnapshot | None:
        result = await db.execute(
            select(PerformanceSnapshot)
            .where(PerformanceSnapshot.person_id == person_id)
            .order_by(PerformanceSnapshot.snapshot_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def _get_week_ago_snapshot(person_id: uuid.UUID, db: AsyncSession) -> PerformanceSnapshot | None:
        target = date.today() - timedelta(days=7)
        result = await db.execute(
            select(PerformanceSnapshot)
            .where(
                PerformanceSnapshot.person_id == person_id,
                PerformanceSnapshot.snapshot_date <= target,
            )
            .order_by(PerformanceSnapshot.snapshot_date.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def compute_person_performance(person_id: uuid.UUID, db: AsyncSession) -> dict:
        person_result = await db.execute(select(Person).where(Person.id == person_id))
        person = person_result.scalar_one_or_none()
        if not person:
            return None

        activities = await PerformanceService._get_person_activities(person_id, db)
        counts = PerformanceService._classify_activities(activities)

        score = PerformanceService._score_from_counts(
            counts["done"], counts["on_track"], counts["slow"], counts["delayed"], counts["total"]
        )
        on_time_rate = PerformanceService._on_time_rate(
            counts["done"], counts["on_time_done"], counts["total"]
        )

        week_snap = await PerformanceService._get_week_ago_snapshot(person_id, db)
        score_change = round(score - week_snap.score, 2) if week_snap else 0.0

        return {
            "person_id": str(person.id),
            "person_name": person.name,
            "employee_id": person.employee_id,
            "department": person.department,
            "role": person.role,
            "skills": person.skills,
            "performance_score": score,
            "on_time_rate": on_time_rate,
            "avg_delay_days": counts["avg_delay_days"],
            "score_change_vs_last_week": score_change,
            "total_tasks": counts["total"],
            "completed_tasks": counts["done"],
            "on_track_tasks": counts["on_track"],
            "slow_tasks": counts["slow"],
            "delayed_tasks": counts["delayed"],
            "pending_tasks": counts["pending"],
            "activities": [
                {
                    "id": str(a.id),
                    "name": a.name,
                    "project_id": str(a.project_id),
                    "plan_start_col": a.plan_start_col,
                    "plan_end_col": a.plan_end_col,
                    "actual_start_col": a.actual_start_col,
                    "actual_end_col": a.actual_end_col,
                    "status": StatusService.compute_status(a),
                    "remarks": a.remarks,
                }
                for a in activities
            ],
        }

    @staticmethod
    async def compute_department_performance(department: str, db: AsyncSession) -> dict:
        persons_result = await db.execute(
            select(Person).where(Person.department == department, Person.is_active == True)
        )
        persons = persons_result.scalars().all()

        person_stats = []
        for person in persons:
            activities = await PerformanceService._get_person_activities(person.id, db)
            counts = PerformanceService._classify_activities(activities)
            score = PerformanceService._score_from_counts(
                counts["done"], counts["on_track"], counts["slow"], counts["delayed"], counts["total"]
            )
            on_time_rate = PerformanceService._on_time_rate(
                counts["done"], counts["on_time_done"], counts["total"]
            )
            person_stats.append({
                "person_id": str(person.id),
                "person_name": person.name,
                "employee_id": person.employee_id,
                "role": person.role,
                "performance_score": score,
                "on_time_rate": on_time_rate,
                "avg_delay_days": counts["avg_delay_days"],
                "total_tasks": counts["total"],
                "completed_tasks": counts["done"],
                "delayed_tasks": counts["delayed"],
            })

        if not person_stats:
            return {
                "department": department,
                "avg_score": 0.0,
                "avg_on_time_rate": 0.0,
                "total_persons": 0,
                "persons": [],
            }

        avg_score = round(sum(p["performance_score"] for p in person_stats) / len(person_stats), 2)
        avg_on_time = round(sum(p["on_time_rate"] for p in person_stats) / len(person_stats), 2)

        return {
            "department": department,
            "avg_score": avg_score,
            "avg_on_time_rate": avg_on_time,
            "total_persons": len(person_stats),
            "persons": sorted(person_stats, key=lambda x: x["performance_score"], reverse=True),
        }

    @staticmethod
    async def compute_leaderboard(
        db: AsyncSession, department: str | None = None, limit: int = 10
    ) -> list[dict]:
        q = select(Person).where(Person.is_active == True)
        if department:
            q = q.where(Person.department == department)
        persons_result = await db.execute(q)
        persons = persons_result.scalars().all()

        entries = []
        for person in persons:
            activities = await PerformanceService._get_person_activities(person.id, db)
            counts = PerformanceService._classify_activities(activities)
            score = PerformanceService._score_from_counts(
                counts["done"], counts["on_track"], counts["slow"], counts["delayed"], counts["total"]
            )
            week_snap = await PerformanceService._get_week_ago_snapshot(person.id, db)
            score_change = round(score - week_snap.score, 2) if week_snap else 0.0

            entries.append({
                "person_id": str(person.id),
                "person_name": person.name,
                "employee_id": person.employee_id,
                "department": person.department,
                "role": person.role,
                "performance_score": score,
                "on_time_rate": PerformanceService._on_time_rate(
                    counts["done"], counts["on_time_done"], counts["total"]
                ),
                "avg_delay_days": counts["avg_delay_days"],
                "total_tasks": counts["total"],
                "completed_tasks": counts["done"],
                "score_change_vs_last_week": score_change,
                "rank": 0,
            })

        entries.sort(key=lambda x: x["performance_score"], reverse=True)
        for i, entry in enumerate(entries[:limit], start=1):
            entry["rank"] = i

        return entries[:limit]

    @staticmethod
    async def get_person_history(
        person_id: uuid.UUID, db: AsyncSession, days: int = 90
    ) -> list[dict]:
        since = date.today() - timedelta(days=days)
        result = await db.execute(
            select(PerformanceSnapshot)
            .where(
                PerformanceSnapshot.person_id == person_id,
                PerformanceSnapshot.snapshot_date >= since,
            )
            .order_by(PerformanceSnapshot.snapshot_date.asc())
        )
        snaps = result.scalars().all()
        return [
            {
                "snapshot_date": s.snapshot_date.isoformat(),
                "score": s.score,
                "on_time_rate": s.on_time_rate,
                "avg_delay_days": s.avg_delay_days,
                "total_tasks": s.total_tasks,
                "completed_tasks": s.completed_tasks,
                "delayed_tasks": s.delayed_tasks,
            }
            for s in snaps
        ]

    @staticmethod
    async def compute_project_performance(project_id: uuid.UUID, db: AsyncSession) -> dict:
        result = await db.execute(
            select(Activity).where(Activity.project_id == project_id)
        )
        activities = result.scalars().all()

        person_ids_result = await db.execute(
            select(Assignment.person_id)
            .join(Activity, Activity.id == Assignment.activity_id)
            .where(Activity.project_id == project_id)
            .distinct()
        )
        person_ids = [row[0] for row in person_ids_result.all()]

        person_stats = []
        for pid in person_ids:
            proj_acts_result = await db.execute(
                select(Activity)
                .join(Assignment, Assignment.activity_id == Activity.id)
                .where(Assignment.person_id == pid, Activity.project_id == project_id)
            )
            proj_acts = proj_acts_result.scalars().all()
            counts = PerformanceService._classify_activities(proj_acts)
            score = PerformanceService._score_from_counts(
                counts["done"], counts["on_track"], counts["slow"], counts["delayed"], counts["total"]
            )
            person_result = await db.execute(select(Person).where(Person.id == pid))
            person = person_result.scalar_one_or_none()
            if person:
                person_stats.append({
                    "person_id": str(pid),
                    "person_name": person.name,
                    "department": person.department,
                    "performance_score": score,
                    "total_tasks": counts["total"],
                    "completed_tasks": counts["done"],
                    "delayed_tasks": counts["delayed"],
                })

        counts = PerformanceService._classify_activities(activities)
        summary_score = PerformanceService._score_from_counts(
            counts["done"], counts["on_track"], counts["slow"], counts["delayed"], counts["total"]
        )

        return {
            "project_id": str(project_id),
            "performance_score": summary_score,
            "total_tasks": counts["total"],
            "completed_tasks": counts["done"],
            "on_track_tasks": counts["on_track"],
            "slow_tasks": counts["slow"],
            "delayed_tasks": counts["delayed"],
            "pending_tasks": counts["pending"],
            "on_time_rate": PerformanceService._on_time_rate(
                counts["done"], counts["on_time_done"], counts["total"]
            ),
            "avg_delay_days": counts["avg_delay_days"],
            "persons": sorted(person_stats, key=lambda x: x["performance_score"], reverse=True),
        }

    @staticmethod
    async def snapshot_all_persons(db: AsyncSession) -> int:
        today = date.today()
        persons_result = await db.execute(select(Person).where(Person.is_active == True))
        persons = persons_result.scalars().all()

        count = 0
        for person in persons:
            activities = await PerformanceService._get_person_activities(person.id, db)
            counts = PerformanceService._classify_activities(activities)
            score = PerformanceService._score_from_counts(
                counts["done"], counts["on_track"], counts["slow"], counts["delayed"], counts["total"]
            )
            on_time_rate = PerformanceService._on_time_rate(
                counts["done"], counts["on_time_done"], counts["total"]
            )

            existing = await db.execute(
                select(PerformanceSnapshot).where(
                    PerformanceSnapshot.person_id == person.id,
                    PerformanceSnapshot.snapshot_date == today,
                )
            )
            snap = existing.scalar_one_or_none()

            if snap:
                snap.score = score
                snap.on_time_rate = on_time_rate
                snap.avg_delay_days = counts["avg_delay_days"]
                snap.total_tasks = counts["total"]
                snap.completed_tasks = counts["done"]
                snap.delayed_tasks = counts["delayed"]
            else:
                snap = PerformanceSnapshot(
                    person_id=person.id,
                    snapshot_date=today,
                    score=score,
                    on_time_rate=on_time_rate,
                    avg_delay_days=counts["avg_delay_days"],
                    total_tasks=counts["total"],
                    completed_tasks=counts["done"],
                    delayed_tasks=counts["delayed"],
                )
                db.add(snap)

            person.performance_score = score
            person.on_time_rate = on_time_rate
            person.avg_delay_days = counts["avg_delay_days"]
            count += 1

        await db.commit()
        return count
