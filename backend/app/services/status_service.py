from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.activity import Activity, ActivityStatusOverride


_EPOCH = date(2026, 3, 25)


def _today_col() -> int:
    return (date.today() - _EPOCH).days


class StatusService:
    TODAY_COL: int = _today_col()

    @staticmethod
    def compute_status(activity: Activity) -> str:
        # 1. Manual override always wins
        if activity.status_override is not None:
            return activity.status_override.value

        # 2. Actual end is set → finished, but check if it was late
        if activity.actual_end_col is not None:
            if activity.actual_end_col > activity.plan_end_col:
                return ActivityStatusOverride.DELAYED.value   # completed after planned end → red
            return ActivityStatusOverride.DONE.value          # completed on time → green

        today    = StatusService.TODAY_COL
        midpoint = (activity.plan_start_col + activity.plan_end_col) / 2

        # 3. Not started yet
        if activity.actual_start_col is None:
            if today > activity.plan_end_col:
                return ActivityStatusOverride.DELAYED.value   # past end without starting → red
            if today > midpoint:
                return ActivityStatusOverride.SLOW.value      # past midpoint without starting → orange
            return ActivityStatusOverride.PENDING.value

        # 4. In progress (actual_start set, no actual_end)
        if today > activity.plan_end_col or activity.actual_start_col > activity.plan_end_col:
            return ActivityStatusOverride.DELAYED.value       # overrun plan end → red

        if today > midpoint or activity.actual_start_col > midpoint:
            return ActivityStatusOverride.SLOW.value          # past midpoint → orange

        return ActivityStatusOverride.ON_TRACK.value

    @staticmethod
    def compute_project_summary(activities: list[Activity]) -> dict:
        total = len(activities)
        if total == 0:
            return {
                "total": 0,
                "counts": {s.value: 0 for s in ActivityStatusOverride},
                "pct_complete": 0.0,
                "overall_status": ActivityStatusOverride.PENDING.value,
            }

        statuses = [StatusService.compute_status(a) for a in activities]
        counts = {s.value: statuses.count(s.value) for s in ActivityStatusOverride}

        done = counts[ActivityStatusOverride.DONE.value]
        pct_complete = round(done / total * 100, 1)

        if counts[ActivityStatusOverride.DELAYED.value] > 0:
            overall = ActivityStatusOverride.DELAYED.value
        elif counts[ActivityStatusOverride.SLOW.value] > 0:
            overall = ActivityStatusOverride.SLOW.value
        elif done == total:
            overall = ActivityStatusOverride.DONE.value
        elif counts[ActivityStatusOverride.PENDING.value] == total:
            overall = ActivityStatusOverride.PENDING.value
        else:
            overall = ActivityStatusOverride.ON_TRACK.value

        return {
            "total": total,
            "counts": counts,
            "pct_complete": pct_complete,
            "overall_status": overall,
        }


async def check_db_connection(db: AsyncSession) -> bool:
    try:
        await db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
