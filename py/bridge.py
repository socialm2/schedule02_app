# -*- coding: utf-8 -*-
"""브라우저(Pyodide) 전용 브릿지.

webapp/app.py의 Flask 라우트 로직을 그대로 옮기되, HTTP 대신 JS에서 직접 호출하는
평범한 함수로 노출한다. 모든 함수는 JSON 문자열을 인자로 받고 JSON 문자열을
반환한다(다운로드용 바이너리 함수만 예외). 성공/실패는 HTTP 상태 코드 대신
반환 JSON에 "error" 키가 있는지로 구분한다 — JS 쪽 api() 어댑터가 이 규약을 안다.

로컬 파일 시스템이 없으므로(브라우저), 웹앱의 webapp/history/*.json 파일 저장은
브라우저 localStorage로 대체한다. 그 외 로직(생성/편집/피드백/재생성/누적 원장)은
webapp/app.py와 완전히 동일하다.

이 모듈은 Web Worker 안에서 실행되므로(메인 스레드가 생성 계산 중 멈추지 않게 하려고)
localStorage에 직접 접근할 수 없다(Worker에는 window.localStorage가 없음). 대신
메인 스레드가 현재 localStorage 스냅샷을 부팅 직후 `bootstrap_history()`로 넣어주고,
이 모듈은 그 내용을 메모리 캐시(_hist)에서 읽고 쓴다. 새로 쓴 값은 각 응답의
"_history_patch" 필드로 실어보내면, 메인 스레드가 그걸 받아 실제 localStorage에 반영한다.
"""
from __future__ import annotations

import copy
import json
import re

from nurse_scheduler.calendar_utils import DAY_WEEKDAY, build_calendar
from nurse_scheduler.constraints import all_hard_checks, check_soft
from nurse_scheduler.excel_export import export_excel, export_excel_ocs, export_staff_table_xlsx
from nurse_scheduler.excel_input import (
    ExcelInputError, load_input_xlsx, load_prev_month_schedule_xlsx,
    load_staff_table_xlsx, load_wanted_grid_xlsx,
)
from nurse_scheduler.generator import (
    Generator, InputError, _BEST_EFFORT_RULES, carryover_from_grid,
    carryover_from_staff_table, generate_best,
)
from nurse_scheduler.models import Shift, parse_shift
from nurse_scheduler.reporting import build_report, format_text_report

SAMPLE_PATH = "/sample_input.xlsx"
HISTORY_PREFIX = "ns_history_"


class State:
    """프로세스(=탭) 전역 세션 상태 — webapp/app.py의 State와 동일한 역할."""

    def __init__(self):
        self.cfg: dict | None = None
        self.gen = None
        self.sch = None
        self.locked_cells: dict[tuple[str, int], Shift] = {}
        self.pending_edits: dict[tuple[str, int], Shift] = {}
        self.round: int = 0
        self.staff_table_in: dict | None = None


S = State()


class ApiError(Exception):
    pass


def _err(msg: str) -> str:
    return json.dumps({"error": msg}, ensure_ascii=False)


def _require_generated():
    if S.gen is None or S.sch is None:
        raise ApiError("아직 생성된 근무표가 없습니다")


# ---------------------------------------------------------------- 상태 직렬화

def _display_grid() -> dict:
    """화면/편집용 값은 "OFF"를 그대로 유지한다(셀 편집·순환·드롭다운이 이 값을 기준으로
    동작하므로) — "X"/"/" 표시 변환은 export/annual_grid 등 출력 시점에만 적용한다."""
    out = {}
    for s in S.sch.staff:
        row = list(S.sch.grid[s.id])
        for d in range(S.sch.num_days):
            if (s.id, d) in S.pending_edits:
                row[d] = S.pending_edits[(s.id, d)]
        out[s.id] = [str(v) for v in row]
    return out


def _off_display(sid: str, day: int, code: str) -> str:
    """OFF는 "OFF" 대신 원티드오프="X" / 일반오프="/"로 표시(병원 표준 표기, §excel_export와 동일 규칙)."""
    if code != "OFF":
        return code
    return "X" if (sid, day) in S.sch.wanted else "/"


def _staff_meta():
    return [
        {"id": s.id, "role": s.role, "level": s.level,
         "allowed": [x.value for x in s.allowed_shifts],
         "is_partjang": s.is_partjang, "is_nk": s.is_nk,
         "no_night": s.no_night}
        for s in S.sch.staff
    ]


def _days_meta():
    return [
        {"n": i + 1, "dow": d.dow_name, "weekend": d.day_type != DAY_WEEKDAY,
         "substitute": d.is_substitute, "allows_8a": d.allows_8a}
        for i, d in enumerate(S.gen.days)
    ]


def _report_summary():
    report = build_report(S.sch, S.gen.days, S.gen.params, S.gen.requests)
    requests_all = [
        {"staff_id": r.staff_id, "date": r.date, "type": str(r.type),
         "accepted": bool(r.accepted), "reason": r.reject_reason}
        for r in S.gen.requests
    ]
    bad_days = [d for d in report["daily"] if not d["ok"]]
    # H6-1/H6-4/H4-1은 월경계 등에서 로컬 수리만으로 0건을 보장하기 어려운
    # 최선노력 규칙 — 상세 목록(hard)에는 그대로 남기되, 대표 카운트에서는 제외한다.
    strict_hard = [v for v in report["hard_violations"]
                  if v["rule"] not in _BEST_EFFORT_RULES]
    return {
        "hard_count": len(strict_hard),
        "hard": report["hard_violations"],
        "soft_count": len(report["soft_violations"]),
        "soft": report["soft_violations"],
        "off_range": report["off_range"],
        "per_person": report["per_person"],
        "requests": report["requests"],
        "requests_all": requests_all,
        "daily": report["daily"],
        "bad_days_count": len(bad_days),
        "night_block_hist": report["night_block_length_hist"],
        "night_gap_hist": report["night_gap_hist"],
        "logs": report["logs"],
    }


def _locked_keys():
    return [f"{sid}:{d}" for (sid, d) in S.locked_cells]


def _pending_keys():
    return [f"{sid}:{d}" for (sid, d) in S.pending_edits]


def _wanted_keys():
    return [f"{sid}:{d}" for (sid, d) in S.sch.wanted]


def _full_state():
    p = S.gen.params
    return {
        "ward_id": S.cfg.get("ward_id", ""),
        "year": S.gen.year, "month": S.gen.month,
        "num_days": S.sch.num_days,
        "staff": _staff_meta(),
        "days": _days_meta(),
        "grid": _display_grid(),
        "locked": _locked_keys(),
        "pending": _pending_keys(),
        "wanted": _wanted_keys(),
        "round": S.round,
        "params_summary": {
            "min_staff": p.min_staff, "max_nights": p.max_nights,
            "leader_8a_as_prn": p.leader_8a_as_prn,
            "holidays": p.holidays, "nk_count": p.nk_count,
        },
        "report": _report_summary(),
    }


def _full_state_json() -> str:
    return json.dumps(_full_state(), ensure_ascii=False)


# ---------------------------------------------------------------- 연간 근무표 히스토리
# webapp/app.py는 webapp/history/YYYY-MM.json 파일에 저장하지만, 브라우저에는
# 로컬 파일 시스템이 없으므로 localStorage 키(ns_history_YYYY-MM)로 대체한다.
# 이 모듈은 Worker 안에서 돌아 localStorage에 직접 접근할 수 없으므로, 메인 스레드가
# bootstrap_history()로 넣어준 스냅샷을 메모리 캐시(_hist)에 두고 그걸로 읽고 쓴다.
# 새로 쓴 값은 _pending_writes에 모아뒀다가 응답의 "_history_patch" 필드로 실어보낸다.

_hist: dict[str, str] = {}
_pending_writes: dict[str, str] = {}


def bootstrap_history(raw_json: str) -> str:
    """메인 스레드가 부팅 직후 현재 localStorage 스냅샷을 여기로 넣어준다."""
    _hist.update(json.loads(raw_json))
    return json.dumps({"ok": True}, ensure_ascii=False)


def _with_history_patch(payload: dict) -> dict:
    if _pending_writes:
        payload["_history_patch"] = dict(_pending_writes)
        _pending_writes.clear()
    return payload


def _history_key(year: int, month: int) -> str:
    return f"{HISTORY_PREFIX}{year:04d}-{month:02d}"


def _save_history_entry(entry: dict):
    key = _history_key(entry["year"], entry["month"])
    val = json.dumps(entry, ensure_ascii=False)
    _hist[key] = val
    _pending_writes[key] = val


def _load_history_entry(year: int, month: int) -> dict | None:
    raw = _hist.get(_history_key(year, month))
    if raw is None:
        return None
    return json.loads(raw)


def _history_exists(year: int, month: int) -> bool:
    return _history_key(year, month) in _hist


def _all_history_year_months():
    out = []
    pat = re.compile(rf"^{HISTORY_PREFIX}(\d{{4}})-(\d{{2}})$")
    for k in _hist:
        m = pat.match(k)
        if m:
            out.append((int(m.group(1)), int(m.group(2))))
    return out


def _days_meta_for(year: int, month: int, num_days: int):
    days = build_calendar(year, month, [], [])
    return [{"n": i + 1, "dow": d.dow_name, "weekend": d.day_type != DAY_WEEKDAY}
            for i, d in enumerate(days[:num_days])]


def _list_history_before(year: int, month: int, limit: int = 2):
    found = [(y, mo) for (y, mo) in _all_history_year_months() if (y, mo) < (year, month)]
    found.sort(reverse=True)
    out = []
    for y, mo in found[:limit]:
        entry = _load_history_entry(y, mo)
        if entry:
            entry["days"] = _days_meta_for(y, mo, entry["num_days"])
            out.append(entry)
    return out


_OFF_CODES = ("OFF", "X", "/")  # "OFF"(구버전 파일 호환) / "X"(원티드오프) / "/"(일반오프)


def _summary_from_raw_grid(grid: dict, num_days: int):
    out = {}
    for sid, row in grid.items():
        out[sid] = {
            "off": sum(1 for v in row if v in _OFF_CODES),
            "night": sum(1 for v in row if v in ("N", "NK")),
            "workday": sum(1 for v in row if v not in _OFF_CODES and v != "연차"),
        }
    return out


def _current_history_entry():
    return {
        "year": S.gen.year, "month": S.gen.month,
        "staff": [{"id": s.id, "level": s.level, "is_nk": s.is_nk} for s in S.sch.staff],
        "num_days": S.sch.num_days,
        "grid": _display_grid(),
        "days": _days_meta(),
        "summary": {
            s.id: {"off": S.sch.offs_in_month(s.id),
                   "night": S.sch.nights_in_month(s.id),
                   "workday": S.sch.workdays_in_month(s.id)}
            for s in S.sch.staff
        },
    }


def _night_block_counts(row: list) -> tuple:
    """근무 코드 리스트 하나(한 달치)에서 야간(N/NK) 연속블록 길이별 건수를 센다."""
    b2 = b3 = other = 0
    i, n = 0, len(row)
    while i < n:
        if row[i] in ("N", "NK"):
            j = i
            while j + 1 < n and row[j + 1] in ("N", "NK"):
                j += 1
            length = j - i + 1
            if length == 2:
                b2 += 1
            elif length == 3:
                b3 += 1
            else:
                other += 1
            i = j + 1
        else:
            i += 1
    return b2, b3, other


def _count_shift_codes(row: list, days: list) -> tuple:
    """행(한 달치 근무 코드)에서 D/E/prn(8A 포함) 개수와 주말·휴일 OFF 개수를 센다."""
    d_cnt = sum(1 for v in row if v == "D")
    e_cnt = sum(1 for v in row if v == "E")
    prn_cnt = sum(1 for v in row if v in ("prn", "8A", "9A"))
    wh_off = sum(1 for v, d in zip(row, days) if v in _OFF_CODES and d.get("weekend"))
    return d_cnt, e_cnt, prn_cnt, wh_off


def _cumulative_summary(entries: list, staff_ids: list):
    out = {}
    for sid in staff_ids:
        off = night = workday = months = 0
        weekend_night = 0
        blocks_2 = blocks_3 = blocks_other = 0
        for e in entries:
            s = e["summary"].get(sid)
            if s:
                off += s["off"]; night += s["night"]; workday += s["workday"]
                months += 1
            row = e.get("grid", {}).get(sid)
            days = e.get("days")
            if row and days:
                weekend_night += sum(1 for v, d in zip(row, days)
                                     if v in ("N", "NK") and d.get("dow") in ("토", "일"))
                b2, b3, bo = _night_block_counts(row)
                blocks_2 += b2; blocks_3 += b3; blocks_other += bo
        out[sid] = {"off": off, "night": night, "workday": workday, "months": months,
                    "weekend_night": weekend_night, "blocks_2": blocks_2,
                    "blocks_3": blocks_3, "blocks_other": blocks_other}
    return out


def _build_updated_staff_table():
    """이번 달 생성 결과를 이전 연간근무표(S.staff_table_in)에 얹어 갱신본을 만든다.

    통계는 항상 "이번 달 실제 생성 결과"만 더해서 한 걸음씩 앞으로 나간다 —
    월간근무표(이어붙이기 규칙용)와는 별개로, 연간근무표 스스로 다음 입력이 된다.
    연간 그리드는 해가 바뀌면(1/1) 리셋한다.
    """
    import datetime

    prev = S.staff_table_in or {}
    prev_stats = prev.get("stats", {})
    prev_dates = prev.get("annual_dates", [])
    prev_grid = prev.get("annual_grid", {})

    grid = _display_grid()
    days = _days_meta()
    next_carry = S.gen.build_next_carryover()

    stats = {}
    for s in S.sch.staff:
        row = grid[s.id]
        b2, b3, _bo = _night_block_counts(row)
        weekend_night = sum(1 for v, d in zip(row, days)
                            if v in ("N", "NK") and d["dow"] in ("토", "일"))
        d_cnt, e_cnt, prn_cnt, wh_off = _count_shift_codes(row, days)
        base = prev_stats.get(s.id, {})
        stats[s.id] = {
            "night": base.get("night", 0) + S.sch.nights_in_month(s.id),
            "workday": base.get("workday", 0) + S.sch.workdays_in_month(s.id),
            "off": base.get("off", 0) + S.sch.offs_in_month(s.id),
            "weekend_night": base.get("weekend_night", 0) + weekend_night,
            "blocks_2": base.get("blocks_2", 0) + b2,
            "blocks_3": base.get("blocks_3", 0) + b3,
            "months": base.get("months", 0) + 1,
            "recent_night_score": next_carry.get(s.id, {}).get("recent_night_score", 0.0),
            "cum_d": base.get("cum_d", 0) + d_cnt,
            "cum_e": base.get("cum_e", 0) + e_cnt,
            "cum_prn": base.get("cum_prn", 0) + prn_cnt,
            "cum_weekend_holiday_off": base.get("cum_weekend_holiday_off", 0) + wh_off,
        }

    this_year = S.gen.year
    if prev_dates and prev_dates[0][:4] == str(this_year):
        base_dates = [datetime.date.fromisoformat(x) for x in prev_dates]
    else:
        base_dates = []
    this_month_dates = [datetime.date(this_year, S.gen.month, d + 1)
                        for d in range(S.sch.num_days)]
    annual_dates = base_dates + this_month_dates

    annual_grid = {}
    for s in S.sch.staff:
        base_codes = (prev_grid.get(s.id, []) if base_dates else [])
        base_codes = (base_codes + [""] * len(base_dates))[:len(base_dates)]
        this_month_codes = [_off_display(s.id, d, c) for d, c in enumerate(grid[s.id])]
        annual_grid[s.id] = base_codes + this_month_codes

    return stats, annual_dates, annual_grid


# ================================================================ API 함수
# (경로 하나당 함수 하나 — webapp/app.py의 라우트와 1:1 대응)

def api_sample() -> str:
    try:
        cfg = load_input_xlsx(SAMPLE_PATH)
    except Exception as e:
        return _err(f"샘플 로드 실패: {e}")
    return json.dumps(cfg, ensure_ascii=False)


def _write_temp_xlsx(file_bytes, path: str):
    data = bytes(file_bytes.to_py()) if hasattr(file_bytes, "to_py") else bytes(file_bytes)
    with open(path, "wb") as f:
        f.write(data)


def api_upload(file_bytes) -> str:
    path = "/tmp_upload.xlsx"
    try:
        _write_temp_xlsx(file_bytes, path)
        cfg = load_input_xlsx(path)
    except ExcelInputError as e:
        return _err(f"입력 엑셀 오류: {e}")
    except Exception as e:
        return _err(f"파일을 읽을 수 없습니다: {e}")
    return json.dumps({"ok": True, "cfg": cfg}, ensure_ascii=False)


def api_upload_prev_month(file_bytes) -> str:
    path = "/tmp_prev.xlsx"
    try:
        _write_temp_xlsx(file_bytes, path)
        data = load_prev_month_schedule_xlsx(path)
    except ExcelInputError as e:
        return _err(f"엑셀 오류: {e}")
    except Exception as e:
        return _err(f"파일을 읽을 수 없습니다: {e}")

    carry = carryover_from_grid(data["grid"], data["num_days"])
    for sid, bal in data.get("off_balance", {}).items():
        if sid in carry:
            carry[sid]["off_balance"] = bal

    if not _history_exists(data["year"], data["month"]):
        summary = _summary_from_raw_grid(data["grid"], data["num_days"])
        _save_history_entry({
            "year": data["year"], "month": data["month"],
            "staff": [{"id": sid, "level": None} for sid in data["grid"]],
            "num_days": data["num_days"], "grid": data["grid"], "summary": summary,
        })

    warning = None
    if S.cfg is not None:
        cur_y, cur_m = int(S.cfg["year"]), int(S.cfg["month"])
        prev_y, prev_m = (cur_y - 1, 12) if cur_m == 1 else (cur_y, cur_m - 1)
        if (data["year"], data["month"]) != (prev_y, prev_m):
            warning = (f"업로드한 파일은 {data['year']}년 {data['month']}월 근무표인데, "
                       f"현재 설정된 달({cur_y}년 {cur_m}월)의 바로 전달({prev_y}년 {prev_m}월)이 "
                       "아닙니다 — 그래도 이월값은 반영합니다.")
    payload = _with_history_patch({"ok": True, "year": data["year"], "month": data["month"],
                                   "carryover": carry, "warning": warning})
    return json.dumps(payload, ensure_ascii=False)


def api_upload_wanted(file_bytes) -> str:
    """원티드 신청 엑셀(월간근무표와 같은 모양, 별표·X 등 표기) → 신청 목록 자동 변환."""
    path = "/tmp_wanted.xlsx"
    try:
        _write_temp_xlsx(file_bytes, path)
        data = load_wanted_grid_xlsx(path)
    except ExcelInputError as e:
        return _err(f"엑셀 오류: {e}")
    except Exception as e:
        return _err(f"파일을 읽을 수 없습니다: {e}")

    warning = None
    if S.cfg is not None:
        cur_y, cur_m = int(S.cfg["year"]), int(S.cfg["month"])
        if (data["year"], data["month"]) != (cur_y, cur_m):
            warning = (f"업로드한 파일은 {data['year']}년 {data['month']}월 표인데, "
                       f"현재 설정된 달({cur_y}년 {cur_m}월)과 다릅니다 — "
                       "그래도 신청 날짜는 파일에 적힌 그대로 반영합니다.")
    return json.dumps({"ok": True, "year": data["year"], "month": data["month"],
                       "requests": data["requests"], "unknown_marks": data["unknown_marks"],
                       "warning": warning}, ensure_ascii=False)


def api_upload_staff_table(file_bytes) -> str:
    """'연간근무표'(로스터+누적통계+연간그리드) 업로드 — 다월 자동 연동의 시작점."""
    path = "/tmp_staff_table.xlsx"
    try:
        _write_temp_xlsx(file_bytes, path)
        data = load_staff_table_xlsx(path)
    except ExcelInputError as e:
        return _err(f"연간근무표 엑셀 오류: {e}")
    except Exception as e:
        return _err(f"파일을 읽을 수 없습니다: {e}")

    S.staff_table_in = {"stats": data["stats"], "annual_dates": data["annual_dates"],
                        "annual_grid": data["annual_grid"]}
    return json.dumps({"ok": True, "staff": data["staff"],
                       "annual_days": len(data["annual_dates"]),
                       "last_date": (data["annual_dates"][-1] if data["annual_dates"] else None)},
                      ensure_ascii=False)


def api_staff_table_status() -> str:
    """지금 서버에 연간근무표가 반영돼 있는지 — '생성'을 누르면 이게 계속 자동으로 쓰이므로,
    화면에서 리더가 잊지 않고 확인할 수 있게 상시 조회 가능하게 해둔다."""
    if not S.staff_table_in:
        return json.dumps({"loaded": False}, ensure_ascii=False)
    dates = S.staff_table_in.get("annual_dates") or []
    return json.dumps({"loaded": True, "staff_count": len(S.staff_table_in.get("stats") or {}),
                       "annual_days": len(dates), "last_date": (dates[-1] if dates else None)},
                      ensure_ascii=False)


def api_clear_staff_table() -> str:
    S.staff_table_in = None
    return json.dumps({"ok": True}, ensure_ascii=False)


def api_set_config(body_json: str) -> str:
    data = json.loads(body_json)
    if not data or not all(k in data for k in ("year", "month", "staff", "params")):
        return _err("입력 형식이 올바르지 않습니다 (year/month/staff/params 필요)")
    if S.staff_table_in:
        stats = S.staff_table_in["stats"]
        annual_dates = S.staff_table_in.get("annual_dates") or []
        annual_grid = S.staff_table_in.get("annual_grid") or {}
        carry = {}
        if annual_dates:
            carry.update(carryover_from_staff_table(
                annual_dates, annual_grid, int(data["year"]), int(data["month"])))
        for sid, v in (data.get("prev_month_carryover") or {}).items():
            carry[sid] = v
        for sid, st in stats.items():
            entry = dict(carry.get(sid) or {})
            entry["recent_night_score"] = st.get("recent_night_score", 0.0)
            carry[sid] = entry
        data["prev_month_carryover"] = carry
    try:
        Generator(data)
    except InputError as e:
        return _err(str(e))
    except Exception as e:
        return _err(f"입력 오류: {e}")
    S.cfg = data
    S.gen = None
    S.sch = None
    S.locked_cells = {}
    S.pending_edits = {}
    S.round = 0
    return json.dumps({"ok": True, "staff_count": len(data["staff"])}, ensure_ascii=False)


def api_generate() -> str:
    if S.cfg is None:
        return _err("먼저 입력을 확정하세요 (업로드 또는 직접입력 후 생성)")
    try:
        gen, sch = generate_best(S.cfg)
    except InputError as e:
        return _err(f"입력 검증 실패: {e}")
    except Exception as e:
        return _err(f"생성 중 오류가 발생했습니다: {e}")
    S.gen, S.sch = gen, sch
    S.locked_cells = {}
    S.pending_edits = {}
    S.round = 1
    return _full_state_json()


def api_state() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return _err(str(e))
    return _full_state_json()


def api_edit(body_json: str) -> str:
    try:
        _require_generated()
    except ApiError as e:
        return _err(str(e))
    data = json.loads(body_json)
    sid, day, shift_str = data.get("staff_id"), data.get("day"), data.get("shift")
    if sid not in S.sch.by_id:
        return _err("존재하지 않는 직원입니다")
    if not isinstance(day, int) or not (0 <= day < S.sch.num_days):
        return _err("잘못된 날짜입니다")
    try:
        shift = parse_shift(shift_str)
    except ValueError:
        return _err(f"알 수 없는 근무유형: {shift_str}")
    S.pending_edits[(sid, day)] = shift
    return _full_state_json()


def api_edit_undo(body_json: str) -> str:
    data = json.loads(body_json)
    sid, day = data.get("staff_id"), data.get("day")
    S.pending_edits.pop((sid, day), None)
    return _full_state_json()


def api_discard() -> str:
    S.pending_edits = {}
    return _full_state_json()


def api_feedback() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return _err(str(e))
    if not S.pending_edits:
        return json.dumps({"hard": [], "soft": [], "edits": []}, ensure_ascii=False)

    temp = copy.deepcopy(S.sch)
    for (sid, d), shift in S.pending_edits.items():
        temp.grid[sid][d] = shift

    hard = all_hard_checks(temp, S.gen.days, S.gen.params)
    soft = [v for v in check_soft(temp, S.gen.days, S.gen.params) if v.severity == "soft"]

    def related(v):
        if v.staff_id:
            return any(sid == v.staff_id and (v.day is None or abs(v.day - d) <= 2)
                       for (sid, d) in S.pending_edits)
        if v.day is not None:
            return any(v.day == d for (_, d) in S.pending_edits)
        return False

    edits_list = [
        {"staff_id": sid, "day": d, "old": str(S.sch.grid[sid][d]), "new": str(shift)}
        for (sid, d), shift in sorted(S.pending_edits.items())
    ]
    return json.dumps({
        "hard": [{"rule": v.rule, "message": v.message} for v in hard if related(v)],
        "hard_other": len([v for v in hard if not related(v)]),
        "soft": [{"rule": v.rule, "message": v.message} for v in soft if related(v)],
        "edits": edits_list,
    }, ensure_ascii=False)


def api_apply() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return _err(str(e))
    if not S.pending_edits:
        return _err("적용할 편집이 없습니다")

    S.locked_cells.update(S.pending_edits)
    try:
        gen, sch = generate_best(S.cfg, fixed_cells=dict(S.locked_cells))
    except InputError as e:
        return _err(f"재생성 실패: {e}")
    except Exception as e:
        return _err(f"재생성 중 오류가 발생했습니다: {e}")

    S.gen, S.sch = gen, sch
    S.pending_edits = {}
    S.round += 1
    return _full_state_json()


def api_finalize() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return _err(str(e))
    _save_history_entry(_current_history_entry())
    payload = _with_history_patch({"ok": True, "saved": f"{S.gen.year}-{S.gen.month:02d}"})
    return json.dumps(payload, ensure_ascii=False)


def api_annual() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return _err(str(e))
    current = _current_history_entry()
    history = _list_history_before(S.gen.year, S.gen.month, limit=2)
    staff_ids = [s.id for s in S.sch.staff]
    cumulative = _cumulative_summary([current] + history, staff_ids)
    return json.dumps({"current": current, "history": history, "cumulative": cumulative},
                      ensure_ascii=False)


# ---------------------------------------------------------------- 다운로드
# 브라우저에는 send_file이 없으므로 바이트/문자열을 그대로 반환하고,
# JS 쪽에서 Blob으로 감싸 다운로드를 띄운다.

def api_download_xlsx():
    try:
        _require_generated()
    except ApiError as e:
        return None
    path = "/tmp_out.xlsx"
    export_excel(S.sch, S.gen.days, path)
    with open(path, "rb") as f:
        return f.read()


def api_download_xlsx_ocs():
    """병원 OCS 원본과 같은 모양(간호스케줄)으로 내보내기."""
    try:
        _require_generated()
    except ApiError as e:
        return None
    path = "/tmp_out_ocs.xlsx"
    export_excel_ocs(S.sch, S.gen.days, path)
    with open(path, "rb") as f:
        return f.read()


def api_download_staff_table():
    """'연간근무표' 갱신본 다운로드 — 다음 달엔 이 파일을 그대로 다시 업로드하면 된다."""
    try:
        _require_generated()
    except ApiError as e:
        return None
    stats, annual_dates, annual_grid = _build_updated_staff_table()
    path = "/tmp_staff_table_out.xlsx"
    export_staff_table_xlsx(S.sch.staff, stats, annual_dates, annual_grid, path,
                            last_reflected=f"{S.gen.year}년 {S.gen.month}월")
    with open(path, "rb") as f:
        return f.read()


_FILENAME_UNSAFE = re.compile(r'[\\/:*?"<>|\s]+')


def _download_filename(kind: str) -> str:
    """다운로드 파일명 = {종류}_{병동명}_{연도}-{월}.xlsx (병동명 없으면 생략)."""
    ward = (S.cfg or {}).get("ward_id", "") if S.cfg else ""
    ward = _FILENAME_UNSAFE.sub("", str(ward or "").strip())
    parts = [kind] + ([ward] if ward else []) + [f"{S.gen.year}-{S.gen.month:02d}"]
    return "_".join(parts) + ".xlsx"


def download_filename_schedule() -> str:
    if S.gen is None:
        return "월간근무표.xlsx"
    name = _download_filename("월간근무표")
    return name[:-5] + f"_r{S.round}.xlsx"


def download_filename_schedule_ocs() -> str:
    if S.gen is None:
        return "월간근무표_OCS형식.xlsx"
    name = _download_filename("월간근무표_OCS형식")
    return name[:-5] + f"_r{S.round}.xlsx"


def download_filename_staff_table() -> str:
    if S.gen is None:
        return "연간근무표.xlsx"
    return _download_filename("연간근무표")
