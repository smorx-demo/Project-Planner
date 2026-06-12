import datetime as _dt
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.activity import Activity
from app.models.evm_snapshot import EVMSnapshot
from app.services.status_service import _EPOCH

EPOCH = _EPOCH  # date(2026, 3, 25)


def _today_col() -> int:
    return (date.today() - EPOCH).days


def _r(v):
    """Round float to 2 dp or return None."""
    return round(v, 2) if v is not None else None


class EVMService:

    @staticmethod
    def _pv_pct_at_col(activity: Activity, col: int) -> float:
        """Linear interpolation of planned % at a given column."""
        ps, pe = activity.plan_start_col, activity.plan_end_col
        if pe <= ps:
            return 100.0 if col >= pe else 0.0
        if col <= ps:
            return 0.0
        if col >= pe:
            return 100.0
        return (col - ps) / (pe - ps) * 100.0

    @staticmethod
    def _ev_pct_at_col(activity: Activity, col: int) -> float:
        """Spread actual_pct linearly from actual_start_col to actual_end_col (or today)."""
        if activity.actual_pct is None or activity.actual_start_col is None:
            return 0.0
        start = activity.actual_start_col
        end = activity.actual_end_col if activity.actual_end_col is not None else _today_col()
        if col < start:
            return 0.0
        if end <= start or col >= end:
            return float(activity.actual_pct)
        return activity.actual_pct * (col - start) / (end - start)

    @staticmethod
    def compute_activity_evm(activity: Activity) -> dict:
        today = _today_col()
        bac = activity.bac

        # PV
        if activity.planned_pct is not None:
            pv_pct = float(activity.planned_pct)
        else:
            pv_pct = EVMService._pv_pct_at_col(activity, today)
        pv = _r(pv_pct / 100 * bac) if bac is not None else None

        # EV
        ap = activity.actual_pct
        ev = _r(ap / 100 * bac) if (bac is not None and ap is not None) else None
        ev_pct = float(ap) if ap is not None else None

        # AC
        ac = _r(activity.actual_cost) if activity.actual_cost is not None else None

        # Derived
        spi = _r(ev / pv)   if (ev is not None and pv and pv > 0) else None
        cpi = _r(ev / ac)   if (ev is not None and ac and ac > 0) else None
        sv  = _r(ev - pv)   if (ev is not None and pv is not None) else None
        cv  = _r(ev - ac)   if (ev is not None and ac is not None) else None
        eac = _r(bac / cpi) if (bac is not None and cpi and cpi > 0) else None
        vac = _r(bac - eac) if (bac is not None and eac is not None) else None

        return {
            "activity_id": str(activity.id),
            "name":        activity.name,
            "bac":         bac,
            "bac_unit":    activity.bac_unit,
            "pv_pct":      _r(pv_pct),
            "ev_pct":      ev_pct,
            "pv":          pv,
            "ev":          ev,
            "ac":          ac,
            "spi":         spi,
            "cpi":         cpi,
            "sv":          sv,
            "cv":          cv,
            "eac":         eac,
            "vac":         vac,
        }

    @staticmethod
    def compute_project_evm(activities: list) -> dict:
        """Roll-up EVM + S-Curve across all activities."""
        # Only activities with a BAC contribute to financials
        bac_acts = [a for a in activities if a.bac is not None and a.bac > 0]

        total_bac = round(sum(a.bac for a in bac_acts), 2) if bac_acts else 0.0
        total_pv  = 0.0
        total_ev  = 0.0
        total_ac  = 0.0

        activity_evm = []
        for a in activities:
            ev_data = EVMService.compute_activity_evm(a)
            activity_evm.append(ev_data)
            if a.bac:
                total_pv += (ev_data["pv"] or 0)
                total_ev += (ev_data["ev"] or 0)
                total_ac += (ev_data["ac"] or 0)

        total_pv = round(total_pv, 2)
        total_ev = round(total_ev, 2)
        total_ac = round(total_ac, 2)

        spi = _r(total_ev / total_pv) if total_pv > 0 else None
        cpi = _r(total_ev / total_ac) if total_ac > 0 else None
        sv  = _r(total_ev - total_pv)
        cv  = _r(total_ev - total_ac)
        eac = _r(total_bac / cpi)     if (cpi and cpi > 0) else None
        vac = _r(total_bac - eac)     if eac is not None else None
        pct_complete = _r(total_ev / total_bac * 100) if total_bac > 0 else 0.0

        # S-Curve: determine column range
        if bac_acts:
            min_col = min(a.plan_start_col for a in bac_acts)
            max_col = max(a.plan_end_col   for a in bac_acts)
        else:
            min_col = 0
            max_col = 63

        labels             = []
        planned_cumulative = []
        actual_cumulative  = []

        for c in range(min_col, max_col + 1):
            col_date = EPOCH + _dt.timedelta(days=c)
            labels.append(col_date.strftime("%d %b"))

            period_pv = sum(
                (EVMService._pv_pct_at_col(a, c) / 100) * a.bac
                for a in bac_acts
            )
            cum_ev_abs = sum(
                (EVMService._ev_pct_at_col(a, c) / 100) * a.bac
                for a in bac_acts
            )
            planned_cumulative.append(round(period_pv, 2))
            actual_cumulative.append(round(cum_ev_abs, 2))

        # Transform activity list to match frontend ActivityEVM interface
        activities_out = []
        for ev_data, a in zip(activity_evm, activities):
            activities_out.append({
                "activity_id":   ev_data["activity_id"],
                "activity_name": ev_data["name"],
                "bac":           ev_data["bac"],
                "bac_unit":      ev_data["bac_unit"] or "",
                "planned_pct":   _r(ev_data["pv_pct"] / 100) if ev_data["pv_pct"] is not None else None,
                "actual_pct":    ev_data["ev_pct"],
                "actual_cost":   ev_data["ac"],
                "pv":            ev_data["pv"],
                "ev":            ev_data["ev"],
                "ac":            ev_data["ac"],
                "spi":           ev_data["spi"],
                "cpi":           ev_data["cpi"],
                "sv":            ev_data["sv"],
                "cv":            ev_data["cv"],
                "eac":           ev_data["eac"],
                "vac":           ev_data["vac"],
            })

        # Transform s_curve to array of SCurvePoint objects expected by frontend
        s_curve_out = [
            {
                "col":                min_col + i,
                "label":              label,
                "planned_cumulative": planned_cumulative[i],
                "actual_cumulative":  actual_cumulative[i],
            }
            for i, label in enumerate(labels)
        ]

        return {
            "total_bac":    total_bac,
            "total_pv":     total_pv,
            "total_ev":     total_ev,
            "total_ac":     total_ac,
            "spi":          spi,
            "cpi":          cpi,
            "sv":           sv,
            "cv":           cv,
            "eac":          eac,
            "vac":          vac,
            "pct_complete": pct_complete,
            "activities":   activities_out,
            "s_curve":      s_curve_out,
        }

    @staticmethod
    async def snapshot_project_evm(project_id, db: AsyncSession):
        """Store today's project-level EVM snapshot. Called daily by scheduler."""
        today = date.today()

        result = await db.execute(
            select(Activity).where(Activity.project_id == project_id)
        )
        activities = result.scalars().all()
        if not activities:
            return

        evm = EVMService.compute_project_evm(activities)

        snap = EVMSnapshot(
            project_id    = project_id,
            activity_id   = None,
            snapshot_date = today,
            pv  = evm["total_pv"],
            ev  = evm["total_ev"],
            ac  = evm["total_ac"],
            spi = evm["spi"],
            cpi = evm["cpi"],
            sv  = evm["sv"],
            cv  = evm["cv"],
        )
        db.add(snap)
        await db.flush()
