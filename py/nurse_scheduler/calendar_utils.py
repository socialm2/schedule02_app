# -*- coding: utf-8 -*-
"""달력/공휴일 처리 (G5 대체공휴일 포함)."""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from typing import Dict, List, Set

WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]

DAY_WEEKDAY = "weekday"
DAY_SATURDAY = "saturday"
DAY_SUNDAY_HOLIDAY = "sunday_holiday"


@dataclass
class DayInfo:
    date: _dt.date
    dow: int                 # 0=월 ... 6=일
    day_type: str            # weekday | saturday | sunday_holiday
    is_holiday: bool = False
    is_substitute: bool = False

    @property
    def dow_name(self) -> str:
        return WEEKDAY_NAMES[self.dow]

    @property
    def allows_8a(self) -> bool:
        """8A는 평일만 (H1-2). 대체공휴일도 8A 없음 (G5)."""
        return self.day_type == DAY_WEEKDAY


def _parse_dates(items: List[str]) -> Set[_dt.date]:
    return {_dt.date.fromisoformat(s) for s in (items or [])}


def build_calendar(year: int, month: int, holidays: List[str],
                   substitute_holidays: List[str]) -> List[DayInfo]:
    import calendar as _cal
    num_days = _cal.monthrange(year, month)[1]
    hol = {d for d in _parse_dates(holidays)
           if d.year == year and d.month == month}
    subs = {d for d in _parse_dates(substitute_holidays)
            if d.year == year and d.month == month}

    # G5: 공휴일이 토/일과 겹치면 다음 평일을 대체공휴일로 자동 지정
    auto_subs: Set[_dt.date] = set()
    for h in sorted(hol):
        if h.weekday() >= 5:  # 토(5)/일(6)
            cand = h + _dt.timedelta(days=1)
            while (cand.weekday() >= 5 or cand in hol
                   or cand in subs or cand in auto_subs):
                cand += _dt.timedelta(days=1)
            if cand.month == month:
                auto_subs.add(cand)
    subs |= auto_subs

    days: List[DayInfo] = []
    for i in range(num_days):
        d = _dt.date(year, month, i + 1)
        is_hol = d in hol
        is_sub = d in subs
        if is_hol or is_sub or d.weekday() == 6:
            t = DAY_SUNDAY_HOLIDAY
        elif d.weekday() == 5:
            t = DAY_SATURDAY
        else:
            t = DAY_WEEKDAY
        days.append(DayInfo(date=d, dow=d.weekday(), day_type=t,
                            is_holiday=is_hol, is_substitute=is_sub))
    return days


def holiday_count(days: List[DayInfo]) -> int:
    """G6의 '휴일수' = 토/일/공휴일/대체공휴일 일수."""
    return sum(1 for d in days if d.day_type != DAY_WEEKDAY)


def min_staff_for(day: DayInfo, min_staff_cfg: Dict[str, Dict[str, int]]) -> Dict[str, int]:
    return min_staff_cfg[day.day_type]
