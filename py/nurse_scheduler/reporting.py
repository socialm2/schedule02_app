# -*- coding: utf-8 -*-
"""Step 10 검증 리포트 (설계서 §6)."""
from __future__ import annotations

from typing import Dict, List

from .calendar_utils import DayInfo, DAY_WEEKDAY, holiday_count
from .constraints import all_hard_checks, check_soft, night_blocks
from .models import (
    MonthSchedule, Request, Shift, Violation,
    NIGHT_SHIFTS, REST_SHIFTS, WORK_SHIFTS,
)


def build_report(sch: MonthSchedule, days: List[DayInfo], params,
                 requests: List[Request]) -> dict:
    hard = all_hard_checks(sch, days, params)
    soft = check_soft(sch, days, params)
    hol = holiday_count(days)
    lower, upper = max(8, hol - 1), hol + 2

    per_person = []
    for s in sch.staff:
        off = sch.offs_in_month(s.id)
        entry = {
            "id": s.id, "role": s.role, "level": s.level,
            "off": off,
            "off_ok": (s.is_partjang or s.is_nk) or (lower <= off <= upper),
            "annual_leave": sch.als_in_month(s.id),   # §6-2 연차 별도 카운트
            "nights": sch.nights_in_month(s.id),
            "workdays": sch.workdays_in_month(s.id),
            "weekend_off": sum(
                1 for d, di in enumerate(days)
                if di.day_type != DAY_WEEKDAY
                and sch.effective(s.id, d) in REST_SHIFTS),
        }
        per_person.append(entry)

    daily = []
    for d, di in enumerate(days):
        mins = params.min_staff[di.day_type]
        counts = {k: sch.count_shift(d, sh) for k, sh in
                  (("D", Shift.D), ("E", Shift.E), ("N", Shift.N),
                   ("prn", Shift.PRN))}
        lv_avgs = {}
        for k, sh in (("D", Shift.D), ("E", Shift.E), ("N", Shift.N),
                      ("prn", Shift.PRN)):
            levels = []
            for s in sch.staff:
                if s.is_partjang:
                    continue
                v = sch.grid[s.id][d]
                if (sh == Shift.N and v in NIGHT_SHIFTS) or \
                   (sh == Shift.PRN and (v == Shift.PRN or (
                       v == Shift.A8 and (s.id, d) in sch.leader_8a))) or \
                   (sh in (Shift.D, Shift.E) and v == sh):
                    levels.append(s.level)
            lv_avgs[k] = round(sum(levels) / len(levels), 2) if levels else None
        daily.append({
            "day": d + 1, "type": di.day_type, "counts": counts,
            "min": mins, "ok": all(counts[k] >= mins.get(k, 0) for k in counts),
            "level_avg": lv_avgs,
        })

    # 야간 히스토그램 (§6-7)
    block_lengths: Dict[int, int] = {}
    gaps: Dict[int, int] = {}
    for s in sch.staff:
        if s.is_partjang:
            continue
        blocks = night_blocks(sch, s.id)
        for (a, b) in blocks:
            L = b - a + 1
            block_lengths[L] = block_lengths.get(L, 0) + 1
        if not s.is_nk:
            for i in range(1, len(blocks)):
                g = blocks[i][0] - blocks[i - 1][1] - 1
                gaps[g] = gaps.get(g, 0) + 1

    accepted = [r for r in requests if r.accepted]
    rejected = [r for r in requests if r.accepted is False]

    return {
        "hard_violations": [_v(v) for v in hard],
        "soft_violations": [_v(v) for v in soft if v.severity == "soft"],
        "info": [_v(v) for v in soft if v.severity == "info"],
        "off_range": {"lower": lower, "upper": upper, "holidays": hol},
        "per_person": per_person,
        "daily": daily,
        "night_block_length_hist": block_lengths,
        "night_gap_hist": gaps,
        "requests": {
            "total": len(requests),
            "accepted": len(accepted),
            "rate": round(len(accepted) / len(requests), 3) if requests else None,
            "rejected": [
                {"staff_id": r.staff_id, "date": r.date, "type": str(r.type),
                 "reason": r.reject_reason} for r in rejected],
        },
        "logs": sch.logs,
    }


def _v(v: Violation) -> dict:
    return {"rule": v.rule, "severity": v.severity, "message": v.message,
            "staff_id": v.staff_id,
            "day": (v.day + 1) if v.day is not None else None}


def format_text_report(report: dict, year: int, month: int) -> str:
    L: List[str] = []
    L.append(f"===== {year}년 {month}월 근무표 검증 리포트 =====\n")

    hv = report["hard_violations"]
    L.append(f"■ 하드 제약 위반: {len(hv)}건" + (" ★★★ 확인 필요 ★★★" if hv else " (통과)"))
    for v in hv:
        L.append(f"  - [{v['rule']}] {v['message']}")
    L.append("")

    sv = report["soft_violations"]
    L.append(f"■ 소프트 제약 위반: {len(sv)}건")
    for v in sv:
        L.append(f"  - [{v['rule']}] {v['message']}")
    L.append("")

    orng = report["off_range"]
    L.append(f"■ 개인별 집계 (OFF 허용범위 {orng['lower']}~{orng['upper']}일, "
             f"휴일수 {orng['holidays']}일)")
    L.append(f"  {'이름':<10}{'역할':<6}{'Lv':>3}{'OFF':>5}{'연차':>5}"
             f"{'야간':>5}{'근무':>5}{'주말OFF':>7}")
    for p in report["per_person"]:
        mark = "" if p["off_ok"] else "  ← OFF 범위 밖"
        L.append(f"  {p['id']:<10}{p['role']:<6}{p['level']:>3}{p['off']:>5}"
                 f"{p['annual_leave']:>5}{p['nights']:>5}{p['workdays']:>5}"
                 f"{p['weekend_off']:>7}{mark}")
    L.append("")

    bad_days = [d for d in report["daily"] if not d["ok"]]
    L.append(f"■ 일별 최소인력: {'전일 충족' if not bad_days else f'{len(bad_days)}일 미달'}")
    for d in bad_days:
        L.append(f"  - {d['day']}일({d['type']}): {d['counts']} < {d['min']}")
    L.append("")

    L.append(f"■ 야간블록 길이 분포: {report['night_block_length_hist']}")
    L.append(f"■ 야간블록 간격 분포(일반): {report['night_gap_hist']}")
    L.append("")

    rq = report["requests"]
    if rq["total"]:
        L.append(f"■ 원티드 반영: {rq['accepted']}/{rq['total']}건 "
                 f"(반영률 {rq['rate'] * 100:.0f}%)")
        for r in rq["rejected"]:
            L.append(f"  - 반려: {r['staff_id']} {r['date']} {r['type']} — {r['reason']}")
    else:
        L.append("■ 원티드 신청 없음")
    L.append("")

    if report["logs"]:
        L.append("■ 처리 로그")
        for lg in report["logs"]:
            L.append(f"  {lg}")
    return "\n".join(L) + "\n"
