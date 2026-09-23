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
import { IonicModule, ToastController, LoadingController, NavController } from '@ionic/angular';
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
    sheet_id: '',
    output_name: 'Midterm Examination.pdf',
    student_id_digits: 13,
  };

  sections: Array<{ section_id: number; section: string }> = [];
  subjects: Array<{ SubjectID: number; subject: string }> = [];
  isLoadingSections = true;
  isLoadingSubjects = false;
  sectionsLoadError = false;
  subjectsLoadError = false;

  // Options map 1:1 to answer letters in the backend (A-I).
  readonly optionChoices = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  maxAllowedOptions = 9;
  maxAllowedColumns = 6;

  get availableOptionChoices(): number[] {
    return this.optionChoices.filter((optionCount) => optionCount <= this.maxAllowedOptions);
  }

  get isTrueFalse(): boolean {
    return this.model.quiz_type === 'True or False';
  }

  isGenerating = false;

  constructor(
    private api: OmrApiService,
    private supabaseService: SupabaseService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private navCtrl: NavController
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.model.sheet_id = await this.generateUniqueSheetId();
    } catch (error) {
      console.error('Error generating unique sheet ID:', error);
      await this.showToast('Unable to generate a unique Sheet ID. Please try again.', 'danger');
    }

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

  async generateUniqueSheetId(): Promise<string> {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
      const candidate = `SHT-${datePart}-${randomPart}`;
      if (!await this.supabaseService.sheetIdExists(candidate)) {
        return candidate;
      }
    }

    throw new Error('Unable to find an unused Sheet ID.');
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

  onQuestionCountChange(): void {
    const totalQuestions = Number(this.model.total_questions);
    this.model.total_questions = Number.isFinite(totalQuestions)
      ? Math.min(100, Math.max(1, Math.trunc(totalQuestions)))
      : 1;

    if (this.model.total_questions >= 70) {
      this.maxAllowedOptions = 5;
      this.maxAllowedColumns = 5;
    } else {
      this.maxAllowedOptions = 9;
      this.maxAllowedColumns = 6;
    }

    this.sanitizeOptionsInput();
    this.sanitizeColumnsInput();
  }

  sanitizeOptionsInput(): void {
    const options = Number(this.model.options_per_question);
    this.model.options_per_question = Number.isFinite(options)
      ? Math.min(this.maxAllowedOptions, Math.max(2, Math.trunc(options)))
      : 2;
  }

  sanitizeColumnsInput(event?: any): void {
    const value = event?.detail?.value ?? event?.target?.value ?? this.model.columns;
    const columns = Number(value);
    this.model.columns = Number.isFinite(columns)
      ? Math.min(this.maxAllowedColumns, Math.max(1, Math.trunc(columns)))
      : 1;

    if (event?.target && Number.isFinite(columns) && columns > this.maxAllowedColumns) {
      event.target.value = this.maxAllowedColumns;
    }
  }

  sanitizeQuestionInput(event: any): void {
    const value = event?.detail?.value ?? event?.target?.value;
    if (value !== null && value !== undefined && value !== '') {
      const parsedValue = Number.parseInt(String(value), 10);
      if (Number.isFinite(parsedValue)) {
        this.model.total_questions = Math.min(100, Math.max(1, parsedValue));
        if (parsedValue > 100 && event?.target) {
          event.target.value = 100;
        }
      }
    }

    this.onQuestionCountChange();
  }

  onTitleChange(title: string): void {
    const outputTitle = String(title ?? '').trim();
    this.model.output_name = outputTitle
      ? (outputTitle.toLowerCase().endsWith('.pdf') ? outputTitle : `${outputTitle}.pdf`)
      : '';
  }

  /** Basic client-side validation before hitting the network -- mirrors
   * the constraints enforced server-side in config.SheetConfig.__post_init__. */
  private validate(): string | null {
    this.onQuizTypeChange(this.model.quiz_type);
    this.onQuestionCountChange();
    if (!this.model.title.trim()) return 'Title is required.';
    if (!this.model.section_id) return 'Section is required.';
    if (!this.model.SubjectID) return 'Subject is required.';
    if (!this.model.sheet_id.trim()) return 'Sheet ID is required.';
    if (!this.model.output_name.trim()) return 'Output filename is required.';
    if (this.model.total_questions < 1 || this.model.total_questions > 100) {
      return 'Total questions must be between 1 and 100.';
    }
    if (this.model.columns < 1 || this.model.columns > this.maxAllowedColumns) {
      return `Columns must be between 1 and ${this.maxAllowedColumns}.`;
    }
    if (this.isTrueFalse && this.model.options_per_question !== 2) {
      return 'True or False sheets must use exactly 2 options.';
    }
    if (this.model.options_per_question < 1 || this.model.options_per_question > this.maxAllowedOptions) {
      return `Options per question must be between 1 and ${this.maxAllowedOptions}.`;
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
      let activeProfessorId: number | null = null;
      try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const parsedProfessorId = Number(currentUser.prof_id);
        activeProfessorId = Number.isFinite(parsedProfessorId) ? parsedProfessorId : null;
      } catch {
        console.error('Professor session metadata could not be read.');
      }

      await this.supabaseService.saveSheetMetadata({
        sheet_id: this.model.sheet_id.trim(),
        sheet_title: this.model.title.trim(),
        quiz_type: this.model.quiz_type,
        questions: Number(this.model.total_questions),
        columns: Number(this.model.columns),
        section_id: Number(this.model.section_id),
        subj_id: Number(this.model.SubjectID),
      }, activeProfessorId);
    } catch (error) {
      console.error('Sheet metadata could not be saved; generation aborted:', error);
      await loading.dismiss();
      this.isGenerating = false;
      await this.showToast('Sheet could not be saved. PDF generation was cancelled.', 'danger');
      return;
    }

    const studentIds = await this.getAssignedStudentIdsForGeneration();
    let currentUser: any = {};
    try {
      currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    } catch {
      console.error('Professor session metadata could not be read.');
    }
    let studentMetadata: Array<{ student_id: string; student_name: string }> = [];
    try {
      studentMetadata = await this.supabaseService.getStudentMetadata(studentIds);
    } catch (error) {
      console.error('Student names could not be loaded; generating with student IDs:', error);
    }
    const professorName = [
      currentUser.p_firstname,
      currentUser.p_middlename,
      currentUser.p_lastname,
    ].filter(Boolean).join(' ');
    const generationModel = {
      ...this.model,
      student_ids: studentIds,
      student_metadata: studentMetadata,
      prof_id: Number.isFinite(Number(currentUser.prof_id)) ? Number(currentUser.prof_id) : undefined,
      professor_id: String(currentUser.prof_number || currentUser.prof_id || '').trim(),
      professor_name: professorName || 'MASTER ANSWER KEY',
    };

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
        await this.showToast('Answer Sheet generated and saved successfully!', 'success');
        await this.navCtrl.navigateBack('/exams');
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
