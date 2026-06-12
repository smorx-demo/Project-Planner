import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.activity import Activity
from app.models.assignment import Assignment
from app.models.person import Person


class ConflictService:

    @staticmethod
    async def detect_person_conflicts(
        project_id: uuid.UUID, db: AsyncSession
    ) -> list[dict]:
        """
        For every person assigned to activities in the project, find all
        pairs of their activities whose plan ranges overlap.
        Returns only persons who have at least one conflict.
        """
        result = await db.execute(
            select(Activity)
            .where(Activity.project_id == project_id)
            .options(
                selectinload(Activity.assignments).selectinload(Assignment.person)
            )
            .order_by(Activity.sequence_no)
        )
        activities = result.scalars().all()

        # Build person → activities map
        person_map: dict[str, dict] = {}
        for act in activities:
            for asgn in act.assignments:
                pid = str(asgn.person_id)
                if pid not in person_map:
                    person_map[pid] = {
                        "person_id": pid,
                        "person_name": asgn.person.name,
                        "department": asgn.person.department,
                        "acts": [],
                    }
                person_map[pid]["acts"].append(act)

        conflict_list = []
        for pid, data in person_map.items():
            acts = data["acts"]
            conflicts = []
            for i in range(len(acts)):
                for j in range(i + 1, len(acts)):
                    a, b = acts[i], acts[j]
                    if a.plan_start_col <= b.plan_end_col and b.plan_start_col <= a.plan_end_col:
                        conflicts.append({
                            "activity_a": {
                                "id": str(a.id),
                                "name": a.name,
                                "plan_start_col": a.plan_start_col,
                                "plan_end_col": a.plan_end_col,
                            },
                            "activity_b": {
                                "id": str(b.id),
                                "name": b.name,
                                "plan_start_col": b.plan_start_col,
                                "plan_end_col": b.plan_end_col,
                            },
                            "overlap_start": max(a.plan_start_col, b.plan_start_col),
                            "overlap_end": min(a.plan_end_col, b.plan_end_col),
                        })
            if conflicts:
                conflict_list.append({
                    "person_id": pid,
                    "person_name": data["person_name"],
                    "department": data["department"],
                    "conflicts": conflicts,
                })

        return conflict_list

    @staticmethod
    async def check_assignment_conflict(
        person_id: uuid.UUID, activity_id: uuid.UUID, db: AsyncSession
    ) -> dict | None:
        """
        Check if assigning person_id to activity_id creates an overlap with another
        activity in the same project already assigned to that person.
        Returns conflict details or None.
        """
        activity = await db.get(Activity, activity_id)
        if not activity:
            return None

        result = await db.execute(
            select(Activity)
            .join(Assignment, Assignment.activity_id == Activity.id)
            .where(
                Assignment.person_id == person_id,
                Activity.project_id == activity.project_id,
                Activity.id != activity_id,
                Activity.plan_start_col <= activity.plan_end_col,
                Activity.plan_end_col >= activity.plan_start_col,
            )
            .limit(1)
        )
        conflict_act = result.scalar_one_or_none()
        if not conflict_act:
            return None

        return {
            "conflict_activity_id": str(conflict_act.id),
            "conflict_activity_name": conflict_act.name,
            "overlap_start": max(activity.plan_start_col, conflict_act.plan_start_col),
            "overlap_end": min(activity.plan_end_col, conflict_act.plan_end_col),
            "message": (
                f"Also assigned to '{conflict_act.name}' "
                f"(cols {conflict_act.plan_start_col}–{conflict_act.plan_end_col})"
            ),
        }

    @staticmethod
    async def get_available_persons(
        project_id: uuid.UUID,
        start_col: int,
        end_col: int,
        db: AsyncSession,
    ) -> list[Person]:
        """
        Persons with no assignment overlapping [start_col, end_col] in the given
        project AND no leave_schedule entry overlapping those cols.
        """
        from sqlalchemy import func

        overlap_subq = (
            select(Assignment.person_id, func.count(Assignment.id).label("cnt"))
            .join(Activity, Activity.id == Assignment.activity_id)
            .where(
                Activity.project_id == project_id,
                Activity.plan_start_col <= end_col,
                Activity.plan_end_col >= start_col,
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

        # Filter out persons on leave for this range (JSONB array checked in Python)
        available = []
        for p in persons:
            on_leave = any(
                e.get("start_col", 999) <= end_col and e.get("end_col", -1) >= start_col
                for e in (p.leave_schedule or [])
            )
            if not on_leave:
                available.append(p)

        return available
