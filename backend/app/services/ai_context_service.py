import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.activity import Activity, ActivityStatusOverride
from app.models.assignment import Assignment
from app.models.person import Person
from app.models.project import Project
from app.services.conflict_service import ConflictService
from app.services.status_service import StatusService

TODAY_COL = StatusService.TODAY_COL
DAYS_PER_COL = 2

STATUS_EMOJI = {
    "DONE": "✅",
    "ON_TRACK": "🟢",
    "SLOW": "🟠",
    "DELAYED": "🔴",
    "PENDING": "⏳",
}


class AIContextService:

    TIMELINE_MAP = {
        0: "02 Mar", 1: "03 Mar", 2: "04 Mar", 3: "05 Mar", 4: "06 Mar", 5: "07 Mar",
        6: "09 Mar", 7: "10 Mar", 8: "11 Mar", 9: "12 Mar", 10: "13 Mar", 11: "14 Mar",
        12: "16 Mar", 13: "17 Mar", 14: "18 Mar", 15: "19 Mar", 16: "20 Mar", 17: "21 Mar",
        18: "23 Mar", 19: "24 Mar", 20: "25 Mar", 21: "26 Mar", 22: "27 Mar", 23: "28 Mar",
        24: "25 May", 25: "26 May", 26: "27 May", 27: "28 May", 28: "29 May", 29: "30 May",
        30: "01 Jun", 31: "02 Jun", 32: "03 Jun", 33: "04 Jun", 34: "05 Jun", 35: "06 Jun",
        36: "08 Jun", 37: "09 Jun", 38: "10 Jun", 39: "11 Jun", 40: "12 Jun", 41: "13 Jun",
        42: "15 Jun", 43: "16 Jun", 44: "17 Jun", 45: "18 Jun", 46: "19 Jun", 47: "20 Jun",
        48: "22 Jun", 49: "23 Jun", 50: "24 Jun", 51: "25 Jun", 52: "26 Jun", 53: "27 Jun",
        54: "29 Jun", 55: "30 Jun", 56: "01 Jul", 57: "02 Jul", 58: "03 Jul", 59: "04 Jul",
        60: "06 Jul", 61: "07 Jul", 62: "08 Jul", 63: "09 Jul", 64: "10 Jul", 65: "11 Jul",
    }

    def __init__(self):
        # Simple dict cache: key → (timestamp, value)
        self._cache: dict[str, tuple[datetime, str]] = {}

    def col_to_date(self, col: int) -> str:
        return self.TIMELINE_MAP.get(col, f"col {col}")

    def _is_cached(self, key: str, ttl_seconds: int) -> str | None:
        if key in self._cache:
            ts, data = self._cache[key]
            if (datetime.now(timezone.utc) - ts).total_seconds() < ttl_seconds:
                return data
        return None

    def _set_cache(self, key: str, value: str) -> None:
        self._cache[key] = (datetime.now(timezone.utc), value)

    # ── Project context ───────────────────────────────────────────────────────

    async def build_project_context(self, project_id: str, db: AsyncSession) -> str:
        cache_key = f"project_{project_id}"
        cached = self._is_cached(cache_key, 300)
        if cached:
            return cached

        proj_uuid = uuid.UUID(project_id)
        project = await db.get(Project, proj_uuid)
        if not project:
            return f"Project {project_id} not found."

        # Load activities with assignments + persons
        result = await db.execute(
            select(Activity)
            .where(Activity.project_id == proj_uuid)
            .options(
                selectinload(Activity.assignments).selectinload(Assignment.person)
            )
            .order_by(Activity.sequence_no)
        )
        activities = result.scalars().all()

        # Compute statuses
        statuses = {a.id: StatusService.compute_status(a) for a in activities}

        # Summary counts
        counts = {s.value: 0 for s in ActivityStatusOverride}
        for s in statuses.values():
            counts[s] = counts.get(s, 0) + 1
        total = len(activities)
        done = counts.get("DONE", 0)
        pct = round(done / total * 100, 1) if total else 0

        # Dispatch col = latest plan_end_col
        dispatch_col = max((a.plan_end_col for a in activities), default=0)

        today_date = self.col_to_date(TODAY_COL)

        # ── COMPANY & PROJECT ──────────────────────────────────────────────
        lines = [
            "=== COMPANY & PROJECT ===",
            "Company: Ingenious Engineering Pvt. Ltd.",
            f"Customer: {project.customer_name or 'N/A'}",
            f"PO Number: {project.po_number or 'N/A'}",
            f"Part Number: {project.part_number or 'N/A'}",
            f"Product: {project.product_description or 'N/A'}",
            f"Scope: {project.scope_of_supply or 'N/A'}",
            f"Today: {today_date} (column index {TODAY_COL})",
            "",
            "=== PROJECT STATUS SUMMARY ===",
            f"Total Activities: {total}",
            f"Completed: {counts.get('DONE', 0)}",
            f"On Track: {counts.get('ON_TRACK', 0)}",
            f"Slow (slight delay): {counts.get('SLOW', 0)}",
            f"Delayed (significant): {counts.get('DELAYED', 0)}",
            f"Pending (not started): {counts.get('PENDING', 0)}",
            f"Overall Progress: {pct}%",
            f"Planned Dispatch: {self.col_to_date(dispatch_col)} (col {dispatch_col})",
        ]

        # ── ACTIVITIES TABLE ───────────────────────────────────────────────
        lines += ["", "=== ACTIVITIES — FULL STATUS TABLE ==="]
        lines.append("| # | Activity | People | Plan Start | Plan End | Actual Start | Actual End | Status | Delay | Remarks |")
        lines.append("|---|----------|--------|------------|----------|--------------|------------|--------|-------|---------|")

        for act in activities:
            status = statuses[act.id]
            emoji = STATUS_EMOJI.get(status, "")
            people = ", ".join(
                asgn.person.name for asgn in act.assignments if asgn.person
            ) or "Unassigned"

            # Delay calculation
            if status in ("DELAYED", "SLOW"):
                end_ref = act.actual_end_col if act.actual_end_col else TODAY_COL
                delay_cols = max(0, end_ref - act.plan_end_col)
                delay_str = f"{delay_cols * DAYS_PER_COL}d" if delay_cols > 0 else "—"
            elif status == "DONE" and act.actual_end_col:
                delay_cols = act.actual_end_col - act.plan_end_col
                delay_str = f"+{delay_cols * DAYS_PER_COL}d" if delay_cols > 0 else "✓"
            else:
                delay_str = "—"

            lines.append(
                f"| {act.sequence_no} | {act.name} | {people} "
                f"| {self.col_to_date(act.plan_start_col)} "
                f"| {self.col_to_date(act.plan_end_col)} "
                f"| {self.col_to_date(act.actual_start_col) if act.actual_start_col is not None else '—'} "
                f"| {self.col_to_date(act.actual_end_col) if act.actual_end_col is not None else '—'} "
                f"| {emoji} {status} | {delay_str} | {act.remarks or '—'} |"
            )

        # ── RESOURCE ASSIGNMENTS ───────────────────────────────────────────
        lines += ["", "=== RESOURCE ASSIGNMENTS ==="]
        person_acts: dict[str, dict] = {}
        for act in activities:
            for asgn in act.assignments:
                if not asgn.person:
                    continue
                pid = str(asgn.person_id)
                if pid not in person_acts:
                    person_acts[pid] = {
                        "person": asgn.person,
                        "tasks": [],
                    }
                person_acts[pid]["tasks"].append(
                    f"{act.name} [{statuses[act.id]}]"
                )

        if person_acts:
            for entry in person_acts.values():
                p = entry["person"]
                tasks_str = ", ".join(entry["tasks"])
                lines.append(
                    f"{p.name} ({p.department}, {p.role}): {tasks_str}"
                )
        else:
            lines.append("No personnel assigned.")

        # ── CONFLICTS ─────────────────────────────────────────────────────
        lines += ["", "=== CONFLICTS ==="]
        try:
            conflicts = await ConflictService.detect_person_conflicts(proj_uuid, db)
        except Exception:
            conflicts = []

        if conflicts:
            for c in conflicts:
                for item in c["conflicts"]:
                    a = item["activity_a"]
                    b = item["activity_b"]
                    lines.append(
                        f"{c['person_name']} is double-booked on '{a['name']}' and '{b['name']}' "
                        f"(overlap: {self.col_to_date(item['overlap_start'])} – "
                        f"{self.col_to_date(item['overlap_end'])})"
                    )
        else:
            lines.append("No conflicts detected.")

        # ── CRITICAL PATH ─────────────────────────────────────────────────
        lines += ["", "=== CRITICAL PATH ANALYSIS ==="]
        critical_path = self._find_critical_path(activities)
        lines.append(
            f"The critical path leads to Dispatch on {self.col_to_date(dispatch_col)} "
            f"(col {dispatch_col})."
        )
        lines.append("Critical path activities (zero float):")
        if critical_path:
            for act in critical_path:
                status = statuses[act.id]
                flag = " ← CURRENTLY DELAYED" if status == "DELAYED" else (
                    " ← SLOW" if status == "SLOW" else ""
                )
                lines.append(
                    f"  • [{act.sequence_no}] {act.name}: "
                    f"{self.col_to_date(act.plan_start_col)} → "
                    f"{self.col_to_date(act.plan_end_col)}{flag}"
                )
        else:
            lines.append("  (Unable to determine without explicit dependency data)")

        # ── DELAY IMPACT ──────────────────────────────────────────────────
        lines += ["", "=== CURRENT DELAY IMPACT ==="]
        delayed_acts = [a for a in activities if statuses[a.id] == "DELAYED"]
        if not delayed_acts:
            lines.append("No activities currently delayed.")
        else:
            max_slip = 0
            for act in delayed_acts:
                end_ref = act.actual_end_col if act.actual_end_col else TODAY_COL
                delay_cols = max(0, end_ref - act.plan_end_col)
                delay_days = delay_cols * DAYS_PER_COL

                successors = [
                    a for a in activities
                    if a.plan_start_col >= act.plan_end_col - 1
                    and a.plan_start_col <= act.plan_end_col + 3
                    and a.id != act.id
                ]

                lines.append(
                    f"Activity [{act.sequence_no}] '{act.name}' is delayed by {delay_days} days."
                )
                if successors:
                    for succ in successors:
                        push_cols = max(0, (act.plan_end_col + delay_cols) - succ.plan_start_col)
                        if push_cols > 0:
                            lines.append(
                                f"  → This pushes '{succ.name}' by {push_cols * DAYS_PER_COL} days."
                            )
                max_slip = max(max_slip, delay_cols)

            forecast_col = dispatch_col + max_slip
            lines.append(
                f"Forecast Dispatch: {self.col_to_date(forecast_col)} "
                f"vs planned {self.col_to_date(dispatch_col)}."
            )
            lines.append(f"Total schedule slip: {max_slip * DAYS_PER_COL} days.")

        # ── AI INSTRUCTIONS ───────────────────────────────────────────────
        lines += [
            "",
            "=== INSTRUCTIONS FOR AI ===",
            "You are an AI project assistant for Ingenious Engineering Pvt. Ltd.",
            "Answer questions about this manufacturing project specifically.",
            "FORMATTING RULES (mandatory):",
            "- Always use markdown bullet points (`- `) for every list or enumeration. Never write flowing paragraph text when listing items.",
            "- Use `**Bold label:**` to introduce each section or topic heading.",
            "- One piece of information per bullet. Keep each bullet to one line.",
            "- Use `---` on its own line to visually separate major sections.",
            "- Never output raw markdown table syntax or multi-column layouts.",
            "When suggesting recovery plans, name specific activities and people.",
            f"Dates refer to the timeline above. 'Today' means {today_date}.",
        ]

        context = "\n".join(lines)
        self._set_cache(cache_key, context)
        return context

    # ── Person context ────────────────────────────────────────────────────────

    async def build_person_context(self, person_id: str, db: AsyncSession) -> str:
        cache_key = f"person_{person_id}"
        cached = self._is_cached(cache_key, 300)
        if cached:
            return cached

        person_uuid = uuid.UUID(person_id)
        person = await db.get(Person, person_uuid)
        if not person:
            return f"Person {person_id} not found."

        result = await db.execute(
            select(Activity)
            .join(Assignment, Assignment.activity_id == Activity.id)
            .where(Assignment.person_id == person_uuid)
            .options(selectinload(Activity.assignments))
            .order_by(Activity.project_id, Activity.sequence_no)
        )
        activities = result.scalars().all()

        statuses = {a.id: StatusService.compute_status(a) for a in activities}
        counts = {s.value: 0 for s in ActivityStatusOverride}
        for s in statuses.values():
            counts[s] += 1

        lines = [
            "=== PERSON PROFILE ===",
            f"Name: {person.name}",
            f"Employee ID: {person.employee_id}",
            f"Department: {person.department}",
            f"Role: {person.role}",
            f"Skills: {', '.join(person.skills) if person.skills else 'N/A'}",
            f"Active: {'Yes' if person.is_active else 'No'}",
            f"Max Concurrent Tasks: {person.max_concurrent_tasks}",
            "",
            "=== PERFORMANCE METRICS ===",
            f"Performance Score: {person.performance_score:.1f}/100",
            f"On-Time Rate: {person.on_time_rate:.1f}%",
            f"Average Delay: {person.avg_delay_days:.1f} days",
            "",
            "=== TASK SUMMARY ===",
            f"Total Assigned: {len(activities)}",
            f"Completed: {counts.get('DONE', 0)}",
            f"On Track: {counts.get('ON_TRACK', 0)}",
            f"Slow: {counts.get('SLOW', 0)}",
            f"Delayed: {counts.get('DELAYED', 0)}",
            f"Pending: {counts.get('PENDING', 0)}",
            "",
            "=== ACTIVITY DETAIL ===",
            "| # | Activity | Plan | Actual | Status | Delay |",
            "|---|----------|------|--------|--------|-------|",
        ]

        for act in activities:
            status = statuses[act.id]
            emoji = STATUS_EMOJI.get(status, "")
            delay_cols = 0
            if status in ("DELAYED", "SLOW"):
                end_ref = act.actual_end_col if act.actual_end_col else TODAY_COL
                delay_cols = max(0, end_ref - act.plan_end_col)

            lines.append(
                f"| {act.sequence_no} | {act.name} "
                f"| {self.col_to_date(act.plan_start_col)}–{self.col_to_date(act.plan_end_col)} "
                f"| {self.col_to_date(act.actual_start_col) if act.actual_start_col is not None else '—'}–"
                f"{self.col_to_date(act.actual_end_col) if act.actual_end_col is not None else 'ongoing'} "
                f"| {emoji} {status} "
                f"| {delay_cols * DAYS_PER_COL}d |"
            )

        leave_entries = person.leave_schedule or []
        if leave_entries:
            lines += ["", "=== LEAVE SCHEDULE ==="]
            for entry in leave_entries:
                lines.append(
                    f"  • {self.col_to_date(entry.get('start_col', 0))} – "
                    f"{self.col_to_date(entry.get('end_col', 0))}: {entry.get('reason', '')}"
                )

        lines += [
            "",
            "=== INSTRUCTIONS FOR AI ===",
            f"You are analysing the performance and workload of {person.name} "
            f"at Ingenious Engineering Pvt. Ltd.",
            "Be specific and constructive. Reference actual task names and dates.",
            "When suggesting improvements, be actionable.",
        ]

        context = "\n".join(lines)
        self._set_cache(cache_key, context)
        return context

    # ── Dashboard context ─────────────────────────────────────────────────────

    async def build_dashboard_context(self, user_id: str, db: AsyncSession) -> str:
        cache_key = f"dashboard_{user_id}"
        cached = self._is_cached(cache_key, 300)
        if cached:
            return cached

        from app.models.project import Project, ProjectStatus
        result = await db.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )
        projects = result.scalars().all()

        lines = [
            "=== DASHBOARD OVERVIEW — INGENIOUS ENGINEERING ===",
            f"Today: {self.col_to_date(TODAY_COL)} (col {TODAY_COL})",
            f"Active Projects: {len(projects)}",
            "",
        ]

        for proj in projects:
            acts_result = await db.execute(
                select(Activity).where(Activity.project_id == proj.id)
            )
            acts = acts_result.scalars().all()
            statuses = [StatusService.compute_status(a) for a in acts]
            total = len(statuses)
            done = statuses.count("DONE")
            delayed = statuses.count("DELAYED")
            slow = statuses.count("SLOW")
            pct = round(done / total * 100, 1) if total else 0
            dispatch_col = max((a.plan_end_col for a in acts), default=0)
            health = (
                "🔴 At Risk" if delayed > 0
                else "🟠 Monitor" if slow > 0
                else "🟢 Healthy"
            )

            lines.append(f"── Project: {proj.name} ──")
            lines.append(f"  PO: {proj.po_number or 'N/A'} | Customer: {proj.customer_name or 'N/A'}")
            lines.append(f"  Progress: {pct}% ({done}/{total} done)")
            lines.append(f"  Delayed: {delayed} | Slow: {slow}")
            lines.append(f"  Dispatch: {self.col_to_date(dispatch_col)}")
            lines.append(f"  Health: {health}")
            lines.append("")

        lines += [
            "=== INSTRUCTIONS FOR AI ===",
            "You are a project management AI assistant for Ingenious Engineering Pvt. Ltd.",
            "The user may ask about any of the active projects listed above.",
            "MANDATORY RESPONSE FORMAT — follow exactly:",
            "1. For each project write a heading: ### <Project Name>",
            "2. Then a bullet list using `- ` for every data point. Example:",
            "   - **Status:** 🔴 At Risk",
            "   - **Progress:** 21.4% (3 of 14 done)",
            "   - **Delayed tasks:** 11",
            "   - **Dispatch:** 09 Jul",
            "   - **Action:** <one-line recommendation>",
            "3. Separate projects with `---`",
            "4. End with a `### Summary` section with 2-3 bullets.",
            "NEVER write flowing paragraphs. EVERY piece of information must be its own `- ` bullet.",
            f"Today is {self.col_to_date(TODAY_COL)}.",
        ]

        context = "\n".join(lines)
        self._set_cache(cache_key, context)
        return context

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _find_critical_path(self, activities: list) -> list:
        """Backward pass: find activities that chain to Dispatch with no slack."""
        if not activities:
            return []
        dispatch_col = max(a.plan_end_col for a in activities)
        sorted_by_end = sorted(activities, key=lambda a: a.plan_end_col, reverse=True)

        critical = []
        current_deadline = dispatch_col

        for act in sorted_by_end:
            if act.plan_end_col >= current_deadline - 1:
                critical.append(act)
                current_deadline = act.plan_start_col
            if current_deadline <= 0:
                break

        critical.reverse()
        return critical


ai_context_service = AIContextService()
