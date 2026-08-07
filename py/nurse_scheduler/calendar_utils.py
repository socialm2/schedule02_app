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

# 한국 공휴일(관공서의 공휴일에 관한 규정 기준) — 확인된 연도만 정확한 음력 명절 포함,
# 그 외 연도는 고정일 공휴일만 기본 반영한다.
# ⚠ pyodide-app/app.js의 KR_HOLIDAYS와 반드시 동일하게 유지할 것(둘 다 같은 표를 따로 들고 있음).
KR_HOLIDAYS: Dict[int, Dict[str, List[str]]] = {
    2025: {
        "holidays": [
            "2025-01-01", "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30",
            "2025-03-01", "2025-05-05", "2025-06-06", "2025-08-15",
            "2025-10-03", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-09", "2025-12-25",
        ],
        "substitutes": ["2025-03-03", "2025-05-06", "2025-10-08"],
    },
    2026: {
        "holidays": [
            "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
            "2026-03-01", "2026-05-05", "2026-05-24", "2026-06-06", "2026-08-15",
            "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-09", "2026-12-25",
        ],
        "substitutes": ["2026-03-02", "2026-05-25", "2026-08-17", "2026-10-05"],
    },
    2027: {
        "holidays": [
            "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08",
            "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06", "2027-08-15",
            "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-09", "2027-12-25",
        ],
        "substitutes": ["2027-02-09", "2027-08-16", "2027-10-04", "2027-10-11", "2027-12-27"],
    },
}
# 신정·삼일절·어린이날·현충일·광복절·개천절·한글날·성탄절 (음력 명절·부처님오신날 제외 고정일)
FIXED_HOLIDAYS_MMDD = ["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"]


def kr_holidays_for_month(year: int, month: int) -> tuple[List[str], List[str]]:
    """그 해/그 달의 공휴일·대체공휴일을 자동 조회한다(관공서의 공휴일에 관한 규정 기준).

    확인된 연도(현재 2025~2027)는 음력 명절까지 정확히 반영하고, 그 외 연도는 고정일
    공휴일만 반환한다(음력 명절 제외, 대체공휴일도 빈 리스트 — 캘린더에서 직접 조정 필요).
    """
    data = KR_HOLIDAYS.get(year)
    if data:
        holidays, substitutes = data["holidays"], data["substitutes"]
    else:
        holidays = [f"{year}-{mmdd}" for mmdd in FIXED_HOLIDAYS_MMDD]
        substitutes = []
    mm = f"{month:02d}"
    return ([d for d in holidays if d[5:7] == mm],
            [d for d in substitutes if d[5:7] == mm])


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
