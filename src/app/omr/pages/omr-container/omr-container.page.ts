/**
 * omr-container.page.ts
 * ======================
 * Top-level page that hosts conditional rendering of the OMR workflow based
 * on route query parameters. This replaces the single monolithic omr-dashboard.page
 * and allows selective display of:
 *   - mode='metadata': Sheet form (Create Answer Sheets)
 *   - mode='scanner': Image picker & processing (Scan Answer Sheets)
 *   - mode='results': Individual scan results (Student Grades)
 *
 * When no mode is specified, all sections are visible for a full workflow view.
 */
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController, LoadingController, AlertController } from '@ionic/angular';
import { OmrApiService, GradeSheetResponse, QrPayload, SheetConfigRequest, parseQrPayload } from '../../../services/omr-api.service';
import { SupabaseService } from '../../../services/supabase.service';
import { TemplateFormComponent } from '../../components/template-form/template-form.component';
import { ImagePickerComponent, MAX_BATCH_IMAGES } from '../../components/image-picker/image-picker.component';
import { ResultsDisplayComponent } from '../../components/results-display/results-display.component';

type ScanMode = 'key' | 'grade';
type DisplayMode = 'metadata' | 'scanner' | 'results' | 'full';

@Component({
  selector: 'app-omr-container',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    IonicModule,
    TemplateFormComponent,
    ImagePickerComponent,
    ResultsDisplayComponent,
  ],
  templateUrl: './omr-container.page.html',
  styleUrls: ['./omr-container.page.scss'],
})
export class OmrContainerPage implements OnInit {
  // Route-based display mode
  displayMode: DisplayMode = 'full';

  // Populated once a sheet has been generated
  activeSheetId = '';
  professorSheetIds: string[] = [];
  activeProfessorId: number | null = null;
  activeTotalQuestions: number | null = null;
  activeOptionsPerQuestion: number | null = null;
  activeColumns: number | null = null;

  scanMode: ScanMode = 'key';
  studentId = '';

  @ViewChild(ImagePickerComponent) imagePicker?: ImagePickerComponent;

  teacherKeyImage: File | null = null;
  studentImage: File | null = null;
  studentImages: File[] = [];
  teacherKeyResult: GradeSheetResponse | null = null;
  studentResult: GradeSheetResponse | null = null;
  studentBatchResults: GradeSheetResponse[] = [];
  scanError: string | null = null;

  isProcessing = false;
  savingResultKey: string | null = null;
  savedResultKey: string | null = null;

  constructor(
    private api: OmrApiService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit() {
    void this.loadProfessorSheets();
    this.route.queryParams.subscribe((params) => {
      const mode = params['mode'];
      if (mode === 'metadata' || mode === 'scanner' || mode === 'results') {
        this.displayMode = mode;
      } else {
        this.displayMode = 'full';
      }
    });
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      await this.loadProfessorSheets();
    } finally {
      event.target.complete();
    }
  }

  private async loadProfessorSheets(): Promise<void> {
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const professorId = Number(currentUser.prof_id);
      if (!Number.isFinite(professorId) || professorId <= 0) {
        this.scanError = 'Professor ID is missing. Sign in again to load assigned sheets.';
        return;
      }

      this.activeProfessorId = professorId;
      this.professorSheetIds = await this.supabaseService.getProfessorSheetIds(professorId);
    } catch (error) {
      console.error('Failed to load professor sheet assignments:', error);
      this.scanError = 'Unable to load your assigned sheet IDs.';
    }
  }

  goBack() {
    this.router.navigate(['/exams']);
  }

  /** Called when TemplateFormComponent finishes generating a sheet. */
  onSheetGenerated(cfg: SheetConfigRequest) {
    this.activeSheetId = cfg.sheet_id;
    if (this.activeSheetId && !this.professorSheetIds.includes(this.activeSheetId)) {
      this.professorSheetIds = [...this.professorSheetIds, this.activeSheetId];
    }
    this.activeTotalQuestions = cfg.total_questions;
    this.activeOptionsPerQuestion = cfg.options_per_question;
    this.activeColumns = cfg.columns;
  }

  /** Called when ImagePickerComponent acquires an image (camera or gallery). */
  onImageCaptured(file: File) {
    if (this.scanMode === 'key') {
      this.teacherKeyImage = file;
    } else {
      this.resetStudentResultState();
      this.studentImage = file;
      this.studentImages = [];
    }
  }

  /** Called when ImagePickerComponent acquires a batch of images (Student Sheet gallery import). */
  onImagesCaptured(files: File[]) {
    this.resetStudentResultState();
    this.studentImages = files;
    this.studentImage = null;
  }

  onScanModeChange(mode: unknown) {
    if (mode !== 'key' && mode !== 'grade') return;
    this.scanMode = mode;
    this.resetStudentResultState();
    this.imagePicker?.resetTeacherKey();
    this.imagePicker?.resetStudentSheet();
  }

  async onProcessAndGrade() {
    if (!this.activeSheetId.trim()) {
      await this.showToast('Enter or generate a Sheet ID first.', 'danger');
      return;
    }

    if (!this.activeProfessorId || !this.professorSheetIds.includes(this.activeSheetId.trim())) {
      await this.showToast('Unauthorized: This sheet layout is not assigned to this professor.', 'danger');
      return;
    }

    // Batch mode: Student Sheet gallery import (1-5 images).
    if (this.scanMode === 'grade' && this.studentImages.length > 0) {
      await this.processBatch();
      return;
    }

    const image = this.scanMode === 'key' ? this.teacherKeyImage : this.studentImage;
    if (!image) {
      await this.showToast('Capture or import a sheet image first.', 'danger');
      return;
    }

    this.isProcessing = true;
    const loading = await this.loadingCtrl.create({
      message: this.scanMode === 'key' ? 'Reading answer key...' : 'Grading & reading Student ID...',
    });
    await loading.present();

    this.api
      .gradeSheet(image, this.scanMode, this.activeSheetId, {
        studentId: this.studentId ? this.studentId : undefined,
        totalQuestions: this.activeTotalQuestions ?? undefined,
        optionsPerQuestion: this.activeOptionsPerQuestion ?? undefined,
        columns: this.activeColumns ?? undefined,
        profId: this.activeProfessorId,
      })
      .subscribe({
        next: async (res) => {
          await loading.dismiss();
          this.isProcessing = false;
          this.scanError = null;
          if (this.scanMode === 'key') {
            this.teacherKeyResult = res;
            if (res.answer_key && this.activeProfessorId) {
              try {
                await this.supabaseService.saveAnswerKey(
                  this.activeSheetId,
                  this.activeProfessorId,
                  res.answer_key,
                );
              } catch (error) {
                console.error('Teacher answer key could not be mirrored to Supabase:', error);
                await this.showToast('Answer key was processed but could not be saved to Supabase.', 'danger');
              }
            }
            this.teacherKeyImage = null;
          } else {
            this.studentResult = await this.normalizeResult(res);
            this.studentImage = null;
          }
        },
        error: async (err) => {
          await loading.dismiss();
          this.isProcessing = false;
          const errorMessage = err.message ?? 'Processing failed.';
          this.scanError = errorMessage;
          await this.showAlignmentErrorAlert(errorMessage);
        },
      });
  }

  /** Processes all pending images sequentially using the existing OMR pipeline. */
  private async processBatch() {
    if (!this.activeSheetId.trim()) {
      await this.showToast('Enter or generate a Sheet ID first.', 'danger');
      return;
    }

    if (!this.activeProfessorId || !this.professorSheetIds.includes(this.activeSheetId.trim())) {
      await this.showToast('Unauthorized: This sheet layout is not assigned to this professor.', 'danger');
      return;
    }

    this.isProcessing = true;
    this.studentBatchResults = [];
    this.scanError = null;
    this.studentId = '';
    const batchImages = this.studentImages.slice(0, MAX_BATCH_IMAGES);

    const loading = await this.loadingCtrl.create({
      message: `Grading ${batchImages.length} student sheet(s)...`,
    });
    await loading.present();

    for (let i = 0; i < batchImages.length; i++) {
      const file = batchImages[i];
      try {
        const res = await this.api
          .gradeSheet(file, 'grade', this.activeSheetId, {
            totalQuestions: this.activeTotalQuestions ?? undefined,
            optionsPerQuestion: this.activeOptionsPerQuestion ?? undefined,
            columns: this.activeColumns ?? undefined,
            profId: this.activeProfessorId,
          })
          .toPromise();

        if (res) {
          this.studentBatchResults.push(await this.normalizeResult(res));
        }
      } catch (err: any) {
        this.scanError = `Sheet ${i + 1}: ${err?.message ?? 'Processing failed.'}`;
        await this.showAlignmentErrorAlert(
          this.scanError
        );
      }
    }

    await loading.dismiss();
    this.isProcessing = false;

    if (this.studentBatchResults.length > 0) {
      this.studentResult = this.studentBatchResults[this.studentBatchResults.length - 1];
    }

    this.studentImages = [];
  }

  private parseScannedPayload(rawPayload: string): QrPayload | null {
    const cleaned = String(rawPayload ?? '').trim();
    const sheetMatch = cleaned.match(/SHT-\d{8}-\d{4}/);
    if (sheetMatch?.index !== undefined) {
      const sheetId = sheetMatch[0].trim();
      const prefix = cleaned.slice(0, sheetMatch.index).replace(/[:-]+$/, '').trim();
      const suffix = cleaned.slice(sheetMatch.index + sheetId.length).replace(/^[:-]+/, '').trim();

      if (/^\d+$/.test(prefix)) {
        return { type: 'TEACHER_KEY', profId: prefix, sheetId, profName: '' };
      }

      const studentId = prefix || suffix;
      if (studentId) {
        return { type: 'STUDENT_SHEET', studentId, sheetId };
      }
    }

    return parseQrPayload(cleaned);
  }

  private async normalizeResult(result: GradeSheetResponse): Promise<GradeSheetResponse> {
    const parsedPayload = this.parseScannedPayload(result.student_id ?? '');
    const studentId = parsedPayload?.type === 'STUDENT_SHEET' ? parsedPayload.studentId : '';
    const sheetId = parsedPayload?.sheetId || 'N/A';
    const parsedProfId = parsedPayload?.type === 'TEACHER_KEY' ? parsedPayload.profId : '';
    const profId = result.qr_prof_id || parsedProfId;
    const resolvedStudentId = result.student_id?.trim() || studentId;
    const missingId =
      !resolvedStudentId ||
      result.student_id_missing === true ||
      resolvedStudentId.toLowerCase().includes('missing id') ||
      resolvedStudentId.toLowerCase().includes('unassigned');

    const studentName = result.student_name?.trim() || 'Student';
    const scannedSheetId = (sheetId !== 'N/A' ? sheetId : result.sheet_id || '').trim();
    const selectedSheetId = this.activeSheetId.trim();
    if (profId && this.activeProfessorId && profId !== String(this.activeProfessorId)) {
      throw new Error('Unauthorized: This sheet layout belongs to another professor');
    }

    return {
      ...result,
      student_id: missingId ? 'No ID' : resolvedStudentId,
      clean_student_id: missingId ? '' : resolvedStudentId,
      student_id_missing: missingId,
      student_name: studentName,
      student_found: !missingId && (result.student_found === true || Boolean(resolvedStudentId)),
      display_sheet_id: scannedSheetId || 'N/A',
      selected_sheet_id: selectedSheetId,
      scanned_sheet_id: scannedSheetId || 'N/A',
      sheet_id_matches: Boolean(selectedSheetId) && selectedSheetId === scannedSheetId,
      qr_prof_id: profId || result.qr_prof_id,
    };
  }

  async onConfirmResult() {
    this.activeSheetId = '';
    this.activeTotalQuestions = null;
    this.activeOptionsPerQuestion = null;
    this.activeColumns = null;
    this.scanMode = 'key';
    this.studentId = '';
    this.teacherKeyImage = null;
    this.studentImage = null;
    this.studentImages = [];
    this.teacherKeyResult = null;
    this.studentResult = null;
    this.studentBatchResults = [];
    this.scanError = null;
    this.isProcessing = false;
    this.savingResultKey = null;
    this.savedResultKey = null;
    await this.router.navigate(['/exams']);
  }

  async resetForm() {
    this.activeSheetId = '';
    this.activeTotalQuestions = null;
    this.activeOptionsPerQuestion = null;
    this.activeColumns = null;
    this.scanMode = 'key';
    this.studentId = '';
    this.resetTeacherKey();
    this.resetStudentSheet();
    this.isProcessing = false;
    await this.showToast('All fields reset.', 'success');
  }

  resetStudentSheet() {
    this.studentImage = null;
    this.studentImages = [];
    this.resetStudentResultState();
    this.imagePicker?.resetStudentSheet();
  }

  private resetStudentResultState() {
    this.studentResult = null;
    this.studentBatchResults = [];
    this.scanError = null;
    this.savingResultKey = null;
    this.savedResultKey = null;
  }

  async saveScoreToDatabase(result: GradeSheetResponse) {
    if (result.sheet_id_matches !== true) {
      const selectedSheetId = result.selected_sheet_id || this.activeSheetId.trim() || ' none ';
      const scannedSheetId = result.scanned_sheet_id || result.display_sheet_id || result.sheet_id || 'N/A';
      await this.showToast(
        `Sheet ID Mismatch: Selected '${selectedSheetId.trim()}' does not match scanned paper ID '${scannedSheetId}'. Results cannot be saved.`,
        'danger'
      );
      return;
    }

    const studentId = result.clean_student_id || result.student_id;
    const sheetId = result.display_sheet_id || result.sheet_id;
    if (!studentId || studentId === 'No ID' || !sheetId || sheetId === 'N/A') {
      await this.showToast('A valid student ID and sheet ID are required to save the score.', 'danger');
      return;
    }

    const resultKey = `${studentId}|${sheetId}`;
    if (this.savingResultKey === resultKey || this.savedResultKey === resultKey) return;

    this.savingResultKey = resultKey;
    try {
      const response = await this.api.saveStudentScore({
        student_id: studentId,
        sheet_id: sheetId,
        expected_sheet_id: result.selected_sheet_id,
        prof_id: this.activeProfessorId ?? undefined,
        score_value: result.score,
        percentage: result.percentage,
      }).toPromise();

      if (response?.status === 'success') {
        this.savedResultKey = resultKey;
        await this.showToast('Score successfully saved to database!', 'success');
      } else if (response?.status === 'duplicate') {
        this.savedResultKey = resultKey;
        await this.showToast(
          `Duplicate Record Detected: Score results for Student ID '${studentId}' (Sheet ID: ${sheetId}) have already been recorded in the database.`,
          'warning'
        );
      } else {
        await this.showToast(response?.message || 'Failed to save score. Please try again.', 'danger');
      }
    } catch (error: any) {
      console.error('Error saving score:', error);
      await this.showToast(error?.message || 'An error occurred while saving score.', 'danger');
    } finally {
      this.savingResultKey = null;
    }
  }

  resetTeacherKey() {
    this.teacherKeyImage = null;
    this.teacherKeyResult = null;
    this.imagePicker?.resetTeacherKey();
  }

  private async showAlignmentErrorAlert(message: string) {
    const alert = await this.alertCtrl.create({
      header: 'Could Not Read Sheet',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
