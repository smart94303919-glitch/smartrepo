import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { firstValueFrom } from 'rxjs';
import { OmrApiService } from '../services/omr-api.service';
import { ProfessorSheet, SupabaseService } from '../services/supabase.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-exams',
  standalone: false,
  templateUrl: 'exams.page.html',
  styleUrls: ['exams.page.scss'],
})
export class ExamsPage implements OnInit {
  showGrades = false;
  grades: any[] = [];
  sections: { id: number; name: string }[] = [];
  subjectsBySection = new Map<number, { id: number; name: string }[]>();
  assessmentsBySubject = new Map<string, any[]>();
  selectedSectionId: number | null = null;
  selectedSubjectId: number | null = null;
  selectedAssessment: any | null = null;
  loadingGrades = false;
  loadingAssessments = false;
  loadingAssessmentGrades = false;
  gradesError = '';
  singleSheetModalOpen = false;
  loadingSingleSheetOptions = false;
  loadingSingleSheetStudents = false;
  generatingSingleSheet = false;
  singleSheetError = '';
  singleSheetSearch = '';
  singleStudentSearch = '';
  singleSheetSections: { id: number; name: string }[] = [];
  professorSheets: ProfessorSheet[] = [];
  availableSingleStudents: any[] = [];
  selectedSingleSectionId: number | null = null;
  selectedSingleSheet: ProfessorSheet | null = null;
  selectedSingleStudent: any | null = null;
  singleSheetSubjects = new Map<number, string>();
  private singleSheetSectionNames = new Map<number, string>();

  constructor(
    private router: Router,
    private supabaseService: SupabaseService,
    private omrApi: OmrApiService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {}

  async handleRefresh(event: any): Promise<void> {
    try {
      if (this.showGrades) {
        await this.openStudentGrades();
      }
    } finally {
      event.target.complete();
    }
  }

  /**
   * Navigate to OMR system in "metadata" mode to create answer sheets
   * This displays the Sheet Metadata & Layout Configuration form
   */
  openSheetMaker(): void {
    this.router.navigate(['/omr'], { queryParams: { mode: 'metadata' } });
  }

  async openSingleSheet(): Promise<void> {
    this.singleSheetModalOpen = true;
    this.loadingSingleSheetOptions = true;
    this.singleSheetError = '';
    this.professorSheets = [];
    this.singleSheetSections = [];
    this.selectedSingleSectionId = null;
    this.selectedSingleSheet = null;
    this.selectedSingleStudent = null;
    this.availableSingleStudents = [];

    try {
      const professorId = this.getActiveProfessorId();
      if (!professorId) {
        throw new Error('Professor ID is missing. Sign in again to load your sheets.');
      }

      const [sheets, assignments] = await Promise.all([
        this.supabaseService.getProfessorSheets(professorId),
        this.supabaseService.getProfessorSubjectSectionAssignments(professorId)
      ]);

      this.professorSheets = sheets.filter((sheet) =>
        Number.isFinite(sheet.section_id) && Number.isFinite(sheet.subj_id)
      );
      this.singleSheetSubjects.clear();
      this.singleSheetSectionNames.clear();
      (assignments || []).forEach((assignment: any) => {
        const subject = Array.isArray(assignment.subject_tbl) ? assignment.subject_tbl[0] : assignment.subject_tbl;
        const section = Array.isArray(assignment.section_tbl) ? assignment.section_tbl[0] : assignment.section_tbl;
        this.singleSheetSubjects.set(Number(assignment.subj_id), subject?.subject ?? 'Unknown Subject');
        this.singleSheetSectionNames.set(Number(assignment.section_id), section?.section ?? 'Unknown Section');
      });

      const sectionIds = Array.from(new Set(this.professorSheets.map((sheet) => sheet.section_id)));
      this.singleSheetSections = sectionIds.map((id) => ({
        id,
        name: this.singleSheetSectionNames.get(id) ?? `Section ${id}`
      }));

      if (!this.professorSheets.length) {
        this.singleSheetError = 'No reusable answer sheets found. Create an answer sheet first.';
      }
    } catch (error) {
      console.error('Failed to load reusable answer sheets:', error);
      this.singleSheetError = error instanceof Error
        ? error.message
        : 'Unable to load your answer sheets. Please try again.';
    } finally {
      this.loadingSingleSheetOptions = false;
    }
  }

  get filteredProfessorSheets(): ProfessorSheet[] {
    const search = this.singleSheetSearch.trim().toLowerCase();
    return this.professorSheets.filter((sheet) => {
      const matchesSection = this.selectedSingleSectionId === null ||
        sheet.section_id === this.selectedSingleSectionId;
      const label = `${sheet.sheet_id} ${sheet.sheet_title} ${this.singleSheetSubjects.get(sheet.subj_id) ?? ''}`
        .toLowerCase();
      return matchesSection && (!search || label.includes(search));
    });
  }

  get filteredSingleStudents(): any[] {
    const search = this.singleStudentSearch.trim().toLowerCase();
    return this.availableSingleStudents.filter((student) => {
      const label = `${student.first_name ?? ''} ${student.middle_name ?? ''} ${student.last_name ?? ''} ${student.student_id ?? ''}`
        .toLowerCase();
      return !search || label.includes(search);
    });
  }

  onSingleSheetSectionChanged(sectionId: number | string | null | undefined): void {
    this.selectedSingleSectionId = sectionId == null || sectionId === ''
      ? null
      : Number(sectionId);
    this.selectedSingleSheet = null;
    this.selectedSingleStudent = null;
    this.availableSingleStudents = [];
    this.singleSheetError = '';
  }

  async selectSingleSheet(sheet: ProfessorSheet): Promise<void> {
    this.selectedSingleSheet = sheet;
    this.selectedSingleStudent = null;
    this.availableSingleStudents = [];
    this.loadingSingleSheetStudents = true;
    this.singleSheetError = '';

    try {
      const professorId = this.getActiveProfessorId();
      const sectionName = this.singleSheetSectionNames.get(sheet.section_id);
      if (!professorId || !sectionName) {
        throw new Error('Professor or section information is missing.');
      }

      const [enrolledStudents, scoredStudentIds] = await Promise.all([
        this.supabaseService.getStudentsForSubject(sheet.subj_id, sectionName, professorId),
        this.supabaseService.getScoredStudentIdsForSheet(sheet.sheet_id)
      ]);
      const scoredIds = new Set(scoredStudentIds);
      this.availableSingleStudents = enrolledStudents.filter(
        (student) => !scoredIds.has(String(student.student_id).trim())
      );

      if (!this.availableSingleStudents.length) {
        this.singleSheetError = 'No eligible students are available for this sheet in the selected section.';
      }
    } catch (error) {
      console.error('Failed to load students for single-sheet printing:', error);
      this.singleSheetError = 'Unable to load eligible students. Please try again.';
    } finally {
      this.loadingSingleSheetStudents = false;
    }
  }

  selectSingleStudent(student: any): void {
    this.selectedSingleStudent = student;
  }

  async generateSingleStudentSheet(): Promise<void> {
    const sheet = this.selectedSingleSheet;
    const student = this.selectedSingleStudent;
    const professorId = this.getActiveProfessorId();
    const sectionName = sheet ? this.singleSheetSectionNames.get(sheet.section_id) : null;
    const subjectName = sheet ? this.singleSheetSubjects.get(sheet.subj_id) : null;
    if (!sheet || !student || !professorId || !sectionName || !subjectName) {
      this.singleSheetError = 'Select a section, sheet ID, and student before generating.';
      return;
    }

    this.generatingSingleSheet = true;
    const loading = await this.loadingCtrl.create({
      message: 'Generating single-student answer sheet...',
      spinner: 'crescent',
      backdropDismiss: false
    });
    await loading.present();

    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const studentName = [
        student.first_name,
        student.middle_name,
        student.last_name
      ].filter(Boolean).join(' ');
      const filenamePart = `${sheet.sheet_id}-${student.student_id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const pdf = await firstValueFrom(this.omrApi.generatePdf({
        title: sheet.sheet_title,
        subject: subjectName,
        SubjectID: sheet.subj_id,
        section_id: sheet.section_id,
        section: sectionName,
        quiz_type: sheet.quiz_type === 'True or False' ? 'True or False' : 'Multiple Choice',
        total_questions: sheet.questions,
        options_per_question: sheet.quiz_type === 'True or False' ? 2 : sheet.options,
        columns: sheet.columns,
        sheet_id: sheet.sheet_id,
        output_name: `single-sheet-${filenamePart}.pdf`,
        student_ids: [String(student.student_id)],
        student_metadata: [{
          student_id: String(student.student_id),
          student_name: studentName || String(student.student_id)
        }],
        prof_id: professorId,
        professor_id: String(currentUser.prof_number || professorId),
        professor_name: [
          currentUser.p_firstname,
          currentUser.p_middlename,
          currentUser.p_lastname
        ].filter(Boolean).join(' ') || 'MASTER ANSWER KEY',
        reuse_existing_sheet: true
      }));

      await this.saveOrShareSingleSheet(pdf, `single-sheet-${filenamePart}.pdf`);
      await loading.dismiss();
      this.generatingSingleSheet = false;
      await this.showSingleSheetToast(
        `Single OMR Sheet generated for ${studentName || student.student_id}.`,
        'success'
      );
      this.singleSheetModalOpen = false;
    } catch (error) {
      console.error('Failed to generate reusable single-student sheet:', error);
      await loading.dismiss();
      this.generatingSingleSheet = false;
      await this.showSingleSheetToast('Unable to generate the single OMR sheet. Please try again.', 'danger');
    }
  }

  private getActiveProfessorId(): number | null {
    try {
      const professorId = Number(JSON.parse(localStorage.getItem('currentUser') || '{}').prof_id);
      return Number.isFinite(professorId) && professorId > 0 ? professorId : null;
    } catch (error) {
      console.error('Professor session metadata could not be read:', error);
      return null;
    }
  }

  private async saveOrShareSingleSheet(pdf: Blob, filename: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const base64Data = await this.blobToBase64(pdf);
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents
      });
      await Share.share({
        title: 'Single student OMR sheet',
        text: 'Generated OMR answer sheet',
        url: savedFile.uri,
        dialogTitle: 'Open or share answer sheet'
      });
      return;
    }

    const url = window.URL.createObjectURL(pdf);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read generated PDF.'));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Generated PDF could not be converted for saving.'));
          return;
        }
        resolve(result.split(',')[1] ?? '');
      };
      reader.readAsDataURL(blob);
    });
  }

  private async showSingleSheetToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
  }

  closeSingleSheetModal(): void {
    this.singleSheetModalOpen = false;
  }

  /**
   * Navigate to OMR system in "scanner" mode to scan and grade answer sheets
   * This displays the Camera capture / Image upload and Grading sections
   */
  openScanner(): void {
    this.router.navigate(['/omr'], { queryParams: { mode: 'scanner' } });
  }

  /**
   * Navigate to OMR system in "results" mode to view student grades
   * This displays the Class Results / Grade Analytics dashboard
   */
  async openStudentGrades(): Promise<void> {
    this.showGrades = true;
    this.loadingGrades = true;
    this.gradesError = '';

    try {
      const currentUser = localStorage.getItem('currentUser');
      const professorId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
      if (!professorId) {
        this.gradesError = 'Professor ID is missing.';
        return;
      }

      const assignments = await this.supabaseService.getProfessorSubjectSectionAssignments(Number(professorId));
      const sectionMap = new Map<number, { id: number; name: string }>();
      const subjectMap = new Map<number, { id: number; name: string }[]>();

      (assignments || []).forEach((assignment: any) => {
        const subject = Array.isArray(assignment.subject_tbl) ? assignment.subject_tbl[0] : assignment.subject_tbl;
        const section = Array.isArray(assignment.section_tbl) ? assignment.section_tbl[0] : assignment.section_tbl;
        const sectionId = Number(assignment.section_id);
        const subjectId = Number(assignment.subj_id);
        sectionMap.set(sectionId, { id: sectionId, name: section?.section ?? 'Unknown Section' });
        const sectionSubjects = subjectMap.get(sectionId) || [];
        if (!sectionSubjects.some((item) => item.id === subjectId)) {
          sectionSubjects.push({ id: subjectId, name: subject?.subject ?? 'Unknown Subject' });
        }
      });

      this.sections = Array.from(sectionMap.values());
      this.subjectsBySection = subjectMap;
      this.assessmentsBySubject.clear();
      this.grades = [];
      this.selectedSectionId = null;
      this.selectedSubjectId = null;
      this.selectedAssessment = null;
      this.loadingAssessments = true;
      const assessments = await this.supabaseService.getProfessorGradeAssessments(Number(professorId));
      assessments.forEach((assessment: any) => {
        const key = this.assessmentKey(assessment.section_id, assessment.subj_id);
        const subjectAssessments = this.assessmentsBySubject.get(key) || [];
        subjectAssessments.push(assessment);
        this.assessmentsBySubject.set(key, subjectAssessments);
      });
    } catch (error) {
      console.error('Failed to load student grades:', error);
      this.gradesError = 'Failed to load student grades.';
    } finally {
      this.loadingAssessments = false;
      this.loadingGrades = false;
    }
  }

  private assessmentKey(sectionId: number, subjectId: number): string {
    return `${sectionId}:${subjectId}`;
  }

  get selectedSubjects(): { id: number; name: string }[] {
    return this.selectedSectionId === null ? [] : this.subjectsBySection.get(this.selectedSectionId) || [];
  }

  get selectedAssessments(): any[] {
    return this.selectedSectionId === null || this.selectedSubjectId === null
      ? []
      : this.assessmentsBySubject.get(this.assessmentKey(this.selectedSectionId, this.selectedSubjectId)) || [];
  }

  onSectionSelected(sectionId: number | string | undefined): void {
    if (sectionId === undefined) {
      return;
    }

    this.selectedSectionId = Number(sectionId);
    this.selectedSubjectId = null;
    this.selectedAssessment = null;
    this.grades = [];

    const currentUser = localStorage.getItem('currentUser');
    const professorId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
    if (professorId) {
      void this.loadSubjectsForSection(Number(professorId), this.selectedSectionId);
    }
  }

  private async loadSubjectsForSection(professorId: number, sectionId: number): Promise<void> {
    try {
      const subjects = await this.supabaseService.getProfessorSubjectsForSection(professorId, sectionId);
      this.subjectsBySection.set(sectionId, subjects);
    } catch (error) {
      console.error('Failed to load subjects for section:', error);
      this.gradesError = 'Failed to load subjects for the selected section.';
    }
  }

  onSubjectSelected(subjectId: number): void {
    this.selectedSubjectId = Number(subjectId);
    this.selectedAssessment = null;
    this.grades = [];
  }

  async onAssessmentSelected(assessment: any): Promise<void> {
    this.selectedAssessment = assessment;
    this.grades = [];
    this.loadingAssessmentGrades = true;
    this.gradesError = '';

    try {
      const currentUser = localStorage.getItem('currentUser');
      const professorId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
      if (!professorId) {
        this.gradesError = 'Professor ID is missing.';
        return;
      }

      this.grades = await this.supabaseService.getProfessorGradesForAssessment(
        Number(professorId),
        Number(assessment.section_id),
        Number(assessment.subj_id),
        String(assessment.sheet_id)
      );
    } catch (error) {
      console.error('Failed to load assessment grades:', error);
      this.gradesError = 'Failed to load grades for this assessment.';
    } finally {
      this.loadingAssessmentGrades = false;
    }
  }

  getLetterGrade(percentage: number | null | undefined): string {
    const score = Number(percentage ?? 0);
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  get filteredGrades(): any[] {
    return this.grades;
  }

  async exportGrades(): Promise<void> {
    const rows = this.filteredGrades;
    if (!rows.length) {
      return;
    }

    let sheetAssignments: any[] = [];
    try {
      sheetAssignments = await this.supabaseService.getSheetAssignments(
        rows.map((grade) => grade.sheet_id)
      );
    } catch (error) {
      console.error('Failed to fetch sheet assignments for export:', error);
    }

    const assignmentBySheetId = new Map<string, any>();
    sheetAssignments.forEach((assignment) => {
      const sheetId = String(assignment.sheet_id ?? '').trim();
      if (sheetId && !assignmentBySheetId.has(sheetId)) {
        assignmentBySheetId.set(sheetId, assignment);
      }
    });

    const selectedSubjectName = this.selectedSubjects.find((subject) => subject.id === this.selectedSubjectId)?.name;
    const selectedSectionName = this.sections.find((section) => section.id === this.selectedSectionId)?.name;
    const exportSubject = selectedSubjectName ?? rows.find((grade) => grade.subject_name)?.subject_name ?? 'N/A';
    const exportSection = selectedSectionName ?? rows.find((grade) => grade.section_name)?.section_name ?? 'N/A';

    const exportRows = rows.map((grade) => ({
      'Student ID': grade.student_id ?? 'N/A',
      'Student Name': grade.student_name ?? 'N/A',
      Subject: exportSubject,
      Section: exportSection,
      Score: grade.score_value ?? 0,
      Percentage: grade.percentage != null ? `${grade.percentage}%` : 'N/A',
      'Letter Grade': this.getLetterGrade(grade.percentage),
      'Assigned Sheet ID': assignmentBySheetId.get(String(grade.sheet_id ?? '').trim())?.sheet_id ?? 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Grades');
    const filename = `student-grades-${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (Capacitor.isNativePlatform()) {
      const fileData = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: fileData,
        directory: Directory.Documents,
        recursive: true
      });

      await Share.share({
        title: 'Student grades export',
        text: 'Student grades Excel file',
        url: savedFile.uri,
        dialogTitle: 'Open or share student grades'
      });
      return;
    }

    XLSX.writeFile(workbook, filename);
  }

  /**
   * Deprecated: kept for backwards compatibility
   * Now redirects to openSheetMaker() instead of opening external window
   */
  openOmrSystem(): void {
    this.openSheetMaker();
  }
}