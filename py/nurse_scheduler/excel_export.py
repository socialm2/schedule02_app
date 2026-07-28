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
}
WHITE_FONT_SHIFTS = {Shift.N, Shift.NK}
WEEKEND_FILL = PatternFill("solid", fgColor="FCE4EC")
SUB_FILL = PatternFill("solid", fgColor="FFD966")
THIN = Border(*[Side(style="thin", color="BFBFBF")] * 4)
CENTER = Alignment(horizontal="center", vertical="center")


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
            c = ws.cell(row, first_day_col + d, str(v) if v else "")
            c.alignment = CENTER
            c.border = THIN
            if v in SHIFT_FILLS:
                c.fill = PatternFill("solid", fgColor=SHIFT_FILLS[v])
                if v in WHITE_FONT_SHIFTS:
                    c.font = Font(color="FFFFFF")
        a = get_column_letter(first_day_col)
        b = get_column_letter(last_day_col)
        rng = f"{a}{row}:{b}{row}"
        ws.cell(row, last_day_col + 1, f'=COUNTIF({rng},"OFF")').alignment = CENTER
        ws.cell(row, last_day_col + 2, f'=COUNTIF({rng},"연차")').alignment = CENTER
        ws.cell(row, last_day_col + 3,
                f'=COUNTIF({rng},"N")+COUNTIF({rng},"NK")').alignment = CENTER
        ws.cell(row, last_day_col + 4,
                f'={nd}-COUNTIF({rng},"OFF")-COUNTIF({rng},"연차")').alignment = CENTER
        row += 1

    # 하단 합계행: 파트장 행 제외 범위로 COUNTIF (G10)
    nurse_top = 4 + len(partjang_rows)
    nurse_bot = row - 1
    labels = [("D", '=COUNTIF({r},"D")'),
              ("E", '=COUNTIF({r},"E")'),
              ("N", '=COUNTIF({r},"N")+COUNTIF({r},"NK")'),
              ("prn", '=COUNTIF({r},"prn")+COUNTIF({r},"8A")')]
    sum_start = row + 1
    for i, (name, formula) in enumerate(labels):
        rr = sum_start + i
        ws.cell(rr, 1, f"{name} 계").font = Font(bold=True)
        for d in range(nd):
            col = get_column_letter(first_day_col + d)
            rng = f"{col}{nurse_top}:{col}{nurse_bot}"
            cell = ws.cell(rr, first_day_col + d, formula.format(r=rng))
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
