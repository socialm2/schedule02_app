# -*- coding: utf-8 -*-
"""브라우저(Pyodide) 전용 브릿지.

webapp/app.py의 Flask 라우트 로직을 그대로 옮기되, HTTP 대신 JS에서 직접 호출하는
평범한 함수로 노출한다. 모든 함수는 JSON 문자열을 인자로 받고 JSON 문자열을
반환한다(다운로드용 바이너리 함수만 예외). 성공/실패는 HTTP 상태 코드 대신
반환 JSON에 "error" 키가 있는지로 구분한다 — JS 쪽 api() 어댑터가 이 규약을 안다.

로컬 파일 시스템이 없으므로(브라우저), 웹앱의 webapp/history/*.json 파일 저장은
브라우저 localStorage로 대체한다. 그 외 로직(생성/편집/피드백/재생성/누적 원장)은
webapp/app.py와 완전히 동일하다.
"""
from __future__ import annotations

import copy
import json
import re

from nurse_scheduler.calendar_utils import DAY_WEEKDAY, build_calendar
from nurse_scheduler.constraints import all_hard_checks, check_soft
from nurse_scheduler.excel_export import export_excel
from nurse_scheduler.excel_input import (
    ExcelInputError, load_input_xlsx, load_prev_month_schedule_xlsx,
)
from nurse_scheduler.generator import (
    Generator, InputError, carryover_from_grid, generate_best,
)
from nurse_scheduler.models import Shift, parse_shift
from nurse_scheduler.reporting import build_report, format_text_report

try:
    import js  # Pyodide 안에서만 존재 (localStorage 등 브라우저 전역 접근용)
except ImportError:  # pragma: no cover - 브라우저 밖에서 import 테스트할 때만
    js = None

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
    out = {}
    for s in S.sch.staff:
        row = list(S.sch.grid[s.id])
        for d in range(S.sch.num_days):
            if (s.id, d) in S.pending_edits:
                row[d] = S.pending_edits[(s.id, d)]
        out[s.id] = [str(v) for v in row]
    return out


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
    return {
        "hard_count": len(report["hard_violations"]),
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

def _history_key(year: int, month: int) -> str:
    return f"{HISTORY_PREFIX}{year:04d}-{month:02d}"


def _save_history_entry(entry: dict):
    js.localStorage.setItem(_history_key(entry["year"], entry["month"]),
                            json.dumps(entry, ensure_ascii=False))


def _load_history_entry(year: int, month: int) -> dict | None:
    raw = js.localStorage.getItem(_history_key(year, month))
    if raw is None:
        return None
    return json.loads(raw)


def _history_exists(year: int, month: int) -> bool:
    return js.localStorage.getItem(_history_key(year, month)) is not None


def _all_history_year_months():
    out = []
    n = js.localStorage.length
    pat = re.compile(rf"^{HISTORY_PREFIX}(\d{{4}})-(\d{{2}})$")
    for i in range(n):
        k = js.localStorage.key(i)
        m = pat.match(k) if k else None
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


def _summary_from_raw_grid(grid: dict, num_days: int):
    out = {}
    for sid, row in grid.items():
        out[sid] = {
            "off": sum(1 for v in row if v == "OFF"),
            "night": sum(1 for v in row if v in ("N", "NK")),
            "workday": sum(1 for v in row if v not in ("OFF", "연차")),
        }
    return out


def _current_history_entry():
    return {
        "year": S.gen.year, "month": S.gen.month,
        "staff": [{"id": s.id, "level": s.level} for s in S.sch.staff],
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


def _cumulative_summary(entries: list, staff_ids: list):
    out = {}
    for sid in staff_ids:
        off = night = workday = months = 0
        for e in entries:
            s = e["summary"].get(sid)
            if s:
                off += s["off"]; night += s["night"]; workday += s["workday"]
                months += 1
        out[sid] = {"off": off, "night": night, "workday": workday, "months": months}
    return out


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
    return json.dumps({"ok": True, "year": data["year"], "month": data["month"],
                       "carryover": carry, "warning": warning}, ensure_ascii=False)


def api_set_config(body_json: str) -> str:
    data = json.loads(body_json)
    if not data or not all(k in data for k in ("year", "month", "staff", "params")):
        return _err("입력 형식이 올바르지 않습니다 (year/month/staff/params 필요)")
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
    return json.dumps({"ok": True, "saved": f"{S.gen.year}-{S.gen.month:02d}"},
                      ensure_ascii=False)


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


def api_download_report() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return ""
    report = build_report(S.sch, S.gen.days, S.gen.params, S.gen.requests)
    return format_text_report(report, S.gen.year, S.gen.month)


def api_download_carryover() -> str:
    try:
        _require_generated()
    except ApiError as e:
        return "{}"
    carry = S.gen.build_next_carryover()
    return json.dumps(carry, ensure_ascii=False, indent=2)


def download_tag() -> str:
    if S.gen is None:
        return "미생성"
    return f"{S.gen.year}-{S.gen.month:02d}_r{S.round}"
