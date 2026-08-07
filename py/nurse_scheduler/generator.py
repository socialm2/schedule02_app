# -*- coding: utf-8 -*-
"""근무표 생성 알고리즘 (설계서 §4 Step 0~9)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .calendar_utils import (
    DayInfo, DAY_WEEKDAY, build_calendar, holiday_count, min_staff_for,
)
from .constraints import _senior_pool_threshold
from .models import (
    Carryover, MonthSchedule, Request, Shift, Staff,
    DAY_WORK_SHIFTS, NIGHT_SHIFTS, REST_SHIFTS, WORK_SHIFTS, parse_shift,
)

# S6 고랩 판정용 근무유형 키 (constraints.check_soft의 S6와 동일 매핑)
_SENIOR_SHIFT_KEY = {
    Shift.D: "D", Shift.E: "E", Shift.PRN: "prn", Shift.A8: "prn",
    Shift.N: "N", Shift.NK: "N",
}


@dataclass
class Params:
    nk_count: int = 0
    min_staff: Dict[str, Dict[str, int]] = field(default_factory=dict)
    leader_8a_as_prn: bool = False
    max_nights: int = 6            # H2-6 (입력키: off_max_per_month)
    holidays: List[str] = field(default_factory=list)
    substitute_holidays: List[str] = field(default_factory=list)
    advanced_track_staff: List[str] = field(default_factory=list)
    max_requests_per_person: int = 6   # §5
    prn_cap_extra: int = 2             # 확정 #7: 하루 prn 최대 = 최소+2

    @classmethod
    def from_dict(cls, d: dict) -> "Params":
        return cls(
            nk_count=int(d.get("nk_count", 0)),
            min_staff=d.get("min_staff", {}),
            leader_8a_as_prn=bool(d.get("leader_8a_as_prn", False)),
            max_nights=int(d.get("off_max_per_month",
                                 d.get("max_nights_per_month", 6))),
            holidays=d.get("holidays", []),
            substitute_holidays=d.get("substitute_holidays", []),
            advanced_track_staff=d.get("advanced_track_staff", []),
            max_requests_per_person=int(d.get("max_requests_per_person", 6)),
            prn_cap_extra=int(d.get("prn_cap_extra", 2)),
        )


class InputError(Exception):
    pass


def _nk_block_plan(total: int, start_with_three: bool = True) -> List[int]:
    """NK 월 목표 야간일수를 2일/3일 블록으로 최대한 비슷한 비율로 나눈다(S10 최선 근사).

    2*a + 3*b = total 을 만족하는 조합 중 |a-b|(2일/3일 블록 개수차)가 최소인 것을 고른다.
    (예: 15 → 2일 3개+3일 3개 정확히 1:1, 14 → 2일 4개+3일 2개가 최선의 근사)

    start_with_three: NK 인원이 여럿일 때 서로 다른 값을 줘서 근무/휴식 위상을
    엇갈리게 한다 — 위상이 같으면 여러 NK가 동시에 OFF인 날이 생겨 그날 일반
    간호사가 야간을 더 메워야 해 다른 근무 최소인력이 부족해지기 쉽다.
    """
    best = None
    for b in range(0, total // 3 + 1):
        rem = total - 3 * b
        if rem < 0 or rem % 2 != 0:
            continue
        a = rem // 2
        diff = abs(a - b)
        if best is None or diff < best[0]:
            best = (diff, a, b)
    if best is None:
        return [total] if total > 0 else []
    _, a, b = best
    plan: List[int] = []
    while a > 0 or b > 0:
        if start_with_three:
            if b > 0:
                plan.append(3)
                b -= 1
            if a > 0:
                plan.append(2)
                a -= 1
        else:
            if a > 0:
                plan.append(2)
                a -= 1
            if b > 0:
                plan.append(3)
                b -= 1
    return plan


class Generator:
    def __init__(self, config: dict,
                 fixed_cells: Optional[Dict[Tuple[str, int], Shift]] = None,
                 seed: int = 0):
        self.cfg = config
        self.fixed_cells = fixed_cells or {}
        self.seed = seed
        self.year = int(config["year"])
        self.month = int(config["month"])
        self.params = Params.from_dict(config.get("params", {}))
        self.staff = self._parse_staff(config["staff"])
        import random
        self.rng = random.Random(seed)
        if seed:
            # 재시도 시 후보 순서·동순위 결정을 바꿔 다른 해를 찾는다 (Step 10 재시도)
            self.rng.shuffle(self.staff)
        carry = {sid: Carryover.from_dict(v)
                 for sid, v in (config.get("prev_month_carryover") or {}).items()
                 if sid in {s.id for s in self.staff}}
        self.sch = MonthSchedule(self.year, self.month, self.staff, carry)
        self.days: List[DayInfo] = build_calendar(
            self.year, self.month, self.params.holidays,
            self.params.substitute_holidays)
        self.requests: List[Request] = [
            Request(staff_id=r["staff_id"], date=r["date"],
                    type=parse_shift(r["type"]),
                    priority=int(r.get("priority", 1)))
            for r in (config.get("requests") or [])
        ]
        self.nk_target = 14 if self.month == 2 else 15
        self.senior_threshold: Dict[str, Optional[int]] = {}

    # ------------------------------------------------------------ S6 고랩 기준선
    def compute_senior_thresholds(self):
        """근무유형별 상대 고랩 기준선(constraints._senior_pool_threshold와 동일 정의)을
        미리 계산해둔다 — 배정 중 가드(_lv3_guard_ok)와 검증(check_soft)이 같은
        기준을 쓰도록 하기 위함."""
        pools = {
            "D": [s for s in self.staff if not s.is_partjang and s.can(Shift.D)],
            "E": [s for s in self.staff if not s.is_partjang and s.can(Shift.E)],
            "prn": [s for s in self.staff if not s.is_partjang and s.can(Shift.PRN)],
            "N": [s for s in self.staff
                  if not s.is_partjang and (s.is_nk or s.can(Shift.N))],
        }
        self.senior_threshold = {key: _senior_pool_threshold(pool)
                                 for key, pool in pools.items()}

    def _senior_min_level(self, shift: Shift) -> int:
        key = _SENIOR_SHIFT_KEY.get(shift)
        th = self.senior_threshold.get(key) if key else None
        return th if th is not None else 3

    # ------------------------------------------------------------ H6-4 목표
    def compute_night_targets(self):
        """야간 가능한 일반 간호사에게 이번 달 목표(4일 또는 6일)를 배정한다.

        전월 누적 데이터(carryover.recent_night_score — 감쇠 이동평균)가 적은
        사람일수록 6일 목표를 받아 장기적으로 균등해지도록 한다(§전월 누적 기반)."""
        eligible = [s for s in self.staff
                    if not (s.is_partjang or s.is_nk) and s.can(Shift.N)]
        if not eligible:
            return
        ranked = sorted(
            eligible,
            key=lambda s: (self.sch.carryover[s.id].recent_night_score, s.id))
        six_count = (len(ranked) + 1) // 2  # 홀수면 6일 그룹이 1명 더 많게(적게 한 쪽 우선)
        for i, s in enumerate(ranked):
            self.sch.night_target[s.id] = 6 if i < six_count else 4

    # ------------------------------------------------------------ 입력 파싱
    @staticmethod
    def _parse_staff(raw: List[dict]) -> List[Staff]:
        staff = []
        for r in raw:
            staff.append(Staff(
                id=r["id"], role=r["role"], level=int(r.get("level", 1)),
                allowed_shifts=[parse_shift(x) for x in r.get("allowed_shifts", [])],
                flags=list(r.get("flags", [])),
            ))
        ids = [s.id for s in staff]
        if len(ids) != len(set(ids)):
            raise InputError("staff id 중복")
        return staff

    # ------------------------------------------------------------ 유틸
    def min_for(self, day: int, key: str) -> int:
        return min_staff_for(self.days[day], self.params.min_staff).get(key, 0)

    def _cell_free(self, sid: str, d: int) -> bool:
        """배정 가능한 칸: 미배정이거나, 잠기지 않은 OFF."""
        if self.sch.is_locked(sid, d):
            return False
        v = self.sch.get(sid, d)
        return v is None or v == Shift.OFF

    def _is_rest_or_free(self, sid: str, d: int) -> bool:
        if d >= self.sch.num_days:
            return True
        v = self.sch.get(sid, d)
        return v is None or v in REST_SHIFTS

    def can_assign_day(self, s: Staff, d: int, shift: Shift) -> bool:
        """D/E/prn/8A(리더) 한 칸 배정 가능성 검사 (H1-3, H2-8, H3-1, H3-2)."""
        sch = self.sch
        if s.is_partjang or s.is_nk:
            return False
        if not self._cell_free(s.id, d):
            return False
        if shift == Shift.A8:
            if not (s.is_leader and self.params.leader_8a_as_prn
                    and self.days[d].allows_8a):
                return False
        elif shift not in s.allowed_shifts:
            return False
        # 연속근무: 앞뒤 이어진 근무와 합쳐 5일 이하 (H3-1)
        before = sch.work_run_ending(s.id, d - 1) if d > 0 else \
            (sch.carryover[s.id].consecutive_work_days
             if sch.carryover[s.id].last_shift_type in WORK_SHIFTS else 0)
        after = sch.work_run_starting(s.id, d + 1)
        total = before + 1 + after
        # 뒤 근무열이 월말 단독야간으로 끝나면 익월 1일 연장(H5-2) 예정 → +1
        nd = sch.num_days
        if d + 1 + after == nd and after > 0 \
                and sch.get(s.id, nd - 1) in NIGHT_SHIFTS \
                and (nd < 2 or sch.get(s.id, nd - 2) not in NIGHT_SHIFTS):
            total += 1
        if total > 5:
            return False
        # H6-1: D/E/prn 연속블록은 4일 이하 (전용 카운트)
        if shift in DAY_WORK_SHIFTS:
            day_before = sch.day_work_run_ending(s.id, d - 1) if d > 0 else \
                (sch.carryover[s.id].consecutive_work_days
                 if sch.carryover[s.id].last_shift_type in DAY_WORK_SHIFTS else 0)
            day_after = sch.day_work_run_starting(s.id, d + 1)
            if day_before + 1 + day_after > 4:
                return False
        p1 = sch.effective(s.id, d - 1)
        p2 = sch.effective(s.id, d - 2)
        # H2-8: N→주간, N-O→주간 금지
        if p1 in NIGHT_SHIFTS:
            return False
        if p2 in NIGHT_SHIFTS and p1 in REST_SHIFTS:
            return False
        # H3-2: E→D, E→prn
        if p1 == Shift.E and shift in (Shift.D, Shift.PRN, Shift.A8):
            return False
        # H6-3: EOD(E-O-D) 금지
        if p2 == Shift.E and p1 in REST_SHIFTS and shift == Shift.D:
            return False
        nxt = sch.get(s.id, d + 1) if d + 1 < sch.num_days else None
        if shift == Shift.E and nxt in (Shift.D, Shift.PRN, Shift.A8):
            return False
        # H6-3: EOD(E-O-D) 금지 — 반대 방향(E를 놓았을 때 이틀 뒤에 이미 D가 있는 경우)
        if shift == Shift.E:
            nxt1 = sch.effective(s.id, d + 1)
            nxt2 = sch.effective(s.id, d + 2)
            if nxt1 in REST_SHIFTS and nxt2 == Shift.D:
                return False
        return True

    # ------------------------------------------------------------ Step 0
    def validate_input(self):
        p = self.params
        if not p.min_staff:
            raise InputError("params.min_staff 누락")
        for t in ("weekday", "saturday", "sunday_holiday"):
            if t not in p.min_staff:
                raise InputError(f"min_staff.{t} 누락")
        partjang = [s for s in self.staff if s.is_partjang]
        if len(partjang) > 1:
            raise InputError("파트장은 1명이어야 합니다")
        nk_staff = [s for s in self.staff if s.is_nk]
        if len(nk_staff) != p.nk_count:
            raise InputError(
                f"nk_count={p.nk_count} 이지만 NK 전담 인원은 {len(nk_staff)}명")
        for s in nk_staff:
            if s.no_night:
                raise InputError(f"NK 전담 {s.id}에 야간불가 플래그")

        # 야간 슬롯 실현가능성: 총 야간수요 vs NK 공급 + 일반 야간역량
        total_night_slots = sum(self.min_for(d, "N")
                                for d in range(self.sch.num_days))
        nk_supply = len(nk_staff) * self.nk_target
        generals = [s for s in self.staff
                    if not (s.is_partjang or s.is_nk) and s.can(Shift.N)]
        capacity = sum(self.sch.night_target.get(s.id, p.max_nights)
                       for s in generals)
        if total_night_slots - nk_supply > capacity:
            raise InputError(
                f"야간 실현 불가: 수요 {total_night_slots} - NK공급 {nk_supply}"
                f" > 일반역량 {capacity} (인원/NK/상한 조정 필요)")

        # 일별 총 최소인력 vs 가용 인원 (파트장 제외)
        head = len([s for s in self.staff if not s.is_partjang])
        for d in range(self.sch.num_days):
            need = sum(self.min_for(d, k) for k in ("D", "E", "N", "prn"))
            if need > head:
                raise InputError(f"{d+1}일 최소인력 합 {need} > 가용인원 {head}")

    # ------------------------------------------------------------ Step 0.5 (재생성)
    def apply_fixed(self):
        """리더 수정분 고정 배정. 이후 모든 스텝에서 이동 금지 (원티드보다 우선)."""
        for (sid, d), shift in sorted(self.fixed_cells.items()):
            if sid not in self.sch.by_id or not (0 <= d < self.sch.num_days):
                continue
            s = self.sch.by_id[sid]
            self.sch.set(sid, d, shift, lock=True)
            self.sch.wanted.add((sid, d))
            if shift == Shift.A8 and s.is_leader:
                self.sch.leader_8a.add((sid, d))
            self.sch.log(f"[수정고정] {sid} {d+1}일 = {shift}")
            if shift == Shift.LEAVE:
                # 휴직: 발생일부터 그 달 나머지 기간 전부 제외
                for dd in range(d + 1, self.sch.num_days):
                    if not self.sch.is_locked(sid, dd):
                        self.sch.set(sid, dd, Shift.LEAVE, lock=True)
                        self.sch.wanted.add((sid, dd))

    def complete_partial_night_blocks(self):
        """수정으로 생긴 단독 야간을 2~3일 블록으로 보완하고 뒤 휴식 2일 확보 (H2-4/H2-5)."""
        nd = self.sch.num_days
        for s in self.staff:
            d = 0
            while d < nd:
                if self.sch.get(s.id, d) not in NIGHT_SHIFTS:
                    d += 1
                    continue
                start = d
                while d + 1 < nd and self.sch.get(s.id, d + 1) in NIGHT_SHIFTS:
                    d += 1
                end = d
                length = end - start + 1
                carry_head = (start == 0
                              and self.sch.carryover[s.id].trailing_night_count > 0)
                night = Shift.NK if s.is_nk else Shift.N
                if length == 1 and end != nd - 1 and not carry_head:
                    if self._cell_free(s.id, end + 1):
                        self.sch.set(s.id, end + 1, night, lock=True)
                        end += 1
                        self.sch.log(f"[보완] {s.id} {end+1}일 {night} — 단독야간 블록화(H2-4)")
                    elif start > 0 and self._cell_free(s.id, start - 1) and \
                            self.sch.effective(s.id, start - 2) not in NIGHT_SHIFTS:
                        self.sch.set(s.id, start - 1, night, lock=True)
                        self.sch.log(f"[보완] {s.id} {start}일 {night} — 단독야간 블록화(H2-4)")
                if end - start + 1 >= 2 or carry_head:
                    for k in (1, 2):
                        dd = end + k
                        if dd < nd and self._cell_free(s.id, dd):
                            self.sch.set(s.id, dd, Shift.OFF, lock=True)
                d = end + 1

    # ------------------------------------------------------------ Step 1
    def apply_carryover(self):
        for s in self.staff:
            co = self.sch.carryover[s.id]
            # H5-1: 야간블록 후 이월 OFF
            for k in range(min(co.night_block_remaining_off, self.sch.num_days)):
                if self.sch.get(s.id, k) is None:
                    self.sch.set(s.id, k, Shift.OFF, lock=True)
                elif self.sch.get(s.id, k) not in REST_SHIFTS:
                    self.sch.log(f"[H5-1 충돌] {s.id} {k+1}일: 이월 OFF 자리에 "
                                 f"{self.sch.get(s.id, k)} 고정 배정 존재")
            # H5-2: 월말 단독(또는 미완) 야간블록 연결
            t = co.trailing_night_count
            if t <= 0:
                continue
            night = Shift.NK if s.is_nk else Shift.N
            target_len = 3 if s.is_nk else 2
            extend = max(0, min(target_len - t, 3 - t))
            d = 0
            for _ in range(extend):
                if d < self.sch.num_days:
                    cur = self.sch.get(s.id, d)
                    if cur is None or cur in NIGHT_SHIFTS:
                        self.sch.set(s.id, d, night, lock=True)
                    else:
                        self.sch.log(f"[H5-2 충돌] {s.id} {d+1}일: 야간 연결 자리에 "
                                     f"{cur} 고정 배정 존재")
                    d += 1
            # 블록 종료 후 필수 OFF 2일 (H2-5)
            if t + extend >= 2 or extend > 0:
                for k in range(2):
                    if d + k < self.sch.num_days and \
                            self.sch.get(s.id, d + k) is None:
                        self.sch.set(s.id, d + k, Shift.OFF, lock=True)
            if extend:
                self.sch.log(f"[H5-2] {s.id}: 전월 야간 {t}일 → 이번달 {extend}일 연장 연결")

    # ------------------------------------------------------------ Step 2
    def assign_partjang(self):
        for s in self.staff:
            if not s.is_partjang:
                continue
            for d, di in enumerate(self.days):
                if self.sch.get(s.id, d) is not None:
                    continue
                self.sch.set(s.id, d,
                             Shift.A8 if di.allows_8a else Shift.OFF, lock=True)

    # ------------------------------------------------------------ Step 3
    def assign_nk(self):
        nks = [s for s in self.staff if s.is_nk]
        for idx, s in enumerate(nks):
            done = self.sch.nights_in_month(s.id)  # Step1 연장분 포함
            remaining = self.nk_target - done
            # 시작 위치: 이월 OFF/연장블록 이후 + 전담자별 오프셋(서로 엇갈리게)
            d = 0
            while d < self.sch.num_days and self.sch.get(s.id, d) is not None:
                d += 1
            d += (idx * 3) % 5
            plan = _nk_block_plan(remaining, start_with_three=(idx % 2 == 0))
            pi = 0
            while remaining > 0 and d < self.sch.num_days:
                block = plan[pi] if pi < len(plan) else min(3, remaining)
                pi += 1
                block = min(block, remaining)
                placed = 0
                while placed < block and d < self.sch.num_days:
                    if self._cell_free(s.id, d):
                        self.sch.set(s.id, d, Shift.NK, lock=True)
                        placed += 1
                        d += 1
                    else:
                        d += 1
                        break
                remaining -= placed
                if placed >= 2:
                    rest = 2
                    # 남은 야간을 남은 일수에 고르게: 여유 있으면 3일 휴식(S10)
                    # (2일/3일 혼합 계획이므로 "3일 블록만" 가정한 division 추정 대신
                    #  실제 계획에 남은 블록 개수를 그대로 사용 — 과소추정 시 rest=3을
                    #  잘못 허용해 마지막 블록 배정할 날이 모자라는 문제 방지)
                    if pi < len(plan):
                        blocks_left = len(plan) - pi
                    else:
                        blocks_left = (remaining + 2) // 3
                    need_days = remaining + 2 * max(0, blocks_left - 1)
                    if remaining > 0 and (self.sch.num_days - d - rest - 1) > need_days:
                        rest = 3
                    for k in range(rest):
                        if d < self.sch.num_days and self._cell_free(s.id, d):
                            self.sch.set(s.id, d, Shift.OFF, lock=True)
                            d += 1
                        elif d < self.sch.num_days:
                            d += 1
            if remaining > 0:
                self.sch.log(f"[H2-2] NK {s.id}: 야간 {remaining}일 미충족 (달력 제약)")
            # 나머지는 전부 OFF (H2-2)
            for d2 in range(self.sch.num_days):
                if self.sch.get(s.id, d2) is None:
                    self.sch.set(s.id, d2, Shift.OFF, lock=True)

    # ------------------------------------------------------------ Step 4
    def apply_requests(self):
        self._accepted_rest_reqs: Dict[Tuple[str, int], Request] = {}
        per_person: Dict[str, int] = {}
        # 같은 날 같은 근무유형 채택 수 (선착순 제한, §5)
        taken: Dict[Tuple[int, Shift], int] = {}
        for req in self.requests:
            req.accepted = False
            s = self.sch.by_id.get(req.staff_id)
            if s is None:
                req.reject_reason = "존재하지 않는 직원"
                continue
            try:
                import datetime as _dt
                dt = _dt.date.fromisoformat(req.date)
            except ValueError:
                req.reject_reason = "날짜 형식 오류"
                continue
            if dt.year != self.year or dt.month != self.month:
                req.reject_reason = "해당 월이 아님"
                continue
            d = dt.day - 1
            t = req.type
            # 월 신청 상한은 근무형 신청(D/E/N/8A/NK/prn)만 카운트한다 — 휴무/연차는
            # 병가·경조사 등 사유가 다양해 인원수 제한 취지와 안 맞으므로 제외(§5).
            if t in WORK_SHIFTS:
                per_person[s.id] = per_person.get(s.id, 0) + 1
                if per_person[s.id] > self.params.max_requests_per_person:
                    req.reject_reason = f"월 신청 상한({self.params.max_requests_per_person}건) 초과"
                    continue
            if self.sch.is_locked(s.id, d):
                if self.sch.get(s.id, d) == t:
                    # 리더가 신청과 동일한 근무로 이미 고정 배정해둔 경우 — 반영된 것으로 처리.
                    # _accepted_rest_reqs에는 넣지 않는다: 그 목록은 나중에 H1-1 미달 시
                    # _repair_via_revoke_request()가 회수할 수 있는 "일반 신청"용이고,
                    # 리더가 직접 고정한 칸은 그 어떤 경우에도 되돌려선 안 되기 때문.
                    if t in REST_SHIFTS:
                        self.sch.requested_off.add((s.id, d))
                    else:
                        taken[(d, t)] = taken.get((d, t), 0) + 1
                    self.sch.wanted.add((s.id, d))
                    req.accepted = True
                else:
                    req.reject_reason = (f"고정 배정과 충돌({self.sch.get(s.id, d)}) "
                                         "— 하드 제약/리더 수정 우선")
                continue
            if t in REST_SHIFTS:
                if not self._off_capacity_ok(d):
                    req.reject_reason = "해당일 최소인력 부족으로 휴무 불가(H1-1)"
                    continue
            elif t == Shift.EDU:
                pass  # 교육(T)은 근무일수엔 포함되지만 최소인력 대상이 아니므로 인원 제한 없음
            else:
                if t in NIGHT_SHIFTS and s.no_night:
                    req.reject_reason = "임부/야간불가 야간금지(H2-7)"
                    continue
                if not s.can(t) and not (t == Shift.A8 and s.is_leader
                                         and self.params.leader_8a_as_prn):
                    req.reject_reason = f"허용 근무유형 아님(H1-3): {t}"
                    continue
                if t == Shift.A8 and not self.days[d].allows_8a:
                    req.reject_reason = "8A는 평일만(H1-2)"
                    continue
                cap_key = "prn" if t in (Shift.PRN, Shift.A8) else t.value
                cap = self.min_for(d, "N" if t in NIGHT_SHIFTS else cap_key)
                if t in (Shift.PRN, Shift.A8):
                    cap += self.params.prn_cap_extra
                if taken.get((d, t), 0) >= cap:
                    req.reject_reason = "동일 일자·근무 신청 몰림 — 선착순 마감(§5)"
                    continue
                if t in NIGHT_SHIFTS:
                    # 단독야간 방지(H2-4): 앞뒤 어느 쪽으로든 블록 연장이 가능해야 수용
                    fwd = (d + 1 >= self.sch.num_days
                           or self._is_rest_or_free(s.id, d + 1)
                           or self.sch.get(s.id, d + 1) in NIGHT_SHIFTS)
                    bwd = (d > 0 and (self._cell_free(s.id, d - 1)
                                      or self.sch.get(s.id, d - 1) in NIGHT_SHIFTS))
                    if not (fwd or bwd):
                        req.reject_reason = "야간 블록 구성 불가(H2-4)"
                        continue
            # 채택
            self.sch.set(s.id, d, t, lock=True)
            self.sch.wanted.add((s.id, d))
            if t == Shift.A8 and s.is_leader:
                self.sch.leader_8a.add((s.id, d))
            if t in REST_SHIFTS:
                self.sch.requested_off.add((s.id, d))
                self._accepted_rest_reqs[(s.id, d)] = req
            else:
                taken[(d, t)] = taken.get((d, t), 0) + 1
            req.accepted = True
            if t == Shift.LEAVE:
                # 휴직: 발생일부터 그 달 나머지 기간 전부 제외
                for dd in range(d + 1, self.sch.num_days):
                    if not self.sch.is_locked(s.id, dd):
                        self.sch.set(s.id, dd, Shift.LEAVE, lock=True)
                        self.sch.wanted.add((s.id, dd))

    def _off_capacity_ok(self, d: int) -> bool:
        """d일에 휴무 1명 추가해도 최소인력 채울 수 있는지 (근사)."""
        generals = [s for s in self.staff if not (s.is_partjang or s.is_nk)]
        resting = sum(1 for s in generals
                      if self.sch.get(s.id, d) in REST_SHIFTS)
        nk_on = sum(1 for s in self.staff if s.is_nk
                    and self.sch.get(s.id, d) in NIGHT_SHIFTS)
        need = (self.min_for(d, "D") + self.min_for(d, "E")
                + self.min_for(d, "prn") + max(0, self.min_for(d, "N") - nk_on))
        return len(generals) - resting - 1 >= need

    # ------------------------------------------------------------ Step 5
    def assign_nights(self):
        """일반 간호사: 2일 블록만 배정하며, 개인별 월 목표(4일 또는 6일, H6-4) 내로
        제한한다. 목표를 지키면 못 채우는 경우(H1-1 최소인력 보존이 최우선) 목표를
        넘겨서라도 2일 블록으로 배정하고 위반을 기록한다."""
        nd = self.sch.num_days
        for d in range(nd):
            need = self.min_for(d, "N") - self.sch.count_shift(d, Shift.N)
            while need > 0:
                placed = False
                if d + 1 >= nd:
                    # 월말 단독야간 예외(H2-4) — 목표 개념 없이 1일 블록만
                    for relax in (0, 1, 2, 3):
                        cand = self._pick_night_candidate(d, relax, (1,))
                        if cand is not None:
                            sid, length = cand
                            self._place_night_block(sid, d, length, relax)
                            placed = True
                            break
                else:
                    for relax in (0, 1, 2, 3):
                        cand = self._pick_night_candidate(d, relax, (2,))
                        if cand is not None:
                            sid, length = cand
                            self._place_night_block(sid, d, length, relax)
                            placed = True
                            break
                    if not placed:
                        # 월 목표(4/6일)를 지키면 못 채움 — 최소인력(H1-1) 보존이 우선이므로
                        # 목표를 넘겨서라도 2일 블록으로 배정하고 위반으로 남긴다.
                        for relax in (0, 1, 2, 3):
                            cand = self._pick_night_candidate(
                                d, relax, (2,), allow_over_target=True)
                            if cand is not None:
                                sid, length = cand
                                self._place_night_block(sid, d, length, relax)
                                self.sch.log(
                                    f"[H6-4] {sid}: {d+1}일 야간 — 월 목표(4/6일) 초과 배정 "
                                    "(2일블록 목표 소진, 최소인력(H1-1) 우선)")
                                placed = True
                                break
                if not placed:
                    self.sch.log(f"[H1-1] {d+1}일 야간 최소인력 미달 — 배정 가능 인원 없음")
                    break
                need -= 1

    def _pick_night_candidate(self, d: int, relax: int, lengths: Tuple[int, ...],
                              allow_over_target: bool = False) -> Optional[Tuple[str, int]]:
        best = None
        best_score = None
        for length in lengths:
            for s in self.staff:
                if s.is_partjang or s.is_nk or s.no_night:
                    continue
                if Shift.N not in s.allowed_shifts:
                    continue
                if not self._can_night_block(s, d, length, relax, allow_over_target):
                    continue
                # S8: 배정 시 뒤따르는 강제 OFF가 '신청 OFF'를 잡아먹으면 감점
                s8_pen = 0
                for k in range(length, length + 2):
                    if (s.id, d + k) in self.sch.requested_off:
                        s8_pen = 1
                # 휴식 잠금이 만들 인력 압박(look-ahead): 압박 없는 배정 우선
                squeeze = self._squeeze_after_block(s, d, length)
                last = self.sch.last_night_day(s.id, d)
                gap = d - last if last is not None else 99
                score = (squeeze, s8_pen,
                         self.sch.nights_in_month(s.id),
                         -min(gap, 12), self.sch.workdays_in_month(s.id),
                         self.sch.carryover[s.id].recent_night_score,
                         self.rng.random())
                if best_score is None or score < best_score:
                    best_score = score
                    best = (s.id, length)
        return best

    def _squeeze_after_block(self, s: Staff, d: int, length: int) -> int:
        """블록·휴식 기간의 각 날에 대해, 남은 가용 인원이 남은 최소인력 수요보다
        부족해질 날 수를 센다 (야간 배정의 주간 인력 look-ahead)."""
        sch = self.sch
        squeeze = 0
        for dd in range(d, min(d + length + 2, sch.num_days)):
            in_block = dd < d + length
            need = 0
            for key, sh in (("D", Shift.D), ("E", Shift.E), ("prn", Shift.PRN)):
                need += max(0, self.min_for(dd, key) - sch.count_shift(dd, sh))
            n_have = sch.count_shift(dd, Shift.N) + (1 if in_block else 0)
            need += max(0, self.min_for(dd, "N") - n_have)
            avail = 0
            for t in self.staff:
                if t.is_partjang or t.is_nk or t.id == s.id:
                    continue
                v = sch.get(t.id, dd)
                if v is None or (v == Shift.OFF and not sch.is_locked(t.id, dd)):
                    avail += 1
            if avail < need:
                squeeze += 1
        return squeeze

    def _can_night_block(self, s: Staff, d: int, length: int, relax: int,
                         allow_over_target: bool = False) -> bool:
        sch = self.sch
        nd = sch.num_days
        for i in range(length):
            if not self._cell_free(s.id, d + i):
                return False
        # 블록 뒤 2일 휴식 확보 가능해야 함 (H2-5): 이미 근무로 잠겨 있으면 불가
        for k in range(length, length + 2):
            if d + k < nd and not self._is_rest_or_free(s.id, d + k):
                return False
        # 월 야간 목표 (H6-4: 4일 또는 6일만) — H1-1 보존을 위해 부득이할 때만 초과 허용
        if not allow_over_target:
            target = sch.night_target.get(s.id, self.params.max_nights)
            if sch.nights_in_month(s.id) + length > target:
                return False
        # 월 야간 상한 (H2-6 안전망, relax>=2부터 상향 H2-9)
        extra = max(0, relax - 1)
        if sch.nights_in_month(s.id) + length > self.params.max_nights + extra:
            return False
        # 연속근무 (H3-1)
        before = sch.work_run_ending(s.id, d - 1) if d > 0 else \
            (sch.carryover[s.id].consecutive_work_days
             if sch.carryover[s.id].last_shift_type in WORK_SHIFTS else 0)
        if before + length > 5:
            return False
        # 월말 단독야간은 익월에 최소 1일 연장(H5-2)되므로 그만큼 여유 필요 (H3-1)
        if length == 1 and d == nd - 1 and before + 2 > 5:
            return False
        # 직전이 야간이면 안 됨(블록은 통째로만 배정), 야간 후 휴식 2일 (H2-5/H2-8)
        last = sch.last_night_day(s.id, d)
        if last is None:
            co = sch.carryover[s.id]
            if co.trailing_night_count > 0 or co.night_block_remaining_off > 0:
                # 월초 이월 휴식 중 → 간격을 월초 기준으로 계산
                gap = d + 1
                if gap < 3:
                    return False
                if relax < 1 and gap < 7:
                    return False
        else:
            gap = d - last
            if gap < 3:  # 최소 2일 휴식 + 1
                return False
            if relax < 1 and gap < 7:  # S1 하한 (H2-9 1순위 완화)
                return False
        return True

    def _place_night_block(self, sid: str, d: int, length: int, relax: int):
        sch = self.sch
        for i in range(length):
            sch.set(sid, d + i, Shift.N, lock=True)
        for k in range(length, length + 2):
            if d + k < sch.num_days and self.sch.get(sid, d + k) is None:
                sch.set(sid, d + k, Shift.OFF, lock=True)
        if relax >= 2:
            cap = self.params.max_nights + max(0, relax - 1)
            prev = sch.relaxed_night_cap.get(sid, self.params.max_nights)
            if cap > prev:
                sch.relaxed_night_cap[sid] = cap
                sch.log(f"[H2-9] {sid}: 월 야간상한 {cap}일로 완화")
        elif relax == 1:
            sch.log(f"[H2-9] {sid}: {d+1}일 야간 — S1(간격 7일) 완화 적용")
        if length == 1:
            sch.log(f"[H5-2] {sid}: 월말 단독야간({d+1}일) → 익월 연결 필요")

    # ------------------------------------------------------------ Step 6
    def fill_day_shifts(self):
        for d in range(self.sch.num_days):
            for key, shift in (("D", Shift.D), ("E", Shift.E), ("prn", Shift.PRN)):
                need = self.min_for(d, key) - self.sch.count_shift(d, shift)
                while need > 0:
                    cand = self._pick_day_candidate(d, shift)
                    if cand is None:
                        self.sch.log(f"[H1-1] {d+1}일 {key} 최소인력 미달 — 후보 없음")
                        break
                    self.sch.set(cand.id, d, shift)
                    need -= 1

    def _pick_day_candidate(self, d: int, shift: Shift,
                            protect_lower: Optional[int] = None) -> Optional[Staff]:
        # S6: 아직 고랩(상대 기준선) 없으면 우선 확보
        min_lv = self._senior_min_level(shift)
        cur_levels = []
        for s in self.staff:
            if s.is_partjang:
                continue
            v = self.sch.get(s.id, d)
            if v == shift or (shift == Shift.PRN and v == Shift.A8
                              and (s.id, d) in self.sch.leader_8a):
                cur_levels.append(s.level)
        need_lv3 = not any(lv >= min_lv for lv in cur_levels)
        weekend = self.days[d].day_type != DAY_WEEKDAY
        best, best_score = None, None
        for s in self.staff:
            if not self.can_assign_day(s, d, shift):
                continue
            odo = 1 if (self.sch.effective(s.id, d - 1) in REST_SHIFTS
                        and self.sch.effective(s.id, d + 1) in REST_SHIFTS) else 0
            wk_load = 0
            if weekend:
                wk_load = sum(1 for dd, di in enumerate(self.days)
                              if di.day_type != DAY_WEEKDAY
                              and self.sch.effective(s.id, dd) in WORK_SHIFTS)
            # H4-1 보호: 배정 시 OFF 하한이 깨질 사람은 후순위 (H4-1 > S6)
            lower_break = 0
            if protect_lower is not None and \
                    self.sch.offs_in_month(s.id) - 1 < protect_lower:
                lower_break = 1
            score = (lower_break,
                     0 if (need_lv3 and s.level >= min_lv) else 1,
                     odo, wk_load,
                     self.sch.workdays_in_month(s.id),
                     -self.sch.offs_in_month(s.id),
                     self.rng.random())
            if best_score is None or score < best_score:
                best_score, best = score, s
        return best

    # ------------------------------------------------------------ 최소인력 수리
    def count_deficits(self) -> int:
        n = 0
        for d in range(self.sch.num_days):
            for key, shift in (("D", Shift.D), ("E", Shift.E),
                               ("N", Shift.N), ("prn", Shift.PRN)):
                n += max(0, self.min_for(d, key)
                         - self.sch.count_shift(d, shift))
        return n

    def repair_min_staff(self):
        """H1-1 미달 칸을 이웃일 재배치로 수리 (E→prn 금지 등으로 후보가 없던 경우)."""
        lower = max(8, holiday_count(self.days) - 1)
        for d in range(self.sch.num_days):
            for key, shift in (("D", Shift.D), ("E", Shift.E), ("prn", Shift.PRN)):
                while self.sch.count_shift(d, shift) < self.min_for(d, key):
                    cand = self._pick_day_candidate(d, shift, protect_lower=lower)
                    if cand is not None:
                        self.sch.set(cand.id, d, shift)
                        continue
                    if self._repair_via_neighbor_transfer(d, shift, lower):
                        continue
                    if self._repair_via_same_day_switch(d, shift, lower):
                        continue
                    if self._window_rebuild(d):
                        continue
                    if self._window_rebuild(d, tries=20, span=5):
                        continue
                    if not self._repair_via_revoke_request(d, shift):
                        break

    def _repair_via_neighbor_transfer(self, d: int, shift: Shift,
                                      lower: int) -> bool:
        """이웃날 근무(E→x 금지·연속 5일 초과의 원인)를 제3자에게 이관해
        당일 부족 근무(H1-1)를 배정할 수 있게 만든다."""
        sch = self.sch
        # 1차: 수령자 OFF 하한을 지키는 이관만, 2차: 하한 무시(H1-1 > H4-1)
        for strict in (True, False):
            for a in self.staff:
                if a.is_partjang or a.is_nk or not a.can(shift):
                    continue
                if sch.get(a.id, d) != Shift.OFF or sch.is_locked(a.id, d):
                    continue
                for w in (d - 1, d + 1):
                    if not (0 <= w < sch.num_days):
                        continue
                    v = sch.get(a.id, w)
                    if v not in DAY_WORK_SHIFTS or sch.is_locked(a.id, w):
                        continue
                    if self._removal_creates_eod(a.id, w):
                        continue
                    sch.grid[a.id][w] = Shift.OFF
                    if not self.can_assign_day(a, d, shift):
                        sch.grid[a.id][w] = v
                        continue
                    receivers = sorted(
                        (r for r in self.staff if r.id != a.id),
                        key=lambda r: -sch.offs_in_month(r.id))
                    for r in receivers:
                        if strict and sch.offs_in_month(r.id) - 1 < lower:
                            continue
                        if self.can_assign_day(r, w, v) and \
                                self._lv3_guard_ok(a, r, w, v):
                            sch.set(r.id, w, v)
                            sch.set(a.id, d, shift)
                            sch.log(f"[수리] {w+1}일 {v}: {a.id}→{r.id} 이관 후 "
                                    f"{a.id} {d+1}일 {shift} 배정 (H1-1)")
                            return True
                    sch.grid[a.id][w] = v
        return False

    def _window_rebuild(self, d0: int, tries: int = 10, span: int = 3) -> bool:
        """부족일 주변 ±span일의 잠기지 않은 주간근무를 헐고 무작위 순서로 재충원.

        전역 미달 수가 줄어들 때만 채택 (destroy-and-repair).
        대형 병동에서 비용 폭주를 막기 위해 실행당 호출 횟수를 제한한다.
        """
        self._rebuild_calls = getattr(self, "_rebuild_calls", 0) + 1
        if self._rebuild_calls > 40:
            return False
        sch = self.sch
        lo, hi = max(0, d0 - span), min(sch.num_days - 1, d0 + span)
        snapshot = {s.id: sch.grid[s.id][lo:hi + 1] for s in self.staff}
        base = self.count_deficits()
        for _ in range(tries):
            for s in self.staff:
                if s.is_partjang or s.is_nk:
                    continue
                for dd in range(lo, hi + 1):
                    if sch.grid[s.id][dd] in DAY_WORK_SHIFTS \
                            and not sch.is_locked(s.id, dd):
                        sch.grid[s.id][dd] = Shift.OFF
            for dd in range(lo, hi + 1):
                for key, sh in (("D", Shift.D), ("E", Shift.E),
                                ("prn", Shift.PRN)):
                    need = self.min_for(dd, key) - sch.count_shift(dd, sh)
                    while need > 0:
                        cand = self._pick_day_candidate(dd, sh)
                        if cand is None:
                            break
                        sch.set(cand.id, dd, sh)
                        need -= 1
            if self.count_deficits() < base:
                sch.log(f"[수리] {d0+1}일 주변({lo+1}~{hi+1}일) 재구성으로 "
                        f"미달 {base}→{self.count_deficits()}건 (H1-1)")
                return True
            for s in self.staff:
                sch.grid[s.id][lo:hi + 1] = list(snapshot[s.id])
        return False

    def _repair_via_revoke_request(self, d: int, shift: Shift) -> bool:
        """최후 수단: 원티드 OFF/연차를 반려(회수)하고 부족 근무를 배정.

        §3 우선순위 '하드(H1-1) > 원티드'에 따른 조치. 반려 사유를 기록한다.
        """
        sch = self.sch
        reqs = getattr(self, "_accepted_rest_reqs", {})
        for (sid, dd), req in sorted(reqs.items()):
            if dd != d:
                continue
            s = sch.by_id[sid]
            # 회수 시뮬레이션: 잠금 해제 후 배정 가능성 확인
            sch.locked.discard((sid, d))
            sch.requested_off.discard((sid, d))
            prev = sch.grid[sid][d]
            sch.grid[sid][d] = Shift.OFF
            lower = max(8, holiday_count(self.days) - 1)
            ok = False
            if self.can_assign_day(s, d, shift):
                sch.set(sid, d, shift)
                ok = True
            # 직접 배정이 막히면(연속근무 등) 이관·재구성까지 연쇄 시도
            elif self._repair_via_neighbor_transfer(d, shift, lower) or \
                    self._window_rebuild(d):
                ok = self.sch.count_shift(d, shift) >= self.min_for(
                    d, "prn" if shift == Shift.PRN else shift.value)
            if ok:
                req.accepted = False
                req.reject_reason = ("생성 중 최소인력(H1-1) 충족 불가 — "
                                     "하드 제약 우선(§3)으로 반려")
                del reqs[(sid, d)]
                sch.log(f"[수리] {d+1}일 {shift}: {sid}의 신청 {prev} 회수 "
                        f"(H1-1 > 원티드)")
                return True
            # 원복
            sch.grid[sid][d] = prev
            sch.locked.add((sid, d))
            sch.requested_off.add((sid, d))
        return False

    def _repair_via_same_day_switch(self, d: int, shift: Shift,
                                    lower: int) -> bool:
        """같은 날 다른 근무자(b)를 부족 근무로 돌리고, b가 비운 근무를
        제3자로 재충원한다. (예: E→prn 금지로 막힌 사람이 E는 설 수 있는 경우)"""
        sch = self.sch
        for b in self.staff:
            y = sch.get(b.id, d)
            if y not in DAY_WORK_SHIFTS or y == shift or sch.is_locked(b.id, d):
                continue
            sch.grid[b.id][d] = Shift.OFF
            if not self.can_assign_day(b, d, shift):
                sch.grid[b.id][d] = y
                continue
            sch.grid[b.id][d] = shift  # 가배정
            cand = self._pick_day_candidate(d, y, protect_lower=lower)
            if cand is not None:
                sch.set(cand.id, d, y)
                sch.log(f"[수리] {d+1}일: {b.id} {y}→{shift} 전환, "
                        f"{cand.id} {y} 충원 (H1-1)")
                return True
            if self._repair_via_neighbor_transfer(d, y, lower):
                sch.log(f"[수리] {d+1}일: {b.id} {y}→{shift} 전환 (H1-1)")
                return True
            sch.grid[b.id][d] = y  # 원복
        return False

    # ------------------------------------------------------------ 마무리(기본 OFF)
    def finalize_offs(self):
        for s in self.staff:
            for d in range(self.sch.num_days):
                if self.sch.get(s.id, d) is None:
                    self.sch.set(s.id, d, Shift.OFF)

    # ------------------------------------------------------------ Step 7 (G4)
    def fix_alternation(self) -> int:
        """S7 퐁당퐁당(ODO/OEO — 고립된 하루 근무) 완화. 한 번 고치면 다른 사람 자리가
        비어 새로 고칠 여지가 생길 수 있어, 호출부에서 변화 없을 때까지 반복 호출한다."""
        sch = self.sch
        nd = sch.num_days
        fixed = 0
        for s in self.staff:
            if s.is_partjang or s.is_nk:
                continue
            for d in range(nd):
                v = sch.get(s.id, d)
                if v not in DAY_WORK_SHIFTS:      # 야간·8A 제외 (가드⑤)
                    continue
                if sch.is_locked(s.id, d):        # 원티드 확정분 제외 (가드⑥)
                    continue
                if not (sch.effective(s.id, d - 1) in REST_SHIFTS
                        and sch.effective(s.id, d + 1) in REST_SHIFTS):
                    continue
                if self._try_transfer(s, d, v) or self._try_swap(s, d, v):
                    fixed += 1
        return fixed

    # ------------------------------------------------------------ Step 7b (H6-1)
    def _short_day_blocks(self) -> List[Tuple[Staff, int, int]]:
        """길이 1~2일짜리 D/E/prn 연속블록 목록 [(직원, start, end), ...].

        전월에서 이어지는 블록(정확한 시작을 모름)은 건드리지 않는다."""
        sch = self.sch
        nd = sch.num_days
        out: List[Tuple[Staff, int, int]] = []
        for s in self.staff:
            if s.is_partjang or s.is_nk:
                continue
            d = 0
            while d < nd:
                if sch.effective(s.id, d) not in DAY_WORK_SHIFTS:
                    d += 1
                    continue
                start = d
                while d + 1 < nd and sch.effective(s.id, d + 1) in DAY_WORK_SHIFTS:
                    d += 1
                end = d
                carried = (start == 0
                          and sch.carryover[s.id].last_shift_type in DAY_WORK_SHIFTS)
                length = end - start + 1
                if length < 3 and not carried:
                    out.append((s, start, end))
                d = end + 1
        return out

    def fix_short_day_blocks(self, max_passes: int = 5) -> int:
        """H6-1: 1~2일짜리 고립 주간근무 블록을 3일 이상으로 확장하거나(우선),
        확장이 불가하면 다른 사람에게 이관/맞교환한다(fix_alternation과 동일 기법).

        월경계 등에서 인접 블록이 이미 4일 꽉 차 확장·이관이 모두 막히는 경우가
        남을 수 있다 — 최종 리포트에 H6-1 잔여 위반으로 표시된다(§H1-1과 동일하게
        최선 노력 후 잔존을 허용하는 방식)."""
        sch = self.sch
        fixed_total = 0
        for _ in range(max_passes):
            blocks = self._short_day_blocks()
            if not blocks:
                break
            any_fixed = False
            for s, start, end in blocks:
                grown = False
                for dd, vv in ((end + 1, sch.get(s.id, end)),
                              (start - 1, sch.get(s.id, start))):
                    if not (0 <= dd < sch.num_days):
                        continue
                    if sch.is_locked(s.id, dd) or sch.get(s.id, dd) != Shift.OFF:
                        continue
                    if self.can_assign_day(s, dd, vv):
                        sch.set(s.id, dd, vv)
                        sch.log(f"[H6-1] {s.id}: {dd+1}일 {vv} 추가 — "
                                f"단기블록({start+1}~{end+1}일) 확장")
                        grown = True
                        any_fixed = True
                        fixed_total += 1
                        break
                if grown:
                    continue
                for dd in range(start, end + 1):
                    if sch.is_locked(s.id, dd):
                        continue
                    vv = sch.get(s.id, dd)
                    if self._try_transfer(s, dd, vv) or self._try_swap(s, dd, vv):
                        any_fixed = True
                        fixed_total += 1
            if not any_fixed:
                break
        return fixed_total

    def _lv3_guard_ok(self, donor: Optional[Staff], receiver: Optional[Staff],
                      d: int, shift: Shift) -> bool:
        """가드③: 이동 후에도 해당 근무 고랩(상대 기준선) 유지. donor=None이면 순수 추가(제외 없음)."""
        levels = []
        for s in self.staff:
            if s.is_partjang or (donor is not None and s.id == donor.id):
                continue
            if self.sch.get(s.id, d) == shift:
                levels.append(s.level)
        if receiver is not None:
            levels.append(receiver.level)
        min_lv = self._senior_min_level(shift)
        return (not levels) or any(lv >= min_lv for lv in levels)

    def _try_transfer(self, donor: Staff, d: int, shift: Shift) -> bool:
        """G4-a: 퐁당퐁당 근무를 인접 근무자가 있는 다른 사람에게 이관."""
        sch = self.sch
        for r in self.staff:
            if r.id == donor.id or r.is_partjang or r.is_nk:
                continue
            if sch.get(r.id, d) != Shift.OFF or sch.is_locked(r.id, d):
                continue
            adjacent = (sch.effective(r.id, d - 1) in WORK_SHIFTS
                        or sch.effective(r.id, d + 1) in WORK_SHIFTS)
            if not adjacent:
                continue
            # 가드④: 근무일수 편차 악화 금지
            if sch.workdays_in_month(r.id) > sch.workdays_in_month(donor.id):
                continue
            # 가드: 수령자의 OFF 하한(H4-1) 붕괴·기증자의 OFF 상한(G6) 초과 금지
            hol = holiday_count(self.days)
            if sch.offs_in_month(r.id) - 1 < max(8, hol - 1):
                continue
            if sch.offs_in_month(donor.id) + 1 > hol + 2:
                continue
            if not self._lv3_guard_ok(donor, r, d, shift):
                continue
            # 수령자 배정 가능성 (가드①② 포함: can_assign_day가 검사)
            sch.grid[donor.id][d] = Shift.OFF  # 임시 제거 후 검사
            ok = self.can_assign_day(r, d, shift)
            if ok:
                sch.set(r.id, d, shift)
                sch.log(f"[G4-a] {d+1}일 {shift}: {donor.id} → {r.id} 이관")
                return True
            sch.grid[donor.id][d] = shift  # 원복
        return False

    def _try_swap(self, donor: Staff, d: int, shift: Shift) -> bool:
        """G4-b: 인접일 근무자와 맞교환 (donor d일 근무 ↔ partner 인접일 근무)."""
        sch = self.sch
        for nd_ in (d - 1, d + 1):
            if not (0 <= nd_ < sch.num_days):
                continue
            for p in self.staff:
                if p.id == donor.id or p.is_partjang or p.is_nk:
                    continue
                pv = sch.get(p.id, nd_)
                if pv not in DAY_WORK_SHIFTS or sch.is_locked(p.id, nd_):
                    continue
                if sch.get(p.id, d) != Shift.OFF or sch.is_locked(p.id, d):
                    continue
                if sch.get(donor.id, nd_) != Shift.OFF or sch.is_locked(donor.id, nd_):
                    continue
                if not self._lv3_guard_ok(donor, p, d, shift):
                    continue
                if not self._lv3_guard_ok(p, donor, nd_, pv):
                    continue
                # 시험 적용
                sch.grid[donor.id][d] = Shift.OFF
                sch.grid[p.id][nd_] = Shift.OFF
                ok = (self.can_assign_day(p, d, shift)
                      and self.can_assign_day(donor, nd_, pv))
                if ok:
                    sch.set(p.id, d, shift)
                    sch.set(donor.id, nd_, pv)
                    sch.log(f"[G4-b] {donor.id}({d+1}일 {shift}) ↔ {p.id}({nd_+1}일 {pv}) 맞교환")
                    return True
                sch.grid[donor.id][d] = shift
                sch.grid[p.id][nd_] = pv
        return False

    # ------------------------------------------------------------ Step 7 보완: 전역 탐색
    # fix_alternation(위)은 인접일(±1)만 보고, 그 자리에서 "새 문제를 안 만드는지"를
    # 로컬로만 판단한다 — 실측해보니 검색 폭을 넓히거나 로컬 부작용을 막는 시도 둘 다
    # 오히려 잔여를 늘렸다(문서화된 실험 참고). 대신 여기서는 완전히 별도 단계로,
    # "그 달 전체 아무 날짜"를 상대로 이관/맞교환을 시도하되, 채택 기준을 "이 칸 주변에
    # 새 문제가 생기는지"가 아니라 "전체 고립근무일 수가 늘지 않는지"로 바꾼다 — 국소
    # 판단의 오류(멀리 있는 부작용을 놓치거나, 나중에 사슬로 풀릴 기회를 막는 것) 없이
    # 정확한 전역 기준으로 판단한다. 최선노력이며, 호출 횟수 상한으로 대형 병동 성능을 보호한다.

    def _is_isolated_workday(self, sid: str, d: int) -> bool:
        sch = self.sch
        if not (0 <= d < sch.num_days):
            return False
        if sch.effective(sid, d) not in DAY_WORK_SHIFTS:
            return False
        return (sch.effective(sid, d - 1) in REST_SHIFTS
                and sch.effective(sid, d + 1) in REST_SHIFTS)

    def _is_isolated_2block(self, sid: str, d: int) -> bool:
        """d,d+1 이틀 연속 근무가 앞뒤로 휴무에 둘러싸여 고립된 "2일짜리 블록"인지.

        d+2가 근무이면(3일 이상 블록) 여기 안 걸린다 — 정확히 2일짜리만 잡는다.
        """
        sch = self.sch
        nd = sch.num_days
        if not (0 <= d and d + 1 < nd):
            return False
        if sch.effective(sid, d) not in DAY_WORK_SHIFTS:
            return False
        if sch.effective(sid, d + 1) not in DAY_WORK_SHIFTS:
            return False
        return (sch.effective(sid, d - 1) in REST_SHIFTS
                and sch.effective(sid, d + 2) in REST_SHIFTS)

    def _local_isolation_score(self, cells) -> int:
        """cells(=[(직원id, 날짜), ...]) 주변만 놓고 센 고립근무(1일+2일블록) 개수.

        이관/맞교환은 딱 이 칸들의 근무값만 바꾸므로, 다른 어떤 칸의 고립 여부도
        바뀔 수 없다(1일 고립 판정은 자기 자신과 바로 옆 칸, 2일블록 고립 판정은
        최대 ±2칸까지만 본다) — 그래서 각 칸을 ±2 여유를 두고 넓혀서 확인하면
        이 부분합의 전/후 비교가 전체 보드를 다시 세는 것과 수학적으로 완전히
        같은 결과를 주면서, 대형 병동에서도 빠르다(전체 O(인원×일수) 대신 O(1))."""
        expanded = set()
        for sid, dd in cells:
            for delta in (-2, -1, 0, 1, 2):
                expanded.add((sid, dd + delta))
        score = 0
        for sid, dd in expanded:
            if self._is_isolated_workday(sid, dd):
                score += 1
            if self._is_isolated_2block(sid, dd):
                score += 1
        return score

    def global_fix_alternation(self, max_passes: int = 3, call_budget: int = 4000) -> int:
        """S7 잔여를 추가로 줄이는 전역 마무리 탐색 — fix_alternation이 끝난 뒤 호출."""
        sch = self.sch
        calls = 0
        fixed_total = 0
        for _ in range(max_passes):
            isolated = [(s, d) for s in self.staff if not (s.is_partjang or s.is_nk)
                       for d in range(sch.num_days)
                       if not sch.is_locked(s.id, d) and self._is_isolated_workday(s.id, d)]
            if not isolated:
                break
            any_fixed = False
            for s, d in isolated:
                if calls > call_budget:
                    return fixed_total
                if not self._is_isolated_workday(s.id, d):
                    continue  # 이번 패스 중 이미 다른 조치로 해소됨
                v = sch.get(s.id, d)
                calls += 1
                if self._try_global_transfer(s, d, v) or self._try_global_swap(s, d, v):
                    fixed_total += 1
                    any_fixed = True
            if not any_fixed:
                break
        return fixed_total

    def _try_global_transfer(self, donor: Staff, d: int, shift: Shift) -> bool:
        sch = self.sch
        hol = holiday_count(self.days)
        for r in self.staff:
            if r.id == donor.id or r.is_partjang or r.is_nk:
                continue
            if sch.get(r.id, d) != Shift.OFF or sch.is_locked(r.id, d):
                continue
            if sch.workdays_in_month(r.id) > sch.workdays_in_month(donor.id):
                continue
            if sch.offs_in_month(r.id) - 1 < max(8, hol - 1):
                continue
            if sch.offs_in_month(donor.id) + 1 > hol + 2:
                continue
            if not self._lv3_guard_ok(donor, r, d, shift):
                continue
            cells = [(donor.id, d - 1), (donor.id, d), (donor.id, d + 1),
                    (r.id, d - 1), (r.id, d), (r.id, d + 1)]
            before = self._local_isolation_score(cells)
            sch.grid[donor.id][d] = Shift.OFF
            ok = self.can_assign_day(r, d, shift)
            if ok:
                sch.set(r.id, d, shift)
                if self._local_isolation_score(cells) <= before:
                    sch.log(f"[G4-a 전역] {d+1}일 {shift}: {donor.id} → {r.id} 이관")
                    return True
                sch.grid[r.id][d] = Shift.OFF
            sch.grid[donor.id][d] = shift
        return False

    def _try_global_swap(self, donor: Staff, d: int, shift: Shift) -> bool:
        sch = self.sch
        for nd_ in range(sch.num_days):
            if nd_ == d:
                continue
            for p in self.staff:
                if p.id == donor.id or p.is_partjang or p.is_nk:
                    continue
                pv = sch.get(p.id, nd_)
                if pv not in DAY_WORK_SHIFTS or sch.is_locked(p.id, nd_):
                    continue
                if sch.get(p.id, d) != Shift.OFF or sch.is_locked(p.id, d):
                    continue
                if sch.get(donor.id, nd_) != Shift.OFF or sch.is_locked(donor.id, nd_):
                    continue
                cells = [(donor.id, d - 1), (donor.id, d), (donor.id, d + 1),
                        (p.id, d - 1), (p.id, d), (p.id, d + 1),
                        (donor.id, nd_ - 1), (donor.id, nd_), (donor.id, nd_ + 1),
                        (p.id, nd_ - 1), (p.id, nd_), (p.id, nd_ + 1)]
                before = self._local_isolation_score(cells)
                # Lv3 가드는 O(인원수)라 비용이 크다 — 대형 병동에서 이 이중루프
                # (일수×인원)와 곱해지면 전체가 너무 느려지므로, 훨씬 싼 하드 제약
                # 검사(can_assign_day)를 먼저 통과한 후보에게만 적용해 호출 수를 줄인다.
                sch.grid[donor.id][d] = Shift.OFF
                sch.grid[p.id][nd_] = Shift.OFF
                ok = (self.can_assign_day(p, d, shift)
                      and self.can_assign_day(donor, nd_, pv))
                if ok and self._lv3_guard_ok(donor, p, d, shift) \
                        and self._lv3_guard_ok(p, donor, nd_, pv):
                    sch.set(p.id, d, shift)
                    sch.set(donor.id, nd_, pv)
                    if self._local_isolation_score(cells) <= before:
                        sch.log(f"[G4-b 전역] {donor.id}({d+1}일 {shift}) ↔ "
                                f"{p.id}({nd_+1}일 {pv}) 맞교환")
                        return True
                    sch.grid[p.id][d] = Shift.OFF
                    sch.grid[donor.id][nd_] = Shift.OFF
                sch.grid[donor.id][d] = shift
                sch.grid[p.id][nd_] = pv
        return False

    def global_fix_2blocks(self, max_passes: int = 3, call_budget: int = 4000) -> int:
        """2일짜리 고립 근무블록(O-근무-근무-O)을 인접 휴무일을 근무로 늘려
        3일 이상 블록으로 확장해 고립을 해소한다 — global_fix_alternation 뒤에 호출.
        한 명 고치면 다른 사람 자리(OFF)가 새로 열려 반복하면 더 줄어들 수 있어
        fix_alternation과 같은 방식으로 수렴할 때까지 반복한다."""
        sch = self.sch
        calls = 0
        fixed_total = 0
        for _ in range(max_passes):
            blocks = [(s, d) for s in self.staff if not (s.is_partjang or s.is_nk)
                     for d in range(sch.num_days - 1)
                     if not sch.is_locked(s.id, d) and not sch.is_locked(s.id, d + 1)
                     and self._is_isolated_2block(s.id, d)]
            if not blocks:
                break
            any_fixed = False
            for s, d in blocks:
                if calls > call_budget:
                    return fixed_total
                if not self._is_isolated_2block(s.id, d):
                    continue  # 이번 패스 중 이미 다른 조치로 해소됨
                calls += 1
                if self._try_extend_2block(s, d):
                    fixed_total += 1
                    any_fixed = True
            if not any_fixed:
                break
        return fixed_total

    def _try_extend_2block(self, donor: Staff, d: int) -> bool:
        """d-1(앞) 또는 d+2(뒤) 휴무일 하나를 같은 사람 근무로 바꿔 블록을 늘린다."""
        sch = self.sch
        hol = holiday_count(self.days)
        for ext_d, shift in ((d - 1, sch.get(donor.id, d)),
                            (d + 2, sch.get(donor.id, d + 1))):
            if not (0 <= ext_d < sch.num_days):
                continue
            if sch.get(donor.id, ext_d) != Shift.OFF or sch.is_locked(donor.id, ext_d):
                continue
            if sch.offs_in_month(donor.id) - 1 < max(8, hol - 1):
                continue  # H4-1: 확장하면 본인 OFF 하한이 깨짐
            # 가드는 반드시 칸을 바꾸기 전에(현재 그리드 기준으로) 검사해야 한다 —
            # can_assign_day의 첫 체크(_cell_free)가 "지금 OFF인가"를 보기 때문에,
            # 먼저 값을 바꿔버리면 항상 실패로 나온다.
            if not self.can_assign_day(donor, ext_d, shift):
                continue
            if not self._lv3_guard_ok(None, donor, ext_d, shift):
                continue
            cells = [(donor.id, ext_d)]
            before = self._local_isolation_score(cells)
            sch.grid[donor.id][ext_d] = shift
            if self._local_isolation_score(cells) <= before:
                sch.log(f"[2블록 확장] {donor.id} {ext_d+1}일 OFF→{shift} "
                        f"(고립 2일블록 {d+1}~{d+2}일 해소)")
                return True
            sch.grid[donor.id][ext_d] = Shift.OFF
        return False

    # ------------------------------------------------------------ Step 8 (G6)
    def equalize_off(self):
        sch = self.sch
        hol = holiday_count(self.days)
        upper = hol + 2
        lower = max(8, hol - 1)
        # 1) OFF 부족자(H4-1) 해소 + 균등화: 근무 이관 (S3/S4)
        self._balance_transfers(lower)
        # 2) 그래도 초과인 사람: 추가 근무 배정 (PRN 우선 → D/E, G8)
        for s in self.staff:
            if s.is_partjang or s.is_nk:
                continue
            guard = 0
            while sch.offs_in_month(s.id) > upper and guard < 31:
                guard += 1
                if not self._add_one_workday(s):
                    break
        # 3) 잔여 미달자: 초과 인력 날에서 근무 제거 (최후 수단)
        for s in self.staff:
            if s.is_partjang or s.is_nk:
                continue
            guard = 0
            while sch.offs_in_month(s.id) < lower and guard < 31:
                guard += 1
                if not self._remove_one_workday(s):
                    break

    def _balance_transfers(self, lower: int):
        """OFF가 적은(과로) 사람의 주간근무를 OFF가 많은 사람에게 이관.

        총 근무 슬롯 수는 유지되므로 H1-1에 영향 없음.
        """
        sch = self.sch
        generals = [s for s in self.staff if not (s.is_partjang or s.is_nk)]
        for _ in range(400):
            offs = {s.id: sch.offs_in_month(s.id) for s in generals}
            donors = sorted(generals, key=lambda s: offs[s.id])
            moved = False
            for donor in donors:
                # 하한 미달이거나 편차가 2 초과인 경우만 이관 시도
                max_off = max(offs.values())
                need_fix = offs[donor.id] < lower or \
                    (max_off - offs[donor.id]) > 2
                if not need_fix:
                    continue
                receivers = sorted(
                    [r for r in generals if offs[r.id] > offs[donor.id] + 1],
                    key=lambda r: -offs[r.id])
                if not receivers:
                    continue
                # H4-1(하드) 미달 해소가 S6(소프트) Lv3 유지보다 우선
                allow_lv3_break = offs[donor.id] < lower
                if self._transfer_one_workday(donor, receivers, allow_lv3_break):
                    moved = True
                    break
            if not moved:
                break

    def _transfer_one_workday(self, donor: Staff, receivers: List[Staff],
                              allow_lv3_break: bool = False) -> bool:
        sch = self.sch
        # 주말 근무를 우선 이관 (S5: 주말 OFF 공평분배 개선)
        day_order = sorted(range(sch.num_days),
                           key=lambda d: self.days[d].day_type == DAY_WEEKDAY)
        for d in day_order:
            v = sch.get(donor.id, d)
            if v not in DAY_WORK_SHIFTS or sch.is_locked(donor.id, d):
                continue
            if self._removal_creates_eod(donor.id, d):
                continue
            for r in receivers:
                if sch.get(r.id, d) != Shift.OFF or sch.is_locked(r.id, d):
                    continue
                if not allow_lv3_break and not self._lv3_guard_ok(donor, r, d, v):
                    continue
                sch.grid[donor.id][d] = Shift.OFF
                if self.can_assign_day(r, d, v):
                    sch.set(r.id, d, v)
                    sch.log(f"[G6] {d+1}일 {v}: {donor.id} → {r.id} 이관(잔휴 균등화)")
                    return True
                sch.grid[donor.id][d] = v
        return False

    def _add_one_workday(self, s: Staff) -> bool:
        sch = self.sch
        # OFF 많은 날 중 배정 가능한 날 탐색 (퐁당퐁당 안 만드는 날 우선)
        candidates = []
        for d in range(sch.num_days):
            if sch.get(s.id, d) != Shift.OFF or sch.is_locked(s.id, d):
                continue
            for shift in (Shift.PRN, Shift.D, Shift.E):
                if shift == Shift.PRN:
                    cap = self.min_for(d, "prn") + self.params.prn_cap_extra
                    if sch.count_shift(d, Shift.PRN) >= cap:
                        continue
                if not self.can_assign_day(s, d, shift):
                    continue
                odo = 1 if (sch.effective(s.id, d - 1) in REST_SHIFTS
                            and sch.effective(s.id, d + 1) in REST_SHIFTS) else 0
                pref = 0 if shift == Shift.PRN else 1  # G8: PRN 우선
                over = sch.count_shift(d, shift) - self.min_for(
                    d, "prn" if shift == Shift.PRN else shift.value)
                candidates.append((odo, pref, over, d, shift))
        if not candidates:
            return False
        candidates.sort()
        _, _, _, d, shift = candidates[0]
        sch.set(s.id, d, shift)
        sch.log(f"[G6] {s.id}: OFF 초과 → {d+1}일 {shift} 추가 배정")
        return True

    def _remove_one_workday(self, s: Staff) -> bool:
        sch = self.sch
        for d in range(sch.num_days):
            v = sch.get(s.id, d)
            if v not in DAY_WORK_SHIFTS or sch.is_locked(s.id, d):
                continue
            key = "prn" if v == Shift.PRN else v.value
            if sch.count_shift(d, v) - 1 < self.min_for(d, key):
                continue  # 최소인력 붕괴 금지 (H1-1)
            if not self._lv3_guard_ok(s, None, d, v):
                continue
            if self._removal_creates_eod(s.id, d):
                continue
            sch.grid[s.id][d] = Shift.OFF
            sch.log(f"[G6] {s.id}: OFF 부족 → {d+1}일 {v} 제거")
            return True
        return False

    def _removal_creates_eod(self, sid: str, d: int) -> bool:
        """이 칸을 비우면(OFF) E-O-D(EOD, H6-3) 패턴이 새로 생기는지."""
        sch = self.sch
        return (sch.effective(sid, d - 1) == Shift.E
                and sch.effective(sid, d + 1) == Shift.D)

    # ------------------------------------------------------------ Step 9 (G7)
    def split_long_offs(self):
        sch = self.sch
        nd = sch.num_days
        for s in self.staff:
            if s.is_partjang or s.is_nk:
                continue
            d = 0
            while d < nd:
                if sch.get(s.id, d) not in REST_SHIFTS:
                    d += 1
                    continue
                start = d
                while d < nd and sch.get(s.id, d) in REST_SHIFTS:
                    d += 1
                end = d - 1
                if end - start + 1 >= 5:
                    self._break_off_run(s, start, end)

    def _break_off_run(self, s: Staff, start: int, end: int) -> bool:
        """연속 OFF 중간일로 다른 날 근무 1개를 이동 (총 OFF 개수 유지)."""
        sch = self.sch
        mid = (start + end) // 2
        targets = sorted(range(start + 1, end),
                         key=lambda x: abs(x - mid))
        for m in targets:
            if sch.get(s.id, m) != Shift.OFF or sch.is_locked(s.id, m):
                continue
            for w in range(sch.num_days):
                if w == m:
                    continue
                v = sch.get(s.id, w)
                if v not in DAY_WORK_SHIFTS or sch.is_locked(s.id, w):
                    continue
                key = "prn" if v == Shift.PRN else v.value
                if sch.count_shift(w, v) - 1 < self.min_for(w, key):
                    continue
                if not self._lv3_guard_ok(s, None, w, v):
                    continue
                if self._removal_creates_eod(s.id, w):
                    continue
                sch.grid[s.id][w] = Shift.OFF
                if self.can_assign_day(s, m, v):
                    sch.set(s.id, m, v)
                    sch.log(f"[G7] {s.id}: 장기 OFF 분할 — {w+1}일 {v}를 {m+1}일로 이동")
                    return True
                sch.grid[s.id][w] = v
        sch.log(f"[G7] {s.id}: {start+1}~{end+1}일 연속 OFF 분할 실패")
        return False

    # ------------------------------------------------------------ carryover 출력
    def build_next_carryover(self) -> Dict[str, dict]:
        out = {}
        nd = self.sch.num_days
        for s in self.staff:
            grid = self.sch.grid[s.id]
            last = grid[nd - 1] or Shift.OFF
            run = self.sch.work_run_ending(s.id, nd - 1) \
                if last in WORK_SHIFTS else 0
            trailing = 0
            d = nd - 1
            while d >= 0 and grid[d] in NIGHT_SHIFTS:
                trailing += 1
                d -= 1
            remaining_off = 0
            if trailing >= 2:
                remaining_off = 2
            elif trailing == 0:
                # 야간블록 종료 후 OFF가 1일만 확보된 채 월이 끝난 경우
                if nd >= 2 and grid[nd - 1] in REST_SHIFTS \
                        and grid[nd - 2] in NIGHT_SHIFTS:
                    blk = 1
                    dd = nd - 3
                    while dd >= 0 and grid[dd] in NIGHT_SHIFTS:
                        blk += 1
                        dd -= 1
                    if blk >= 2:
                        remaining_off = 1
            old_score = self.sch.carryover[s.id].recent_night_score
            this_month_nights = self.sch.nights_in_month(s.id)
            # 잔휴(정상 오프 누적잔액) = 전월 잔휴 + (이번달 휴일수 - 이번달 순수오프일수).
            # 순수오프는 문자 그대로 OFF(원티드="X"/일반="/")로 찍힌 칸만 세고, 연차/공가/
            # 조사/S//군 등 다른 휴가유형은 반영하지 않는다(실측 검증된 병원 공식).
            old_off_balance = self.sch.carryover[s.id].off_balance
            this_month_offs = self.sch.offs_in_month(s.id)
            out[s.id] = {
                "last_shift_type": str(last),
                "consecutive_work_days": run,
                "night_block_remaining_off": remaining_off,
                "night_block_in_progress": trailing == 1,
                "trailing_night_count": trailing,
                # 최근 몇 달 야간 누적을 감쇠 이동평균으로 근사(대략 최근 3개월 비중)
                # — 야간을 적게 받은 사람이 다음 몇 달간 우선권을 갖도록 함(S2 장기화).
                "recent_night_score": round(old_score * (2 / 3) + this_month_nights, 2),
                "off_balance": round(old_off_balance + holiday_count(self.days) - this_month_offs, 2),
            }
        return out

    # ------------------------------------------------------------ 실행
    def run(self) -> MonthSchedule:
        self._rebuild_calls = 0
        self.compute_senior_thresholds()  # S6 근무유형별 상대 고랩 기준선
        self.compute_night_targets()  # H6-4 개인별 월 목표(4/6일) 산정
        self.validate_input()      # Step 0
        self.apply_fixed()         # Step 0.5: 리더 수정분 고정 (재생성 모드)
        self.complete_partial_night_blocks()
        self.apply_carryover()     # Step 1
        self.assign_partjang()     # Step 2
        self.assign_nk()           # Step 3
        self.apply_requests()      # Step 4
        self.complete_partial_night_blocks()  # 신청된 단독 야간 블록 보완 (H2-4)
        self.assign_nights()       # Step 5
        self.fill_day_shifts()     # Step 6
        self.finalize_offs()
        self.repair_min_staff()    # H1-1 미달 수리
        for _ in range(5):         # Step 7 — 한 명 고치면 다른 사람 자리가 열려 반복하면 더 줄어듦
            if self.fix_alternation() == 0:
                break
        for _ in range(5):         # Step 7b — 1~2일 단기블록을 3~4일로 확장(H6-1)
            if self.fix_short_day_blocks() == 0:
                break
        self.equalize_off()        # Step 8
        self.split_long_offs()     # Step 9
        # 수리 ↔ 균등화 반복: 균등화가 만든 빈 자리를 수리가 활용 (Step 10 사전)
        for _ in range(4):
            self.equalize_off()
            self.repair_min_staff()
            if self.count_deficits() == 0:
                break
        self.equalize_off()        # 수리로 생긴 편중 재조정 (일별 인원수 보존)
        for _ in range(5):         # 최종 퐁당퐁당 완화 (G4 재실행, 수렴까지 반복)
            if self.fix_alternation() == 0:
                break
        for _ in range(5):         # 최종 단기블록 확장(H6-1) 재실행
            if self.fix_short_day_blocks() == 0:
                break
        self.global_fix_alternation()  # 인접일 검색으로 못 줄인 잔여를 전역 탐색으로 마무리
        self.global_fix_2blocks()      # 2일짜리 고립 블록도 확장해서 마무리
        self.global_fix_alternation()  # 2블록 확장 과정에서 새 1일 고립이 생겼을 수 있어 재정리
        return self.sch


# 월경계 등에서 로컬 수리만으로는 구조적으로 0건을 보장하기 어려운 최선노력 하드
# 규칙 — 이 규칙들만 남으면 재시도를 멈춘다(계속 시도해도 거의 안 줄어들어 시간만 소모).
_BEST_EFFORT_RULES = {"H6-1", "H6-4", "H4-1"}


def generate_best(config: dict,
                  fixed_cells: Optional[Dict[Tuple[str, int], Shift]] = None,
                  attempts: int = 24,
                  time_budget: float = 120.0) -> Tuple["Generator", MonthSchedule]:
    """하드 위반이 남으면 탐색 순서를 바꿔 재시도하고 최선의 결과를 반환 (Step 10).

    _BEST_EFFORT_RULES를 제외한 하드 규칙이 전부 0건이면 그 시점에서 반환한다
    (아래 설명 참고).

    time_budget(초)을 넘기면 남은 재시도를 중단하고 현재 최선을 반환한다
    (병리적으로 빡빡한 입력에서 무한정 걸리는 것 방지).
    """
    import time as _time
    from .constraints import all_hard_checks
    t0 = _time.time()
    best = None  # (gen, sch, n_hard, n_strict)
    tried = 0
    for i in range(attempts):
        tried = i + 1
        gen = Generator(config, fixed_cells=fixed_cells, seed=i)
        sch = gen.run()
        violations = all_hard_checks(sch, gen.days, gen.params)
        n_hard = len(violations)
        n_strict = sum(1 for v in violations if v.rule not in _BEST_EFFORT_RULES)
        if n_hard == 0:
            if i:
                sch.log(f"[재시도] {i+1}번째 시도에서 하드 위반 0건 달성")
            return gen, sch
        if best is None or (n_strict, n_hard) < (best[3], best[2]):
            best = (gen, sch, n_hard, n_strict)
        if n_strict == 0:
            sch.log(f"[재시도] {i+1}번째 시도에서 필수 하드 위반 0건 — "
                    f"최선노력 규칙(H6-1/H6-4) 잔여 {n_hard}건만 남아 반환")
            return gen, sch
        if _time.time() - t0 > time_budget:
            break
    gen, sch, n_hard, n_strict = best
    sch.log(f"[재시도] {tried}회 시도 후에도 하드 위반 {n_hard}건 잔존"
            f"(그중 필수 위반 {n_strict}건) — 최선 결과 반환"
            + (f" (시간 예산 {time_budget:.0f}초 소진)"
               if _time.time() - t0 > time_budget else ""))
    return gen, sch


# ---------------------------------------------------------------- 지난달 그리드 → 이월값 역산
def carryover_from_grid(grid: Dict[str, List[str]], num_days: int) -> Dict[str, dict]:
    """지난달 확정 근무표(그리드, 문자열 근무코드)만으로 이번 달 전월이월값을 역산.

    Generator.build_next_carryover()와 동일한 계산이나, 그 달의 전월이월 정보 없이
    그리드 자체의 말일 상태만으로 계산한다(월 전체가 근무로 채워진 극단적인 경우
    연속근무일수가 실제보다 짧게 나올 수 있음 — 흔치 않은 근사).
    """
    out: Dict[str, dict] = {}
    for sid, raw_row in grid.items():
        row = [parse_shift(v) for v in raw_row]
        nd = num_days
        last = row[nd - 1] if nd else Shift.OFF
        run = 0
        d = nd - 1
        while d >= 0 and row[d] in WORK_SHIFTS:
            run += 1
            d -= 1
        trailing = 0
        d = nd - 1
        while d >= 0 and row[d] in NIGHT_SHIFTS:
            trailing += 1
            d -= 1
        remaining_off = 0
        if trailing >= 2:
            remaining_off = 2
        elif trailing == 0:
            if nd >= 2 and row[nd - 1] in REST_SHIFTS and row[nd - 2] in NIGHT_SHIFTS:
                blk = 1
                dd = nd - 3
                while dd >= 0 and row[dd] in NIGHT_SHIFTS:
                    blk += 1
                    dd -= 1
                if blk >= 2:
                    remaining_off = 1
        this_month_nights = sum(1 for v in row if v in NIGHT_SHIFTS)
        out[sid] = {
            "last_shift_type": str(last),
            "consecutive_work_days": run,
            "night_block_remaining_off": remaining_off,
            "night_block_in_progress": trailing == 1,
            "trailing_night_count": trailing,
            # 그리드 한 장만으로는 그 이전 달의 recent_night_score를 알 수 없으므로
            # 이번 달 실적만으로 새로 시작한다(그래도 0으로 두는 것보다는 근사가 낫다).
            "recent_night_score": float(this_month_nights),
        }
    return out


# ---------------------------------------------------------------- 연간근무표 → 이월값 역산
def carryover_from_staff_table(annual_dates: List[str], annual_grid: Dict[str, List[str]],
                               year: int, month: int) -> Dict[str, dict]:
    """'연간근무표'의 연간 그리드에서 직전 달 구간만 잘라 carryover_from_grid로 역산.

    annual_dates에 직전 달 1일~말일이 빠짐없이 이어져 있는 경우에만 계산하고,
    아직 그만큼 안 쌓였거나 중간에 구멍이 있으면 빈 dict를 돌려준다(호출 쪽에서
    이월 없이 진행하거나 다른 값으로 채우면 됨).
    """
    import calendar as _cal
    import datetime as _dt
    py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
    ndays = _cal.monthrange(py, pm)[1]
    prev_dates = [_dt.date(py, pm, d).isoformat() for d in range(1, ndays + 1)]
    try:
        idxs = [annual_dates.index(d) for d in prev_dates]
    except ValueError:
        return {}
    if idxs != list(range(idxs[0], idxs[0] + ndays)):
        return {}
    start = idxs[0]
    sliced = {sid: row[start:start + ndays] for sid, row in annual_grid.items()
             if len(row) >= start + ndays}
    return carryover_from_grid(sliced, ndays)
