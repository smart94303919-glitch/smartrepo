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
  restoreSelectionMode = false;
  selectedRestoreArchiveIds = new Set<number>();

  get isAllSelected(): boolean {
    return this.archivedStudents.length > 0 && this.archivedStudents.every((student) =>
      this.selectedArchiveIds.has(Number(student?.s_archive_id))
    );
  }

  get isAllRestoreSelected(): boolean {
    return this.archivedStudents.length > 0 && this.archivedStudents.every((student) =>
      this.selectedRestoreArchiveIds.has(Number(student?.s_archive_id))
    );
  }

  get selectedRestoreCount(): number {
    return this.archivedStudents.filter((student) =>
      this.selectedRestoreArchiveIds.has(Number(student?.s_archive_id))
    ).length;
  }

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.loading = true;
      this.archivedStudents = await this.supabaseService.getArchivedStudents();
    } catch (error: any) {
      console.error('Failed to load archived records:', error?.message, error?.details);
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
    this.restoreSelectionMode = false;
    this.selectedRestoreArchiveIds.clear();
    this.exportSelectionMode = true;
    this.selectedArchiveIds.clear();
  }

  startRestoreSelection(): void {
    this.exportSelectionMode = false;
    this.selectedArchiveIds.clear();
    this.restoreSelectionMode = true;
    this.selectedRestoreArchiveIds.clear();
  }

  cancelExportSelection(): void {
    this.exportSelectionMode = false;
    this.selectedArchiveIds.clear();
  }

  cancelRestoreSelection(): void {
    this.restoreSelectionMode = false;
    this.selectedRestoreArchiveIds.clear();
  }

  toggleArchiveSelection(archiveRow: any): void {
    const archiveId = Number(archiveRow?.s_archive_id);
    if (!Number.isFinite(archiveId)) {
      return;
    }

    if (this.selectedArchiveIds.has(archiveId)) {
      this.selectedArchiveIds.delete(archiveId);
    } else {
      this.selectedArchiveIds.add(archiveId);
    }
  }

  toggleSelectAll(): void {
    if (this.isAllSelected) {
      this.archivedStudents.forEach((student) =>
        this.selectedArchiveIds.delete(Number(student?.s_archive_id))
      );
      return;
    }

    this.archivedStudents.forEach((student) => {
      const archiveId = Number(student?.s_archive_id);
      if (Number.isFinite(archiveId)) {
        this.selectedArchiveIds.add(archiveId);
      }
    });
  }

  toggleRestoreArchiveSelection(archiveRow: any): void {
    const archiveId = Number(archiveRow?.s_archive_id);
    if (!Number.isFinite(archiveId)) {
      return;
    }

    if (this.selectedRestoreArchiveIds.has(archiveId)) {
      this.selectedRestoreArchiveIds.delete(archiveId);
    } else {
      this.selectedRestoreArchiveIds.add(archiveId);
    }
  }

  toggleSelectAllRestore(): void {
    if (this.isAllRestoreSelected) {
      this.archivedStudents.forEach((student) =>
        this.selectedRestoreArchiveIds.delete(Number(student?.s_archive_id))
      );
      return;
    }

    this.archivedStudents.forEach((student) => {
      const archiveId = Number(student?.s_archive_id);
      if (Number.isFinite(archiveId)) {
        this.selectedRestoreArchiveIds.add(archiveId);
      }
    });
  }

  isRestoreArchiveSelected(archiveRow: any): boolean {
    return this.selectedRestoreArchiveIds.has(Number(archiveRow?.s_archive_id));
  }

  isArchiveSelected(archiveRow: any): boolean {
    return this.selectedArchiveIds.has(Number(archiveRow?.s_archive_id));
  }

  trackByArchiveId(_index: number, archiveRow: any): number {
    return Number(archiveRow?.s_archive_id);
  }

  exportSelectedStudents(): void {
    const selectedRows = this.archivedStudents.filter((row) =>
      this.selectedArchiveIds.has(Number(row.s_archive_id))
    );

    if (!selectedRows.length) {
      return;
    }

    const exportRows = selectedRows.map((row) => ({
      'Archive ID': row.s_archive_id,
      'Student ID': row.student_id,
      'Student Name': [
        row.student_tbl?.s_firstname,
        row.student_tbl?.s_middlename,
        row.student_tbl?.s_lastname
      ].filter(Boolean).join(' '),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Archived Students');
    XLSX.writeFile(workbook, `archived-students-${new Date().toISOString().slice(0, 10)}.xlsx`);
    this.cancelExportSelection();
  }

  async restoreSelectedStudents(): Promise<void> {
    if (this.restoringArchiveId !== null) {
      return;
    }

    const selectedRows = this.archivedStudents.filter((student) =>
      this.selectedRestoreArchiveIds.has(Number(student?.s_archive_id))
    );

    for (const archiveRow of selectedRows) {
      const archiveId = Number(archiveRow?.s_archive_id);
      await this.restoreStudent(archiveRow);
      if (this.archivedStudents.some((student) => Number(student?.s_archive_id) === archiveId)) {
        return;
      }
    }

    if (this.selectedRestoreCount === 0) {
      this.cancelRestoreSelection();
    }
  }

  async restoreStudent(archiveRow: any): Promise<void> {
    const currentUser = localStorage.getItem('currentUser');
    const profId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
    if (!profId) {
      this.errorMessage = 'Professor ID is missing.';
      return;
    }

    this.restoringArchiveId = archiveRow.s_archive_id;
    this.errorMessage = '';
    try {
      await this.supabaseService.restoreArchivedStudent(archiveRow, Number(profId));
      this.archivedStudents = this.archivedStudents.filter(
        (student) => student.s_archive_id !== archiveRow.s_archive_id
      );
      this.selectedArchiveIds.delete(Number(archiveRow.s_archive_id));
      this.selectedRestoreArchiveIds.delete(Number(archiveRow.s_archive_id));
    } catch (error) {
      console.error('Failed to restore archived student:', error);
      this.errorMessage = 'Failed to restore the student.';
    } finally {
      this.restoringArchiveId = null;
    }
  }
}
