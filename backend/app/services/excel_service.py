from io import BytesIO
from datetime import date, timedelta, datetime
from typing import Optional
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, GradientFill
from openpyxl.utils import get_column_letter

from app.models.project import Project
from app.models.activity import Activity
from app.services.status_service import StatusService

# ── Date constants (must match frontend: 1 day per column) ────────────────
EPOCH        = date(2026, 3, 25)
DAYS_PER_COL = 1

# ── Fixed left-column indices (1-indexed Excel) ───────────────────────────
COL_SN     = 1
COL_NAME   = 2
COL_GROUP  = 3
COL_PA     = 4   # "P" or "A" — kept for import round-trip
COL_PLAN_S = 5
COL_PLAN_E = 6
COL_ACT_S  = 7
COL_ACT_E  = 8
COL_STATUS = 9
COL_REMARKS = 10
GANTT_START = 11   # Column K onward

# ── Colour palette — exactly matching the frontend ────────────────────────
STATUS_HEX = {
    "DONE":     "22C55E",
    "ON_TRACK": "3B82F6",
    "SLOW":     "F59E0B",
    "DELAYED":  "EF4444",
    "PENDING":  "94A3B8",
}

_HEADER_BG   = "1A3A5C"
_INFO_BG     = "D6E4F0"
_PLAN_BAR    = "B2EBC7"   # light green — plan bar (matches screen ~35 % opacity green)
_TODAY_BG    = "FFDDDD"
_TODAY_FG    = "CC0000"
_DATE_HDR_BG = "EBF3FB"

_THIN = Side(style="thin", color="CCCCCC")
THIN_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)

HEADER_FILL   = PatternFill("solid", fgColor=_HEADER_BG)
INFO_FILL     = PatternFill("solid", fgColor=_INFO_BG)
PLAN_BAR_FILL = PatternFill("solid", fgColor=_PLAN_BAR)


def _col_to_date(col: int) -> date:
    return EPOCH + timedelta(days=col)


def _cell_to_col(val) -> Optional[int]:
    """Convert a cell value (Python date, datetime, string date, or legacy int) → column number."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return max(0, (val.date() - EPOCH).days)
    if isinstance(val, date):
        return max(0, (val - EPOCH).days)
    try:
        n = int(val)
        if n < 1000:          # legacy format stored raw column numbers
            return n
    except (ValueError, TypeError):
        pass
    if isinstance(val, str):
        for fmt in ("%d-%b-%Y", "%d-%b-%y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                return max(0, (datetime.strptime(val.strip(), fmt).date() - EPOCH).days)
            except ValueError:
                continue
    return None


def _is_filled(cell) -> bool:
    if not cell.fill or cell.fill.fill_type != "solid":
        return False
    fg = cell.fill.fgColor
    if not fg or fg.type != "rgb":
        return False
    return fg.rgb.upper() not in ("00000000", "FFFFFFFF", "FF000000")


def _status_fill(status: str) -> PatternFill:
    return PatternFill("solid", fgColor=STATUS_HEX.get(status, "94A3B8"))


class ExcelService:

    @staticmethod
    def generate_excel(
        project: Project,
        activities: list[Activity],
        persons_map: dict | None = None,
    ) -> bytes:
        wb = Workbook()
        ws = wb.active
        ws.title = "Project Plan"

        today_col = StatusService.TODAY_COL

        # ── Compute gantt column range from activities ─────────────────────
        if activities:
            min_col = max(0, min(a.plan_start_col for a in activities) - 2)
            max_col = max(
                max(a.plan_end_col for a in activities),
                max((a.actual_end_col or 0) for a in activities),
                today_col,
            ) + 5
        else:
            min_col = max(0, today_col - 10)
            max_col = today_col + 30

        gantt_cols  = max_col - min_col + 1
        last_xcol   = GANTT_START + gantt_cols - 1
        white_bold9 = Font(color="FFFFFF", bold=True, size=9)
        white_bold8 = Font(color="FFFFFF", bold=True, size=8)

        # ── Row 1: company header ──────────────────────────────────────────
        ws.row_dimensions[1].height = 22
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_xcol)
        c = ws.cell(1, 1, "INGENIOUS ENGINEERING PVT. LTD.")
        c.font  = Font(bold=True, size=13, color="FFFFFF")
        c.fill  = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")

        # ── Row 2: project details ─────────────────────────────────────────
        ws.row_dimensions[2].height = 16
        parts = [project.name]
        if project.po_number:     parts.append(f"PO: {project.po_number}")
        if project.part_number:   parts.append(f"Part: {project.part_number}")
        if project.customer_name: parts.append(f"Customer: {project.customer_name}")
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_xcol)
        c = ws.cell(2, 1, "  |  ".join(parts))
        c.font      = Font(bold=True, size=10, color=_HEADER_BG)
        c.fill      = INFO_FILL
        c.alignment = Alignment(horizontal="left", vertical="center", indent=1)

        # ── Row 3: fixed-column labels + month group headers ──────────────
        ws.row_dimensions[3].height = 15
        for xcol, label in [
            (COL_SN,     "SN"),
            (COL_NAME,   "Activity"),
            (COL_GROUP,  "Group"),
            (COL_PA,     "P/A"),
            (COL_PLAN_S, "Plan\nStart"),
            (COL_PLAN_E, "Plan\nEnd"),
            (COL_ACT_S,  "Act\nStart"),
            (COL_ACT_E,  "Act\nEnd"),
            (COL_STATUS, "Status"),
            (COL_REMARKS,"Remarks"),
        ]:
            c = ws.cell(3, xcol, label)
            c.font      = white_bold9
            c.fill      = HEADER_FILL
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border    = THIN_BORDER

        # Month groups across Gantt columns
        cur_month: Optional[int] = None
        month_xcol_start: Optional[int] = None
        for g in range(gantt_cols):
            xcol = GANTT_START + g
            d    = _col_to_date(min_col + g)
            if d.month != cur_month:
                if cur_month is not None and month_xcol_start is not None:
                    end = xcol - 1
                    if month_xcol_start < end:
                        ws.merge_cells(start_row=3, start_column=month_xcol_start,
                                       end_row=3, end_column=end)
                    c = ws.cell(3, month_xcol_start)
                    c.value     = _col_to_date(min_col + g - 1).strftime("%b %Y")
                    c.font      = white_bold9
                    c.fill      = HEADER_FILL
                    c.alignment = Alignment(horizontal="center", vertical="center")
                cur_month       = d.month
                month_xcol_start = xcol
        # Close last month span
        if month_xcol_start is not None:
            if month_xcol_start < last_xcol:
                ws.merge_cells(start_row=3, start_column=month_xcol_start,
                               end_row=3, end_column=last_xcol)
            c           = ws.cell(3, month_xcol_start)
            c.value     = _col_to_date(max_col).strftime("%b %Y")
            c.font      = white_bold9
            c.fill      = HEADER_FILL
            c.alignment = Alignment(horizontal="center", vertical="center")

        # ── Row 4: day-of-month labels (dd MMM, rotated) ──────────────────
        ws.row_dimensions[4].height = 48
        for g in range(gantt_cols):
            xcol     = GANTT_START + g
            col_abs  = min_col + g
            d        = _col_to_date(col_abs)
            is_today = (col_abs == today_col)
            c        = ws.cell(4, xcol, d.strftime("%d %b"))
            c.font      = Font(size=7, bold=is_today, color=_TODAY_FG if is_today else "444444")
            c.fill      = PatternFill("solid", fgColor=_TODAY_BG if is_today else _DATE_HDR_BG)
            c.alignment = Alignment(horizontal="center", vertical="bottom",
                                    text_rotation=90, wrap_text=False)
            c.border    = THIN_BORDER
            ws.column_dimensions[get_column_letter(xcol)].width = 2.2

        # ── Fixed column widths ────────────────────────────────────────────
        for letter, width in [
            ("A", 4), ("B", 30), ("C", 12), ("D", 3),
            ("E", 11), ("F", 11), ("G", 11), ("H", 11),
            ("I", 14), ("J", 24),
        ]:
            ws.column_dimensions[letter].width = width

        ws.freeze_panes = "K5"

        # ── Activity rows ──────────────────────────────────────────────────
        data_row = 5
        date_fmt = "DD-MMM-YY"

        for act in activities:
            computed  = StatusService.compute_status(act)
            sfill     = _status_fill(computed)

            # ── Plan row ──────────────────────────────────────────────────
            ws.row_dimensions[data_row].height = 14

            ws.cell(data_row, COL_SN, act.sequence_no).alignment = Alignment(horizontal="center")

            c = ws.cell(data_row, COL_NAME, act.name)
            c.alignment = Alignment(horizontal="left", indent=1)
            c.font      = Font(size=9, bold=True)

            ws.cell(data_row, COL_GROUP, act.group_type or "").alignment = Alignment(horizontal="center")

            c = ws.cell(data_row, COL_PA, "P")
            c.alignment = Alignment(horizontal="center")
            c.font      = Font(size=8, bold=True, color="555555")

            # Plan dates
            c = ws.cell(data_row, COL_PLAN_S, _col_to_date(act.plan_start_col))
            c.number_format = date_fmt
            c.alignment     = Alignment(horizontal="center")

            c = ws.cell(data_row, COL_PLAN_E, _col_to_date(act.plan_end_col))
            c.number_format = date_fmt
            c.alignment     = Alignment(horizontal="center")

            # Status (computed, coloured cell)
            c = ws.cell(data_row, COL_STATUS, computed.replace("_", " "))
            c.fill      = sfill
            c.font      = Font(bold=True, size=8, color="FFFFFF" if computed != "PENDING" else "374151")
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border    = THIN_BORDER

            ws.cell(data_row, COL_REMARKS, act.remarks or "").alignment = Alignment(
                wrap_text=True, vertical="top"
            )

            # Apply thin border to frozen columns
            for xcol in range(COL_SN, GANTT_START):
                ws.cell(data_row, xcol).border = THIN_BORDER

            # Plan Gantt bar (light green)
            for g in range(
                max(min_col, act.plan_start_col),
                min(max_col + 1, act.plan_end_col + 1),
            ):
                xcol = GANTT_START + (g - min_col)
                ws.cell(data_row, xcol).fill   = PLAN_BAR_FILL
                ws.cell(data_row, xcol).border = THIN_BORDER

            # ── Actual row ────────────────────────────────────────────────
            data_row += 1
            ws.row_dimensions[data_row].height = 9

            c = ws.cell(data_row, COL_PA, "A")
            c.alignment = Alignment(horizontal="center")
            c.font      = Font(size=7, color="888888")

            # Actual dates (only if set)
            if act.actual_start_col is not None:
                c = ws.cell(data_row, COL_ACT_S, _col_to_date(act.actual_start_col))
                c.number_format = date_fmt
                c.alignment     = Alignment(horizontal="center")
                c.font          = Font(size=8)

            if act.actual_end_col is not None:
                c = ws.cell(data_row, COL_ACT_E, _col_to_date(act.actual_end_col))
                c.number_format = date_fmt
                c.alignment     = Alignment(horizontal="center")
                c.font          = Font(size=8)

            # Actual Gantt bar — split colours matching the screen
            if act.actual_start_col is not None:
                act_end  = act.actual_end_col if act.actual_end_col is not None else today_col
                midpoint = (act.plan_start_col + act.plan_end_col) / 2

                if computed == "DONE":
                    done_fill = _status_fill("DONE")
                    for g in range(
                        max(min_col, act.actual_start_col),
                        min(max_col + 1, act_end + 1),
                    ):
                        xcol = GANTT_START + (g - min_col)
                        ws.cell(data_row, xcol).fill   = done_fill
                        ws.cell(data_row, xcol).border = THIN_BORDER
                else:
                    # Within-plan colour: blue (on time) or amber (late start)
                    late_start   = act.actual_start_col > midpoint
                    within_fill  = _status_fill("SLOW" if late_start else "ON_TRACK")
                    delayed_fill = _status_fill("DELAYED")

                    for g in range(
                        max(min_col, act.actual_start_col),
                        min(max_col + 1, act_end + 1),
                    ):
                        xcol = GANTT_START + (g - min_col)
                        fill = within_fill if g <= act.plan_end_col else delayed_fill
                        ws.cell(data_row, xcol).fill   = fill
                        ws.cell(data_row, xcol).border = THIN_BORDER

            data_row += 1

        # ── Legend row ────────────────────────────────────────────────────
        legend_row = data_row + 1
        ws.row_dimensions[legend_row].height = 13
        ws.merge_cells(start_row=legend_row, start_column=1, end_row=legend_row, end_column=2)
        ws.cell(legend_row, 1, "Legend:").font = Font(bold=True, size=8)

        for i, (label, hex_color) in enumerate([
            ("Done",     "22C55E"),
            ("On Track", "3B82F6"),
            ("Slow",     "F59E0B"),
            ("Delayed",  "EF4444"),
            ("Pending",  "94A3B8"),
            ("Planned",  _PLAN_BAR),
        ]):
            xcol = COL_GROUP + i
            c = ws.cell(legend_row, xcol, label)
            c.fill      = PatternFill("solid", fgColor=hex_color)
            c.font      = Font(bold=True, size=8,
                               color="FFFFFF" if label != "Pending" and label != "Planned" else "374151")
            c.alignment = Alignment(horizontal="center")
            c.border    = THIN_BORDER

        buf = BytesIO()
        wb.save(buf)
        return buf.getvalue()

    # ─────────────────────────────────────────────────────────────────────────
    # Import (parse) — handles both new date format and legacy column-number format
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def parse_excel(file_bytes: bytes) -> dict:
        wb = load_workbook(BytesIO(file_bytes), data_only=True)
        ws = wb.active

        project_info: dict = {
            "name": "",
            "po_number": None,
            "part_number": None,
            "customer_name": None,
        }

        # ── Extract project info from first 5 rows ─────────────────────────
        for row_idx in range(1, 6):
            for cell in ws[row_idx]:
                v = cell.value
                if not isinstance(v, str) or not v.strip():
                    continue
                v = v.strip()
                if "INGENIOUS" in v.upper():
                    continue
                if "|" in v:
                    for part in [p.strip() for p in v.split("|")]:
                        pu = part.upper()
                        if pu.startswith("PO:"):
                            project_info["po_number"] = part[3:].strip() or None
                        elif pu.startswith("PART:"):
                            project_info["part_number"] = part[5:].strip() or None
                        elif pu.startswith("CUSTOMER:"):
                            project_info["customer_name"] = part[9:].strip() or None
                        elif not project_info["name"]:
                            project_info["name"] = part
                    break

        if not project_info["name"]:
            project_info["name"] = "Imported Project"

        # ── Locate first data row (first row where COL_PA == "P") ─────────
        data_start: Optional[int] = None
        for row_idx in range(1, ws.max_row + 1):
            if ws.cell(row_idx, COL_PA).value == "P":
                data_start = row_idx
                break

        if data_start is None:
            return {"project": project_info, "activities": []}

        # ── Determine Gantt start column from header colour detection ──────
        # Try to auto-detect GANTT_START by finding the first date-header column
        gantt_start = GANTT_START  # default

        # ── Read activities ───────────────────────────────────────────────
        # Need to infer min_col offset: find actual gantt start from file
        # We detect by looking at filled cells in a plan row
        def _detect_gantt_range(plan_row: int):
            for col in range(1, ws.max_column + 1):
                if _is_filled(ws.cell(plan_row, col)):
                    return col  # first filled Gantt column (absolute Excel column)
            return gantt_start

        activities = []
        row_idx    = data_start

        while row_idx <= ws.max_row:
            if ws.cell(row_idx, COL_PA).value != "P":
                row_idx += 1
                continue

            name_val = ws.cell(row_idx, COL_NAME).value
            if not name_val:
                row_idx += 1
                continue

            sn_raw      = ws.cell(row_idx, COL_SN).value
            group_raw   = ws.cell(row_idx, COL_GROUP).value
            plan_s_raw  = ws.cell(row_idx, COL_PLAN_S).value
            plan_e_raw  = ws.cell(row_idx, COL_PLAN_E).value
            status_raw  = ws.cell(row_idx, COL_STATUS).value
            remarks_raw = ws.cell(row_idx, COL_REMARKS).value

            # Parse plan cols — new format (dates) or legacy (ints)
            plan_s = _cell_to_col(plan_s_raw)
            plan_e = _cell_to_col(plan_e_raw)

            # Fallback: detect from Gantt bar colours
            if plan_s is None:
                for g in range(ws.max_column - gantt_start + 1):
                    if _is_filled(ws.cell(row_idx, gantt_start + g)):
                        if plan_s is None:
                            plan_s = g
                        plan_e = g

            if plan_s is None:
                row_idx += 1
                continue
            if plan_e is None:
                plan_e = plan_s

            # Check for matching actual row
            has_actual = (
                row_idx + 1 <= ws.max_row
                and ws.cell(row_idx + 1, COL_PA).value == "A"
            )
            act_s: Optional[int] = None
            act_e: Optional[int] = None

            if has_actual:
                act_s = _cell_to_col(ws.cell(row_idx + 1, COL_ACT_S).value)
                act_e = _cell_to_col(ws.cell(row_idx + 1, COL_ACT_E).value)

                # Fallback: detect from Gantt bar colours
                if act_s is None:
                    for g in range(ws.max_column - gantt_start + 1):
                        if _is_filled(ws.cell(row_idx + 1, gantt_start + g)):
                            if act_s is None:
                                act_s = g
                            act_e = g

            status_str: Optional[str] = None
            raw = str(status_raw).strip().upper().replace(" ", "_") if status_raw else ""
            if raw in {"ON_TRACK", "SLOW", "DELAYED", "DONE", "PENDING"}:
                status_str = raw

            activities.append({
                "sequence_no":     int(sn_raw) if sn_raw is not None else len(activities) + 1,
                "name":            str(name_val).strip(),
                "group_type":      str(group_raw).strip() if group_raw else None,
                "plan_start_col":  plan_s,
                "plan_end_col":    plan_e,
                "actual_start_col": act_s,
                "actual_end_col":   act_e,
                "status_override":  status_str,
                "remarks":          str(remarks_raw).strip() if remarks_raw else None,
            })

            row_idx += 2 if has_actual else 1

        return {"project": project_info, "activities": activities}
