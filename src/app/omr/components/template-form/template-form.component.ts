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
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController } from '@ionic/angular';
import { OmrApiService, SheetConfigRequest } from '../../../services/omr-api.service';
import { SupabaseService } from '../../../services/supabase.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-template-form',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './template-form.component.html',
  styleUrls: ['./template-form.component.scss'],
})
export class TemplateFormComponent implements OnInit {
  /** Emitted after a successful generate, so the parent can e.g. switch
   * to the Scan tab and pre-fill sheet_id/question counts there. */
  @Output() sheetGenerated = new EventEmitter<SheetConfigRequest>();

  model: SheetConfigRequest = {
    title: 'Midterm Examination',
    subject: '',
    quiz_type: 'Multiple Choice',
    total_questions: 60,
    options_per_question: 4,
    columns: 3,
    sheet_id: 'SHEET-0001',
    output_name: 'sheet.pdf',
    student_id_digits: 13,
  };

  sections: Array<{ section_id: number; section: string }> = [];
  subjects: Array<{ SubjectID: number; subject: string }> = [];
  isLoadingSections = true;
  isLoadingSubjects = false;
  sectionsLoadError = false;
  subjectsLoadError = false;

  // A-H, since options_per_question maps 1:1 to option letters in the
  // backend (config.OPTION_LETTERS = "ABCDEFGH").
  readonly optionChoices = [1, 2, 3, 4, 5, 6, 7, 8];

  get isTrueFalse(): boolean {
    return this.model.quiz_type === 'True or False';
  }

  isGenerating = false;

  constructor(
    private api: OmrApiService,
    private supabaseService: SupabaseService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  async ngOnInit(): Promise<void> {
    const currentUser = localStorage.getItem('currentUser');
    let professorId = NaN;
    try {
      professorId = currentUser ? Number(JSON.parse(currentUser).prof_id) : NaN;
    } catch {
      this.sectionsLoadError = true;
    }

    if (!Number.isFinite(professorId)) {
      this.isLoadingSections = false;
      this.sectionsLoadError = true;
      return;
    }

    try {
      this.sections = await this.supabaseService.getProfessorAssignedSections(professorId);
    } catch (error) {
      console.error('Error loading sections for answer sheet:', error);
      this.sectionsLoadError = true;
    } finally {
      this.isLoadingSections = false;
    }
  }

  onSectionChange(sectionId: number | string | null): void {
    const selectedSection = this.sections.find((section) => section.section_id === Number(sectionId));
    this.model.section_id = selectedSection?.section_id;
    this.model.section = selectedSection?.section;
    this.model.SubjectID = undefined;
    this.model.subject = '';
    this.subjects = [];
    this.subjectsLoadError = false;

    if (selectedSection) {
      void this.loadSubjects(selectedSection.section_id);
    }
  }

  private async loadSubjects(sectionId: number): Promise<void> {
    const currentUser = localStorage.getItem('currentUser');
    let professorId = NaN;
    try {
      professorId = currentUser ? Number(JSON.parse(currentUser).prof_id) : NaN;
    } catch {
      this.subjectsLoadError = true;
    }

    if (!Number.isFinite(professorId)) {
      this.isLoadingSubjects = false;
      this.subjectsLoadError = true;
      return;
    }

    this.isLoadingSubjects = true;
    try {
      this.subjects = await this.supabaseService.getProfessorAssignedSubjectsForSection(professorId, sectionId);
    } catch (error) {
      console.error('Error loading subjects for answer sheet:', error);
      this.subjectsLoadError = true;
    } finally {
      this.isLoadingSubjects = false;
    }
  }

  onSubjectChange(subjectId: number | string | null): void {
    const selectedSubject = this.subjects.find((subject) => subject.SubjectID === Number(subjectId));
    this.model.SubjectID = selectedSubject?.SubjectID;
    this.model.subject = selectedSubject?.subject ?? '';
  }

  onQuizTypeChange(quizType: string): void {
    this.model.quiz_type = quizType === 'True or False' ? 'True or False' : 'Multiple Choice';
    if (this.isTrueFalse) {
      this.model.options_per_question = 2;
    }
  }

  /** Basic client-side validation before hitting the network -- mirrors
   * the constraints enforced server-side in config.SheetConfig.__post_init__. */
  private validate(): string | null {
    this.onQuizTypeChange(this.model.quiz_type);
    if (!this.model.title.trim()) return 'Title is required.';
    if (!this.model.section_id) return 'Section is required.';
    if (!this.model.SubjectID) return 'Subject is required.';
    if (!this.model.sheet_id.trim()) return 'Sheet ID is required.';
    if (!this.model.output_name.trim()) return 'Output filename is required.';
    if (this.model.total_questions <= 0) return 'Total questions must be positive.';
    if (this.model.columns <= 0) return 'Columns must be positive.';
    if (this.isTrueFalse && this.model.options_per_question !== 2) {
      return 'True or False sheets must use exactly 2 options.';
    }
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

    try {
      await this.supabaseService.saveSheetMetadata({
        sheet_id: this.model.sheet_id.trim(),
        sheet_title: this.model.title.trim(),
        quiz_type: this.model.quiz_type,
        questions: Number(this.model.total_questions),
        columns: Number(this.model.columns),
        section_id: Number(this.model.section_id),
        subj_id: Number(this.model.SubjectID),
      });
    } catch (error) {
      console.error('Sheet metadata could not be saved; continuing generation:', error);
      await this.showToast('Sheet metadata could not be saved. Continuing generation.', 'danger');
    }

    const studentIds = await this.getAssignedStudentIdsForGeneration();
    let studentMetadata: Array<{ student_id: string; student_name: string }> = [];
    try {
      studentMetadata = await this.supabaseService.getStudentMetadata(studentIds);
    } catch (error) {
      console.error('Student names could not be loaded; generating with student IDs:', error);
    }
    const generationModel = { ...this.model, student_ids: studentIds, student_metadata: studentMetadata };

    this.api.generatePdf(generationModel).subscribe({
      next: async (pdfBlob: Blob) => {
        await loading.dismiss();
        this.isGenerating = false;
        await this.saveOrSharePdf(pdfBlob, this.model.output_name);

        try {
          const currentUser = localStorage.getItem('currentUser');
          const professorId = currentUser ? Number(JSON.parse(currentUser)?.prof_id) : NaN;
          if (!Number.isFinite(professorId)) {
            throw new Error('Professor ID is missing.');
          }

          await this.supabaseService.assignSheetToProfessor(
            this.model.sheet_id.trim(),
            professorId
          );
        } catch (error) {
          console.error('Generated sheet could not be assigned:', error);
          this.sheetGenerated.emit(this.model);
          await this.showToast('Sheet downloaded, but department and school year assignment failed.', 'danger');
          return;
        }

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

  private async getAssignedStudentIdsForGeneration(): Promise<string[]> {
    const currentUser = localStorage.getItem('currentUser');
    try {
      const professorId = currentUser ? Number(JSON.parse(currentUser).prof_id) : NaN;
      if (!Number.isFinite(professorId) || !this.model.section_id || !this.model.SubjectID) {
        return [];
      }

      return await this.supabaseService.getAssignedStudentIds(
        professorId,
        Number(this.model.section_id),
        Number(this.model.SubjectID)
      );
    } catch (error) {
      console.error('Assigned students could not be loaded; generating a blank sheet:', error);
      await this.showToast('Assigned students could not be loaded. Generating a blank sheet.', 'danger');
      return [];
    }
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
