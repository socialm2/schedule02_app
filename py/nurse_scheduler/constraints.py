# -*- coding: utf-8 -*-
"""제약 검증기 (설계서 §1 하드, §2 소프트).

배정 로직(generator)과 검증 리포트(Step 10)가 같은 함수를 재사용한다(부록 B).
모든 검증은 '완성된 grid'(None 없음)를 전제로 한다.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .calendar_utils import DayInfo, DAY_WEEKDAY, holiday_count, min_staff_for
from .models import (
    MonthSchedule, Shift, Staff, Violation,
    NIGHT_SHIFTS, REST_SHIFTS, WORK_SHIFTS,
)


def night_blocks(sch: MonthSchedule, sid: str) -> List[tuple]:
    """(start, end) 야간블록 목록 (0-based, 양끝 포함). 전월 이월분은 start<0로 표현."""
    blocks = []
    d = 0
    nd = sch.num_days
    grid = sch.grid[sid]
    co = sch.carryover[sid]
    while d < nd:
        if grid[d] in NIGHT_SHIFTS:
            start = d
            while d + 1 < nd and grid[d + 1] in NIGHT_SHIFTS:
                d += 1
            end = d
            if start == 0 and co.trailing_night_count > 0:
                start = -co.trailing_night_count  # 전월 이월 연결
            blocks.append((start, end))
        d += 1
    # 월초 시작 전 이월블록이 이번달에 야간 없이 끝난 경우는 검증 대상 아님
    return blocks


# ---------------------------------------------------------------- 하드 제약

def check_h1_min_staff(sch: MonthSchedule, days: List[DayInfo],
                       min_cfg: Dict) -> List[Violation]:
    out = []
    for d, di in enumerate(days):
        mins = min_staff_for(di, min_cfg)
        for key, shift in (("D", Shift.D), ("E", Shift.E),
                           ("N", Shift.N), ("prn", Shift.PRN)):
            have = sch.count_shift(d, shift)
            need = mins.get(key, 0)
            if have < need:
                out.append(Violation(
                    "H1-1", "hard",
                    f"{d+1}일 {key} 인원 {have}명 < 최소 {need}명", day=d))
    return out


def check_h1_shift_rules(sch: MonthSchedule, days: List[DayInfo],
                         leader_8a_as_prn: bool) -> List[Violation]:
    out = []
    for s in sch.staff:
        for d, di in enumerate(days):
            v = sch.grid[s.id][d]
            if v == Shift.A8:
                if not di.allows_8a:
                    out.append(Violation("H1-2", "hard",
                                         f"{s.id} {d+1}일 8A는 평일만 가능",
                                         staff_id=s.id, day=d))
                if s.is_leader and not leader_8a_as_prn:
                    out.append(Violation("H1-2", "hard",
                                         f"{s.id}(리더) 8A 운용 미설정 병동",
                                         staff_id=s.id, day=d))
                if not (s.is_partjang or s.is_leader):
                    out.append(Violation("H1-2", "hard",
                                         f"{s.id} 8A는 파트장/리더 전용",
                                         staff_id=s.id, day=d))
            if v is not None and v not in REST_SHIFTS:
                allowed = v in s.allowed_shifts or \
                    (v == Shift.A8 and s.is_leader and leader_8a_as_prn)
                if not allowed:
                    out.append(Violation("H1-3", "hard",
                                         f"{s.id} {d+1}일 {v} 허용범위 밖",
                                         staff_id=s.id, day=d))
    return out


def check_h2_nk_quota(sch: MonthSchedule) -> List[Violation]:
    out = []
    target = 14 if sch.month == 2 else 15
    for s in sch.staff:
        if s.is_nk:
            n = sch.nights_in_month(s.id)
            if n != target:
                out.append(Violation(
                    "H2-2", "hard",
                    f"NK {s.id} 야간 {n}일 (목표 {target}일)", staff_id=s.id))
    return out


def check_h2_night_blocks(sch: MonthSchedule) -> List[Violation]:
    """H2-3(≤3), H2-4(≥2, 월말 단독 예외), H2-5(블록≥2 후 OFF 2일)."""
    out = []
    nd = sch.num_days
    for s in sch.staff:
        for (start, end) in night_blocks(sch, s.id):
            length = end - start + 1
            if length > 3:
                out.append(Violation("H2-3", "hard",
                                     f"{s.id} 야간 연속 {length}일 (>3)",
                                     staff_id=s.id, day=max(start, 0)))
            if length < 2 and end != nd - 1:
                out.append(Violation("H2-4", "hard",
                                     f"{s.id} {end+1}일 단독 야간(월말 아님)",
                                     staff_id=s.id, day=end))
            if length >= 2:
                for k in (1, 2):
                    d = end + k
                    if d < nd and sch.grid[s.id][d] not in REST_SHIFTS:
                        out.append(Violation(
                            "H2-5", "hard",
                            f"{s.id} 야간블록({end+1}일 종료) 후 {d+1}일 휴식 미확보",
                            staff_id=s.id, day=d))
    return out


def check_h2_night_cap(sch: MonthSchedule, base_cap: int) -> List[Violation]:
    out = []
    for s in sch.staff:
        if s.is_nk or s.is_partjang:
            continue
        n = sch.nights_in_month(s.id)
        cap = sch.night_cap(s.id, base_cap)
        if n > cap:
            out.append(Violation("H2-6", "hard",
                                 f"{s.id} 월 야간 {n}일 > 상한 {cap}일",
                                 staff_id=s.id))
        # n > base_cap 이지만 cap 이내인 경우는 H2-9 완화 적용분 — sch.logs에 기록됨
    return out


def check_h2_no_night(sch: MonthSchedule) -> List[Violation]:
    out = []
    for s in sch.staff:
        if not s.no_night:
            continue
        for d, v in enumerate(sch.grid[s.id]):
            if v in NIGHT_SHIFTS:
                out.append(Violation("H2-7", "hard",
                                     f"{s.id}(야간불가) {d+1}일 {v} 배정",
                                     staff_id=s.id, day=d))
    return out


def check_h2_patterns(sch: MonthSchedule) -> List[Violation]:
    """H2-8 금지패턴: ND/NE/N-8A/N-prn, NOD류, ONO. N=NK 포함."""
    out = []
    nd = sch.num_days
    day_work = {Shift.D, Shift.E, Shift.A8, Shift.PRN}
    for s in sch.staff:
        for d in range(nd):
            cur = sch.effective(s.id, d)
            p1 = sch.effective(s.id, d - 1)
            p2 = sch.effective(s.id, d - 2)
            if p1 in NIGHT_SHIFTS and cur in day_work:
                out.append(Violation("H2-8", "hard",
                                     f"{s.id} {d+1}일 N→{cur} 패턴",
                                     staff_id=s.id, day=d))
            if p2 in NIGHT_SHIFTS and p1 in REST_SHIFTS and cur in day_work:
                out.append(Violation("H2-8", "hard",
                                     f"{s.id} {d+1}일 N-O-{cur} 패턴",
                                     staff_id=s.id, day=d))
            # ONO: 단독야간이 휴무 사이에 낀 경우 (월말 단독은 다음날이 없어 제외)
            if (cur in NIGHT_SHIFTS and d + 1 < nd
                    and sch.effective(s.id, d - 1) in REST_SHIFTS
                    and sch.effective(s.id, d + 1) in REST_SHIFTS):
                # 전월에서 이어진 블록이면 단독이 아님
                if not (d == 0 and sch.carryover[s.id].trailing_night_count > 0):
                    out.append(Violation("H2-8", "hard",
                                         f"{s.id} {d+1}일 O-N-O 패턴",
                                         staff_id=s.id, day=d))
    return out


def check_h3_consecutive(sch: MonthSchedule) -> List[Violation]:
    out = []
    for s in sch.staff:
        for d in range(sch.num_days):
            if sch.effective(s.id, d) in WORK_SHIFTS:
                run = sch.work_run_ending(s.id, d)
                if run > 5:
                    out.append(Violation("H3-1", "hard",
                                         f"{s.id} {d+1}일 기준 연속근무 {run}일 (>5)",
                                         staff_id=s.id, day=d))
    return out


def check_h3_links(sch: MonthSchedule) -> List[Violation]:
    out = []
    for s in sch.staff:
        for d in range(1, sch.num_days):
            p = sch.effective(s.id, d - 1)
            c = sch.effective(s.id, d)
            if p == Shift.E and c in (Shift.D, Shift.PRN):
                out.append(Violation("H3-2", "hard",
                                     f"{s.id} {d+1}일 E→{c} 연결 금지",
                                     staff_id=s.id, day=d))
    return out


def check_h4_min_off(sch: MonthSchedule, days: List[DayInfo]) -> List[Violation]:
    out = []
    lower = max(8, holiday_count(days) - 1)
    for s in sch.staff:
        if s.is_partjang or s.is_nk:
            continue
        off = sch.offs_in_month(s.id)
        if off < lower:
            out.append(Violation("H4-1", "hard",
                                 f"{s.id} 월 OFF {off}일 < 하한 {lower}일",
                                 staff_id=s.id))
    return out


def check_h5_carryover(sch: MonthSchedule) -> List[Violation]:
    out = []
    for s in sch.staff:
        co = sch.carryover[s.id]
        for k in range(co.night_block_remaining_off):
            if k < sch.num_days and sch.grid[s.id][k] not in REST_SHIFTS:
                out.append(Violation("H5-1", "hard",
                                     f"{s.id} 전월 야간 후 이월 OFF({k+1}일) 미확보",
                                     staff_id=s.id, day=k))
        if co.trailing_night_count == 1:
            # H5-2: 월말 단독야간 → 이번달 1일부터 이어 2~3일 블록 완성
            if sch.num_days > 0 and sch.grid[s.id][0] not in NIGHT_SHIFTS:
                out.append(Violation("H5-2", "hard",
                                     f"{s.id} 전월 말 단독야간 미연결(1일 야간 아님)",
                                     staff_id=s.id, day=0))
    return out


def all_hard_checks(sch: MonthSchedule, days: List[DayInfo], params) -> List[Violation]:
    out: List[Violation] = []
    out += check_h1_min_staff(sch, days, params.min_staff)
    out += check_h1_shift_rules(sch, days, params.leader_8a_as_prn)
    out += check_h2_nk_quota(sch)
    out += check_h2_night_blocks(sch)
    out += check_h2_night_cap(sch, params.max_nights)
    out += check_h2_no_night(sch)
    out += check_h2_patterns(sch)
    out += check_h3_consecutive(sch)
    out += check_h3_links(sch)
    out += check_h4_min_off(sch, days)
    out += check_h5_carryover(sch)
    return out


# ---------------------------------------------------------------- 소프트 제약

def _spread(values: List[int]) -> int:
    return (max(values) - min(values)) if values else 0


def check_soft(sch: MonthSchedule, days: List[DayInfo], params) -> List[Violation]:
    out: List[Violation] = []
    nd = sch.num_days
    generals = [s for s in sch.staff if not (s.is_partjang or s.is_nk)]
    night_eligible = [s for s in generals if s.can(Shift.N)]

    # S1: 일반 야간블록 간격 하한 7일
    for s in night_eligible:
        blocks = night_blocks(sch, s.id)
        for i in range(1, len(blocks)):
            gap = blocks[i][0] - blocks[i - 1][1] - 1
            if gap < 7:
                out.append(Violation("S1", "soft",
                                     f"{s.id} 야간블록 간격 {gap}일 (<7)",
                                     staff_id=s.id, day=blocks[i][0]))

    # S2/S3/S4/S5: 균등분배 지표 (편차 2 초과 시 soft 위반으로 기록)
    if night_eligible:
        sp = _spread([sch.nights_in_month(s.id) for s in night_eligible])
        if sp > 2:
            out.append(Violation("S2", "soft", f"야간 횟수 편차 {sp}일 (>2)"))
    if generals:
        sp = _spread([sch.offs_in_month(s.id) for s in generals])
        if sp > 2:
            out.append(Violation("S3", "soft", f"OFF 편차 {sp}일 (>2)"))
        sp = _spread([sch.workdays_in_month(s.id) for s in generals])
        if sp > 2:
            out.append(Violation("S4", "soft", f"총 근무일수 편차 {sp}일 (>2)"))
        weekend_days = [d for d, di in enumerate(days) if di.day_type != DAY_WEEKDAY]
        if weekend_days:
            woffs = [sum(1 for d in weekend_days
                         if sch.effective(s.id, d) in REST_SHIFTS)
                     for s in generals]
            sp = _spread(woffs)
            if sp > 2:
                out.append(Violation("S5", "soft", f"주말 OFF 편차 {sp}일 (>2)"))

    # S6: D/E/prn/N(확장) 각 근무 Lv3+ 최소 1명
    for d in range(nd):
        for key, shift in (("D", Shift.D), ("E", Shift.E),
                           ("prn", Shift.PRN), ("N", Shift.N)):
            workers = []
            for s in sch.staff:
                if s.is_partjang:
                    continue
                v = sch.grid[s.id][d]
                if shift == Shift.N and v in NIGHT_SHIFTS:
                    workers.append(s)
                elif shift == Shift.PRN and (
                        v == Shift.PRN or (v == Shift.A8 and (s.id, d) in sch.leader_8a)):
                    workers.append(s)
                elif shift not in (Shift.N, Shift.PRN) and v == shift:
                    workers.append(s)
            if workers and not any(s.level >= 3 for s in workers):
                out.append(Violation("S6", "soft",
                                     f"{d+1}일 {key} Lv3+ 없음", day=d))

    # S7: 퐁당퐁당 (O-근무-O)
    for s in generals:
        for d in range(nd):
            cur = sch.effective(s.id, d)
            if (cur in WORK_SHIFTS and cur not in NIGHT_SHIFTS
                    and sch.effective(s.id, d - 1) in REST_SHIFTS
                    and sch.effective(s.id, d + 1) in REST_SHIFTS):
                boundary = (d == 0 or d == nd - 1)
                out.append(Violation("S7", "soft",
                                     f"{s.id} {d+1}일 O-{cur}-O 퐁당퐁당"
                                     + (" (월경계)" if boundary else " (월중)"),
                                     staff_id=s.id, day=d))

    # S7-2: 2일짜리 고립 근무블록 (O-근무-근무-O)
    for s in generals:
        for d in range(nd - 1):
            cur = sch.effective(s.id, d)
            nxt = sch.effective(s.id, d + 1)
            if (cur in WORK_SHIFTS and cur not in NIGHT_SHIFTS
                    and nxt in WORK_SHIFTS and nxt not in NIGHT_SHIFTS
                    and sch.effective(s.id, d - 1) in REST_SHIFTS
                    and sch.effective(s.id, d + 2) in REST_SHIFTS):
                boundary = (d == 0 or d + 1 == nd - 1)
                out.append(Violation("S7-2", "soft",
                                     f"{s.id} {d+1}~{d+2}일 O-{cur}{nxt}-O 2일블록 고립"
                                     + (" (월경계)" if boundary else " (월중)"),
                                     staff_id=s.id, day=d))

    # S8: 신청 OFF 전날 야간 배제
    for (sid, d) in sorted(sch.requested_off):
        if d - 1 >= 0 and sch.effective(sid, d - 1) in NIGHT_SHIFTS:
            out.append(Violation("S8", "soft",
                                 f"{sid} 신청 OFF({d+1}일) 전날 야간 배정",
                                 staff_id=sid, day=d - 1))

    # S9: 일반 야간 3일 블록 수 (2일 우선 권장 — 정보성)
    three = sum(1 for s in night_eligible
                for (a, b) in night_blocks(sch, s.id) if b - a + 1 >= 3)
    if three:
        out.append(Violation("S9", "info", f"일반 간호사 3일 야간블록 {three}건 (2일 우선 권장)"))

    return out
