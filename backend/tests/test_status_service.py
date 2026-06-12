"""Tests for StatusService.compute_status and compute_project_summary."""
import pytest
from unittest.mock import MagicMock

from app.services.status_service import StatusService
from app.models.activity import Activity, ActivityStatusOverride

TODAY_COL = StatusService.TODAY_COL  # 38


def make_activity(
    plan_start_col: int = 10,
    plan_end_col: int = 20,
    actual_start_col: int | None = None,
    actual_end_col: int | None = None,
    status_override: ActivityStatusOverride | None = None,
) -> Activity:
    a = MagicMock(spec=Activity)
    a.plan_start_col = plan_start_col
    a.plan_end_col = plan_end_col
    a.actual_start_col = actual_start_col
    a.actual_end_col = actual_end_col
    a.status_override = status_override
    return a


# ── compute_status ────────────────────────────────────────────────────────────

class TestComputeStatus:
    def test_override_wins(self):
        a = make_activity(status_override=ActivityStatusOverride.DONE)
        assert StatusService.compute_status(a) == "DONE"

    def test_override_delayed(self):
        a = make_activity(status_override=ActivityStatusOverride.DELAYED)
        assert StatusService.compute_status(a) == "DELAYED"

    def test_not_started_is_pending(self):
        a = make_activity(actual_start_col=None)
        assert StatusService.compute_status(a) == "PENDING"

    def test_completed_on_time(self):
        a = make_activity(plan_end_col=20, actual_start_col=10, actual_end_col=20)
        assert StatusService.compute_status(a) == "ON_TRACK"

    def test_completed_early(self):
        a = make_activity(plan_end_col=20, actual_start_col=10, actual_end_col=18)
        assert StatusService.compute_status(a) == "ON_TRACK"

    def test_completed_slow(self):
        a = make_activity(plan_end_col=20, actual_start_col=10, actual_end_col=22)
        assert StatusService.compute_status(a) == "SLOW"

    def test_completed_delayed(self):
        a = make_activity(plan_end_col=20, actual_start_col=10, actual_end_col=25)
        assert StatusService.compute_status(a) == "DELAYED"

    def test_in_progress_on_track(self):
        # plan_end_col=TODAY_COL means today is the deadline — not yet late
        a = make_activity(plan_end_col=TODAY_COL, actual_start_col=10, actual_end_col=None)
        assert StatusService.compute_status(a) == "ON_TRACK"

    def test_in_progress_slow(self):
        # plan_end_col 2 cols ago = 2-day delay → SLOW (≤ 3)
        a = make_activity(plan_end_col=TODAY_COL - 2, actual_start_col=10, actual_end_col=None)
        assert StatusService.compute_status(a) == "SLOW"

    def test_in_progress_delayed(self):
        # plan_end_col 5 cols ago = 5-day delay → DELAYED
        a = make_activity(plan_end_col=TODAY_COL - 5, actual_start_col=10, actual_end_col=None)
        assert StatusService.compute_status(a) == "DELAYED"


# ── compute_project_summary ───────────────────────────────────────────────────

class TestComputeProjectSummary:
    def test_empty_project(self):
        result = StatusService.compute_project_summary([])
        assert result["total"] == 0
        assert result["pct_complete"] == 0.0
        assert result["overall_status"] == "PENDING"

    def test_all_done(self):
        activities = [
            make_activity(status_override=ActivityStatusOverride.DONE) for _ in range(4)
        ]
        result = StatusService.compute_project_summary(activities)
        assert result["overall_status"] == "DONE"
        assert result["pct_complete"] == 100.0
        assert result["counts"]["DONE"] == 4

    def test_all_pending(self):
        activities = [make_activity(actual_start_col=None) for _ in range(3)]
        result = StatusService.compute_project_summary(activities)
        assert result["overall_status"] == "PENDING"
        assert result["pct_complete"] == 0.0

    def test_one_delayed_drives_overall(self):
        activities = [
            make_activity(plan_end_col=20, actual_start_col=5, actual_end_col=20),  # ON_TRACK
            make_activity(plan_end_col=20, actual_start_col=5, actual_end_col=20),  # ON_TRACK
            make_activity(plan_end_col=20, actual_start_col=5, actual_end_col=30),  # DELAYED
        ]
        result = StatusService.compute_project_summary(activities)
        assert result["overall_status"] == "DELAYED"
        assert result["counts"]["DELAYED"] == 1
        assert result["counts"]["ON_TRACK"] == 2

    def test_slow_without_delayed(self):
        activities = [
            make_activity(plan_end_col=20, actual_start_col=5, actual_end_col=20),  # ON_TRACK
            make_activity(plan_end_col=20, actual_start_col=5, actual_end_col=22),  # SLOW
        ]
        result = StatusService.compute_project_summary(activities)
        assert result["overall_status"] == "SLOW"

    def test_pct_complete_calculation(self):
        activities = [
            make_activity(status_override=ActivityStatusOverride.DONE),
            make_activity(status_override=ActivityStatusOverride.DONE),
            make_activity(status_override=ActivityStatusOverride.ON_TRACK),
            make_activity(status_override=ActivityStatusOverride.PENDING),
        ]
        result = StatusService.compute_project_summary(activities)
        assert result["pct_complete"] == 50.0
        assert result["total"] == 4
