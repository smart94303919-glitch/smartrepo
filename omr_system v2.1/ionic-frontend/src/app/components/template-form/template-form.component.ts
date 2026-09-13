/**
 * template-form.component.ts
 * ===========================
 * Form for the OMR sheet parameters (title, subject, question count,
 * option count, columns, sheet ID, output filename). Emits a
 * SheetConfigRequest when the user taps "Generate & Download PDF".
 *
 * This component only builds the request payload and hands the resulting
 * PDF Blob back up to the parent (dashboard page) via events -- it does
 * not decide what to DO with the PDF (save/share/preview). That keeps it
 * reusable regardless of platform-specific file-saving logic.
 */
import { Component, EventEmitter, Output } from '@angular/core';
import { ToastController, LoadingController } from '@ionic/angular';
import { OmrApiService, SheetConfigRequest } from '../../services/omr-api.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-template-form',
  templateUrl: './template-form.component.html',
  styleUrls: ['./template-form.component.scss'],
})
export class TemplateFormComponent {
  /** Emitted after a successful generate, so the parent can e.g. switch
   * to the Scan tab and pre-fill sheet_id/question counts there. */
  @Output() sheetGenerated = new EventEmitter<SheetConfigRequest>();

  model: SheetConfigRequest = {
    title: 'Midterm Examination',
    subject: 'General',
    quiz_type: 'Multiple Choice',
    total_questions: 60,
    options_per_question: 4,
    columns: 3,
    sheet_id: 'SHEET-0001',
    output_name: 'sheet.pdf',
  };

  // A-H, since options_per_question maps 1:1 to option letters in the
  // backend (config.OPTION_LETTERS = "ABCDEFGH").
  readonly optionChoices = [1, 2, 3, 4, 5, 6, 7, 8];

  isGenerating = false;

  constructor(
    private api: OmrApiService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  /** Basic client-side validation before hitting the network -- mirrors
   * the constraints enforced server-side in config.SheetConfig.__post_init__. */
  private validate(): string | null {
    if (!this.model.title.trim()) return 'Title is required.';
    if (!this.model.sheet_id.trim()) return 'Sheet ID is required.';
    if (!this.model.output_name.trim()) return 'Output filename is required.';
    if (this.model.total_questions <= 0) return 'Total questions must be positive.';
    if (this.model.columns <= 0) return 'Columns must be positive.';
    if (this.model.options_per_question < 1 || this.model.options_per_question > 8) {
      return 'Options per question must be between 1 and 8 (A-H).';
    }
    if (!this.model.output_name.toLowerCase().endsWith('.pdf')) {
      this.model.output_name += '.pdf';
    }
    return null;
  }

  async onGenerateAndDownload() {
    const validationError = this.validate();
    if (validationError) {
      await this.showToast(validationError, 'danger');
      return;
    }

    this.isGenerating = true;
    const loading = await this.loadingCtrl.create({
      message: 'Generating OMR sheet...',
    });
    await loading.present();

    this.api.generatePdf(this.model).subscribe({
      next: async (pdfBlob: Blob) => {
        await loading.dismiss();
        this.isGenerating = false;
        await this.saveOrSharePdf(pdfBlob, this.model.output_name);
        this.sheetGenerated.emit(this.model);
        await this.showToast('Sheet generated successfully!', 'success');
      },
      error: async (err) => {
        await loading.dismiss();
        this.isGenerating = false;
        await this.showToast(err.message ?? 'Failed to generate sheet.', 'danger');
      },
    });
  }

  /**
   * Saves the generated PDF using Capacitor Filesystem on native platforms
   * (Android/iOS), or triggers a normal browser download when running in
   * a plain web/dev-server context. Native "share sheet" (email, Drive,
   * print, etc.) is the natural next step here via @capacitor/share if
   * you want a "Share" button in addition to "Download".
   */
  private async saveOrSharePdf(blob: Blob, filename: string) {
    if (Capacitor.isNativePlatform()) {
      const base64Data = await this.blobToBase64(blob);
      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
      });
    } else {
      // Plain web fallback (Ionic dev server in a desktop browser)
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        // reader.result is "data:application/pdf;base64,XXXX" -- Capacitor
        // Filesystem.writeFile wants just the base64 payload.
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
