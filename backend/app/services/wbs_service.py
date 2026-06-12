"""
WBS (Work Breakdown Structure) service.

Handles tree building, rollup computation, WBS-order sorting,
and default color resolution for 8 hierarchy levels.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.activity import Activity
from app.models.wbs_level_color import WBSLevelColor
from app.services.status_service import StatusService


# ── Default colors per WBS level ──────────────────────────────────────────

WBS_DEFAULT_COLORS: dict[int, dict[str, str]] = {
    1: {"color": "#1F4E79", "bg": "#DEEAF1"},
    2: {"color": "#375623", "bg": "#E2EFDA"},
    3: {"color": "#7F5200", "bg": "#FFF2CC"},
    4: {"color": "#833C00", "bg": "#FCE4D6"},
    5: {"color": "#3F3151", "bg": "#EDEBF7"},
    6: {"color": "#265B73", "bg": "#DDEBF7"},
    7: {"color": "#595959", "bg": "#F2F2F2"},
    8: {"color": "#000000", "bg": "#FFFFFF"},
}


# ── WBS code sort key ─────────────────────────────────────────────────────

def _wbs_sort_key(code: Optional[str]) -> tuple:
    """
    Returns a tuple for correct semantic WBS ordering.
    "1" < "1.1" < "1.2" < "1.10" < "2"
    Activities without a wbs_code sort to the end.
    """
    if not code:
        return (9999,) * 8
    parts = code.split(".")
    padded = [int(p) if p.isdigit() else 0 for p in parts]
    # Pad to length 8 so tuples compare correctly regardless of depth
    padded += [0] * (8 - len(padded))
    return tuple(padded[:8])


class WBSService:

    # ── Level helpers ──────────────────────────────────────────────────────

    @staticmethod
    def compute_wbs_level(wbs_code: Optional[str]) -> int:
        """Derive the nesting level from a WBS code string."""
        if not wbs_code:
            return 1
        return wbs_code.count(".") + 1

    # ── Tree builder ───────────────────────────────────────────────────────

    @staticmethod
    def build_tree(
        activities: list[Activity],
        status_service: Optional[StatusService] = None,
        rollup_map: Optional[dict[uuid.UUID, dict]] = None,
    ) -> list[dict]:
        """
        Convert a flat sorted list of Activity objects into a nested tree.
        Each node has a 'children' key (list of the same shape).
        """
        by_id: dict[uuid.UUID, Activity] = {a.id: a for a in activities}
        children_map: dict[uuid.UUID, list[Activity]] = defaultdict(list)
        roots: list[Activity] = []

        for a in activities:
            if a.parent_id and a.parent_id in by_id:
                children_map[a.parent_id].append(a)
            else:
                roots.append(a)

        def _node(activity: Activity) -> dict:
            d = _activity_to_dict(activity)
            d["computed_status"] = StatusService.compute_status(activity)
            if rollup_map and activity.is_wbs_summary:
                d["rollup"] = rollup_map.get(activity.id)
            kids = sorted(
                children_map.get(activity.id, []),
                key=lambda x: (_wbs_sort_key(x.wbs_code), x.sequence_no),
            )
            d["children"] = [_node(k) for k in kids]
            return d

        sorted_roots = sorted(
            roots,
            key=lambda x: (_wbs_sort_key(x.wbs_code), x.sequence_no),
        )
        return [_node(r) for r in sorted_roots]

    # ── Rollup computation ─────────────────────────────────────────────────

    @staticmethod
    def compute_rollup_sync(
        summary_activity: Activity,
        all_activities: list[Activity],
    ) -> dict:
        """
        For a WBS summary node, aggregate all descendant leaf activities.
        Returns a rollup dict with date ranges, progress, and EVM totals.
        """
        by_id: dict[uuid.UUID, Activity] = {a.id: a for a in all_activities}
        children_map: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
        for a in all_activities:
            if a.parent_id:
                children_map[a.parent_id].append(a.id)

        def _descendants(aid: uuid.UUID) -> list[Activity]:
            result: list[Activity] = []
            for child_id in children_map.get(aid, []):
                if child_id in by_id:
                    result.append(by_id[child_id])
                    result.extend(_descendants(child_id))
            return result

        leaves = [
            a for a in _descendants(summary_activity.id)
            if not a.is_wbs_summary
        ]
        if not leaves:
            return {}

        statuses = [StatusService.compute_status(a) for a in leaves]
        worst = _worst_status(statuses)

        plan_starts  = [a.plan_start_col  for a in leaves]
        plan_ends    = [a.plan_end_col    for a in leaves]
        act_starts   = [a.actual_start_col for a in leaves if a.actual_start_col is not None]
        act_ends     = [a.actual_end_col   for a in leaves if a.actual_end_col   is not None]

        done_count = statuses.count("DONE")

        bac_total = sum(a.bac for a in leaves if a.bac is not None)
        ev_total  = sum((a.bac or 0) * (a.actual_pct or 0)  for a in leaves)
        pv_total  = sum((a.bac or 0) * (a.planned_pct or 0) for a in leaves)
        ac_total  = sum(a.actual_cost for a in leaves if a.actual_cost is not None)

        return {
            "plan_start_col":   min(plan_starts),
            "plan_end_col":     max(plan_ends),
            "actual_start_col": min(act_starts) if act_starts else None,
            "actual_end_col":   max(act_ends)   if act_ends   else None,
            "total_count":      len(leaves),
            "done_count":       done_count,
            "pct_complete":     round(done_count / len(leaves) * 100, 1),
            "overall_status":   worst,
            "bac_total":        bac_total,
            "ev_total":         round(ev_total, 2),
            "pv_total":         round(pv_total, 2),
            "ac_total":         ac_total,
        }

    @staticmethod
    def build_rollup_map(
        activities: list[Activity],
    ) -> dict[uuid.UUID, dict]:
        """Build rollup dicts for all summary activities in one pass."""
        service = WBSService()
        return {
            a.id: service.compute_rollup_sync(a, activities)
            for a in activities
            if a.is_wbs_summary
        }

    # ── WBS reorder ────────────────────────────────────────────────────────

    @staticmethod
    async def reorder_by_wbs(
        project_id: uuid.UUID,
        db: AsyncSession,
    ) -> int:
        """
        Sort all project activities by WBS code and update sequence_no.
        Activities without wbs_code retain their relative order at the end.
        Returns count of updated rows.
        """
        result = await db.execute(
            select(Activity)
            .where(Activity.project_id == project_id)
            .order_by(Activity.sequence_no)
        )
        activities = list(result.scalars().all())
        if not activities:
            return 0

        sorted_acts = sorted(
            activities,
            key=lambda a: (_wbs_sort_key(a.wbs_code), a.sequence_no),
        )

        for seq, a in enumerate(sorted_acts, start=1):
            a.sequence_no = seq

        await db.flush()
        return len(sorted_acts)

    # ── Next child WBS code ────────────────────────────────────────────────

    @staticmethod
    def next_child_wbs_code(
        parent_wbs_code: Optional[str],
        siblings: list[Activity],
    ) -> str:
        """
        Given a parent's wbs_code and its existing children, return
        the next sequential child code.
        e.g. parent="1.2", existing children=["1.2.1","1.2.2"] → "1.2.3"
        """
        prefix = (parent_wbs_code + ".") if parent_wbs_code else ""
        existing_nums: list[int] = []
        for s in siblings:
            if s.wbs_code and s.wbs_code.startswith(prefix):
                suffix = s.wbs_code[len(prefix):]
                top = suffix.split(".")[0]
                if top.isdigit():
                    existing_nums.append(int(top))
        nxt = max(existing_nums, default=0) + 1
        return f"{prefix}{nxt}"

    # ── Color helpers ──────────────────────────────────────────────────────

    @staticmethod
    async def get_project_colors(
        project_id: uuid.UUID,
        db: AsyncSession,
    ) -> list[dict]:
        """
        Return the 8 WBS level colors for a project.
        Falls back to WBS_DEFAULT_COLORS for any level not overridden.
        """
        result = await db.execute(
            select(WBSLevelColor).where(WBSLevelColor.project_id == project_id)
        )
        overrides = {r.level: r for r in result.scalars().all()}

        return [
            {
                "level":          lvl,
                "color_hex":      overrides[lvl].color_hex      if lvl in overrides else WBS_DEFAULT_COLORS[lvl]["color"],
                "background_hex": overrides[lvl].background_hex if lvl in overrides else WBS_DEFAULT_COLORS[lvl]["bg"],
            }
            for lvl in range(1, 9)
        ]

    @staticmethod
    async def set_project_colors(
        project_id: uuid.UUID,
        colors: list[dict],  # [{level, color_hex, background_hex}]
        db: AsyncSession,
    ) -> list[dict]:
        """Upsert WBS level colors for a project."""
        result = await db.execute(
            select(WBSLevelColor).where(WBSLevelColor.project_id == project_id)
        )
        existing = {r.level: r for r in result.scalars().all()}

        for item in colors:
            level = item["level"]
            if level in existing:
                existing[level].color_hex      = item["color_hex"]
                existing[level].background_hex = item["background_hex"]
            else:
                db.add(WBSLevelColor(
                    project_id=project_id,
                    level=level,
                    color_hex=item["color_hex"],
                    background_hex=item["background_hex"],
                ))

        await db.flush()
        return await WBSService.get_project_colors(project_id, db)


# ── Helpers ────────────────────────────────────────────────────────────────

_STATUS_PRIORITY = {
    "DELAYED":  5,
    "SLOW":     4,
    "ON_TRACK": 3,
    "PENDING":  2,
    "DONE":     1,
}


def _worst_status(statuses: list[str]) -> str:
    if not statuses:
        return "PENDING"
    return max(statuses, key=lambda s: _STATUS_PRIORITY.get(s, 0))


def _activity_to_dict(a: Activity) -> dict:
    """Convert an Activity ORM object to a plain dict (without children)."""
    return {
        "id":               str(a.id),
        "project_id":       str(a.project_id),
        "sequence_no":      a.sequence_no,
        "name":             a.name,
        "group_type":       a.group_type,
        "plan_start_col":   a.plan_start_col,
        "plan_end_col":     a.plan_end_col,
        "actual_start_col": a.actual_start_col,
        "actual_end_col":   a.actual_end_col,
        "status_override":  a.status_override.value if a.status_override else None,
        "remarks":          a.remarks,
        "bac":              a.bac,
        "bac_unit":         a.bac_unit,
        "planned_pct":      a.planned_pct,
        "actual_pct":       a.actual_pct,
        "actual_cost":      a.actual_cost,
        "wbs_code":         a.wbs_code,
        "parent_id":        str(a.parent_id) if a.parent_id else None,
        "wbs_level":        a.wbs_level,
        "is_wbs_summary":   a.is_wbs_summary,
        "wbs_color":        a.wbs_color,
        "assignments":      [
            {
                "id":          str(asgn.id),
                "activity_id": str(asgn.activity_id),
                "person_id":   str(asgn.person_id),
                "role":        asgn.role.value,
                "assigned_at": asgn.assigned_at.isoformat(),
            }
            for asgn in (a.assignments or [])
        ],
        "created_at":  a.created_at.isoformat(),
        "updated_at":  a.updated_at.isoformat() if a.updated_at else None,
    }
