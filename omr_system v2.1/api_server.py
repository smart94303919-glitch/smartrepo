"""
api_server.py
==============
FastAPI backend that wraps the EXISTING, already-tested OMR pipeline
(config.py / pdf_generator.py / omr_engine.py) behind a REST API, for
consumption by the Ionic mobile frontend.

NOTE ON NAMING: this file is intentionally NOT named `main.py`. This
project already has a working terminal CLI at `main.py` (generate/key/
grade/batch-grade/export subcommands) that must keep working unmodified.
Naming this file `main.py` would silently overwrite that CLI. Run this
backend with:



    uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload

CORE PIPELINE GUARANTEE: this file contains ZERO image-processing logic.
It only does HTTP plumbing -- decoding uploads, building `SheetConfig`
objects, and calling straight into `pdf_generator.generate_omr_sheet()`
and `omr_engine.process_sheet_image()` exactly as the CLI does. The
perspective warp, fiducial detection, and bubble-scoring algorithms are
completely untouched.

Endpoints
---------
    GET  /health                 liveness check
    POST /generate-pdf           JSON sheet params -> streams the PDF back
    POST /grade-sheet            multipart image upload -> JSON results
                                  (mode="key" captures a teacher answer key,
                                   mode="grade" grades a student sheet)
    GET  /results/{sheet_id}     JSON summary of all graded students
    GET  /results/{sheet_id}/export   downloads the results .xlsx
"""

import base64
import io
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import urllib.request

import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

from config import SheetConfig, OUTPUT_DIR, DEBUG_DIR
from pdf_generator import generate_omr_sheet
from omr_engine import process_sheet_image, draw_debug_overlay, OMRProcessingError

# --------------------------------------------------------------------------
# Per-sheet_id storage layout (a real deployment runs multiple concurrent
# quizzes, so keys/results/debug images are namespaced by sheet_id rather
# than the CLI's single global files).
# --------------------------------------------------------------------------

KEYS_DIR = os.path.join(OUTPUT_DIR, "keys")
RESULTS_DIR = os.path.join(OUTPUT_DIR, "results")
PDFS_DIR = os.path.join(OUTPUT_DIR, "pdfs")

for _d in (OUTPUT_DIR, DEBUG_DIR, KEYS_DIR, RESULTS_DIR, PDFS_DIR):
    os.makedirs(_d, exist_ok=True)


def _key_path(sheet_id: str) -> str:
    return os.path.join(KEYS_DIR, f"{sheet_id}.json")


def _results_path(sheet_id: str) -> str:
    return os.path.join(RESULTS_DIR, f"{sheet_id}.xlsx")


def _debug_path(sheet_id: str, name: str) -> str:
    d = os.path.join(DEBUG_DIR, sheet_id)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{name}.png")


# --------------------------------------------------------------------------
# FastAPI app + CORS
# --------------------------------------------------------------------------

app = FastAPI(
    title="OMR Grading API",
    description="REST backend for the OMR sheet generator + OpenCV grader, "
                 "consumed by the Ionic mobile app.",
    version="1.0.0",
)

# Permissive for local development so the Ionic dev server / device can
# reach this API without CORS friction. TODO before production: replace
# "*" with your actual deployed Ionic app's origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


OMR_PROJECT_DIR = Path(__file__).resolve().parent


def start_omr_system() -> dict:
    """Starts the separate OMR frontend/backend stack if it isn't already running."""
    frontend_url = "http://localhost:8100"
    try:
        with urllib.request.urlopen(frontend_url, timeout=2):
            return {"status": "already-running", "url": frontend_url}
    except Exception:
        pass

    try:
        if os.name == "nt":
            subprocess.Popen(
                ["cmd", "/c", "npm start"],
                cwd=str(OMR_PROJECT_DIR),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
            )
        else:
            subprocess.Popen(
                ["npm", "start"],
                cwd=str(OMR_PROJECT_DIR),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        return {"status": "starting", "url": frontend_url}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not start the OMR system: {exc}")


app.post("/api/start-system")(start_omr_system)
app.post("/start-system")(start_omr_system)


# --------------------------------------------------------------------------
# Request/response models
# --------------------------------------------------------------------------

class SheetConfigRequest(BaseModel):
    """Mirrors config.SheetConfig -- this is what the Ionic template-input
    form serializes into JSON for the /generate-pdf call."""
    title: str = "OMR Answer Sheet"
    subject: str = "General"
    quiz_type: str = "Multiple Choice"
    total_questions: int = Field(60, gt=0)
    options_per_question: int = Field(4, ge=1, le=8)
    columns: int = Field(3, gt=0)
    sheet_id: str = "SHEET-0001"
    output_name: str = Field("sheet.pdf", description="Desired output filename")
    student_id_digits: int = 8
    embed_qr: bool = True

    def to_sheet_config(self) -> SheetConfig:
        return SheetConfig(
            title=self.title,
            subject=self.subject,
            quiz_type=self.quiz_type,
            total_questions=self.total_questions,
            options_per_question=self.options_per_question,
            columns=self.columns,
            sheet_id=self.sheet_id,
            student_id_digits=self.student_id_digits,
            embed_qr=self.embed_qr,
        )


class ItemizedRow(BaseModel):
    question: int
    correct_answer: str
    student_answer: str
    is_correct: bool


class GradeSheetResponse(BaseModel):
    mode: str
    sheet_id: str
    student_id: Optional[str] = None
    questions_read: int
    blank_count: int
    multi_marked_count: int
    answer_key: Optional[Dict[str, Optional[str]]] = None
    score: Optional[int] = None
    total_questions: Optional[int] = None
    percentage: Optional[float] = None
    attempted: Optional[int] = None
    itemized: Optional[List[ItemizedRow]] = None
    overlay_image_base64: str


class StudentSummaryRow(BaseModel):
    student_id: str
    score: int
    total_questions: int
    percentage: float
    graded_at: str


# --------------------------------------------------------------------------
# Image decoding helper
# --------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


async def _decode_upload_to_bgr(file: UploadFile) -> np.ndarray:
    """
    Reads an UploadFile into an OpenCV BGR ndarray, applying EXIF-orientation
    correction first. Phone camera photos very commonly carry EXIF rotation
    metadata (portrait shots stored as landscape pixels + a rotation flag);
    cv2.imdecode does NOT apply that flag, so without this step sheets
    captured in portrait mode can arrive sideways/upside-down and fail
    fiducial detection. Pillow's ImageOps.exif_transpose bakes the rotation
    into the actual pixels before we hand off to OpenCV.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{file.content_type}'. "
                   f"Upload a JPEG, PNG, or WEBP image.",
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(raw) / 1e6:.1f} MB). Max is "
                   f"{MAX_UPLOAD_BYTES / 1e6:.0f} MB.",
        )
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        pil_img = Image.open(io.BytesIO(raw))
        pil_img = ImageOps.exif_transpose(pil_img)  # apply EXIF rotation
        pil_img = pil_img.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not decode image: {e}")

    rgb = np.array(pil_img)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return bgr


def _overlay_to_base64(overlay_bgr: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", overlay_bgr)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode debug overlay image.")
    return base64.b64encode(buf.tobytes()).decode("ascii")


STUDENT_ID_PATTERN = re.compile(r"SIC\d{4}-\d{4}")


def _normalize_student_id(text: str) -> Optional[str]:
    """Extract one ID from OCR output after removing layout noise."""
    cleaned = re.sub(r"[^A-Z0-9-]", "", text.upper())
    match = STUDENT_ID_PATTERN.search(cleaned)
    return match.group(0) if match else None


def _read_student_id(image: np.ndarray) -> str:
    """OCR a tightly framed student-ID region using several CV variants."""
    try:
        import pytesseract
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Student ID OCR is unavailable. Install pytesseract and Tesseract OCR.",
        ) from exc

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.copyMakeBorder(gray, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)
    scaled = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    variants = [
        scaled,
        cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
        cv2.adaptiveThreshold(
            scaled, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
        ),
    ]

    try:
        for variant in variants:
            for psm in (7, 6):
                text = pytesseract.image_to_string(
                    variant,
                    config=f"--psm {psm} -c tessedit_char_whitelist=SICsic0123456789-",
                )
                student_id = _normalize_student_id(text)
                if student_id:
                    return student_id
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Tesseract OCR is not installed or is not on the server PATH.",
        ) from exc

    raise HTTPException(
        status_code=422,
        detail="Could not read a valid Student ID. Frame only the ID field and try again.",
    )


def _read_student_id_from_sheet(warped: np.ndarray, digits: int) -> str:
    """Read the handwritten digit boxes from the aligned sheet header."""
    height, width = warped.shape[:2]
    id_region = warped[int(height * 0.07):int(height * 0.22), int(width * 0.34):int(width * 0.98)]
    gray = cv2.cvtColor(id_region, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    thresholded = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]

    try:
        import pytesseract
        text = pytesseract.image_to_string(
            thresholded,
            config="--psm 7 -c tessedit_char_whitelist=0123456789",
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Student ID OCR is unavailable. Install pytesseract and Tesseract OCR.",
        ) from exc
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Tesseract OCR is not installed or is not on the server PATH.",
        ) from exc

    detected = re.sub(r"\D", "", text)
    if len(detected) >= digits:
        return detected[:digits]
    raise HTTPException(
        status_code=422,
        detail="Could not detect the Student ID written on this sheet. Make sure all ID boxes are visible.",
    )


def _load_sheet_config_for_scan(
    sheet_id: str,
    total_questions: Optional[int],
    options_per_question: Optional[int],
    columns: Optional[int],
) -> SheetConfig:
    """
    Resolves the SheetConfig to use when scanning: if this sheet_id already
    has a saved config (from a prior /generate-pdf call), use it; explicit
    query params override individual fields; otherwise fall back to
    defaults. This mirrors main.py's `_resolve_cfg_for_scan` CLI behavior.
    """
    cfg_path = os.path.join(PDFS_DIR, f"{sheet_id}.config.json")
    base = {"sheet_id": sheet_id}
    if os.path.exists(cfg_path):
        with open(cfg_path) as f:
            base.update(json.load(f))
    if total_questions is not None:
        base["total_questions"] = total_questions
    if options_per_question is not None:
        base["options_per_question"] = options_per_question
    if columns is not None:
        base["columns"] = columns
    if "total_questions" not in base:
        raise HTTPException(
            status_code=400,
            detail=f"No saved configuration found for sheet_id '{sheet_id}'. "
                   f"Generate the sheet first, or pass total_questions/"
                   f"options_per_question/columns explicitly.",
        )
    return SheetConfig(**base)


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds")}


@app.post("/scan-student-id")
async def scan_student_id(
    file: UploadFile = File(..., description="Tightly framed photo of the Student ID field"),
):
    """Extract and validate an ID in the canonical SICYYYY-XXXX format."""
    image = await _decode_upload_to_bgr(file)
    return {"student_id": _read_student_id(image), "pattern": "SICYYYY-XXXX"}


@app.post("/generate-pdf")
def generate_pdf(payload: SheetConfigRequest):
    """
    Builds the OMR sheet PDF via the UNCHANGED pdf_generator.generate_omr_sheet()
    and streams it straight back to the Ionic app for preview/download. The
    resolved SheetConfig is also cached to disk so a later /grade-sheet call
    for this sheet_id automatically knows the right question/option/column
    counts without the mobile app having to resend them.
    """
    cfg = payload.to_sheet_config()
    out_path = os.path.join(PDFS_DIR, payload.output_name)

    try:
        generate_omr_sheet(cfg, out_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    # cache config for later scan calls
    cfg_cache_path = os.path.join(PDFS_DIR, f"{cfg.sheet_id}.config.json")
    with open(cfg_cache_path, "w") as f:
        json.dump(
            {
                "total_questions": cfg.total_questions,
                "options_per_question": cfg.options_per_question,
                "columns": cfg.columns,
                "title": cfg.title,
                "subject": cfg.subject,
                "quiz_type": cfg.quiz_type,
                "student_id_digits": cfg.student_id_digits,
                "embed_qr": cfg.embed_qr,
            },
            f,
        )

    return FileResponse(
        out_path,
        media_type="application/pdf",
        filename=payload.output_name,
    )


@app.post("/grade-sheet", response_model=GradeSheetResponse)
async def grade_sheet(
    file: UploadFile = File(..., description="Photo of the OMR sheet"),
    mode: str = Form(..., description='"key" to capture a teacher answer key, "grade" to grade a student sheet'),
    sheet_id: str = Form(...),
    student_id: Optional[str] = Form(None, description="Required when mode='grade'"),
    total_questions: Optional[int] = Form(None),
    options_per_question: Optional[int] = Form(None),
    columns: Optional[int] = Form(None),
):
    """
    Single endpoint handling both pipeline entry points from the mobile app:

      mode="key"   -> runs the UNCHANGED omr_engine.process_sheet_image()
                       on a teacher's filled master sheet, saves the result
                       as this sheet_id's answer key.
      mode="grade" -> loads that saved key and grades a student's photo
                       against it, appends to this sheet_id's results
                       workbook.

    Both branches call the exact same `process_sheet_image()` /
    `draw_debug_overlay()` functions the CLI uses -- no CV logic is
    duplicated or altered here.
    """
    if mode not in ("key", "grade"):
        raise HTTPException(status_code=400, detail="mode must be 'key' or 'grade'")

    cfg = _load_sheet_config_for_scan(sheet_id, total_questions, options_per_question, columns)
    image = await _decode_upload_to_bgr(file)

    try:
        results, warped = process_sheet_image(image, cfg)
    except OMRProcessingError as e:
        # Friendly, actionable error instead of a raw 500/stack trace --
        # this is what the Ionic app should surface directly to the user.
        raise HTTPException(
            status_code=422,
            detail=f"Could not align sheet: {e} "
                   f"Make sure all 4 corner squares are visible, the sheet "
                   f"isn't folded, and lighting is even.",
        )

    if mode == "grade" and not student_id:
        student_id = _read_student_id_from_sheet(warped, cfg.student_id_digits)

    overlay = draw_debug_overlay(warped, cfg, results)
    n_blank = sum(1 for r in results.values() if r.selected is None and not r.multi_marked)
    n_multi = sum(1 for r in results.values() if r.multi_marked)

    if mode == "key":
        debug_name = "teacher_key"
        cv2.imwrite(_debug_path(sheet_id, debug_name), overlay)

        key = {str(q): r.selected for q, r in results.items()}
        with open(_key_path(sheet_id), "w") as f:
            json.dump(
                {
                    "sheet_config": {
                        "total_questions": cfg.total_questions,
                        "options_per_question": cfg.options_per_question,
                        "columns": cfg.columns,
                    },
                    "answer_key": key,
                    "saved_at": datetime.now().isoformat(timespec="seconds"),
                },
                f,
                indent=2,
            )

        return GradeSheetResponse(
            mode="key",
            sheet_id=sheet_id,
            questions_read=len(results),
            blank_count=n_blank,
            multi_marked_count=n_multi,
            answer_key=key,
            overlay_image_base64=_overlay_to_base64(overlay),
        )

    # mode == "grade"
    if not os.path.exists(_key_path(sheet_id)):
        raise HTTPException(
            status_code=404,
            detail=f"No answer key found for sheet_id '{sheet_id}'. "
                   f"Capture the teacher key first (mode='key').",
        )
    with open(_key_path(sheet_id)) as f:
        key_payload = json.load(f)
    answer_key = {int(k): v for k, v in key_payload["answer_key"].items()}

    debug_name = f"student_{student_id}"
    cv2.imwrite(_debug_path(sheet_id, debug_name), overlay)

    itemized: List[ItemizedRow] = []
    correct = 0
    attempted = 0
    for q in sorted(answer_key):
        expected = answer_key[q]
        res = results.get(q)
        chosen = res.selected if res else None
        is_multi = res.multi_marked if res else False
        is_correct = (expected is not None) and (chosen == expected) and not is_multi
        if is_correct:
            correct += 1
        if chosen is not None or is_multi:
            attempted += 1
        itemized.append(
            ItemizedRow(
                question=q,
                correct_answer=expected or "",
                student_answer="MULTI" if is_multi else (chosen or "BLANK"),
                is_correct=is_correct,
            )
        )

    total = len(answer_key)
    percentage = round((correct / total * 100.0) if total else 0.0, 2)
    _append_result_row(sheet_id, student_id, correct, total, percentage)

    return GradeSheetResponse(
        mode="grade",
        sheet_id=sheet_id,
        student_id=student_id,
        questions_read=len(results),
        blank_count=n_blank,
        multi_marked_count=n_multi,
        score=correct,
        total_questions=total,
        percentage=percentage,
        attempted=attempted,
        itemized=itemized,
        overlay_image_base64=_overlay_to_base64(overlay),
    )


def _append_result_row(sheet_id: str, student_id: str, correct: int, total: int, percentage: float) -> None:
    """Upserts this student's row into the sheet_id's results.xlsx (replaces
    any prior row for the same student_id, so re-grading doesn't duplicate)."""
    path = _results_path(sheet_id)
    row = {
        "student_id": student_id,
        "score": correct,
        "total_questions": total,
        "percentage": percentage,
        "graded_at": datetime.now().isoformat(timespec="seconds"),
    }
    if os.path.exists(path):
        df = pd.read_excel(path)
        df = df[df["student_id"] != student_id]
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    else:
        df = pd.DataFrame([row])
    df.to_excel(path, index=False)


@app.get("/results/{sheet_id}", response_model=List[StudentSummaryRow])
def get_results(sheet_id: str):
    path = _results_path(sheet_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"No results yet for sheet_id '{sheet_id}'.")
    df = pd.read_excel(path)
    return df.to_dict(orient="records")


@app.get("/results/{sheet_id}/export")
def export_results(sheet_id: str):
    path = _results_path(sheet_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"No results yet for sheet_id '{sheet_id}'.")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"{sheet_id}_results.xlsx",
    )
