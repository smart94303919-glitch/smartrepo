import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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

  constructor(private router: Router, private supabaseService: SupabaseService) {}

  ngOnInit(): void {}

  /**
   * Navigate to OMR system in "metadata" mode to create answer sheets
   * This displays the Sheet Metadata & Layout Configuration form
   */
  openSheetMaker(): void {
    this.router.navigate(['/omr'], { queryParams: { mode: 'metadata' } });
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

    const exportRows = rows.map((grade) => ({
      'Student ID': grade.student_id ?? 'N/A',
      'Student Name': grade.student_name ?? 'N/A',
      Subject: grade.subject_name ?? 'N/A',
      Section: grade.section_name ?? 'N/A',
      Score: grade.score_value ?? 0,
      Percentage: grade.percentage != null ? `${grade.percentage}%` : 'N/A',
      'Letter Grade': this.getLetterGrade(grade.percentage),
      'Assigned Sheet ID': assignmentBySheetId.get(String(grade.sheet_id ?? '').trim())?.sheet_id ?? 'N/A',
      'Department ID': assignmentBySheetId.get(String(grade.sheet_id ?? '').trim())?.dept_id ?? 'N/A',
      'School Year ID': assignmentBySheetId.get(String(grade.sheet_id ?? '').trim())?.sy_id ?? 'N/A'
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