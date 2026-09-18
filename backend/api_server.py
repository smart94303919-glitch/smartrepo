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

It only does HTTP plumbing -- decoding uploads, building `SheetConfig`
objects, and calling straight into `pdf_generator.generate_omr_sheet()`
and `omr_engine.process_sheet_image()` exactly as the CLI does. The
perspective warp, fiducial detection, and bubble-scoring algorithms are
completely untouched.

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
import binascii
import inspect
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import traceback
from functools import wraps
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

# Ensure the backend directory is dynamically added to Python's module search path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import urllib.request

import cv2
import numpy as np
import pandas as pd
import pytesseract
from supabase import Client, create_client
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from PIL import Image, ImageOps

from config import SheetConfig, OUTPUT_DIR, DEBUG_DIR
from pdf_generator import (
    encode_student_qr_payload,
    format_student_name,
    generate_omr_sheets,
)
from omr_engine import process_sheet_image, draw_debug_overlay, OMRProcessingError

# Configure Tesseract OCR binary path dynamically (Cross-Platform / Cloud Ready)
TESSERACT_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

if os.path.exists(TESSERACT_WIN_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_WIN_PATH
    print(f"[OCR] Windows Tesseract configured at: {TESSERACT_WIN_PATH}")
elif shutil.which("tesseract"):
    pytesseract.pytesseract.tesseract_cmd = shutil.which("tesseract")
    print(f"[OCR] Linux/Render Tesseract found in PATH: {shutil.which('tesseract')}")
else:
    print("[OCR] Warning: Tesseract executable not found. Ensure Tesseract OCR is installed on system PATH.")

load_dotenv(Path(__file__).resolve().parent / ".env")

# --------------------------------------------------------------------------
# Per-sheet_id storage layout
# --------------------------------------------------------------------------

KEYS_DIR = os.path.join(OUTPUT_DIR, "keys")
RESULTS_DIR = os.path.join(OUTPUT_DIR, "results")
PDFS_DIR = os.path.join(OUTPUT_DIR, "pdfs")

for _d in (OUTPUT_DIR, DEBUG_DIR, KEYS_DIR, RESULTS_DIR, PDFS_DIR):
    os.makedirs(_d, exist_ok=True)

# In-memory storage for student summaries during process lifetime
IN_MEMORY_RESULTS: dict[str, list["StudentSummaryRow"]] = {}


def _key_path(sheet_id: str) -> str:
    return os.path.join(KEYS_DIR, f"{sheet_id}.json")


def _results_path(sheet_id: str) -> str:
    return os.path.join(RESULTS_DIR, f"{sheet_id}.xlsx")


def _debug_path(sheet_id: str, name: str) -> str:
    d = os.path.join(DEBUG_DIR, sheet_id)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{name}.png")


# --------------------------------------------------------------------------
# FastAPI app + APK / Render CORS Config
# --------------------------------------------------------------------------

app = FastAPI(
    title="OMR Grading API",
    description="REST backend for the OMR sheet generator + OpenCV grader, "
                 "consumed by the Ionic mobile app.",
    version="1.0.0",
)

# Cross-Origin configuration explicitly supporting Android APK / Capacitor origins
origins = [
    "http://localhost",
    "http://localhost:8100",
    "http://localhost:8080",
    "capacitor://localhost",
    "https://localhost",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


OMR_PROJECT_DIR = Path(__file__).resolve().parent


def _get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_URL and SUPABASE_KEY must be configured for sheet generation.",
        )
    return create_client(url, key)


def _link_sheet_to_professor(supabase: Client, sheet_id: str, prof_id: Optional[int]) -> None:
    """Create the sheet_prof link without making PDF generation fail."""
    if prof_id is None:
        print(f"[PDF Gen] Warning: No prof_id supplied; sheet_prof link skipped for '{sheet_id}'")
        return

    try:
        active_prof_id = int(prof_id)
    except (TypeError, ValueError):
        print(f"[PDF Gen] Warning: Invalid prof_id '{prof_id}'; sheet_prof link skipped for '{sheet_id}'")
        return

    if active_prof_id <= 0:
        print(f"[PDF Gen] Warning: Invalid prof_id '{prof_id}'; sheet_prof link skipped for '{sheet_id}'")
        return

    existing_mapping = (
        supabase.table("sheet_prof")
        .select("assignment_id")
        .eq("sheet_id", str(sheet_id))
        .eq("prof_id", active_prof_id)
        .limit(1)
        .execute()
    )

    if existing_mapping.data:
        return

    supabase.table("sheet_prof").insert({
        "sheet_id": str(sheet_id),
        "prof_id": active_prof_id,
    }).execute()
    print(f"[PDF Gen] Linked sheet '{sheet_id}' to professor {active_prof_id}")


def fetch_assigned_students(section_id, subject_id, prof_id=None):
    """Fetch students enrolled in a section and subject from the current schema."""
    supabase = _get_supabase_client()
    try:
        sec_id = int(section_id)
        subj_id = int(subject_id)
    except (ValueError, TypeError):
        print(f"[PDF GEN ERROR] Invalid section_id ({section_id}) or subject_id ({subject_id})")
        return []

    print(f"\n[PDF GEN] Querying stud_section_subj for section={sec_id}, subject={subj_id}")

    enrollment_response = (
        supabase.table("stud_section_subj")
        .select("student_id, student_tbl(s_firstname, s_middlename, s_lastname)")
        .eq("section_id", sec_id)
        .eq("subj_id", subj_id)
        .execute()
    )

    enrollment_rows = enrollment_response.data or []
    if not enrollment_rows:
        print("[PDF GEN] No students found in stud_section_subj")
        return []

    students = []
    seen_ids = set()
    for row in enrollment_rows:
        student_id = str(row.get("student_id", "")).strip()
        student_record = row.get("student_tbl") or {}
        if isinstance(student_record, list):
            student_record = student_record[0] if student_record else {}
        if not student_id or student_id in seen_ids:
            continue
        seen_ids.add(student_id)
        students.append({
            "student_id": student_id,
            "student_name": format_student_name(
                student_record.get("s_firstname"),
                student_record.get("s_middlename"),
                student_record.get("s_lastname"),
                student_id,
            ),
        })

    print(f"[PDF GEN] Retrieved {len(students)} student(s): {students}")
    return students


def fetch_student_names(student_ids: list[str]) -> dict[str, str]:
    """Fetch printable names for IDs already selected for sheet generation."""
    if not student_ids:
        return {}

    students_response = (
        _get_supabase_client()
        .table("student_tbl")
        .select("student_id, s_firstname, s_middlename, s_lastname")
        .in_("student_id", student_ids)
        .execute()
    )
    return {
        str(row.get("student_id", "")).strip(): format_student_name(
            row.get("s_firstname"),
            row.get("s_middlename"),
            row.get("s_lastname"),
            str(row.get("student_id", "")).strip(),
        )
        for row in (students_response.data or [])
        if row.get("student_id")
    }


def _get_enrolled_student_ids(
    sheet_id: str,
    section_id: Optional[int],
    subject_id: Optional[int],
    prof_id: Optional[int] = None,
) -> tuple[list[str], Optional[int], Optional[int]]:
    """Resolve sheet metadata and return enrolled IDs for its subject/section."""
    supabase = _get_supabase_client()

    if section_id is None or subject_id is None:
        sheet_response = (
            supabase.table("sheet_tbl")
            .select("section_id, subj_id")
            .eq("sheet_id", sheet_id)
            .maybe_single()
            .execute()
        )
        sheet_row = sheet_response.data
        if not sheet_row:
            raise HTTPException(
                status_code=404,
                detail=f"No sheet metadata found for sheet_id '{sheet_id}'.",
            )
        section_id = section_id if section_id is not None else sheet_row.get("section_id")
        subject_id = subject_id if subject_id is not None else sheet_row.get("subj_id")

    if section_id is None or subject_id is None:
        raise HTTPException(
            status_code=400,
            detail="section_id and subj_id are required to find enrolled students.",
        )

    enrolled_students = []
    for student_dict in fetch_assigned_students(section_id, subject_id, prof_id):
        real_student_id = (
            student_dict.get("student_id")
            or (student_dict.get("student") or {}).get("student_id")
        )
        if not real_student_id:
            raise ValueError("Failed to extract valid student_id for sheet QR generation.")
        enrolled_students.append(str(real_student_id).strip())

    enrolled_students = list(dict.fromkeys(enrolled_students))
    if not enrolled_students:
        raise HTTPException(
            status_code=400,
            detail="No enrolled students found for this Section and Subject. Please assign students in Supabase before generating PDFs.",
        )

    return enrolled_students, section_id, subject_id


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
    title: str = "OMR Answer Sheet"
    subject: str = "General"
    quiz_type: str = "Multiple Choice"
    total_questions: int = Field(60, gt=0)
    options_per_question: int = Field(4, ge=1, le=8)
    columns: int = Field(3, gt=0)
    sheet_id: str = "SHEET-0001"
    output_name: str = Field("sheet.pdf", description="Desired output filename")
    student_ids: List[str] = Field(default_factory=list)
    student_metadata: List[dict] = Field(
        default_factory=list,
        description="Optional entries with student_id and student_name for offline QR generation.",
    )
    student_id_digits: int = 13
    embed_qr: bool = True
    section: str = ""
    section_id: Optional[int] = None
    SubjectID: Optional[int] = None
    prof_id: Optional[int] = None
    professor_id: str = ""
    professor_name: str = "MASTER ANSWER KEY"

    @property
    def normalized_quiz_type(self) -> str:
        return "True or False" if self.quiz_type == "True or False" else "Multiple Choice"

    def to_sheet_config(self) -> SheetConfig:
        quiz_type = self.normalized_quiz_type
        return SheetConfig(
            title=self.title,
            subject=self.subject,
            quiz_type=quiz_type,
            total_questions=self.total_questions,
            options_per_question=2 if quiz_type == "True or False" else self.options_per_question,
            columns=self.columns,
            sheet_id=self.sheet_id,
            student_id_digits=self.student_id_digits,
            embed_qr=self.embed_qr,
            section=self.section,
            section_id=self.section_id if self.section_id is not None else "",
            SubjectID=self.SubjectID if self.SubjectID is not None else "",
        )


class ItemizedRow(BaseModel):
    question: int
    correct_answer: str
    student_answer: str
    is_correct: bool


class GradeSheetResponse(BaseModel):
    status: str = "success"
    mode: str
    sheet_id: str
    student_id: Optional[str] = ""
    qr_prof_id: Optional[str] = None
    student_found: bool = False
    student_name: Optional[str] = None
    full_name: Optional[str] = None
    firstname: Optional[str] = None
    middlename: Optional[str] = None
    lastname: Optional[str] = None
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    section_id: Optional[int] = None
    section_name: Optional[str] = None
    student_id_missing: bool = False
    student_id_note: Optional[str] = None
    questions_read: int
    blank_count: int
    multi_marked_count: int
    answer_key: Optional[Dict[str, Optional[str]]] = None
    score: Optional[int] = None
    total_questions: Optional[int] = None
    percentage: Optional[float] = None
    recognized_answers: Dict[str, Optional[str]] = Field(default_factory=dict)
    attempted: Optional[int] = None
    itemized: Optional[List[ItemizedRow]] = None
    overlay_image_base64: str


class StudentSummaryRow(BaseModel):
    student_id: str
    score: int
    total_questions: int
    percentage: float
    graded_at: Optional[str] = None


class SaveStudentScoreRequest(BaseModel):
    student_id: str = Field(..., min_length=1)
    sheet_id: str = Field(..., min_length=1)
    expected_sheet_id: Optional[str] = Field(None, min_length=1)
    score_value: Optional[int] = None
    percentage: Optional[float] = None


# --------------------------------------------------------------------------
# Image decoding helper
# --------------------------------------------------------------------------

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
SCAN_SLOT = threading.Semaphore(1)


def _exclusive_scan(handler):
    """Queue CPU-heavy image scans so only one full-resolution scan runs at a time."""
    @wraps(handler)
    def wrapped(*args, **kwargs):
        with SCAN_SLOT:
            return handler(*args, **kwargs)
    return wrapped


def _decode_upload_to_bgr(file: UploadFile) -> np.ndarray:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{file.content_type}'. Upload JPEG, PNG, or WEBP.",
        )

    raw = file.file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(raw) / 1e6:.1f} MB). Max is {MAX_UPLOAD_BYTES / 1e6:.0f} MB.",
        )
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        pil_img = Image.open(io.BytesIO(raw))
        pil_img = ImageOps.exif_transpose(pil_img)
        if pil_img.width * pil_img.height > MAX_IMAGE_PIXELS:
            raise HTTPException(
                status_code=413,
                detail=f"Image resolution too large. Max is {MAX_IMAGE_PIXELS:,} pixels.",
            )
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


def _load_sheet_config_for_scan(
    sheet_id: str,
    total_questions: Optional[int],
    options_per_question: Optional[int],
    columns: Optional[int],
) -> SheetConfig:
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
                   f"Generate sheet first or pass config parameters explicitly.",
        )

    valid_keys = inspect.signature(SheetConfig.__init__).parameters.keys()
    filtered_base = {key: value for key, value in base.items() if key in valid_keys}

    return SheetConfig(**filtered_base)


def _as_metadata_id(value: object) -> Optional[int]:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def extract_sheet_identity(header_image: np.ndarray) -> tuple[str, str, str]:
    height, width = header_image.shape[:2]
    header_roi = header_image[:min(353, height), :min(1000, width)]
    if header_roi.size == 0:
        return "UNKNOWN", "UNKNOWN", ""

    detector = cv2.QRCodeDetector()
    raw_payload, _, _ = detector.detectAndDecode(header_roi)
    raw_payload = str(raw_payload or "").strip()
    if not raw_payload:
        return "UNKNOWN", "UNKNOWN", ""

    return parse_qr_payload(raw_payload)


def parse_qr_payload(raw_payload: str) -> tuple[str, str, str]:
    cleaned = str(raw_payload or "").strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            student_id = str(parsed.get("student_id") or parsed.get("studentId") or "").strip()
            sheet_id = str(parsed.get("sheet_id") or parsed.get("sheetId") or "UNKNOWN").strip()
            return student_id, sheet_id or "UNKNOWN", str(parsed.get("prof_id") or parsed.get("profId") or "").strip()
    except (TypeError, json.JSONDecodeError):
        pass

    if "|" in cleaned:
        parts = cleaned.split("|", 1)
        return parts[0].strip(), parts[1].strip() or "UNKNOWN", parts[2].strip() if len(parts) > 2 else ""

    if "_" in cleaned:
        parts = cleaned.split("_", 1)
        if parts[0].startswith("T") or "SHEET" in parts[0].upper():
            return parts[1].strip() or "UNKNOWN", parts[0].strip(), ""
        return parts[0].strip(), parts[1].strip() or "UNKNOWN", ""

    return cleaned, "UNKNOWN", ""


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds")}


@app.post("/save-student-score")
def save_student_score(payload: SaveStudentScoreRequest):
    expected_sheet_id = (payload.expected_sheet_id or "").strip()
    sheet_id = payload.sheet_id.strip()
    if expected_sheet_id and expected_sheet_id != sheet_id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Sheet ID mismatch: selected '{expected_sheet_id}' does not "
                f"match scanned paper ID '{sheet_id}'."
            ),
        )

    try:
        supabase = _get_supabase_client()
        student_id = payload.student_id.strip()

        existing_record = (
            supabase.table("student_score")
            .select('"Score_id"')
            .eq("student_id", student_id)
            .eq("sheet_id", sheet_id)
            .limit(1)
            .execute()
        )
        if existing_record.data:
            return {
                "status": "duplicate",
                "message": (
                    f"Duplicate Record Detected: Score results for Student ID "
                    f"'{student_id}' (Sheet ID: {sheet_id}) already recorded."
                ),
            }

        sheet_response = (
            supabase.table("sheet_tbl")
            .select("subj_id, section_id")
            .eq("sheet_id", sheet_id)
            .maybe_single()
            .execute()
        )
        sheet_data = sheet_response.data
        if not sheet_data:
            return JSONResponse(
                status_code=404,
                content={"status": "error", "message": f"No sheet metadata found for sheet_id '{sheet_id}'."},
            )

        subject_id = sheet_data.get("subj_id")
        section_id = sheet_data.get("section_id")
        if subject_id is None or section_id is None:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": f"Sheet '{sheet_id}' missing subj_id or section_id metadata."},
            )

        insert_payload = {
            "student_id": student_id,
            "sheet_id": sheet_id,
            "score_value": payload.score_value,
            "percentage": payload.percentage,
            "subj_id": subject_id,
            "section_id": section_id,
        }
        response = supabase.table("student_score").insert(insert_payload).execute()
        return {"status": "success", "message": "Score saved successfully!", "data": response.data}
    except Exception as exc:
        print(f"[SCORE SAVE] Failed for sheet '{payload.sheet_id}': {exc}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Failed to save score: {exc}"},
        )


@app.post("/generate-pdf")
def generate_pdf(payload: SheetConfigRequest):
    section_id = payload.section_id
    subject_id = payload.SubjectID
    if payload.student_ids:
        enrolled_students = list(dict.fromkeys(
            str(student_id).strip() for student_id in payload.student_ids if str(student_id).strip()
        ))
    else:
        enrolled_students, section_id, subject_id = _get_enrolled_student_ids(
            payload.sheet_id,
            section_id,
            subject_id,
            payload.prof_id,
        )
    if not enrolled_students:
        raise HTTPException(status_code=400, detail="student_ids must contain at least one student ID.")
    cfg = payload.to_sheet_config()
    cfg.section_id = section_id if section_id is not None else ""
    cfg.SubjectID = subject_id if subject_id is not None else ""
    out_path = os.path.join(PDFS_DIR, payload.output_name)
    sheet_title_val = cfg.title

    names_by_id = {
        str(entry.get("student_id", "")).strip(): str(
            entry.get("student_name") or entry.get("name") or ""
        ).strip()
        for entry in payload.student_metadata
        if entry.get("student_id")
    }
    missing_name_ids = [student_id for student_id in enrolled_students if not names_by_id.get(student_id)]
    if missing_name_ids:
        try:
            names_by_id.update(fetch_student_names(missing_name_ids))
        except Exception as db_err:
            print(f"[PDF GEN] Warning: Student names unavailable; using IDs: {db_err}")
    student_names = [names_by_id.get(student_id, student_id) for student_id in enrolled_students]
    page_qr_payloads = [
        encode_student_qr_payload(student_id, cfg.sheet_id, payload.prof_id)
        for student_id in enrolled_students
    ]
    try:
        supabase = _get_supabase_client()
    except Exception as db_err:
        supabase = None
        print(f"[PDF GEN] Warning: Supabase mapping unavailable: {db_err}")

    if supabase is not None:
        try:
            mapping_payload = {
                "sheet_id": str(cfg.sheet_id),
                "sheet_title": str(sheet_title_val),
                "quiz_type": str(cfg.quiz_type),
                "questions": int(cfg.total_questions),
                "columns": int(cfg.columns),
            }
            if section_id:
                mapping_payload["section_id"] = int(section_id)
            if subject_id:
                mapping_payload["subj_id"] = int(subject_id)

            supabase.table("sheet_tbl").upsert(mapping_payload, on_conflict="sheet_id").execute()
            print(f"[PDF Gen] Saved sheet_tbl record for '{cfg.sheet_id}'")

            _link_sheet_to_professor(supabase, str(cfg.sheet_id), payload.prof_id)
        except Exception as db_err:
            print(f"[PDF Gen] Warning: Failed to save sheet metadata or professor mapping: {db_err}")

    try:
        generate_omr_sheets(
            cfg,
            out_path,
            enrolled_students,
            student_names,
            page_qr_payloads,
            payload.professor_id or (str(payload.prof_id) if payload.prof_id is not None else ""),
            payload.professor_name,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

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
                "section_id": cfg.section_id,
                "SubjectID": cfg.SubjectID,
                "prof_id": payload.prof_id,
                "saved_at": datetime.now().isoformat(timespec="seconds"),
            },
            f,
            indent=2,
        )

    return FileResponse(out_path, media_type="application/pdf", filename=payload.output_name)


@app.post("/grade-sheet", response_model=GradeSheetResponse)
@_exclusive_scan
def grade_sheet(
    file: UploadFile = File(..., description="Photo of the OMR sheet"),
    mode: str = Form(...),
    sheet_id: Optional[str] = Form(None),
    student_id: Optional[str] = Form(None),
    total_questions: Optional[int] = Form(None),
    options_per_question: Optional[int] = Form(None),
    columns: Optional[int] = Form(None),
    prof_id: Optional[int] = Form(None),
    sheet_id_query: Optional[str] = Query(None, alias="sheet_id"),
    subject_id: Optional[int] = Query(None),
    section_id: Optional[int] = Query(None),
):
    sheet_id = sheet_id or sheet_id_query
    if not sheet_id:
        raise HTTPException(status_code=400, detail="sheet_id is required")

    if prof_id is None or int(prof_id) <= 0:
        raise HTTPException(status_code=400, detail="A valid professor ID is required")

    supabase = _get_supabase_client()
    ownership = (
        supabase.table("sheet_prof")
        .select("assignment_id")
        .eq("sheet_id", str(sheet_id).strip())
        .eq("prof_id", int(prof_id))
        .limit(1)
        .execute()
    )
    if not ownership.data:
        raise HTTPException(
            status_code=403,
            detail="Unauthorized: This sheet layout belongs to another professor",
        )

    cfg = _load_sheet_config_for_scan(sheet_id, total_questions, options_per_question, columns)
    image = _decode_upload_to_bgr(file)
    try:
        results, warped = process_sheet_image(image, cfg)
        overlay = draw_debug_overlay(warped, cfg, results)
    except OMRProcessingError as exc:
        print(f"[OMR] Processing error for sheet {sheet_id}: {exc}")
        traceback.print_exc()
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        print(f"[OMR] Unexpected processing error for sheet {sheet_id}: {exc}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OMR processing failed: {exc}")

    n_blank = sum(1 for result in results.values() if result.selected is None and not result.multi_marked)
    n_multi = sum(1 for result in results.values() if result.multi_marked)

    if mode == "key":
        key = {str(question): result.selected for question, result in results.items()}
        with open(_key_path(sheet_id), "w") as key_file:
            json.dump({"answer_key": key}, key_file, indent=2)
        return GradeSheetResponse(
            mode="key", sheet_id=sheet_id, questions_read=len(results),
            blank_count=n_blank, multi_marked_count=n_multi, answer_key=key,
            overlay_image_base64=_overlay_to_base64(overlay),
        )

    if not os.path.exists(_key_path(sheet_id)):
        raise HTTPException(
            status_code=404,
            detail=f"No answer key found for sheet_id '{sheet_id}'. Capture key first.",
        )
    with open(_key_path(sheet_id)) as f:
        key_payload = json.load(f)
    answer_key = {int(k): v for k, v in key_payload["answer_key"].items()}

    student_id_missing = False
    student_id_note = None

    resolved_student_id, response_sheet_id, qr_prof_id = extract_sheet_identity(warped)
    if qr_prof_id and str(qr_prof_id) != str(prof_id):
        raise HTTPException(
            status_code=403,
            detail="Unauthorized: The scanned QR code belongs to another professor",
        )
    qr_identity_found = (
        resolved_student_id not in {"", "UNKNOWN", "UNASSIGNED"}
        and response_sheet_id not in {"", "UNKNOWN"}
    )
    if not resolved_student_id or resolved_student_id.upper() == "UNASSIGNED":
        resolved_student_id = "UNASSIGNED"
        student_id_missing = True
        student_id_note = "Unreadable QR code / Student ID not found."

    resolved_subject_id = subject_id if subject_id is not None else _as_metadata_id(cfg.SubjectID)
    resolved_section_id = section_id if section_id is not None else _as_metadata_id(cfg.section_id)
    metadata = {
        "student_name": None,
        "subject_id": resolved_subject_id,
        "subject_name": None,
        "section_id": resolved_section_id,
        "section_name": None,
        "firstname": None,
        "middlename": None,
        "lastname": None,
    }

    debug_name = f"student_{resolved_student_id.replace(' ', '_').replace('(', '').replace(')', '')}"
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
    recognized_answers = {
        str(question): ("MULTI" if result.multi_marked else result.selected)
        for question, result in results.items()
    }

    summary = StudentSummaryRow(
        student_id=resolved_student_id,
        score=correct,
        total_questions=total,
        percentage=percentage,
        graded_at=datetime.now().isoformat(timespec="seconds"),
    )
    IN_MEMORY_RESULTS.setdefault(sheet_id, []).append(summary)

    return GradeSheetResponse(
        status="success",
        mode="grade",
        sheet_id=response_sheet_id,
        student_id=resolved_student_id,
        qr_prof_id=qr_prof_id or None,
        student_found=qr_identity_found and not student_id_missing,
        student_name=metadata["student_name"],
        full_name=metadata["student_name"],
        firstname=metadata["firstname"],
        middlename=metadata["middlename"],
        lastname=metadata["lastname"],
        subject_id=metadata["subject_id"],
        subject_name=metadata["subject_name"],
        section_id=metadata["section_id"],
        section_name=metadata["section_name"],
        student_id_missing=student_id_missing,
        student_id_note=student_id_note,
        questions_read=len(results),
        blank_count=n_blank,
        multi_marked_count=n_multi,
        score=correct,
        total_questions=total,
        percentage=percentage,
        recognized_answers=recognized_answers,
        attempted=attempted,
        itemized=itemized,
        overlay_image_base64=_overlay_to_base64(overlay),
    )


@app.get("/results/{sheet_id}", response_model=List[StudentSummaryRow])
def get_results(sheet_id: str):
    in_memory_results = IN_MEMORY_RESULTS.get(str(sheet_id))
    if in_memory_results:
        return in_memory_results

    try:
        response = (
            _get_supabase_client()
            .table("student_score")
            .select('student_id, score_value, percentage, sheet_id, subj_id, section_id')
            .eq("sheet_id", str(sheet_id))
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load student scores: {exc}")

    if not response.data:
        return []

    total_questions = _total_questions_for_sheet(sheet_id)
    return [
        StudentSummaryRow(
            student_id=str(row.get("student_id", "")),
            score=int(row.get("score_value") or 0),
            total_questions=total_questions,
            percentage=float(row.get("percentage") or 0),
        )
        for row in response.data
    ]


def _total_questions_for_sheet(sheet_id: str) -> int:
    cfg_path = os.path.join(PDFS_DIR, f"{sheet_id}.config.json")
    if not os.path.exists(cfg_path):
        return 0
    with open(cfg_path) as f:
        return int(json.load(f).get("total_questions", 0))


@app.get("/results/{sheet_id}/export")
def export_results(sheet_id: str):
    rows = get_results(sheet_id)
    workbook = io.BytesIO()
    pd.DataFrame([row.model_dump() for row in rows]).to_excel(workbook, index=False)
    workbook.seek(0)
    return StreamingResponse(
        workbook,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{sheet_id}_results.xlsx"'},
    )


# --------------------------------------------------------------------------
# Student ID Scanning — pytesseract OCR endpoint
# --------------------------------------------------------------------------

try:
    import pytesseract
    _TESSERACT_AVAILABLE = True
except ImportError:
    pytesseract = None  # type: ignore[assignment]
    _TESSERACT_AVAILABLE = False

STUDENT_ID_RE = re.compile(r"^SIC\d{4}-\d{4}$")


def _clean_ocr_text(raw: str) -> str:
    text = raw.upper().strip()
    text = re.sub(r"[^A-Z0-9\-]", "", text)
    text = re.sub(r"(?<=SIC)(.+)", lambda m: m.group(0).replace("O", "0").replace("I", "1").replace("L", "1"), text)
    return text


class StudentIdScanResponse(BaseModel):
    student_id: Optional[str] = None
    raw_text: str
    confidence: str           # "high" | "low" | "failed"
    error: Optional[str] = None


@app.post("/api/scan-student-id", response_model=StudentIdScanResponse)
@_exclusive_scan
def scan_student_id(
    file: UploadFile = File(..., description="Cropped photo of the Student ID field"),
):
    if not _TESSERACT_AVAILABLE:
        return StudentIdScanResponse(
            raw_text="",
            confidence="failed",
            error="Tesseract OCR is not installed on this server.",
        )

    bgr = _decode_upload_to_bgr(file)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15,
        C=8,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    ocr_target = cleaned
    contours, _ = cv2.findContours(
        cv2.bitwise_not(cleaned), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if contours:
        h_img, w_img = cleaned.shape[:2]
        min_area = 0.10 * h_img * w_img
        candidate = max(contours, key=cv2.contourArea)
        if cv2.contourArea(candidate) >= min_area:
            x, y, w, h = cv2.boundingRect(candidate)
            pad = 6
            x1 = max(x - pad, 0)
            y1 = max(y - pad, 0)
            x2 = min(x + w + pad, w_img)
            y2 = min(y + h + pad, h_img)
            ocr_target = cleaned[y1:y2, x1:x2]

    custom_config = (
        "--psm 7 "
        r"-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"
    )
    try:
        raw_text: str = pytesseract.image_to_string(ocr_target, config=custom_config).strip()
    except Exception as exc:
        return StudentIdScanResponse(
            raw_text="",
            confidence="failed",
            error=f"OCR engine error: {exc}",
        )

    if STUDENT_ID_RE.match(raw_text):
        return StudentIdScanResponse(
            student_id=raw_text,
            raw_text=raw_text,
            confidence="high",
        )

    cleaned_text = _clean_ocr_text(raw_text)
    if STUDENT_ID_RE.match(cleaned_text):
        return StudentIdScanResponse(
            student_id=cleaned_text,
            raw_text=raw_text,
            confidence="low",
        )

    return StudentIdScanResponse(
        student_id=None,
        raw_text=raw_text,
        confidence="failed",
        error=(
            f'Could not extract valid Student ID. Raw OCR output: "{raw_text}".'
        ),
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)