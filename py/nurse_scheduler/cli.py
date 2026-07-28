# -*- coding: utf-8 -*-
"""CLI.

생성:   python -m nurse_scheduler <input.json> [-o outdir]
재생성: python -m nurse_scheduler resolve <input.json> --base <schedule.json>
        --edited <수정본.xlsx|.json> [-o outdir] [--yes]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional

from .generator import Generator, InputError, generate_best
from .reporting import build_report, format_text_report


def load_config(path: str) -> dict:
    """입력 로드: .xlsx(기본 양식) 또는 .json."""
    if path.lower().endswith((".xlsx", ".xlsm")):
        from .excel_input import load_input_xlsx
        return load_input_xlsx(path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _write_outputs(gen: Generator, sch, outdir: str, no_excel: bool,
                   extra: Optional[dict] = None) -> dict:
    report = build_report(sch, gen.days, gen.params, gen.requests)
    if extra:
        report.update(extra)
    os.makedirs(outdir, exist_ok=True)
    tag = f"{gen.year}-{gen.month:02d}"

    sched_json = {
        "ward_id": gen.cfg.get("ward_id", ""),
        "year": gen.year, "month": gen.month,
        "schedule": {s.id: [str(v) for v in sch.grid[s.id]] for s in sch.staff},
    }
    with open(os.path.join(outdir, f"schedule_{tag}.json"), "w",
              encoding="utf-8") as f:
        json.dump(sched_json, f, ensure_ascii=False, indent=2)

    with open(os.path.join(outdir, f"report_{tag}.json"), "w",
              encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    text = format_text_report(report, gen.year, gen.month)
    with open(os.path.join(outdir, f"report_{tag}.txt"), "w",
              encoding="utf-8") as f:
        f.write(text)

    with open(os.path.join(outdir, f"carryover_next_{tag}.json"), "w",
              encoding="utf-8") as f:
        json.dump(gen.build_next_carryover(), f, ensure_ascii=False, indent=2)

    if not no_excel:
        try:
            from .excel_export import export_excel
            export_excel(sch, gen.days,
                         os.path.join(outdir, f"schedule_{tag}.xlsx"))
        except ImportError:
            print("[경고] openpyxl 미설치 — 엑셀 출력 생략 (pip install openpyxl)",
                  file=sys.stderr)

    print(text)
    print(f"출력 완료 → {outdir}/")
    return report


def generate_main(argv) -> int:
    ap = argparse.ArgumentParser(
        prog="nurse_scheduler",
        description="간호사 근무표 자동생성 프로그램")
    ap.add_argument("input", help="입력 파일 — 엑셀(.xlsx, 기본 양식) 또는 JSON")
    ap.add_argument("-o", "--output", default="output", help="출력 디렉터리")
    ap.add_argument("--no-excel", action="store_true", help="엑셀 출력 생략")
    args = ap.parse_args(argv)

    cfg = load_config(args.input)
    try:
        gen, sch = generate_best(cfg)
    except InputError as e:
        print(f"[입력 오류] {e}", file=sys.stderr)
        return 2
    report = _write_outputs(gen, sch, args.output, args.no_excel)
    return 0 if not report["hard_violations"] else 1


def resolve_main(argv) -> int:
    from .resolve import (
        analyze_edits, diff_schedules, format_feedback,
        load_schedule_json, load_schedule_xlsx, parse_grid, resolve,
    )
    ap = argparse.ArgumentParser(
        prog="nurse_scheduler resolve",
        description="리더 수정분을 고정한 채 근무표 재생성")
    ap.add_argument("input", help="원본 입력 파일 (.xlsx 또는 .json)")
    ap.add_argument("--base", required=True,
                    help="기계 생성 근무표 JSON (schedule_YYYY-MM.json)")
    ap.add_argument("--edited", required=True,
                    help="리더 수정본 (.xlsx 또는 .json)")
    ap.add_argument("-o", "--output", default="output_resolve",
                    help="출력 디렉터리")
    ap.add_argument("--no-excel", action="store_true")
    ap.add_argument("--yes", action="store_true",
                    help="피드백 확인 없이 바로 진행")
    args = ap.parse_args(argv)

    cfg = load_config(args.input)
    try:
        probe = Generator(cfg)  # 스키마/일수 파악용
    except InputError as e:
        print(f"[입력 오류] {e}", file=sys.stderr)
        return 2
    ids = [s.id for s in probe.staff]
    nd = probe.sch.num_days

    base = parse_grid(load_schedule_json(args.base), ids, nd)
    if args.edited.lower().endswith((".xlsx", ".xlsm")):
        raw = load_schedule_xlsx(args.edited, ids, nd)
    else:
        raw = load_schedule_json(args.edited)
    edited = parse_grid(raw, ids, nd)

    edits = diff_schedules(base, edited)
    if not edits:
        print("수정된 칸이 없습니다. 재생성이 필요 없습니다.")
        return 0

    # 피드백 (§1/§2 검사 후 이상 보고)
    fb = analyze_edits(cfg, edited, edits)
    print(format_feedback(fb))

    # 사용자 확인 (답변 받고 진행)
    if not args.yes:
        try:
            ans = input("수정분을 고정한 채 재생성을 진행할까요? [y/N] ").strip().lower()
        except EOFError:
            ans = ""
        if ans not in ("y", "yes"):
            print("중단했습니다. (--yes 옵션으로 확인 생략 가능)")
            return 3

    try:
        gen, sch = resolve(cfg, edits)
    except InputError as e:
        print(f"[입력 오류] {e}", file=sys.stderr)
        return 2
    report = _write_outputs(gen, sch, args.output, args.no_excel, extra={
        "resolve_edits": [str(e) for e in edits],
        "resolve_feedback": {
            "hard_edit_related": len(fb.hard_edit_related),
            "soft_edit_related": len(fb.soft_edit_related),
        },
    })
    return 0 if not report["hard_violations"] else 1


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "resolve":
        return resolve_main(argv[1:])
    return generate_main(argv)


if __name__ == "__main__":
    sys.exit(main())
