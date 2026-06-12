"""
XER (Primavera P6) import/export/audit service.

XER format rules:
  - Tab-delimited text
  - Section header:  %T <TABLE_NAME>
  - Field list:      %F\\tfield1\\tfield2\\t...
  - Record row:      %R\\tval1\\tval2\\t...
  - End of file:     %E
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# ── Epoch: col 0 = 2026-03-25 ────────────────────────────────────────────────
EPOCH = date(2026, 3, 25)

# ── Task type constants ────────────────────────────────────────────────────────
_WBS_SUMMARY_TYPES = {"TT_WBS", "TT_LOE"}
_SKIP_AUDIT_TYPES  = {"TT_Mile", "TT_LOE", "TT_Rsrc", "TT_WBS", "TT_FinMile"}

# ── Severity ordering ─────────────────────────────────────────────────────────
_SEV_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


class XERService:

    # ─────────────────────────────────────────────────────────────────────────
    # Primitive helpers
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_tables(content: str) -> dict[str, list[dict]]:
        """
        Parse XER text into {table_name: [row_dict, ...]}.
        Handles both CRLF and LF line endings.
        """
        tables: dict[str, list[dict]] = {}
        current_table: Optional[str] = None
        current_fields: list[str] = []

        for raw_line in content.splitlines():
            line = raw_line.rstrip("\r")
            if not line:
                continue

            if line.startswith("%T"):
                # %T TABLE_NAME  (may have leading/trailing whitespace around name)
                parts = re.split(r"\s+", line.strip(), maxsplit=1)
                current_table = parts[1].strip() if len(parts) > 1 else None
                current_fields = []
                if current_table:
                    tables.setdefault(current_table, [])

            elif line.startswith("%F"):
                # Field definition row
                cols = line.split("\t")
                current_fields = [c.strip() for c in cols[1:]]  # skip %F token

            elif line.startswith("%R"):
                # Record row
                if current_table and current_fields:
                    cols = line.split("\t")
                    vals = cols[1:]  # skip %R token
                    # Pad or trim to match field count
                    while len(vals) < len(current_fields):
                        vals.append("")
                    row = {
                        current_fields[i]: vals[i].strip()
                        for i in range(len(current_fields))
                    }
                    tables[current_table].append(row)

            elif line.startswith("%E"):
                # End of file — reset state
                current_table = None
                current_fields = []

        return tables

    @staticmethod
    def _parse_xer_date(val: str) -> Optional[date]:
        """Try '%Y-%m-%d %H:%M' then '%Y-%m-%d'. Returns None if blank/unparseable."""
        if not val or not val.strip():
            return None
        val = val.strip()
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return datetime.strptime(val, fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _date_to_col(d: date) -> int:
        """Convert a calendar date to a Gantt column integer."""
        return (d - EPOCH).days

    @staticmethod
    def _col_to_date(col: int) -> date:
        """Convert a Gantt column integer back to a calendar date."""
        return EPOCH + timedelta(days=col)

    @staticmethod
    def _fmt_xer_date(col: int) -> str:
        """Format a column number as 'YYYY-MM-DD 08:00' for XER output."""
        d = XERService._col_to_date(col)
        return d.strftime("%Y-%m-%d") + " 08:00"

    # ─────────────────────────────────────────────────────────────────────────
    # Import
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def import_xer(content: str) -> dict:
        """
        Parse XER content and return a structured import dict.

        Returns:
            {
                project_data: {name: str},
                activities: [activity_dict, ...],
                wbs_levels: int,
                resource_count: int,
                audit_issues: list[dict],
                audit_counts: dict,
            }
        """
        tables = XERService._parse_tables(content)

        # ── Project name ──────────────────────────────────────────────────────
        project_rows = tables.get("PROJECT", [])
        project_name = "Imported Project"
        if project_rows:
            p = project_rows[0]
            project_name = (
                p.get("proj_name")
                or p.get("proj_short_name")
                or project_name
            ).strip() or project_name

        # ── WBS hierarchy ─────────────────────────────────────────────────────
        wbs_rows = tables.get("WBS", [])
        proj_id_val = project_rows[0].get("proj_id", "") if project_rows else ""

        # Map wbs_id → row
        wbs_by_id: dict[str, dict] = {r["wbs_id"]: r for r in wbs_rows if r.get("wbs_id")}
        all_wbs_ids = set(wbs_by_id.keys())

        # Determine root WBS nodes: parent_wbs_id == proj_id OR parent_wbs_id not in wbs set
        def _is_root(row: dict) -> bool:
            parent = row.get("parent_wbs_id", "")
            return (not parent) or (parent == proj_id_val) or (parent not in all_wbs_ids)

        # Build wbs_code for every node via parent chain traversal
        wbs_code_map: dict[str, str] = {}   # wbs_id → "1.2.3"
        child_counter: dict[str, int] = {}  # parent_wbs_id → next_child_index

        def _assign_code(wbs_id: str, parent_code: Optional[str]) -> None:
            if wbs_id in wbs_code_map:
                return
            counter_key = parent_code or "__root__"
            child_counter[counter_key] = child_counter.get(counter_key, 0) + 1
            idx = child_counter[counter_key]
            code = f"{parent_code}.{idx}" if parent_code else str(idx)
            wbs_code_map[wbs_id] = code

        # Assign codes: roots first (depth-first)
        def _dfs(wbs_id: str, parent_code: Optional[str]) -> None:
            _assign_code(wbs_id, parent_code)
            my_code = wbs_code_map[wbs_id]
            # Find children (rows whose parent_wbs_id == this wbs_id)
            for child_row in wbs_rows:
                if child_row.get("parent_wbs_id") == wbs_id and child_row.get("wbs_id") != wbs_id:
                    _dfs(child_row["wbs_id"], my_code)

        for row in wbs_rows:
            if _is_root(row) and row.get("wbs_id"):
                _dfs(row["wbs_id"], None)

        # Any still-unassigned nodes (disconnected)
        for row in wbs_rows:
            wid = row.get("wbs_id")
            if wid and wid not in wbs_code_map:
                _assign_code(wid, None)

        # ── Tasks ─────────────────────────────────────────────────────────────
        task_rows = tables.get("TASK", [])
        activities: list[dict] = []

        for seq_idx, task in enumerate(task_rows, start=1):
            t_start_str = task.get("target_start_date", "")
            t_end_str   = task.get("target_end_date", "")

            t_start = XERService._parse_xer_date(t_start_str)
            t_end   = XERService._parse_xer_date(t_end_str)

            if t_start is None or t_end is None:
                # Required dates missing — skip
                continue

            plan_start_col = XERService._date_to_col(t_start)
            plan_end_col   = XERService._date_to_col(t_end)

            a_start = XERService._parse_xer_date(task.get("act_start_date", ""))
            a_end   = XERService._parse_xer_date(task.get("act_end_date", ""))

            actual_start_col = XERService._date_to_col(a_start) if a_start else None
            actual_end_col   = XERService._date_to_col(a_end)   if a_end   else None

            task_type = task.get("task_type", "")
            is_wbs_summary = task_type in _WBS_SUMMARY_TYPES

            wbs_id = task.get("wbs_id", "")
            wbs_code = wbs_code_map.get(wbs_id, "")
            wbs_level = wbs_code.count(".") + 1 if wbs_code else 1

            activities.append({
                "sequence_no":      seq_idx,
                "name":             task.get("task_name", "").strip() or f"Task {seq_idx}",
                "plan_start_col":   plan_start_col,
                "plan_end_col":     plan_end_col,
                "actual_start_col": actual_start_col,
                "actual_end_col":   actual_end_col,
                "wbs_code":         wbs_code,
                "wbs_level":        wbs_level,
                "is_wbs_summary":   is_wbs_summary,
                "remarks":          task.get("task_code", "").strip() or None,
                "_task_id":         task.get("task_id", ""),
                "_wbs_id":          wbs_id,
            })

        # ── Derived counts ────────────────────────────────────────────────────
        max_wbs_level = max((a["wbs_level"] for a in activities), default=1)
        resource_count = len(tables.get("RSRC", []))

        # ── Audit ─────────────────────────────────────────────────────────────
        audit_issues, audit_counts = XERService.audit_tables(tables)

        return {
            "project_data":   {"name": project_name},
            "activities":     activities,
            "wbs_levels":     max_wbs_level,
            "resource_count": resource_count,
            "audit_issues":   audit_issues,
            "audit_counts":   audit_counts,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Audit
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def audit_tables(tables: dict) -> tuple[list[dict], dict]:
        """
        Run schedule quality checks on parsed XER tables.

        Checks (skipped for task_type in _SKIP_AUDIT_TYPES):
          a. Negative float  (HIGH)
          b. Date constraint (MEDIUM)
          c. Open Start      (LOW)
          d. Open Finish     (LOW)
          e. Late Start      (MEDIUM)

        Returns:
            (issues sorted HIGH→MEDIUM→LOW, counts_dict)
        """
        task_rows = tables.get("TASK", [])
        pred_rows = tables.get("TASKPRED", [])

        # Build sets for logic checks
        has_pred: set[str] = set()   # task_ids that have at least one predecessor
        has_succ: set[str] = set()   # task_ids that appear as a predecessor (have successor)
        for pred in pred_rows:
            if pred.get("task_id"):
                has_pred.add(pred["task_id"])
            if pred.get("pred_task_id"):
                has_succ.add(pred["pred_task_id"])

        issues: list[dict] = []
        total_tasks = len(task_rows)

        open_ends_count      = 0
        missing_logic_count  = 0
        negative_float_count = 0
        constraints_count    = 0
        out_of_seq_count     = 0

        for task in task_rows:
            task_type = task.get("task_type", "")
            if task_type in _SKIP_AUDIT_TYPES:
                continue

            task_id   = task.get("task_id", "")
            task_name = task.get("task_name", task_id)

            # ── a. Negative float ─────────────────────────────────────────
            float_str = task.get("total_float_hr_cnt", "")
            if float_str.strip():
                try:
                    float_val = float(float_str)
                    if float_val < 0:
                        float_days = round(float_val / 8.0, 1)
                        issues.append({
                            "severity": "HIGH",
                            "type":     "Negative Float",
                            "activity": task_name,
                            "detail":   f"Total float: {float_days} days",
                        })
                        negative_float_count += 1
                except ValueError:
                    pass

            # ── b. Date constraint ────────────────────────────────────────
            cstr_type = task.get("cstr_type", "").strip()
            if cstr_type and cstr_type != "CS_MANDFIN":
                issues.append({
                    "severity": "MEDIUM",
                    "type":     "Date Constraint",
                    "activity": task_name,
                    "detail":   f"Constraint type: {cstr_type}",
                })
                constraints_count += 1

            # ── c. Open Start (no predecessors) ───────────────────────────
            if total_tasks > 1 and task_id not in has_pred:
                issues.append({
                    "severity": "LOW",
                    "type":     "Open Start",
                    "activity": task_name,
                    "detail":   "No predecessor relationship found",
                })
                open_ends_count += 1
                missing_logic_count += 1

            # ── d. Open Finish (no successors) ────────────────────────────
            if task_id not in has_succ:
                issues.append({
                    "severity": "LOW",
                    "type":     "Open Finish",
                    "activity": task_name,
                    "detail":   "No successor relationship found",
                })
                open_ends_count += 1

            # ── e. Late Start (actual > plan by >2 days) ──────────────────
            act_start  = XERService._parse_xer_date(task.get("act_start_date", ""))
            plan_start = XERService._parse_xer_date(task.get("target_start_date", ""))
            if act_start and plan_start:
                delta_days = (act_start - plan_start).days
                if delta_days > 2:
                    issues.append({
                        "severity": "MEDIUM",
                        "type":     "Late Start",
                        "activity": task_name,
                        "detail":   f"Started {delta_days} days late",
                    })
                    out_of_seq_count += 1

        # Sort: HIGH first, then MEDIUM, then LOW
        issues.sort(key=lambda x: _SEV_ORDER.get(x["severity"], 99))

        counts = {
            "open_ends":        open_ends_count,
            "missing_logic":    missing_logic_count,
            "negative_float":   negative_float_count,
            "constraints":      constraints_count,
            "out_of_sequence":  out_of_seq_count,
        }
        return issues, counts

    @staticmethod
    def audit_xer(content: str) -> tuple[list[dict], dict, int]:
        """
        Parse XER then audit. Returns (issues, counts, total_task_count).
        """
        tables = XERService._parse_tables(content)
        issues, counts = XERService.audit_tables(tables)
        return issues, counts, len(tables.get("TASK", []))

    # ─────────────────────────────────────────────────────────────────────────
    # Export
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def export_xer(project, activities: list) -> str:
        """
        Generate a valid XER string from a Project ORM object and activity list.

        project:     SQLAlchemy Project instance (has .id UUID, .name str)
        activities:  list of SQLAlchemy Activity instances
        """
        now_str    = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        proj_id    = "P" + str(project.id).replace("-", "").upper()[:8]
        lines: list[str] = []

        # ── File header ───────────────────────────────────────────────────────
        lines.append(
            f"ERMHDR\t15.2\t{now_str}\t{project.name}\t"
            f"user@example.com\tAdmin\tProject Manager\t0\tAsia/Kolkata"
        )

        # ── CURRTYPE ──────────────────────────────────────────────────────────
        lines.append("%T CURRTYPE")
        lines.append("%F\tcurr_id\tcurr_short_name\tcurr_name\tcurr_type\tdecimal_digit_cnt\tsym_before_value")
        lines.append("%R\tCR1\tINR\tIndian Rupee\tlocal\t2\t₹")

        # ── PROJECT ───────────────────────────────────────────────────────────
        lines.append("%T PROJECT")
        lines.append(
            "%F\tproj_id\tfy_start_month_num\tlast_recalc_date\tlast_scheduled_date"
            "\tproj_short_name\tproj_name\texport_flag\tcreate_date\tdef_complete_pct_type\tcurr_id"
        )
        lines.append(
            f"%R\t{proj_id}\t4\t{now_str}\t{now_str}"
            f"\t{project.name[:20]}\t{project.name}\tY\t{now_str}\tCP_Drtn\tCR1"
        )

        # ── WBS ───────────────────────────────────────────────────────────────
        lines.append("%T WBS")
        lines.append(
            "%F\twbs_id\tproj_id\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id"
        )

        # Root WBS node for the project
        root_wbs_id = f"WB{proj_id}"
        lines.append(
            f"%R\t{root_wbs_id}\t{proj_id}\t10\t{project.name[:20]}\t{project.name}\t{proj_id}"
        )

        # Collect all unique wbs_codes from activities
        wbs_codes: list[str] = []
        seen_codes: set[str] = set()
        for act in activities:
            code = getattr(act, "wbs_code", None)
            if code and code not in seen_codes:
                seen_codes.add(code)
                wbs_codes.append(code)

        # Sort so parents appear before children
        wbs_codes_sorted = sorted(wbs_codes, key=lambda c: (c.count("."), c))

        # Build a map: wbs_code → wbs_id string
        wbs_id_map: dict[str, str] = {}
        for idx, code in enumerate(wbs_codes_sorted, start=1):
            safe = code.replace(".", "_")
            wbs_id_map[code] = f"WBS{proj_id[:6]}{safe}"[:30]

        for seq_num, code in enumerate(wbs_codes_sorted, start=20):
            wbs_node_id = wbs_id_map[code]
            parts = code.split(".")
            short_name = parts[-1] if parts else code
            # Parent: if code has a dot, parent is the code without last segment
            if "." in code:
                parent_code = code.rsplit(".", 1)[0]
                parent_wbs_id = wbs_id_map.get(parent_code, root_wbs_id)
            else:
                parent_wbs_id = root_wbs_id

            # Find activity name for this WBS code (prefer summary)
            wbs_display_name = code
            for act in activities:
                if getattr(act, "wbs_code", None) == code and getattr(act, "is_wbs_summary", False):
                    wbs_display_name = act.name
                    break

            lines.append(
                f"%R\t{wbs_node_id}\t{proj_id}\t{seq_num * 10}"
                f"\t{short_name}\t{wbs_display_name}\t{parent_wbs_id}"
            )

        # ── TASK ──────────────────────────────────────────────────────────────
        lines.append("%T TASK")
        lines.append(
            "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name"
            "\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date"
            "\ttask_type\tduration_type\tstatus_code\ttotal_float_hr_cnt"
        )

        for act in activities:
            seq  = act.sequence_no
            tid  = f"TA{seq:04d}"
            code = f"A{seq * 10:04d}"

            act_wbs_code = getattr(act, "wbs_code", None)
            if act_wbs_code and act_wbs_code in wbs_id_map:
                act_wbs_id = wbs_id_map[act_wbs_code]
            else:
                act_wbs_id = root_wbs_id

            task_type = "TT_WBS" if getattr(act, "is_wbs_summary", False) else "TT_Task"

            # Status
            has_actual_start = act.actual_start_col is not None
            has_actual_end   = act.actual_end_col   is not None
            if has_actual_start and has_actual_end:
                status_code = "TK_Complete"
            elif has_actual_start:
                status_code = "TK_Active"
            else:
                status_code = "TK_NotStart"

            t_start = XERService._fmt_xer_date(act.plan_start_col)
            t_end   = XERService._fmt_xer_date(act.plan_end_col)
            a_start = XERService._fmt_xer_date(act.actual_start_col) if has_actual_start else ""
            a_end   = XERService._fmt_xer_date(act.actual_end_col)   if has_actual_end   else ""

            lines.append(
                f"%R\t{tid}\t{proj_id}\t{act_wbs_id}\t{code}\t{act.name}"
                f"\t{t_start}\t{t_end}\t{a_start}\t{a_end}"
                f"\t{task_type}\tDT_FixedDrtn\t{status_code}\t0"
            )

        # ── End of file ───────────────────────────────────────────────────────
        lines.append("%E")

        return "\n".join(lines) + "\n"

    # ─────────────────────────────────────────────────────────────────────────
    # Audit report XLSX
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def audit_report_xlsx(
        project_name: str,
        total_tasks: int,
        issues: list[dict],
        counts: dict,
    ) -> bytes:
        """
        Generate an openpyxl workbook with a colour-coded schedule audit report.
        Returns raw bytes suitable for a StreamingResponse.
        """
        wb = Workbook()
        ws = wb.active
        ws.title = "Schedule Audit"

        # ── Colour constants ──────────────────────────────────────────────────
        DARK_NAVY  = "1A3A5C"
        LIGHT_BLUE = "EBF3FB"
        DARK_BLUE  = "2B4F7A"
        RED_BG     = "FFCCCC"
        AMBER_BG   = "FFF0CC"
        GREY_BG    = "F2F2F2"

        def _fill(hex_color: str) -> PatternFill:
            return PatternFill("solid", fgColor=hex_color)

        def _font(bold: bool = False, color: str = "000000", size: int = 11) -> Font:
            return Font(bold=bold, color=color, size=size)

        center = Alignment(horizontal="center", vertical="center", wrap_text=True)
        left   = Alignment(horizontal="left",   vertical="center", wrap_text=True)

        # ── Row 1: Title ──────────────────────────────────────────────────────
        ws.merge_cells("A1:D1")
        title_cell = ws["A1"]
        title_cell.value     = f"Schedule Audit Report — {project_name}"
        title_cell.fill      = _fill(DARK_NAVY)
        title_cell.font      = _font(bold=True, color="FFFFFF", size=14)
        title_cell.alignment = center
        ws.row_dimensions[1].height = 28

        # ── Row 2: Summary ────────────────────────────────────────────────────
        ws.merge_cells("A2:D2")
        summary_cell = ws["A2"]
        summary_cell.value = (
            f"Total tasks: {total_tasks} | "
            f"Open Ends: {counts.get('open_ends', 0)} | "
            f"Negative Float: {counts.get('negative_float', 0)} | "
            f"Constraints: {counts.get('constraints', 0)} | "
            f"Late Starts: {counts.get('out_of_sequence', 0)}"
        )
        summary_cell.fill      = _fill(LIGHT_BLUE)
        summary_cell.font      = _font(bold=False, color="1A3A5C", size=10)
        summary_cell.alignment = center
        ws.row_dimensions[2].height = 20

        # ── Row 3: Column headers ─────────────────────────────────────────────
        headers = ["Severity", "Type", "Activity", "Detail"]
        for col_idx, header in enumerate(headers, start=1):
            cell = ws.cell(row=3, column=col_idx, value=header)
            cell.fill      = _fill(DARK_BLUE)
            cell.font      = _font(bold=True, color="FFFFFF", size=10)
            cell.alignment = center
        ws.row_dimensions[3].height = 18

        # ── Rows 4+: Issue data ───────────────────────────────────────────────
        sev_style: dict[str, tuple[str, bool]] = {
            "HIGH":   (RED_BG,   True),
            "MEDIUM": (AMBER_BG, True),
            "LOW":    (GREY_BG,  False),
        }

        for row_idx, issue in enumerate(issues, start=4):
            sev      = issue.get("severity", "LOW")
            bg_hex, bold_text = sev_style.get(sev, (GREY_BG, False))

            row_data = [
                issue.get("severity", ""),
                issue.get("type",     ""),
                issue.get("activity", ""),
                issue.get("detail",   ""),
            ]
            for col_idx, value in enumerate(row_data, start=1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.fill      = _fill(bg_hex)
                cell.font      = _font(bold=bold_text, size=9)
                cell.alignment = left
            ws.row_dimensions[row_idx].height = 16

        # ── Column widths ─────────────────────────────────────────────────────
        col_widths = {"A": 12, "B": 18, "C": 40, "D": 50}
        for col_letter, width in col_widths.items():
            ws.column_dimensions[col_letter].width = width

        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()
