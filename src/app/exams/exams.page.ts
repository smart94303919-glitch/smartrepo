import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
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
  gradeTabs: { key: string; subjectName: string; sectionName: string }[] = [];
  selectedGradeTab = 'all';
  loadingGrades = false;
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
      const tabMap = new Map<string, { key: string; subjectName: string; sectionName: string }>();

      (assignments || []).forEach((assignment: any) => {
        const subject = Array.isArray(assignment.subject_tbl) ? assignment.subject_tbl[0] : assignment.subject_tbl;
        const section = Array.isArray(assignment.section_tbl) ? assignment.section_tbl[0] : assignment.section_tbl;
        const key = `${assignment.subj_id}:${assignment.section_id}`;
        if (!tabMap.has(key)) {
          tabMap.set(key, {
            key,
            subjectName: subject?.subject ?? 'Unknown Subject',
            sectionName: section?.section ?? 'Unknown Section'
          });
        }
      });

      this.grades = await this.supabaseService.getProfessorStudentScores(Number(professorId));
      const gradedClassKeys = new Set(
        this.grades.map((grade) => `${grade.subj_id}:${grade.section_id}`)
      );
      this.gradeTabs = Array.from(tabMap.values()).filter((tab) => gradedClassKeys.has(tab.key));
      this.selectedGradeTab = 'all';
    } catch (error) {
      console.error('Failed to load student grades:', error);
      this.gradesError = 'Failed to load student grades.';
    } finally {
      this.loadingGrades = false;
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
    if (this.selectedGradeTab === 'all') {
      return this.grades;
    }

    return this.grades.filter((grade) => `${grade.subj_id}:${grade.section_id}` === this.selectedGradeTab);
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
    XLSX.writeFile(workbook, `student-grades-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Deprecated: kept for backwards compatibility
   * Now redirects to openSheetMaker() instead of opening external window
   */
  openOmrSystem(): void {
    this.openSheetMaker();
  }
}