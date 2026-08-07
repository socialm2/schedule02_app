# -*- coding: utf-8 -*-
"""엑셀 출력 (설계서 §7, G10~G12)."""
from __future__ import annotations

from typing import List

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .calendar_utils import DayInfo, DAY_WEEKDAY, DAY_SATURDAY
from .models import MonthSchedule, Shift, NIGHT_SHIFTS, WORK_SHIFTS

SHIFT_FILLS = {
    Shift.A8: "D9D9D9",
    Shift.D: "BDD7EE",
    Shift.E: "F8CBAD",
    Shift.N: "1F3864",
    Shift.NK: "7030A0",
    Shift.PRN: "C6E0B4",
    Shift.AL: "FFE699",
    Shift.EDU: "B4C7E7",
    Shift.BEREAVE: "808080",
    Shift.CELEBRATE: "F4B6C2",
    Shift.AL_HALF: "FFF2CC",
    Shift.OFFICIAL: "D0CECE",
    Shift.SICK: "F8C9C4",
    Shift.LEAVE: "BFBFBF",
    Shift.PROMO_EDU: "DDEBF7",
}
WHITE_FONT_SHIFTS = {Shift.N, Shift.NK, Shift.BEREAVE}
WEEKEND_FILL = PatternFill("solid", fgColor="FCE4EC")
SUB_FILL = PatternFill("solid", fgColor="FFD966")
THIN = Border(*[Side(style="thin", color="BFBFBF")] * 4)
CENTER = Alignment(horizontal="center", vertical="center")


def _count_eq(rng: str, code: str) -> str:
    """원티드 접미사(*)를 무시하고 code와 정확히 일치하는 칸 수를 세는 수식 조각.

    COUNTIF의 "*" 와일드카드는 접두사가 겹치는 코드(N vs NK 등)를 이중 계산하므로
    대신 SUBSTITUTE로 접미사를 지운 뒤 정확히 비교한다."""
    return f'SUMPRODUCT(--(SUBSTITUTE({rng},"*","")="{code}"))'


def _count_off(rng: str) -> str:
    """OFF는 셀에 "OFF"로 안 쓰고 원티드오프는 "X", 일반오프는 "/"로 쓰므로 둘 다 센다."""
    return f'(SUMPRODUCT(--({rng}="X"))+SUMPRODUCT(--({rng}="/")))'


def export_excel(sch: MonthSchedule, days: List[DayInfo], path: str):
    wb = Workbook()
    ws = wb.active
    ws.title = f"{sch.year}-{sch.month:02d}"
    nd = sch.num_days
    first_day_col = 3  # C열부터 1일
    last_day_col = first_day_col + nd - 1

    # 헤더
    ws.cell(1, 1, f"{sch.year}년 {sch.month}월 근무표").font = Font(bold=True, size=14)
    ws.cell(2, 1, "이름").font = Font(bold=True)
    ws.cell(2, 2, "Lv").font = Font(bold=True)
    for d in range(nd):
        c = first_day_col + d
        di = days[d]
        cell = ws.cell(2, c, d + 1)
        dow = ws.cell(3, c, di.dow_name)
        for x in (cell, dow):
            x.alignment = CENTER
            x.font = Font(bold=True)
            if di.is_substitute:
                x.fill = SUB_FILL
            elif di.day_type != DAY_WEEKDAY:
                x.fill = WEEKEND_FILL
        ws.column_dimensions[get_column_letter(c)].width = 4.5

    # 집계 열 (OFF는 단일 COUNTIF 열만, G11)
    sum_cols = ["OFF", "연차", "야간", "근무일"]
    for i, name in enumerate(sum_cols):
        c = last_day_col + 1 + i
        ws.cell(2, c, name).font = Font(bold=True)
        ws.cell(2, c).alignment = CENTER
        ws.column_dimensions[get_column_letter(c)].width = 6

    # 직원 행: 파트장 먼저 (하단 COUNTIF 범위에서 제외하기 위해)
    ordered = sorted(sch.staff, key=lambda s: (not s.is_partjang,))
    row = 4
    partjang_rows = []
    for s in ordered:
        ws.cell(row, 1, s.id)
        ws.cell(row, 2, s.level).alignment = CENTER
        if s.is_partjang:
            partjang_rows.append(row)
        for d in range(nd):
            v = sch.grid[s.id][d]
            if v == Shift.OFF:
                # 오프는 "OFF" 대신 원티드오프="X" / 일반오프="/"로 표시(병원 표준 표기)
                text = "X" if (s.id, d) in sch.wanted else "/"
            else:
                text = str(v) if v else ""
                if v and (s.id, d) in sch.wanted:
                    text += "*"   # 원티드(신청/관리자 지정) 표시
            c = ws.cell(row, first_day_col + d, text)
            c.alignment = CENTER
            c.border = THIN
            if v in SHIFT_FILLS:
                c.fill = PatternFill("solid", fgColor=SHIFT_FILLS[v])
                if v in WHITE_FONT_SHIFTS:
                    c.font = Font(color="FFFFFF")
        a = get_column_letter(first_day_col)
        b = get_column_letter(last_day_col)
        rng = f"{a}{row}:{b}{row}"
        ws.cell(row, last_day_col + 1, f'={_count_off(rng)}').alignment = CENTER
        ws.cell(row, last_day_col + 2, f'={_count_eq(rng, "연차")}').alignment = CENTER
        ws.cell(row, last_day_col + 3,
                f'={_count_eq(rng, "N")}+{_count_eq(rng, "NK")}').alignment = CENTER
        ws.cell(row, last_day_col + 4,
                f'={nd}-{_count_off(rng)}-{_count_eq(rng, "연차")}').alignment = CENTER
        row += 1

    # 하단 합계행: 파트장 행 제외 범위로 COUNTIF (G10)
    nurse_top = 4 + len(partjang_rows)
    nurse_bot = row - 1
    labels = [("D", ["D"]),
              ("E", ["E"]),
              ("N", ["N", "NK"]),
              ("prn", ["prn", "8A"])]
    sum_start = row + 1
    for i, (name, codes) in enumerate(labels):
        rr = sum_start + i
        ws.cell(rr, 1, f"{name} 계").font = Font(bold=True)
        for d in range(nd):
            col = get_column_letter(first_day_col + d)
            rng = f"{col}{nurse_top}:{col}{nurse_bot}"
            formula = "=" + "+".join(_count_eq(rng, code) for code in codes)
            cell = ws.cell(rr, first_day_col + d, formula)
            cell.alignment = CENTER
            cell.border = THIN

    # 일별 숙련도 평균 (G12) — 파트장 제외 근무자 평균, 값으로 기록
    rr = sum_start + len(labels)
    ws.cell(rr, 1, "Lv 평균").font = Font(bold=True)
    for d in range(nd):
        levels = [s.level for s in sch.staff
                  if not s.is_partjang and sch.grid[s.id][d] in WORK_SHIFTS]
        val = round(sum(levels) / len(levels), 2) if levels else ""
        cell = ws.cell(rr, first_day_col + d, val)
        cell.alignment = CENTER
        cell.border = THIN

    ws.freeze_panes = ws.cell(4, first_day_col)  # 이름·Lv 고정, 일자 가로 스크롤
    ws.column_dimensions["A"].width = 12
    ws.column_dimensions["B"].width = 4
    wb.save(path)


# ---------------------------------------------------------------- 인원표 (다월 자동 연동용)

STAT_FILL = PatternFill("solid", fgColor="E2EFDA")
NK_ROW_FILL = PatternFill("solid", fgColor="F2E9F7")
GROUP_FONT = Font(bold=True, size=11, color="808080")
BOLD = Font(bold=True)


def export_staff_table_xlsx(staff, stats: dict, annual_dates: list,
                             annual_grid: dict, path: str,
                             last_reflected: str = ""):
    """'인원표' 내보내기 — 로스터 + 누적통계(형평성 참고용) + 연간 근무 그리드(1/1~, 참고용).

    staff: List[Staff] (현재 인원 명단, 이 순서/구성대로 출력)
    stats: {staff_id: {"night","workday","off","weekend_night",
                        "blocks_2","blocks_3","months","recent_night_score"}}
    annual_dates: [datetime.date, ...] — 1/1부터 이어진 연간 그리드 날짜(오름차순)
    annual_grid: {staff_id: [code, ...]} — annual_dates와 나란히
    """
    from .excel_input import STAFF_TABLE_STATIC_COLS, STAFF_TABLE_STAT_KEYS, STAFF_TABLE_STAT_LABELS
    from .calendar_utils import WEEKDAY_NAMES

    wb = Workbook()
    ws = wb.active
    ws.title = "인원표"

    n_static = len(STAFF_TABLE_STATIC_COLS)
    n_stat = len(STAFF_TABLE_STAT_KEYS)
    first_day_col = 1 + n_static + n_stat  # 1-based

    title = "인원표"
    if last_reflected:
        title += f" — {last_reflected}까지 반영"
    ws.cell(1, 1, title).font = Font(bold=True, size=13)

    ws.cell(2, 1, "[ 인원 정보 ]").font = GROUP_FONT
    ws.cell(2, 1 + n_static, "[ 누적 통계 (형평성 참고용) ]").font = GROUP_FONT
    if annual_dates:
        ws.cell(2, first_day_col, "[ 연간 근무표 (참고용, 1/1 리셋) ]").font = GROUP_FONT

    header_row = 3
    for i, name in enumerate(STAFF_TABLE_STATIC_COLS):
        c = ws.cell(header_row, 1 + i, name)
        c.font = BOLD
        c.alignment = CENTER
    for i, name in enumerate(STAFF_TABLE_STAT_LABELS):
        c = ws.cell(header_row, 1 + n_static + i, name)
        c.font = BOLD
        c.alignment = CENTER
        c.fill = STAT_FILL

    dow_row = header_row + 1
    for i, d in enumerate(annual_dates):
        c = first_day_col + i
        cell = ws.cell(header_row, c, d)
        cell.number_format = "m/d"
        cell.font = Font(bold=True, size=9)
        cell.alignment = CENTER
        dow = ws.cell(dow_row, c, WEEKDAY_NAMES[d.weekday()])
        dow.font = Font(bold=True, size=9)
        dow.alignment = CENTER
        if d.weekday() >= 5:
            cell.fill = WEEKEND_FILL
            dow.fill = WEEKEND_FILL
        ws.column_dimensions[get_column_letter(c)].width = 4.2

    row0 = dow_row + 1
    for r, s in enumerate(staff):
        row = row0 + r
        is_nk = "night_only" in (s.flags or [])
        note = []
        if is_nk:
            note.append("야간전담")
        if "pregnant" in (s.flags or []):
            note.append("임부(야간 금지)")
        elif "no_night" in (s.flags or []):
            note.append("야간금지")
        static_vals = [r + 1, s.id, s.role, f"Lv{s.level}",
                       ",".join(s.allowed_shifts), ", ".join(note)]
        for i, v in enumerate(static_vals):
            c = ws.cell(row, 1 + i, v)
            c.alignment = CENTER
            if is_nk:
                c.fill = NK_ROW_FILL

        st = stats.get(s.id, {})
        for i, key in enumerate(STAFF_TABLE_STAT_KEYS):
            v = st.get(key, 0)
            c = ws.cell(row, 1 + n_static + i, v)
            c.alignment = CENTER
            c.fill = NK_ROW_FILL if is_nk else STAT_FILL

        codes = annual_grid.get(s.id, [])
        for i in range(len(annual_dates)):
            code = codes[i] if i < len(codes) else ""
            c = ws.cell(row, first_day_col + i, code)
            c.alignment = CENTER
            c.font = Font(size=9)
            if code in SHIFT_FILLS:
                c.fill = PatternFill("solid", fgColor=SHIFT_FILLS[code])
                if code in WHITE_FONT_SHIFTS:
                    c.font = Font(size=9, color="FFFFFF")

    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 9
    ws.column_dimensions["D"].width = 8
    ws.column_dimensions["E"].width = 18
    ws.column_dimensions["F"].width = 22
    if annual_dates:
        ws.freeze_panes = ws.cell(row0, first_day_col)
    wb.save(path)
