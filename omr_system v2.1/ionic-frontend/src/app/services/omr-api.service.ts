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
  quiz_type: string;
  total_questions: number;
  options_per_question: number; // 1-8 (A-H)
  columns: number;
  sheet_id: string;
  output_name: string;
  student_id_digits?: number;
  embed_qr?: boolean;
}

export interface ItemizedRow {
  question: number;
  correct_answer: string;
  student_answer: string;
  is_correct: boolean;
}

export interface GradeSheetResponse {
  mode: 'key' | 'grade';
  sheet_id: string;
  student_id?: string;
  questions_read: number;
  blank_count: number;
  multi_marked_count: number;
  answer_key?: { [question: string]: string | null };
  score?: number;
  total_questions?: number;
  percentage?: number;
  attempted?: number;
  itemized?: ItemizedRow[];
  overlay_image_base64: string; // raw base64 PNG bytes, no data: prefix
}

export interface StudentIdScanResponse {
  student_id: string;
  pattern: string;
}

/** Friendly error shape surfaced to components after catchError below. */
export interface OmrApiError {
  status: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class OmrApiService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

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

    return this.http
      .post<GradeSheetResponse>(`${this.baseUrl}/grade-sheet`, form)
      .pipe(catchError((e) => this.handleError(e)));
  }

  scanStudentId(imageFile: File | Blob): Observable<StudentIdScanResponse> {
    const form = new FormData();
    form.append('file', imageFile, imageFile instanceof File ? imageFile.name : 'student-id.jpg');
    return this.http
      .post<StudentIdScanResponse>(`${this.baseUrl}/api/scan-student-id`, form)
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
   * Normalizes FastAPI's error responses (which use `{"detail": "..."}`)
   * into a consistent shape components can display directly in a toast/
   * alert, instead of every component re-parsing HttpErrorResponse itself.
   */
  private handleError(error: HttpErrorResponse) {
    let message = 'Unexpected error contacting the OMR server.';
    if (error.error?.detail) {
      message = error.error.detail; // FastAPI HTTPException detail
    } else if (error.status === 0) {
      message = 'Could not reach the OMR server. Check your network connection and API URL.';
    } else if (error.message) {
      message = error.message;
    }
    const normalized: OmrApiError = { status: error.status, message };
    return throwError(() => normalized);
  }
}
