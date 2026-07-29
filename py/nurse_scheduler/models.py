# -*- coding: utf-8 -*-
"""데이터 모델: Staff, Shift, Carryover, MonthSchedule (설계서 §0, 부록 B)."""
from __future__ import annotations

import calendar as _cal
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set, Tuple


class Shift(str, Enum):
    A8 = "8A"
    D = "D"
    E = "E"
    N = "N"
    NK = "NK"
    PRN = "prn"
    OFF = "OFF"
    AL = "연차"

    def __str__(self) -> str:  # 엑셀/리포트 출력용
        return self.value


WORK_SHIFTS = {Shift.A8, Shift.D, Shift.E, Shift.N, Shift.NK, Shift.PRN}
NIGHT_SHIFTS = {Shift.N, Shift.NK}
REST_SHIFTS = {Shift.OFF, Shift.AL}
DAY_WORK_SHIFTS = {Shift.D, Shift.E, Shift.PRN}  # 주간 일반근무


def parse_shift(value: str) -> Shift:
    for s in Shift:
        if s.value == value:
            return s
    raise ValueError(f"알 수 없는 근무유형: {value!r}")


@dataclass
class Staff:
    id: str
    role: str  # 파트장 | 리더 | 간호사
    level: int
    allowed_shifts: List[Shift]
    flags: List[str] = field(default_factory=list)

    @property
    def is_partjang(self) -> bool:
        return self.role == "파트장"

    @property
    def is_leader(self) -> bool:
        return self.role == "리더"

    @property
    def is_nk(self) -> bool:
        return "night_only" in self.flags or self.allowed_shifts == [Shift.NK]

    @property
    def no_night(self) -> bool:
        return "pregnant" in self.flags or "no_night" in self.flags

    def can(self, shift: Shift) -> bool:
        if shift in REST_SHIFTS:
            return True
        if shift in NIGHT_SHIFTS and self.no_night:
            return False
        return shift in self.allowed_shifts


@dataclass
class Carryover:
    """전월 말 상태 (H5-3, 부록 A)."""
    last_shift_type: Shift = Shift.OFF
    consecutive_work_days: int = 0
    night_block_remaining_off: int = 0  # 이번 달 초에 이월해야 할 필수 OFF 일수
    night_block_in_progress: bool = False
    trailing_night_count: int = 0  # 전월 말에 이어지던 야간블록 길이(0=없음)
    recent_night_score: float = 0.0  # 최근 몇 달간의 야간 누적(감쇠) — 야간 배정 형평성용

    @classmethod
    def from_dict(cls, d: Optional[dict]) -> "Carryover":
        if not d:
            return cls()
        trailing = int(d.get("trailing_night_count", 0))
        in_prog = bool(d.get("night_block_in_progress", False))
        if in_prog and trailing == 0:
            trailing = 1
        return cls(
            last_shift_type=parse_shift(d.get("last_shift_type", "OFF")),
            consecutive_work_days=int(d.get("consecutive_work_days", 0)),
            night_block_remaining_off=int(d.get("night_block_remaining_off", 0)),
            night_block_in_progress=in_prog,
            trailing_night_count=trailing,
            recent_night_score=float(d.get("recent_night_score", 0.0)),
        )


@dataclass
class Request:
    """원티드(신청). 리스트 순서 = 제출 순서(선착순, §5)."""
    staff_id: str
    date: str  # YYYY-MM-DD
    type: Shift
    priority: int = 1
    # 처리 결과
    accepted: Optional[bool] = None
    reject_reason: str = ""

    @property
    def day_index_cache(self):
        return None


@dataclass
class Violation:
    rule: str          # 예: "H1-1", "S7"
    severity: str      # hard | soft | info
    message: str
    staff_id: str = ""
    day: Optional[int] = None  # 0-based


class MonthSchedule:
    """한 달 근무표. grid[staff_id][day] = Shift 또는 None(미배정)."""

    def __init__(self, year: int, month: int, staff: List[Staff],
                 carryover: Dict[str, Carryover]):
        self.year = year
        self.month = month
        self.num_days = _cal.monthrange(year, month)[1]
        self.staff: List[Staff] = staff
        self.by_id: Dict[str, Staff] = {s.id: s for s in staff}
        self.carryover: Dict[str, Carryover] = {
            s.id: carryover.get(s.id, Carryover()) for s in staff
        }
        self.grid: Dict[str, List[Optional[Shift]]] = {
            s.id: [None] * self.num_days for s in staff
        }
        self.locked: Set[Tuple[str, int]] = set()
        # 리더가 8A(prn형)를 서는 칸 (§0.3): 표시는 8A, 인력합계는 prn으로 계산
        self.leader_8a: Set[Tuple[str, int]] = set()
        # H2-9 완화로 개인별 상향된 야간 상한
        self.relaxed_night_cap: Dict[str, int] = {}
        # 승인된 OFF/연차 신청일 (S8 판단용): {(staff_id, day)}
        self.requested_off: Set[Tuple[str, int]] = set()
        self.logs: List[str] = []

    # ---------- 기본 접근 ----------
    def get(self, sid: str, day: int) -> Optional[Shift]:
        if 0 <= day < self.num_days:
            return self.grid[sid][day]
        return None

    def set(self, sid: str, day: int, shift: Shift, lock: bool = False):
        self.grid[sid][day] = shift
        if lock:
            self.locked.add((sid, day))

    def is_locked(self, sid: str, day: int) -> bool:
        return (sid, day) in self.locked

    def log(self, msg: str):
        self.logs.append(msg)

    # ---------- 이전 근무 조회 (월경계 포함) ----------
    def shift_before(self, sid: str, day: int) -> Optional[Shift]:
        """day-1의 근무. day==0이면 전월 말 상태에서 추정."""
        if day - 1 >= 0:
            return self.grid[sid][day - 1]
        co = self.carryover[sid]
        if day == 0:
            return co.last_shift_type
        # day == -1 (전전일): 정확한 데이터 없음 → 보수적으로 추정
        if co.trailing_night_count >= 2:
            return Shift.N
        if co.night_block_remaining_off >= 2:
            return Shift.N
        return Shift.OFF

    def effective(self, sid: str, day: int) -> Shift:
        """패턴 검사용: 월 범위 밖/미배정은 OFF로 간주."""
        if day < 0:
            s = self.shift_before(sid, day + 1)
            return s if s is not None else Shift.OFF
        if day >= self.num_days:
            return Shift.OFF
        v = self.grid[sid][day]
        return v if v is not None else Shift.OFF

    # ---------- 집계 ----------
    def work_run_ending(self, sid: str, day: int) -> int:
        """day를 포함해 뒤로 이어진 연속 근무일수(전월 이월 포함)."""
        run = 0
        d = day
        while d >= 0 and self.effective(sid, d) in WORK_SHIFTS:
            run += 1
            d -= 1
        if d < 0 and run == day + 1:
            co = self.carryover[sid]
            if co.last_shift_type in WORK_SHIFTS:
                run += co.consecutive_work_days
        return run

    def work_run_starting(self, sid: str, day: int) -> int:
        run = 0
        d = day
        while d < self.num_days and self.effective(sid, d) in WORK_SHIFTS:
            run += 1
            d += 1
        return run

    def nights_in_month(self, sid: str) -> int:
        return sum(1 for v in self.grid[sid] if v in NIGHT_SHIFTS)

    def workdays_in_month(self, sid: str) -> int:
        return sum(1 for v in self.grid[sid] if v in WORK_SHIFTS)

    def offs_in_month(self, sid: str) -> int:
        return sum(1 for v in self.grid[sid] if v == Shift.OFF)

    def als_in_month(self, sid: str) -> int:
        return sum(1 for v in self.grid[sid] if v == Shift.AL)

    def last_night_day(self, sid: str, before_day: int) -> Optional[int]:
        for d in range(before_day - 1, -1, -1):
            if self.grid[sid][d] in NIGHT_SHIFTS:
                return d
        return None

    def count_shift(self, day: int, shift: Shift) -> int:
        """일별 인원 합계 (H1-1/H1-4: 파트장 제외, 리더 8A는 prn으로 계산)."""
        n = 0
        for s in self.staff:
            if s.is_partjang:
                continue
            v = self.grid[s.id][day]
            if v is None:
                continue
            if shift == Shift.N:
                if v in NIGHT_SHIFTS:
                    n += 1
            elif shift == Shift.PRN:
                if v == Shift.PRN or (v == Shift.A8 and (s.id, day) in self.leader_8a):
                    n += 1
            elif v == shift:
                n += 1
        return n

    def night_cap(self, sid: str, base_cap: int) -> int:
        return self.relaxed_night_cap.get(sid, base_cap)
