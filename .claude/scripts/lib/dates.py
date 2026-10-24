#!/usr/bin/env python3
"""Deterministic date windows.

Removes hand-computed "today minus 30 days" arithmetic from skill prompts. The
cost-analyzer SKILL currently instructs the model to compute Cost Explorer
windows by hand ("the end date must be today, start date is 30 days prior") —
that arithmetic differs run to run. This module computes it once, deterministically.

CLI (run, don't read):
    python dates.py                 # default bundle (today, cost/trend windows, week-ending)
    python dates.py --days-back 30  # one Start/End window N days back from today
    python dates.py --months 3      # a window spanning the last N whole-month span
    python dates.py --week-ending fri

All dates are ISO YYYY-MM-DD. "today" is the local date.
"""

from __future__ import annotations

import argparse
import datetime as _dt
from typing import Dict

try:
    from _common import emit
except ImportError:  # imported as a package member
    from ._common import emit

_WEEKDAYS = {
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}


def _iso(d: _dt.date) -> str:
    return d.isoformat()


def window(days_back: int, *, end: _dt.date | None = None) -> Dict[str, str]:
    """A {start, end} window `days_back` days wide, ending today (inclusive end)."""
    end = end or _dt.date.today()
    return {"start": _iso(end - _dt.timedelta(days=days_back)), "end": _iso(end)}


def month_span(months: int, *, today: _dt.date | None = None) -> Dict[str, str]:
    """A window from the first day of the month `months-1` months ago to today.

    months=3 with today=2026-06-19 -> start 2026-04-01, end 2026-06-19. Suits
    AWS Cost Explorer MONTHLY granularity month-over-month trend calls.
    """
    today = today or _dt.date.today()
    y, m = today.year, today.month
    # step back months-1 whole months to the first-of-month
    total = (y * 12 + (m - 1)) - (months - 1)
    start = _dt.date(total // 12, total % 12 + 1, 1)
    return {"start": _iso(start), "end": _iso(today)}


def week_ending(weekday: str = "fri", *, today: _dt.date | None = None) -> str:
    """The date of the most recent (or today's) given weekday — the sprint/digest
    'week ending' stamp used by weekly-digest and sprint-checklist."""
    today = today or _dt.date.today()
    target = _WEEKDAYS[weekday.lower()[:3]]
    delta = (today.weekday() - target) % 7
    return _iso(today - _dt.timedelta(days=delta))


def default_bundle(today: _dt.date | None = None) -> Dict[str, object]:
    today = today or _dt.date.today()
    return {
        "today": _iso(today),
        "cost_30d": window(30, end=today),          # cost-analyzer call 1/2/5/7
        "trend_3mo": month_span(3, today=today),     # cost-analyzer call 3
        "week_ending_fri": week_ending("fri", today=today),  # digest / sprint stamp
        "stamp": _iso(today),                        # status-report / digest filenames
    }


def _main() -> None:
    p = argparse.ArgumentParser(description="Deterministic date windows.")
    p.add_argument("--days-back", type=int, help="emit a single N-day window")
    p.add_argument("--months", type=int, help="emit a window spanning the last N whole months")
    p.add_argument("--week-ending", metavar="DAY", help="emit the week-ending date for a weekday (mon..sun)")
    args = p.parse_args()

    if args.days_back is not None:
        emit(window(args.days_back))
    if args.months is not None:
        emit(month_span(args.months))
    if args.week_ending is not None:
        emit({"week_ending": week_ending(args.week_ending)})
    emit(default_bundle())


if __name__ == "__main__":
    _main()
