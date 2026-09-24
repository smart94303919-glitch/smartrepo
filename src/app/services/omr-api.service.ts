/**
 * omr-api.service.ts
 * ===================
 * Single HTTP client layer between the Ionic UI and the FastAPI backend
 * (api_server.py). Every component in this app should go through this
 * service rather than calling HttpClient directly, so the API contract
 * lives in exactly one place.
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// ---------------------------------------------------------------------
// Types mirroring the FastAPI Pydantic models in api_server.py
// ---------------------------------------------------------------------

export interface SheetConfigRequest {
  title: string;
  subject: string;
  SubjectID?: number;
  section_id?: number;
  section?: string;
  quiz_type: 'Multiple Choice' | 'True or False';
  total_questions: number;
  options_per_question: number; // 1-9 (A-I)
  columns: number;
  sheet_id: string;
  output_name: string;
  student_ids?: string[];
  student_metadata?: Array<{
    student_id: string;
    student_name: string;
  }>;
  prof_id?: number;
  professor_id?: string;
  professor_name?: string;
  student_id_digits?: number;
  embed_qr?: boolean;
}

export interface ItemizedRow {
  question: number;
  correct_answer: string;
  student_answer: string;
  is_correct: boolean;
}

export type AnswerKey = Record<string, string | null>;

export interface GradeSheetResponse {
  mode: 'key' | 'grade';
  sheet_id: string;
  student_id?: string;
  qr_prof_id?: string;
  student_found?: boolean;
  student_id_missing?: boolean;
  clean_student_id?: string;
  student_name?: string;
  display_sheet_id?: string;
  selected_sheet_id?: string;
  scanned_sheet_id?: string;
  sheet_id_matches?: boolean;
  student_id_note?: string;
  questions_read: number;
  blank_count: number;
  multi_marked_count: number;
  answer_key?: AnswerKey;
  score?: number;
  total_questions?: number;
  percentage?: number;
  attempted?: number;
  itemized?: ItemizedRow[];
  overlay_image_base64: string; // raw base64 PNG bytes, no data: prefix
}

export type QrPayload =
  | { type: 'STUDENT_SHEET'; studentId: string; sheetId: string }
  | { type: 'TEACHER_KEY'; profId: string; sheetId: string; profName: string };

export function parseQrPayload(rawPayload: string): QrPayload | null {
  const cleaned = String(rawPayload ?? '').trim();
  const parts = cleaned.split(':').map((part) => part.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    if (/^\d+$/.test(parts[0])) {
      return { type: 'TEACHER_KEY', profId: parts[0], sheetId: parts[1], profName: '' };
    }
    return { type: 'STUDENT_SHEET', studentId: parts[0], sheetId: parts[1] };
  }
  if (parts.length >= 3 && parts[0] && parts[1]) {
    return {
      type: 'TEACHER_KEY',
      profId: parts[0],
      sheetId: parts[1],
      profName: parts.slice(2).join(':').trim(),
    };
  }

  const teacherHyphenMatch = cleaned.match(/^(\d+)-(.+)$/);
  if (teacherHyphenMatch?.[1] && teacherHyphenMatch[2]) {
    return {
      type: 'TEACHER_KEY',
      profId: teacherHyphenMatch[1].trim(),
      sheetId: teacherHyphenMatch[2].trim(),
      profName: '',
    };
  }

  const generatedSheetMatch = cleaned.match(/^(SHT-\d{8}-\d{4})-(.+)$/);
  if (generatedSheetMatch?.[1] && generatedSheetMatch[2]) {
    return {
      type: 'STUDENT_SHEET',
      sheetId: generatedSheetMatch[1].trim(),
      studentId: generatedSheetMatch[2].trim(),
    };
  }

  const legacyHyphenParts = cleaned.split('-');
  if (legacyHyphenParts.length === 2 && legacyHyphenParts[0] && legacyHyphenParts[1]) {
    if (/^\d+$/.test(legacyHyphenParts[0].trim())) {
      return {
        type: 'TEACHER_KEY',
        profId: legacyHyphenParts[0].trim(),
        sheetId: legacyHyphenParts[1].trim(),
        profName: '',
      };
    }
    return {
      type: 'STUDENT_SHEET',
      sheetId: legacyHyphenParts[0].trim(),
      studentId: legacyHyphenParts[1].trim(),
    };
  }

  return null;
}

/** Response from POST /api/scan-student-id */
export interface StudentIdScanResponse {
  /** The extracted and validated Student ID (e.g. "SIC2026-0001"), or null if OCR failed. */
  student_id: string | null;
  /** Raw OCR output before cleaning/validation — useful for debugging and user fallback. */
  raw_text: string;
  /** "high" = regex matched cleanly; "low" = matched after fuzzy cleanup; "failed" = no match. */
  confidence: 'high' | 'low' | 'failed';
  /** Human-readable reason when confidence === "failed". */
  error?: string;
}

export interface SaveStudentScoreRequest {
  student_id: string;
  sheet_id: string;
  expected_sheet_id?: string;
  prof_id?: number;
  score_value?: number;
  percentage?: number;
}

export interface SaveStudentScoreResponse {
  status: 'success' | 'duplicate' | 'error';
  message: string;
  data?: unknown;
}

/** Friendly error shape surfaced to components after catchError below. */
export interface OmrApiError {
  status: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class OmrApiService {
  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = environment.apiBaseUrl.replace(/\/$/, '');
  }

  /**
   * Calls POST /generate-pdf and returns the PDF as a Blob, ready to be
   * saved to the filesystem (Capacitor Filesystem) or opened/shared.
   */
  generatePdf(payload: SheetConfigRequest): Observable<Blob> {
    return this.http
      .post(`${this.baseUrl}/generate-pdf`, payload, { responseType: 'blob' })
      .pipe(catchError((e) => this.handleError(e)));
  }

  /**
   * Calls POST /grade-sheet with a captured/selected image file.
   * mode='key'   -> capture the teacher's answer key for `sheetId`
   * mode='grade' -> grade a student's sheet against that key
   *                 (studentId is required in this case)
   */
  gradeSheet(
    imageFile: File | Blob,
    mode: 'key' | 'grade',
    sheetId: string,
    opts?: {
      studentId?: string;
      totalQuestions?: number;
      optionsPerQuestion?: number;
      columns?: number;
      filename?: string;
      profId?: number;
    }
  ): Observable<GradeSheetResponse> {
    const form = new FormData();
    form.append('file', imageFile, opts?.filename ?? 'capture.jpg');
    form.append('mode', mode);
    form.append('sheet_id', sheetId);
    if (opts?.studentId) form.append('student_id', opts.studentId);
    if (opts?.totalQuestions != null) form.append('total_questions', String(opts.totalQuestions));
    if (opts?.optionsPerQuestion != null) form.append('options_per_question', String(opts.optionsPerQuestion));
    if (opts?.columns != null) form.append('columns', String(opts.columns));
    if (opts?.profId != null) form.append('prof_id', String(opts.profId));

    return this.http
      .post<GradeSheetResponse>(`${this.baseUrl}/grade-sheet`, form)
      .pipe(catchError((e) => this.handleError(e)));
  }

  /** GET /health -- simple connectivity check, useful for a "backend
   * reachable?" indicator in the UI before the user tries to scan anything. */
  checkHealth(): Observable<{ status: string; time: string }> {
    return this.http
      .get<{ status: string; time: string }>(`${this.baseUrl}/health`)
      .pipe(catchError((e) => this.handleError(e)));
  }

  /**
   * Calls POST /api/scan-student-id with a captured image of the Student ID zone.
   * The backend runs OpenCV preprocessing + pytesseract OCR and returns the
   * extracted ID string (e.g. "SIC2026-0001") along with a confidence level.
   *
   * confidence="high"   → matched regex cleanly, safe to auto-populate
   * confidence="low"    → matched after fuzzy cleanup, show confirmation toast
   * confidence="failed" → no valid ID found, user must type manually
   */
  scanStudentId(imageFile: File | Blob, filename = 'id_capture.jpg'): Observable<StudentIdScanResponse> {
    const form = new FormData();
    form.append('file', imageFile, filename);
    return this.http
      .post<StudentIdScanResponse>(`${this.baseUrl}/api/scan-student-id`, form)
      .pipe(catchError((e) => this.handleError(e)));
  }

  saveStudentScore(payload: SaveStudentScoreRequest): Observable<SaveStudentScoreResponse> {
    return this.http
      .post<SaveStudentScoreResponse>(`${this.baseUrl}/save-student-score`, payload)
      .pipe(catchError((e) => this.handleError(e)));
  }

  /**
   * Normalizes FastAPI's error responses (which use `{"detail": "..."}`)
   * into a consistent shape components can display directly in a toast/
   * alert, instead of every component re-parsing HttpErrorResponse itself.
   */
  private handleError(error: HttpErrorResponse) {
    let message = 'Unexpected error contacting the OMR server.';
    if (error.error?.detail) {
      message = error.error.detail; // FastAPI HTTPException detail
    } else if (error.error?.message) {
      message = error.error.message;
    } else if (error.status === 0) {
      message = 'Could not reach the OMR server. Check your network connection and API URL.';
    } else if (error.message) {
      message = error.message;
    }
    const normalized: OmrApiError = { status: error.status, message };
    return throwError(() => normalized);
  }
}
