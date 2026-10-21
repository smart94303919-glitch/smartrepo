import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './archive.page.html',
  styleUrls: ['./archive.page.scss']
})
export class ArchivePage {
  archivedStudents: any[] = [];
  searchTerm = '';
  loading = false;
  errorMessage = '';
  restoringArchiveId: number | null = null;
  exportSelectionMode = false;
  selectedArchiveIds = new Set<number>();
  restoreSelectionMode = false;
  selectedRestoreArchiveIds = new Set<number>();

  private get visibleArchivedStudents(): any[] {
    return this.filteredArchivedStudents;
  }

  get filteredArchivedStudents(): any[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) {
      return this.archivedStudents;
    }

    return this.archivedStudents.filter((row) => {
      const searchableValues = [
        row.student_id,
        JSON.stringify(row.student_tbl ?? {}),
        row.dept_id,
        JSON.stringify(row.department ?? {}),
        row.section_id,
        JSON.stringify(row.section_tbl ?? {}),
        row.subj_id,
        JSON.stringify(row.subject_tbl ?? {}),
        row.sy_id,
        JSON.stringify(row.schoolyear_tbl ?? {})
      ];
      return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }

  onArchiveSearchInput(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm = String(event.detail?.value ?? '');
  }

  get isAllSelected(): boolean {
    return this.visibleArchivedStudents.length > 0 && this.visibleArchivedStudents.every((student) =>
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

  get selectedFilteredArchiveCount(): number {
    return this.visibleArchivedStudents.filter((student) =>
      this.selectedArchiveIds.has(Number(student?.s_archive_id))
    ).length;
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private supabaseService: SupabaseService,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.loading = true;
      this.searchTerm = '';
      const currentUser = localStorage.getItem('currentUser');
      const profId = Number(currentUser ? JSON.parse(currentUser)?.prof_id : null);
      if (!Number.isFinite(profId) || profId <= 0) {
        throw new Error('Professor ID is missing.');
      }
      this.archivedStudents = await this.supabaseService.getArchivedStudents(profId);
    } catch (error: any) {
      console.error('Failed to load archived records:', error?.message, error?.details);
      this.errorMessage = error?.message === 'Professor ID is missing.'
        ? error.message
        : 'Failed to load archived students.';
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

  async goBack(): Promise<void> {
    if (this.restoringArchiveId !== null) {
      return;
    }

    await this.router.navigate(['/student_dashboard'], {
      queryParams: {
        section: this.route.snapshot.queryParamMap.get('section') || undefined,
        subject: this.route.snapshot.queryParamMap.get('subject') || undefined,
        subjectId: this.route.snapshot.queryParamMap.get('subjectId') || undefined
      }
    });
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
      this.visibleArchivedStudents.forEach((student) =>
        this.selectedArchiveIds.delete(Number(student?.s_archive_id))
      );
      return;
    }

    this.visibleArchivedStudents.forEach((student) => {
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

  async exportSelectedStudents(): Promise<void> {
    const selectedRows = this.filteredArchivedStudents.filter((row) =>
      this.selectedArchiveIds.has(Number(row.s_archive_id))
    );

    if (!selectedRows.length) {
      return;
    }

    try {
      const pdf = this.createArchiveReportPdf(selectedRows);
      const filename = `archived-students-${new Date().toISOString().slice(0, 10)}.pdf`;
      const blob = pdf.output('blob');

      if (Capacitor.isNativePlatform()) {
        const base64Data = await this.blobToBase64(blob);
        const savedFile = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache
        });
        try {
          await Share.share({
            title: 'Archived Students Report',
            text: 'Archived students PDF report',
            url: savedFile.uri,
            dialogTitle: 'Open or share archived students report'
          });
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            throw error;
          }
        }
      } else {
        this.downloadPdf(blob, filename);
      }

      this.cancelExportSelection();
      await this.showExportToast('Archived students PDF exported successfully.', 'success');
    } catch (error) {
      console.error('Failed to export archived students:', error);
      await this.showExportToast(
        error instanceof Error ? `Unable to export archived students: ${error.message}` : 'Unable to export archived students. Please try again.',
        'danger'
      );
    }
  }

  private createArchiveReportPdf(rows: any[]): jsPDF {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 14;
    const tableX = margin;
    const columnWidths = [30, 64, 42, 48];
    const headers = ['Student ID', 'Student Name', 'Department', 'School Year'];
    const rowHeight = (values: string[]): number => {
      const lineCounts = values.map((value, index) =>
        pdf.splitTextToSize(value || 'N/A', columnWidths[index] - 6).length
      );
      return Math.max(9, Math.max(...lineCounts) * 4.5 + 4);
    };
    let currentY = 0;

    const drawHeader = (continued = false): void => {
      pdf.setFillColor(20, 58, 111);
      pdf.rect(0, 0, pageWidth, 36, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text(continued ? 'Archived Students Report (continued)' : 'Archived Students Report', margin, 16);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, 24);
      pdf.setTextColor(30, 41, 59);
      currentY = 43;
      this.drawArchiveTableHeader(pdf, headers, columnWidths, tableX, currentY);
      currentY += 8;
    };

    drawHeader();
    rows.forEach((row, rowIndex) => {
      const student = Array.isArray(row.student_tbl) ? row.student_tbl[0] : row.student_tbl;
      const department = Array.isArray(row.department) ? row.department[0] : row.department;
      const schoolYear = Array.isArray(row.schoolyear_tbl) ? row.schoolyear_tbl[0] : row.schoolyear_tbl;
      const values = [
        String(row.student_id ?? 'N/A'),
        [student?.s_firstname, student?.s_middlename, student?.s_lastname].filter(Boolean).join(' ') || 'N/A',
        this.getRelationLabel(department, ['department', 'dept_name', 'name']),
        this.getRelationLabel(schoolYear, ['sy_label', 'school_year', 'schoolyear', 'school_year_name', 'sy_name', 'year'])
      ];
      const height = rowHeight(values);

      if (currentY + height > pageHeight - margin) {
        pdf.addPage();
        drawHeader(true);
      }

      let cellX = tableX;
      pdf.setDrawColor(218, 226, 237);
      const rowColor = rowIndex % 2 === 0 ? 248 : 255;
      pdf.setFillColor(rowColor, rowIndex % 2 === 0 ? 250 : 255, rowIndex % 2 === 0 ? 253 : 255);
      pdf.rect(tableX, currentY, columnWidths.reduce((total, width) => total + width, 0), height, 'FD');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      values.forEach((value, index) => {
        const lines = pdf.splitTextToSize(value, columnWidths[index] - 6);
        pdf.text(lines, cellX + 3, currentY + 5);
        cellX += columnWidths[index];
      });
      currentY += height;
    });

    return pdf;
  }

  private drawArchiveTableHeader(
    pdf: jsPDF,
    headers: string[],
    columnWidths: number[],
    startX: number,
    y: number
  ): void {
    pdf.setFillColor(230, 237, 247);
    pdf.rect(startX, y, columnWidths.reduce((total, width) => total + width, 0), 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(20, 58, 111);
    let cellX = startX;
    headers.forEach((header, index) => {
      pdf.text(header, cellX + 3, y + 5.5);
      cellX += columnWidths[index];
    });
  }

  private getRelationLabel(relation: Record<string, unknown> | null | undefined, keys: string[]): string {
    if (!relation) {
      return 'N/A';
    }
    const value = keys.map((key) => relation[key]).find((item) => item !== null && item !== undefined);
    return value === undefined ? 'N/A' : String(value);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read PDF data.'));
      reader.onload = () => {
        const result = String(reader.result ?? '');
        const base64 = result.split(',')[1];
        if (!base64) {
          reject(new Error('Unable to encode PDF for sharing.'));
          return;
        }
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }

  private downloadPdf(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }

  private async showExportToast(
    message: string,
    color: 'success' | 'warning' | 'danger'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3500, color });
    await toast.present();
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
