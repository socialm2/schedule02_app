# -*- coding: utf-8 -*-
"""엑셀 입력 형식 (원본 설계서 0-2/0-3 표 양식).

시트 구성:
  설정     — 항목/값 (연도, 월, 월최대야간, 월신청상한, 리더8A운용, 공휴일, 대체공휴일)
  인원     — 순번 | 이름 | 직급 | 숙련도 | 가능근무 | 비고
  최소인력 — 근무 | 평일 | 토요일 | 일요일공휴일  (D/E/N/prn 행, 8A 행은 무시)
  신청     — 이름 | 날짜 | 근무유형 | 우선순위   (선택, 행 순서 = 선착순)
  전월이월 — 이름 | 마지막근무 | 연속근무일수 | 이월OFF일수 | 말일연속야간일수 (선택)

비고 키워드: "야간전담" → night_only, "임부" → pregnant, "야간금지"/"야간 금지" → no_night

  인원표 — 다월 자동 연동용(선택 사용). 순번|이름|직급|숙련도|가능근무|비고 +
           누적통계(최근야간점수|누적야간|누적오프|누적주말야간|누적2일블록|누적3일블록|반영개월수) +
           연간 근무 그리드(1/1~, 참고용). export_staff_table_xlsx()로 내보내고
           load_staff_table_xlsx()로 다시 읽어 다음 달 생성에 이어붙인다.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .models import Shift, parse_shift

STAFF_TABLE_STATIC_COLS = ["순번", "이름", "직급", "숙련도", "가능근무", "비고"]
STAFF_TABLE_STAT_KEYS = ["night", "workday", "off", "weekend_night",
                          "blocks_2", "blocks_3", "months", "recent_night_score",
                          "cum_d", "cum_e", "cum_prn", "cum_weekend_holiday_off"]
STAFF_TABLE_STAT_LABELS = ["누적야간", "누적근무일", "누적오프", "누적주말야간",
                            "누적2일블록", "누적3일블록", "반영개월수",
                            "최근야간점수(참고용)",
                            "누적D", "누적E", "누적prn(8A)", "누적주말휴일오프"]


class ExcelInputError(Exception):
    pass


# ---------------------------------------------------------------- 읽기

def _sheet_rows(ws) -> List[list]:
    return [[c for c in row] for row in ws.iter_rows(values_only=True)]


def _find_header(rows, first_col_name):
    for i, r in enumerate(rows):
        if r and str(r[0] or "").strip() == first_col_name:
            return i
    return None


def _parse_level(v) -> int:
    s = str(v).strip()
    if s.lower().startswith("lv"):
        s = s[2:]
    try:
        return int(float(s))
    except ValueError:
        raise ExcelInputError(f"숙련도 해석 불가: {v!r}")


def _parse_flags(note: str) -> List[str]:
    note = (note or "").replace(" ", "")
    flags = []
    if "야간전담" in note:
        flags.append("night_only")
    if "임부" in note:
        flags.append("pregnant")
    if "야간금지" in note and "pregnant" not in flags:
        flags.append("no_night")
    return flags


def _parse_bool(v) -> bool:
    return str(v).strip().upper() in ("Y", "YES", "TRUE", "예", "O", "1")


def _split_list(v) -> List[str]:
    if v is None:
        return []
    return [x.strip() for x in str(v).replace("·", ",").split(",") if x.strip()]


def load_input_xlsx(path: str) -> dict:
    """입력 엑셀 → 설정 dict (JSON 입력과 동일 스키마)."""
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True)

    for need in ("설정", "인원", "최소인력"):
        if need not in wb.sheetnames:
            raise ExcelInputError(f"필수 시트 누락: {need}")

    # -------- 설정
    kv: Dict[str, object] = {}
    for row in wb["설정"].iter_rows(values_only=True):
        if row and row[0] is not None and str(row[0]).strip() not in ("항목", ""):
            kv[str(row[0]).strip()] = row[1] if len(row) > 1 else None
    try:
        year = int(kv["연도"])
        month = int(kv["월"])
    except (KeyError, TypeError, ValueError):
        raise ExcelInputError("설정 시트에 연도/월이 없습니다")

    # -------- 인원
    rows = _sheet_rows(wb["인원"])
    h = _find_header(rows, "순번")
    if h is None:
        raise ExcelInputError("인원 시트에 '순번' 헤더가 없습니다")
    staff = []
    for r in rows[h + 1:]:
        if not r or r[1] is None or not str(r[1]).strip():
            continue
        name = str(r[1]).strip()
        role = str(r[2] or "간호사").strip()
        level = _parse_level(r[3])
        allowed = _split_list(r[4])
        note = str(r[5] or "") if len(r) > 5 else ""
        for a in allowed:
            parse_shift(a)  # 검증
        staff.append({
            "id": name, "role": role, "level": level,
            "allowed_shifts": allowed, "flags": _parse_flags(note),
        })
    if not staff:
        raise ExcelInputError("인원 시트가 비어 있습니다")

    # -------- 최소인력
    rows = _sheet_rows(wb["최소인력"])
    h = _find_header(rows, "근무")
    if h is None:
        raise ExcelInputError("최소인력 시트에 '근무' 헤더가 없습니다")
    mins = {"weekday": {}, "saturday": {}, "sunday_holiday": {}}
    for r in rows[h + 1:]:
        if not r or r[0] is None:
            continue
        key = str(r[0]).strip()
        if key not in ("D", "E", "N", "prn"):
            continue  # 8A 등은 무시 (파트장 자동 배정)
        mins["weekday"][key] = int(r[1] or 0)
        mins["saturday"][key] = int(r[2] or 0)
        mins["sunday_holiday"][key] = int(r[3] or 0)

    # -------- 신청 (선택)
    requests = []
    if "신청" in wb.sheetnames:
        rows = _sheet_rows(wb["신청"])
        h = _find_header(rows, "이름")
        if h is not None:
            for r in rows[h + 1:]:
                if not r or r[0] is None or not str(r[0]).strip():
                    continue
                date = r[1]
                if hasattr(date, "strftime"):
                    date = date.strftime("%Y-%m-%d")
                requests.append({
                    "staff_id": str(r[0]).strip(),
                    "date": str(date).strip()[:10],
                    "type": str(r[2]).strip(),
                    "priority": int(r[3] or 1) if len(r) > 3 else 1,
                })

    # -------- 전월이월 (선택)
    carry = {}
    if "전월이월" in wb.sheetnames:
        rows = _sheet_rows(wb["전월이월"])
        h = _find_header(rows, "이름")
        if h is not None:
            for r in rows[h + 1:]:
                if not r or r[0] is None or not str(r[0]).strip():
                    continue
                trailing = int(r[4] or 0) if len(r) > 4 else 0
                carry[str(r[0]).strip()] = {
                    "last_shift_type": str(r[1] or "OFF").strip(),
                    "consecutive_work_days": int(r[2] or 0),
                    "night_block_remaining_off": int(r[3] or 0),
                    "night_block_in_progress": trailing == 1,
                    "trailing_night_count": trailing,
                }

    nk_count = sum(1 for s in staff if "night_only" in s["flags"])
    return {
        "ward_id": str(kv.get("병동명", "") or ""),
        "year": year, "month": month,
        "staff": staff,
        "params": {
            "nk_count": int(kv.get("NK인원수", nk_count) or nk_count),
            "min_staff": mins,
            "leader_8a_as_prn": _parse_bool(kv.get("리더8A운용", "N")),
            "off_max_per_month": int(kv.get("월최대야간", 6) or 6),
            "max_requests_per_person": int(kv.get("월신청상한", 6) or 6),
            "holidays": _split_list(kv.get("공휴일")),
            "substitute_holidays": _split_list(kv.get("대체공휴일")),
            "advanced_track_staff": _split_list(kv.get("심화과정대상")),
        },
        "prev_month_carryover": carry,
        "requests": requests,
    }


# ---------------------------------------------------------------- 월간근무표 형태 엑셀 공통 (제목행 + 이름|1일|2일|...)

def _parse_monthly_grid_shape(ws):
    """제목 행(A1) 'YYYY년 M월' + 2행 일자 헤더 + 4행부터 이름|근무... 모양 파싱.

    "월간근무표"(이 앱이 내보낸 근무표) 다운로드/전월이월 자동채움/원티드 업로드가
    전부 이 모양을 공유한다. 반환: (year, month, num_days, first_day_col).
    """
    import re
    title = str(ws.cell(1, 1).value or "")
    m = re.match(r"(\d{4})\s*년\s*(\d{1,2})\s*월", title)
    if not m:
        raise ExcelInputError(
            "제목 행(A1)에서 'YYYY년 M월' 형식을 찾지 못했습니다 — "
            "월간근무표와 같은 모양(이름|1일|2일|...)인지 확인하세요."
        )
    year, month = int(m.group(1)), int(m.group(2))
    first_day_col = 3
    col = first_day_col
    while isinstance(ws.cell(2, col).value, (int, float)):
        col += 1
    num_days = col - first_day_col
    if not (28 <= num_days <= 31):
        raise ExcelInputError(f"일자 열을 인식하지 못했습니다 (인식된 일수: {num_days})")
    return year, month, num_days, first_day_col


def _find_grid_sheet(wb):
    """월간근무표 모양의 시트를 찾는다.

    엑셀에서 마지막으로 보고 있던 시트(wb.active)를 우선 시도하되, 안내/설명용
    시트가 같이 들어있어 그게 활성 시트로 저장된 경우에도 문제없이 읽히도록
    나머지 시트를 전부 훑어 'YYYY년 M월' 형식의 진짜 데이터 시트를 찾는다.
    반환: (ws, year, month, num_days, first_day_col)"""
    candidates = [wb.active] + [ws for ws in wb.worksheets if ws is not wb.active]
    last_err = None
    for ws in candidates:
        try:
            year, month, num_days, first_day_col = _parse_monthly_grid_shape(ws)
            return ws, year, month, num_days, first_day_col
        except ExcelInputError as e:
            last_err = e
    raise last_err or ExcelInputError("월간근무표 모양의 시트를 찾지 못했습니다.")


# ---------------------------------------------------------------- 지난달 확정 근무표 읽기 (이월/히스토리용)

def load_prev_month_schedule_xlsx(path: str) -> dict:
    """월간근무표(이 앱이 내보낸 근무표 엑셀)를 읽어 그리드로 복원.

    수기로 값만 고친 파일도 읽을 수 있도록, 서식/수식이 아니라 셀 값만 본다.
    반환: {"year", "month", "num_days", "grid": {staff_id: [shift_str, ...]}}
    """
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True)
    ws, year, month, num_days, first_day_col = _find_grid_sheet(wb)

    grid: Dict[str, List[str]] = {}
    row = 4
    while True:
        name = ws.cell(row, 1).value
        if name is None or str(name).strip() == "":
            break
        sid = str(name).strip()
        shifts = []
        for d in range(num_days):
            v = ws.cell(row, first_day_col + d).value
            shifts.append(str(v).strip() if v not in (None, "") else "OFF")
        grid[sid] = shifts
        row += 1

    if not grid:
        raise ExcelInputError("근무표에서 인원 행을 찾지 못했습니다.")

    return {"year": year, "month": month, "num_days": num_days, "grid": grid}


# ---------------------------------------------------------------- 원티드 신청 읽기 (월간근무표 모양 + 신청 표기)

_WANTED_WORK_CODES = {"D": "D", "E": "E", "N": "N", "8A": "8A", "NK": "NK", "T": "T"}
_WANTED_AL_CODES = {"연": "연차", "연차": "연차", "연4": "연4"}
# 세부 사유가 명확한 휴가류는 각자의 코드로, 그 외(포상휴가·군휴가·미분류 특수코드)는
# 뭉뚱그려 OFF 희망으로 해석한다.
_WANTED_LEAVE_CODES = {
    "조": "조", "경": "경", "공": "공", "병": "병", "휴": "휴", "승": "승",
}
_WANTED_OFF_CODES = {"X", "OFF", "포", "군", "S/"}


def load_wanted_grid_xlsx(path: str) -> dict:
    """월간근무표와 같은 모양(이름|1일|2일|...) 엑셀에서 원티드 신청만 읽어온다.

    표기 규칙: "D*"/"E*"/"N*"/"8A*"/"NK*"/"T*"(또는 별표 없이도 인식) = 그 근무 희망,
    "조"/"경"/"공"/"병"/"휴"/"승"/"연"/"연차"/"연4" = 각자의 휴가유형 희망,
    "X"/그 외 미분류 표기(포상휴가·군휴가 등)는 OFF 희망으로 해석한다. 빈 칸은 건너뛴다.

    반환: {"year", "month", "requests": [{"staff_id","date","type"}, ...],
           "unknown_marks": [str, ...]}  # 인식 못 한 표시(참고용)
    """
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True)
    ws, year, month, num_days, first_day_col = _find_grid_sheet(wb)

    requests: List[dict] = []
    unknown = set()
    row = 4
    while True:
        name = ws.cell(row, 1).value
        if name is None or str(name).strip() == "":
            break
        sid = str(name).strip()
        for d in range(num_days):
            v = ws.cell(row, first_day_col + d).value
            if v in (None, ""):
                continue
            v = str(v).strip()
            base = v[:-1] if v.endswith("*") else v
            if base in _WANTED_WORK_CODES:
                t = _WANTED_WORK_CODES[base]
            elif base in _WANTED_AL_CODES:
                t = _WANTED_AL_CODES[base]
            elif base in _WANTED_LEAVE_CODES:
                t = _WANTED_LEAVE_CODES[base]
            elif base in _WANTED_OFF_CODES:
                t = "OFF"
            else:
                unknown.add(v)
                continue
            requests.append({"staff_id": sid, "date": f"{year}-{month:02d}-{d + 1:02d}",
                             "type": t})
        row += 1

    if not requests and not unknown:
        raise ExcelInputError("표에서 원티드 표시를 하나도 찾지 못했습니다.")

    return {"year": year, "month": month, "requests": requests,
           "unknown_marks": sorted(unknown)}


# ---------------------------------------------------------------- 인원표 읽기 (다월 자동 연동용)

def load_staff_table_xlsx(path: str) -> dict:
    """'인원표' 파일 읽기 — 로스터 + 누적 통계(형평성 참고용) + 연간 근무 그리드(1/1~, 참고용).

    반환: {
      "staff": [{"id","role","level","allowed_shifts","flags"}, ...],
      "stats": {staff_id: {"recent_night_score","night","off","weekend_night",
                            "blocks_2","blocks_3","months"}},
      "annual_dates": ["YYYY-MM-DD", ...],   # 이미 쌓여있던 연간 그리드의 날짜(있으면)
      "annual_grid": {staff_id: [code, ...]},  # annual_dates와 나란히
    }
    """
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True)
    if "인원표" not in wb.sheetnames:
        raise ExcelInputError("필수 시트 누락: 인원표")

    rows = _sheet_rows(wb["인원표"])
    h = _find_header(rows, "순번")
    if h is None:
        raise ExcelInputError("인원표 시트에 '순번' 헤더가 없습니다")
    header_row = rows[h]
    n_static = len(STAFF_TABLE_STATIC_COLS)
    n_stat = len(STAFF_TABLE_STAT_KEYS)
    first_day_idx = n_static + n_stat  # 0-based

    annual_dates: List[str] = []
    i = first_day_idx
    while i < len(header_row) and hasattr(header_row[i], "strftime"):
        annual_dates.append(header_row[i].strftime("%Y-%m-%d"))
        i += 1

    def _num(r, i) -> float:
        v = r[i] if i < len(r) else None
        try:
            return float(v) if v not in (None, "") else 0.0
        except (TypeError, ValueError):
            return 0.0

    staff, stats, annual_grid = [], {}, {}
    for r in rows[h + 1:]:
        if not r or r[1] is None or not str(r[1]).strip():
            continue
        name = str(r[1]).strip()
        role = str(r[2] or "간호사").strip()
        level = _parse_level(r[3])
        allowed = _split_list(r[4])
        note = str(r[5] or "") if len(r) > 5 else ""
        for a in allowed:
            parse_shift(a)  # 검증
        staff.append({"id": name, "role": role, "level": level,
                       "allowed_shifts": allowed, "flags": _parse_flags(note)})

        stats[name] = {
            "night": int(_num(r, n_static + 0)),
            "workday": int(_num(r, n_static + 1)),
            "off": int(_num(r, n_static + 2)),
            "weekend_night": int(_num(r, n_static + 3)),
            "blocks_2": int(_num(r, n_static + 4)),
            "blocks_3": int(_num(r, n_static + 5)),
            "months": int(_num(r, n_static + 6)),
            "recent_night_score": round(_num(r, n_static + 7), 2),
            "cum_d": int(_num(r, n_static + 8)),
            "cum_e": int(_num(r, n_static + 9)),
            "cum_prn": int(_num(r, n_static + 10)),
            "cum_weekend_holiday_off": int(_num(r, n_static + 11)),
        }

        if annual_dates:
            codes = []
            for d in range(len(annual_dates)):
                idx = first_day_idx + d
                v = r[idx] if idx < len(r) else None
                codes.append(str(v).strip() if v not in (None, "") else "")
            annual_grid[name] = codes

    if not staff:
        raise ExcelInputError("인원표 시트가 비어 있습니다")

    return {"staff": staff, "stats": stats,
            "annual_dates": annual_dates, "annual_grid": annual_grid}


# ---------------------------------------------------------------- 쓰기

def write_input_xlsx(cfg: dict, path: str):
    """설정 dict → 입력 엑셀 (원본 0-2/0-3 표 양식)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    head = Font(bold=True)
    fill = PatternFill("solid", fgColor="DDEBE7")

    ws = wb.active
    ws.title = "설정"
    p = cfg.get("params", {})
    rows = [("항목", "값"),
            ("병동명", cfg.get("ward_id", "")),
            ("연도", cfg["year"]), ("월", cfg["month"]),
            ("월최대야간", p.get("off_max_per_month", 6)),
            ("월신청상한", p.get("max_requests_per_person", 6)),
            ("리더8A운용", "Y" if p.get("leader_8a_as_prn") else "N"),
            ("공휴일", ", ".join(p.get("holidays", []))),
            ("대체공휴일", ", ".join(p.get("substitute_holidays", [])))]
    for r in rows:
        ws.append(list(r))
    for c in ws[1]:
        c.font = head
        c.fill = fill
    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 30

    ws = wb.create_sheet("인원")
    ws.append(["순번", "이름", "직급", "숙련도", "가능근무", "비고"])
    for c in ws[1]:
        c.font = head
        c.fill = fill
    for i, s in enumerate(cfg["staff"], 1):
        flags = s.get("flags", [])
        notes = []
        if "night_only" in flags:
            notes.append("야간전담")
        if "pregnant" in flags:
            notes.append("임부(야간 금지)")
        elif "no_night" in flags:
            notes.append("야간금지")
        if s["role"] == "파트장":
            notes.append("카운트 제외, 상근(평일)")
        ws.append([i, s["id"], s["role"], f"Lv{s['level']}",
                   ",".join(s["allowed_shifts"]), ", ".join(notes)])
    for col, w in (("A", 6), ("B", 12), ("C", 9), ("D", 8), ("E", 18), ("F", 24)):
        ws.column_dimensions[col].width = w

    ws = wb.create_sheet("최소인력")
    ws.append(["근무", "평일", "토요일", "일요일공휴일"])
    for c in ws[1]:
        c.font = head
        c.fill = fill
    m = p.get("min_staff", {})
    for key in ("D", "E", "N", "prn"):
        ws.append([key, m.get("weekday", {}).get(key, 0),
                   m.get("saturday", {}).get(key, 0),
                   m.get("sunday_holiday", {}).get(key, 0)])
    ws.append(["8A", "1(파트장)", 0, 0])

    reqs = cfg.get("requests") or []
    if reqs:
        ws = wb.create_sheet("신청")
        ws.append(["이름", "날짜", "근무유형", "우선순위"])
        for c in ws[1]:
            c.font = head
            c.fill = fill
        for r in reqs:
            ws.append([r["staff_id"], r["date"], r["type"], r.get("priority", 1)])
        ws.column_dimensions["B"].width = 12

    carry = cfg.get("prev_month_carryover") or {}
    if carry:
        ws = wb.create_sheet("전월이월")
        ws.append(["이름", "마지막근무", "연속근무일수", "이월OFF일수", "말일연속야간일수"])
        for c in ws[1]:
            c.font = head
            c.fill = fill
        for sid, v in carry.items():
            ws.append([sid, v.get("last_shift_type", "OFF"),
                       v.get("consecutive_work_days", 0),
                       v.get("night_block_remaining_off", 0),
                       v.get("trailing_night_count", 0)])
        for col in ("A", "B", "C", "D", "E"):
            ws.column_dimensions[col].width = 14

    wb.save(path)
