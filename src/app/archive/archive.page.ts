import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './archive.page.html',
  styleUrls: ['./archive.page.scss']
})
export class ArchivePage {
  archivedStudents: any[] = [];
  loading = false;
  errorMessage = '';
  restoringArchiveId: number | null = null;
  exportSelectionMode = false;
  selectedArchiveIds = new Set<number>();

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.loading = true;
      this.archivedStudents = await this.supabaseService.getArchivedStudents();
    } catch (error) {
      console.error('Failed to load archived students:', error);
      this.errorMessage = 'Failed to load archived students.';
    } finally {
      this.loading = false;
    }
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      await this.ngOnInit();
    } finally {
      event.target.complete();
    }
  }

  goBack(): void {
    this.router.navigate(['/student_dashboard']);
  }

  startExportSelection(): void {
    this.exportSelectionMode = true;
    this.selectedArchiveIds.clear();
  }

  cancelExportSelection(): void {
    this.exportSelectionMode = false;
    this.selectedArchiveIds.clear();
  }

  toggleArchiveSelection(archiveRow: any): void {
    const archiveId = Number(archiveRow?.p_archive_id);
    if (!Number.isFinite(archiveId)) {
      return;
    }

    if (this.selectedArchiveIds.has(archiveId)) {
      this.selectedArchiveIds.delete(archiveId);
    } else {
      this.selectedArchiveIds.add(archiveId);
    }
  }

  isArchiveSelected(archiveRow: any): boolean {
    return this.selectedArchiveIds.has(Number(archiveRow?.p_archive_id));
  }

  exportSelectedStudents(): void {
    const selectedRows = this.archivedStudents.filter((row) =>
      this.selectedArchiveIds.has(Number(row.p_archive_id))
    );

    if (!selectedRows.length) {
      return;
    }

    const exportRows = selectedRows.map((row) => ({
      'Archive ID': row.p_archive_id,
      'Student ID': row.student_id,
      'Student Name': [
        row.student_tbl?.s_firstname,
        row.student_tbl?.s_middlename,
        row.student_tbl?.s_lastname
      ].filter(Boolean).join(' '),
      'Department ID': row.dept_id ?? 'N/A',
      'Section ID': row.section_id ?? 'N/A',
      'Subject ID': row.subj_id ?? 'N/A',
      'Score ID': row.Score_id ?? 'N/A',
      Score: row.student_score?.score_value ?? 'N/A',
      Percentage: row.student_score?.percentage != null ? `${row.student_score.percentage}%` : 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Archived Students');
    XLSX.writeFile(workbook, `archived-students-${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.cancelExportSelection();
  }

  async restoreStudent(archiveRow: any): Promise<void> {
    const currentUser = localStorage.getItem('currentUser');
    const profId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
    if (!profId) {
      this.errorMessage = 'Professor ID is missing.';
      return;
    }

    this.restoringArchiveId = archiveRow.p_archive_id;
    this.errorMessage = '';
    try {
      await this.supabaseService.restoreArchivedStudent(archiveRow, Number(profId));
      this.archivedStudents = this.archivedStudents.filter(
        (student) => student.p_archive_id !== archiveRow.p_archive_id
      );
    } catch (error) {
      console.error('Failed to restore archived student:', error);
      this.errorMessage = 'Failed to restore the student.';
    } finally {
      this.restoringArchiveId = null;
    }
  }
}
