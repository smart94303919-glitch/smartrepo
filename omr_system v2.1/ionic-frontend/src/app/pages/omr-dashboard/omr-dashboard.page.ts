/**
 * omr-dashboard.page.ts
 * ======================
 * Top-level page hosting the full workflow described in the requirements:
 *   [ Generate & Download PDF ]  -> TemplateFormComponent
 *   [ Capture / Upload Sheet Image ] -> ImagePickerComponent
 *   [ Process & Grade Sheet ]    -> calls OmrApiService.gradeSheet()
 *   [ View & Export Results ]    -> ResultsDisplayComponent (summary mode)
 *
 * State flow:
 *   1. User fills the form and generates a sheet -> sheetId/question
 *      params are captured here so later scan calls don't need re-entry.
 *   2. User picks "Teacher Key" or "Student" mode, then captures/imports
 *      an image -> stored as `pendingImage`, NOT uploaded yet.
 *   3. User taps "Process & Grade Sheet" -> uploads `pendingImage` via
 *      OmrApiService.gradeSheet() with the chosen mode.
 *   4. Result renders via ResultsDisplayComponent; for mode='grade' the
 *      class summary table is also refreshed.
 */
import { Component } from '@angular/core';
import { ToastController, LoadingController, AlertController } from '@ionic/angular';
import { OmrApiService, GradeSheetResponse, SheetConfigRequest } from '../../services/omr-api.service';

type ScanMode = 'key' | 'grade';

@Component({
  selector: 'app-omr-dashboard',
  templateUrl: './omr-dashboard.page.html',
  styleUrls: ['./omr-dashboard.page.scss'],
})
export class OmrDashboardPage {
  // Populated once a sheet has been generated (or typed in manually if
  // the teacher already has a printed sheet from a prior session).
  activeSheetId = '';
  activeTotalQuestions: number | null = null;
  activeOptionsPerQuestion: number | null = null;
  activeColumns: number | null = null;

  scanMode: ScanMode = 'key';
  pendingImage: File | null = null;
  lastResult: GradeSheetResponse | null = null;

  isProcessing = false;

  constructor(
    private api: OmrApiService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController
  ) {}

  /** Called when TemplateFormComponent finishes generating a sheet. */
  onSheetGenerated(cfg: SheetConfigRequest) {
    this.activeSheetId = cfg.sheet_id;
    this.activeTotalQuestions = cfg.total_questions;
    this.activeOptionsPerQuestion = cfg.options_per_question;
    this.activeColumns = cfg.columns;
  }

  /** Called when ImagePickerComponent acquires an image (camera or gallery). */
  onImageCaptured(file: File) {
    this.pendingImage = file;
  }

  async onProcessAndGrade() {
    if (!this.activeSheetId.trim()) {
      await this.showToast('Enter or generate a Sheet ID first.', 'danger');
      return;
    }
    if (!this.pendingImage) {
      await this.showToast('Capture or import a sheet image first.', 'danger');
      return;
    }
    this.isProcessing = true;
    const loading = await this.loadingCtrl.create({
      message: this.scanMode === 'key' ? 'Reading answer key...' : 'Grading sheet...',
    });
    await loading.present();

    this.api
      .gradeSheet(this.pendingImage, this.scanMode, this.activeSheetId, {
        studentId: undefined,
        totalQuestions: this.activeTotalQuestions ?? undefined,
        optionsPerQuestion: this.activeOptionsPerQuestion ?? undefined,
        columns: this.activeColumns ?? undefined,
      })
      .subscribe({
        next: async (res) => {
          await loading.dismiss();
          this.isProcessing = false;
          this.lastResult = res;
          this.pendingImage = null; // require a fresh capture for the next sheet
          const msg =
            res.mode === 'key'
              ? `Key captured: ${res.questions_read} questions read.`
              : `Graded: ${res.score}/${res.total_questions} (${res.percentage}%).`;
          await this.showToast(msg, 'success');
        },
        error: async (err) => {
          await loading.dismiss();
          this.isProcessing = false;
          await this.showAlignmentErrorAlert(err.message ?? 'Processing failed.');
        },
      });
  }

  async resetForm() {
    this.activeSheetId = '';
    this.activeTotalQuestions = null;
    this.activeOptionsPerQuestion = null;
    this.activeColumns = null;
    this.scanMode = 'key';
    this.pendingImage = null;
    this.lastResult = null;
    this.isProcessing = false;
    await this.showToast('All fields reset.', 'success');
  }

  private async showAlignmentErrorAlert(message: string) {
    const alert = await this.alertCtrl.create({
      header: 'Could Not Read Sheet',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
