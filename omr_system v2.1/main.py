"""
main.py
=======
Interactive command-line runner that ties the whole OMR system together:

    1. Generate a customizable bubble-sheet PDF (pdf_generator.py)
    2. Capture a TEACHER's answer key from a photographed/scanned master
       sheet (omr_engine.py) and save it
    3. Sequentially capture STUDENT sheets (webcam or image files), grade
       each against the saved key, and export a full results workbook
       (pandas + openpyxl)

Run it with no arguments for a guided interactive menu:

    $ python main.py

or use the non-interactive subcommands for scripting, e.g.:

    $ python main.py generate --questions 60 --options 4 --columns 3
    $ python main.py key --image path/to/teacher_sheet.jpg
    $ python main.py grade --image path/to/student1.jpg --student-id S001
    $ python main.py export
"""

import argparse
import glob
import json
import os
import sys
from dataclasses import asdict
from datetime import datetime
from typing import Dict, List, Optional

import cv2
import numpy as np
import pandas as pd

from config import SheetConfig, OUTPUT_DIR, ANSWER_KEY_PATH, RESULTS_XLSX_PATH, DEBUG_DIR
from pdf_generator import generate_omr_sheet
from omr_engine import (
    process_sheet_image,
    draw_debug_overlay,
    OMRProcessingError,
    QuestionResult,
)


# --------------------------------------------------------------------------
# Small persistence helpers -- the "database" for this CLI tool is just a
# couple of JSON files + one growing Excel workbook, which keeps the
# project dependency-free (no SQLite/Postgres needed for a classroom tool).
# --------------------------------------------------------------------------

def _ensure_dirs() -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(DEBUG_DIR, exist_ok=True)


def save_answer_key(cfg: SheetConfig, key: Dict[int, Optional[str]]) -> None:
    _ensure_dirs()
    payload = {
        "sheet_config": asdict(cfg),
        "answer_key": {str(k): v for k, v in key.items()},
        "saved_at": datetime.now().isoformat(timespec="seconds"),
    }
    with open(ANSWER_KEY_PATH, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"[OK] Answer key saved -> {ANSWER_KEY_PATH}")


def load_answer_key() -> "tuple[SheetConfig, Dict[int, Optional[str]]]":
    if not os.path.exists(ANSWER_KEY_PATH):
        raise FileNotFoundError(
            f"No answer key found at {ANSWER_KEY_PATH}. "
            "Run the 'key' step (process the teacher's sheet) first."
        )
    with open(ANSWER_KEY_PATH) as f:
        payload = json.load(f)
    cfg = SheetConfig(**payload["sheet_config"])
    key = {int(k): v for k, v in payload["answer_key"].items()}
    return cfg, key


# --------------------------------------------------------------------------
# Image acquisition: file path OR webcam capture
# --------------------------------------------------------------------------

def load_image_from_file(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(f"Could not read image at '{path}'. Check the path/format.")
    return img


def capture_image_from_webcam(camera_index: int = 0) -> np.ndarray:
    """
    Opens a live webcam preview. Press SPACE to capture the current frame,
    or ESC to cancel. Requires a display (won't work over a headless SSH
    session without X forwarding) -- use file-based input in that case.
    """
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(
            f"Could not open webcam at index {camera_index}. "
            "Check that a camera is connected and not in use by another app."
        )
    print("Webcam preview open. Press SPACE to capture, ESC to cancel.")
    captured = None
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                raise RuntimeError("Failed to read frame from webcam.")
            cv2.imshow("OMR Capture - SPACE to capture, ESC to cancel", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == 27:  # ESC
                break
            elif key == 32:  # SPACE
                captured = frame.copy()
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
    if captured is None:
        raise RuntimeError("Capture cancelled -- no frame was grabbed.")
    return captured


def acquire_image(image_path: Optional[str], use_webcam: bool) -> np.ndarray:
    if use_webcam:
        return capture_image_from_webcam()
    if image_path:
        return load_image_from_file(image_path)
    raise ValueError("Either an image path or --webcam must be provided.")


# --------------------------------------------------------------------------
# Core actions
# --------------------------------------------------------------------------

def action_generate(args) -> None:
    cfg = SheetConfig(
        title=args.title,
        subject=args.subject,
        quiz_type=args.quiz_type,
        total_questions=args.questions,
        options_per_question=args.options,
        columns=args.columns,
        sheet_id=args.sheet_id,
    )
    _ensure_dirs()
    out_path = os.path.join(OUTPUT_DIR, args.output)
    generate_omr_sheet(cfg, out_path)
    print(f"[OK] Generated OMR sheet -> {out_path}")
    print(
        f"     {cfg.total_questions} questions, options A-"
        f"{cfg.option_letters[-1]}, {cfg.columns} columns"
    )
    # Persist the config used, so 'key'/'grade' steps downstream default to
    # matching parameters without the operator re-typing them.
    with open(os.path.join(OUTPUT_DIR, "last_sheet_config.json"), "w") as f:
        json.dump(asdict(cfg), f, indent=2)


def _resolve_cfg_for_scan(args) -> SheetConfig:
    """
    Figures out which SheetConfig to use for a scan: explicit CLI flags
    override, otherwise fall back to the last-generated sheet's config
    (saved by `action_generate`), otherwise the dataclass defaults.
    """
    last_cfg_path = os.path.join(OUTPUT_DIR, "last_sheet_config.json")
    base = {}
    if os.path.exists(last_cfg_path):
        with open(last_cfg_path) as f:
            base = json.load(f)
    if args.questions is not None:
        base["total_questions"] = args.questions
    if args.options is not None:
        base["options_per_question"] = args.options
    if args.columns is not None:
        base["columns"] = args.columns
    if not base:
        raise ValueError(
            "No sheet configuration found. Either generate a sheet first "
            "(python main.py generate ...) or pass --questions/--options/--columns explicitly."
        )
    return SheetConfig(**base)


def _process_and_report(image: np.ndarray, cfg: SheetConfig, debug_name: str):
    try:
        results, warped = process_sheet_image(image, cfg)
    except OMRProcessingError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

    overlay = draw_debug_overlay(warped, cfg, results)
    _ensure_dirs()
    debug_path = os.path.join(DEBUG_DIR, f"{debug_name}.png")
    cv2.imwrite(debug_path, overlay)
    print(f"[debug] Alignment/scoring overlay saved -> {debug_path}")

    n_blank = sum(1 for r in results.values() if r.selected is None and not r.multi_marked)
    n_multi = sum(1 for r in results.values() if r.multi_marked)
    print(f"        {len(results)} questions read, {n_blank} blank, {n_multi} ambiguous/multi-marked")
    return results


def action_key(args) -> None:
    cfg = _resolve_cfg_for_scan(args)
    image = acquire_image(args.image, args.webcam)
    results = _process_and_report(image, cfg, "teacher_key_overlay")
    key = {q: r.selected for q, r in results.items()}

    if any(v is None for v in key.values()):
        print(
            "[WARN] One or more questions on the teacher sheet were read as "
            "blank/ambiguous. Review the debug overlay before trusting this key."
        )

    save_answer_key(cfg, key)
    print("Answer key summary:")
    for q in sorted(key):
        print(f"  Q{q}: {key[q] if key[q] else '-'}")


def _grade(results: Dict[int, QuestionResult], key: Dict[int, Optional[str]]):
    """Compares a student's read answers against the master key."""
    rows = []
    correct = 0
    attempted = 0
    for q in sorted(key):
        expected = key[q]
        res = results.get(q)
        chosen = res.selected if res else None
        is_multi = res.multi_marked if res else False
        is_correct = (expected is not None) and (chosen == expected) and not is_multi
        if is_correct:
            correct += 1
        if chosen is not None or is_multi:
            attempted += 1
        rows.append(
            {
                "question": q,
                "correct_answer": expected if expected else "",
                "student_answer": ("MULTI" if is_multi else (chosen if chosen else "BLANK")),
                "is_correct": is_correct,
            }
        )
    total = len(key)
    return rows, correct, attempted, total


def action_grade(args) -> None:
    cfg, key = load_answer_key()
    if args.questions or args.options or args.columns:
        # allow overriding in case the student sheet uses a variant config
        cfg = _resolve_cfg_for_scan(args)

    student_id = args.student_id or os.path.splitext(os.path.basename(args.image or "webcam_capture"))[0]
    image = acquire_image(args.image, args.webcam)
    results = _process_and_report(image, cfg, f"student_{student_id}_overlay")

    rows, correct, attempted, total = _grade(results, key)
    score_pct = (correct / total * 100.0) if total else 0.0
    print(f"\n[RESULT] {student_id}: {correct}/{total} correct ({score_pct:.1f}%), {attempted} attempted")

    _append_student_result(student_id, rows, correct, total, score_pct)


def _append_student_result(
    student_id: str, rows: List[dict], correct: int, total: int, score_pct: float
) -> None:
    """
    Appends this student's itemized breakdown + summary score into the
    running results workbook (creates it on first use). Two sheets are
    maintained: 'Summary' (one row per student) and 'Itemized' (one row
    per student per question, for detailed QA/appeals).
    """
    _ensure_dirs()

    summary_row = {
        "student_id": student_id,
        "score": correct,
        "total_questions": total,
        "percentage": round(score_pct, 2),
        "graded_at": datetime.now().isoformat(timespec="seconds"),
    }
    itemized_rows = [{"student_id": student_id, **r} for r in rows]

    if os.path.exists(RESULTS_XLSX_PATH):
        summary_df = pd.read_excel(RESULTS_XLSX_PATH, sheet_name="Summary")
        itemized_df = pd.read_excel(RESULTS_XLSX_PATH, sheet_name="Itemized")
        # Replace any prior entry for the same student_id (re-grading)
        summary_df = summary_df[summary_df["student_id"] != student_id]
        itemized_df = itemized_df[itemized_df["student_id"] != student_id]
        summary_df = pd.concat([summary_df, pd.DataFrame([summary_row])], ignore_index=True)
        itemized_df = pd.concat([itemized_df, pd.DataFrame(itemized_rows)], ignore_index=True)
    else:
        summary_df = pd.DataFrame([summary_row])
        itemized_df = pd.DataFrame(itemized_rows)

    with pd.ExcelWriter(RESULTS_XLSX_PATH, engine="openpyxl") as writer:
        summary_df.to_excel(writer, sheet_name="Summary", index=False)
        itemized_df.to_excel(writer, sheet_name="Itemized", index=False)

    print(f"[OK] Results updated -> {RESULTS_XLSX_PATH}")


def action_batch_grade(args) -> None:
    """Grades every image file in a folder in one pass (glob on --folder)."""
    cfg, key = load_answer_key()
    pattern = os.path.join(args.folder, "*")
    paths = sorted(
        p for p in glob.glob(pattern)
        if p.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".tiff"))
    )
    if not paths:
        print(f"[WARN] No image files found in {args.folder}")
        return

    print(f"Found {len(paths)} sheets to grade in {args.folder}")
    for path in paths:
        student_id = os.path.splitext(os.path.basename(path))[0]
        try:
            image = load_image_from_file(path)
            results = _process_and_report(image, cfg, f"student_{student_id}_overlay")
            rows, correct, attempted, total = _grade(results, key)
            score_pct = (correct / total * 100.0) if total else 0.0
            print(f"  {student_id}: {correct}/{total} ({score_pct:.1f}%)")
            _append_student_result(student_id, rows, correct, total, score_pct)
        except OMRProcessingError as e:
            print(f"  [SKIP] {student_id}: {e}")


def action_export(args) -> None:
    if not os.path.exists(RESULTS_XLSX_PATH):
        print(f"[WARN] No results file yet at {RESULTS_XLSX_PATH}. Grade some sheets first.")
        return
    print(f"Results workbook already up to date at: {RESULTS_XLSX_PATH}")
    summary_df = pd.read_excel(RESULTS_XLSX_PATH, sheet_name="Summary")
    print(summary_df.to_string(index=False))


# --------------------------------------------------------------------------
# Interactive guided menu (no subcommand given)
# --------------------------------------------------------------------------

def _prompt(msg: str, default: Optional[str] = None) -> str:
    suffix = f" [{default}]" if default is not None else ""
    val = input(f"{msg}{suffix}: ").strip()
    return val if val else (default or "")


def interactive_menu() -> None:
    print("=" * 60)
    print(" OMR System -- Interactive Runner")
    print("=" * 60)
    while True:
        print(
            "\n1) Generate a new bubble sheet PDF"
            "\n2) Capture teacher answer key"
            "\n3) Grade a single student sheet"
            "\n4) Batch-grade a folder of student sheets"
            "\n5) Show current results summary"
            "\n6) Quit"
        )
        choice = _prompt("Choose an option", "6")

        if choice == "1":
            title = _prompt("Sheet title", "OMR Answer Sheet")
            subject = _prompt("Subject", "General")
            quiz_type = _prompt("Quiz type", "Multiple Choice")
            questions = int(_prompt("Total questions", "60"))
            options = int(_prompt("Options per question (A-H, i.e. 1-8)", "4"))
            columns = int(_prompt("Number of columns", "3"))
            sheet_id = _prompt("Sheet ID", "SHEET-0001")
            args = argparse.Namespace(
                title=title, subject=subject, quiz_type=quiz_type,
                questions=questions, options=options, columns=columns,
                sheet_id=sheet_id, output="sheet.pdf",
            )
            action_generate(args)

        elif choice == "2":
            use_webcam = _prompt("Use webcam? (y/n)", "n").lower() == "y"
            image_path = None if use_webcam else _prompt("Path to teacher sheet image")
            args = argparse.Namespace(
                image=image_path, webcam=use_webcam,
                questions=None, options=None, columns=None,
            )
            action_key(args)

        elif choice == "3":
            use_webcam = _prompt("Use webcam? (y/n)", "n").lower() == "y"
            image_path = None if use_webcam else _prompt("Path to student sheet image")
            student_id = _prompt("Student ID")
            args = argparse.Namespace(
                image=image_path, webcam=use_webcam, student_id=student_id,
                questions=None, options=None, columns=None,
            )
            action_grade(args)

        elif choice == "4":
            folder = _prompt("Folder containing student sheet images")
            args = argparse.Namespace(folder=folder)
            action_batch_grade(args)

        elif choice == "5":
            action_export(argparse.Namespace())

        else:
            print("Goodbye!")
            break


# --------------------------------------------------------------------------
# Argument parsing
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="OMR bubble-sheet generation & grading system")
    sub = p.add_subparsers(dest="command")

    g = sub.add_parser("generate", help="Generate a new bubble-sheet PDF")
    g.add_argument("--title", default="OMR Answer Sheet")
    g.add_argument("--subject", default="General")
    g.add_argument("--quiz-type", dest="quiz_type", default="Multiple Choice")
    g.add_argument("--questions", type=int, default=60)
    g.add_argument("--options", type=int, default=4, help="Options per question, 1-8 (A-H)")
    g.add_argument("--columns", type=int, default=3)
    g.add_argument("--sheet-id", dest="sheet_id", default="SHEET-0001")
    g.add_argument("--output", default="sheet.pdf", help="Output filename inside output/")
    g.set_defaults(func=action_generate)

    k = sub.add_parser("key", help="Process the teacher's master sheet into an answer key")
    k.add_argument("--image", help="Path to the teacher sheet image")
    k.add_argument("--webcam", action="store_true", help="Capture from webcam instead of a file")
    k.add_argument("--questions", type=int, default=None)
    k.add_argument("--options", type=int, default=None)
    k.add_argument("--columns", type=int, default=None)
    k.set_defaults(func=action_key)

    s = sub.add_parser("grade", help="Grade a single student sheet against the saved key")
    s.add_argument("--image", help="Path to the student sheet image")
    s.add_argument("--webcam", action="store_true", help="Capture from webcam instead of a file")
    s.add_argument("--student-id", dest="student_id", default=None)
    s.add_argument("--questions", type=int, default=None)
    s.add_argument("--options", type=int, default=None)
    s.add_argument("--columns", type=int, default=None)
    s.set_defaults(func=action_grade)

    b = sub.add_parser("batch-grade", help="Grade every image in a folder against the saved key")
    b.add_argument("--folder", required=True)
    b.set_defaults(func=action_batch_grade)

    e = sub.add_parser("export", help="Print/refresh the current results summary")
    e.set_defaults(func=action_export)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    if not args.command:
        interactive_menu()
        return
    args.func(args)


if __name__ == "__main__":
    main()
