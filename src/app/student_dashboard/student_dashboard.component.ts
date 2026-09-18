import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './student_dashboard.component.html',
  styleUrls: ['./student_dashboard.component.scss'],
})
export class StudentDashboardComponent implements OnInit {
  selectedSubject: string | null = null;
  selectedSectionName: string | null = null;
  subjectId: string | null = null;
  subjectTabs: { SubjectID: number; subject: string }[] = [];
  selectedSubjectTab: number = 0;
  currentProfId: number | null = null;
  loading: boolean = false;
  studentsLoading: boolean = false;
  errorMessage: string = '';
  students: any[] = [];
  searchText: string = '';
  csvImportMessage: string = '';
  csvImportError: string = '';
  csvImporting: boolean = false;
  archiveSelectionMode = false;
  selectedStudentIds = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit(): Promise<void> {
    this.selectedSubject = this.route.snapshot.queryParamMap.get('subject');
    this.selectedSectionName = this.route.snapshot.queryParamMap.get('section');
    this.subjectId = this.route.snapshot.queryParamMap.get('subjectId');

    if (this.selectedSectionName || this.subjectId) {
      await this.loadSubjectTabsForSection();
    }
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      await this.loadSubjectTabsForSection();
    } finally {
      event.target.complete();
    }
  }

  private async loadSubjectTabsForSection(): Promise<void> {
    try {
      this.loading = true;
      this.errorMessage = '';
      this.subjectTabs = [];
      this.selectedSubjectTab = 0;

      const currentUser = localStorage.getItem('currentUser');
      if (!currentUser) {
        this.errorMessage = 'Professor not logged in.';
        return;
      }

      const user = JSON.parse(currentUser);
      if (!user?.prof_id) {
        this.errorMessage = 'Professor ID is missing.';
        return;
      }

      this.currentProfId = Number(user.prof_id);
      const rows: any[] = await this.supabaseService.getProfessorSubjectSectionAssignments(this.currentProfId);
      const subjectMap = new Map<number, { SubjectID: number; subject: string }>();

      (rows || []).forEach((row: any) => {
        const subjectField = row.subject_tbl;
        const subjectObj = Array.isArray(subjectField) ? subjectField[0] : subjectField;
        const sectionField = row.section_tbl;
        const sectionObj = Array.isArray(sectionField) ? sectionField[0] : sectionField;
        const id = row.subj_id ?? subjectObj?.subj_id;
        const name = subjectObj?.subject ?? 'Unknown Subject';
        const sectionName = sectionObj?.section ?? 'Unknown Section';

        if (!id) {
          return;
        }

        if (this.selectedSectionName && sectionName !== this.selectedSectionName) {
          return;
        }

        if (!subjectMap.has(id)) {
          subjectMap.set(id, { SubjectID: id, subject: name });
        }
      });

      this.subjectTabs = Array.from(subjectMap.values());

      if (!this.subjectTabs.length) {
        this.errorMessage = 'No subjects assigned to this section.';
        this.students = [];
      } else {
        this.selectedSubjectTab = 0;
        await this.loadStudentsForSelectedSubject();
      }
    } catch (error: any) {
      console.error('Failed to load subject tabs:', error);
      this.errorMessage = 'Failed to load subjects for this section.';
    } finally {
      this.loading = false;
    }
  }

  private getCurrentProfessorId(): number | null {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      return null;
    }

    const user = JSON.parse(currentUser);
    return user?.prof_id ?? null;
  }

  async loadStudentsForSelectedSubject(): Promise<void> {
    const selectedSubject = this.subjectTabs[this.selectedSubjectTab];
    const profId = this.getCurrentProfessorId();

    if (!selectedSubject?.SubjectID || !profId) {
      this.students = [];
      return;
    }

    try {
      this.studentsLoading = true;
      this.currentProfId = profId;
      this.students = await this.supabaseService.getStudentsForSubject(
        selectedSubject.SubjectID,
        this.selectedSectionName,
        profId
      );
    } catch (error: any) {
      console.error('Failed to load students:', error);
      this.students = [];
    } finally {
      this.studentsLoading = false;
    }
  }

  onSubjectTabChange(event: any): void {
    this.selectedSubjectTab = event.detail.value;
    this.searchText = '';
    void this.loadStudentsForSelectedSubject();
  }

  get filteredStudents(): any[] {
    const query = this.searchText.trim().toLowerCase();
    if (!query) {
      return this.students;
    }

    return this.students.filter((student) => {
      const fullName = `${student.first_name || ''} ${student.middle_name || ''} ${student.last_name || ''}`.toLowerCase();
      const studentCode = (student.studentCode || '').toLowerCase();
      return fullName.includes(query) || studentCode.includes(query);
    });
  }

  onGoBack(): void {
    this.router.navigate(['/sections']);
  }

  openArchive(): void {
    this.router.navigate(['/archive'], {
      queryParams: {
        section: this.selectedSectionName || undefined,
        subject: this.selectedSubject || undefined
      }
    });
  }

  startArchiveSelection(): void {
    this.archiveSelectionMode = true;
    this.selectedStudentIds.clear();
  }

  cancelArchiveSelection(): void {
    this.archiveSelectionMode = false;
    this.selectedStudentIds.clear();
  }

  toggleStudentForArchive(student: any): void {
    const studentId = String(student?.student_id ?? '');
    if (!studentId) {
      return;
    }

    if (this.selectedStudentIds.has(studentId)) {
      this.selectedStudentIds.delete(studentId);
    } else {
      this.selectedStudentIds.add(studentId);
    }
  }

  isStudentSelected(student: any): boolean {
    return this.selectedStudentIds.has(String(student?.student_id ?? ''));
  }

  async archiveSelectedStudents(): Promise<void> {
    const selectedStudents = this.students
      .filter((student) => this.selectedStudentIds.has(String(student.student_id)))
      .map((student) => ({
        ...student,
        archivedSection: this.selectedSectionName,
        archivedSubject: this.subjectTabs[this.selectedSubjectTab]?.subject || this.selectedSubject
      }));

    if (!selectedStudents.length) {
      return;
    }

    const selectedSubject = this.subjectTabs[this.selectedSubjectTab];
    try {
      await this.supabaseService.archiveStudents(
        selectedStudents.map((student) => String(student.student_id)),
        selectedSubject.SubjectID,
        this.selectedSectionName,
        this.currentProfId ?? undefined
      );
      this.students = this.students.filter((student) => !this.selectedStudentIds.has(String(student.student_id)));
      this.cancelArchiveSelection();
      this.openArchive();
    } catch (error) {
      console.error('Failed to archive students:', error);
      this.errorMessage = 'Failed to archive the selected students.';
    }
  }

  goToStudentInfo(student: any): void {
    this.router.navigate(['/student-info'], {
      queryParams: {
        student_id: student?.student_id || '',
        first_name: student?.first_name || '',
        middle_name: student?.middle_name || '',
        last_name: student?.last_name || '',
        age: student?.age || '',
        gender: student?.gender || '',
        department: student?.department || '',
        year: student?.year || '',
        section: this.selectedSectionName || '',
        subject: this.subjectTabs[this.selectedSubjectTab]?.subject || ''
      }
    });
  }

  async removeStudent(student: any): Promise<void> {
    const studentName = [student?.first_name, student?.middle_name, student?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    const confirmAlert = await this.alertCtrl.create({
      header: 'Confirm Remove Student',
      message: `Remove ${studentName || 'this student'} from this subject/section?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          handler: async () => {
            const selectedSubject = this.subjectTabs[this.selectedSubjectTab];
            if (!selectedSubject?.SubjectID) {
              this.errorMessage = 'No subject selected.';
              return;
            }

            try {
              const removed = await this.supabaseService.removeStudentFromSubjectSectionAssignment(
                student.student_id,
                selectedSubject.SubjectID,
                this.selectedSectionName,
                this.currentProfId ?? undefined
              );

              if (!removed) {
                this.errorMessage = 'Failed to remove the student.';
                return;
              }

              this.students = this.students.filter((item) => item.student_id !== student.student_id);
              this.errorMessage = '';

              const successAlert = await this.alertCtrl.create({
                header: 'Success',
                message: 'Student removed successfully.',
                buttons: ['OK']
              });
              await successAlert.present();
            } catch (error: any) {
              console.error('Failed to remove student:', error);
              this.errorMessage = 'Failed to remove the student.';
            }
          }
        }
      ]
    });

    await confirmAlert.present();
  }

  async onCsvSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    input.value = '';
    await this.importStudentsFromCsv(file);
  }

  private async importStudentsFromCsv(file: File): Promise<void> {
    this.csvImportMessage = '';
    this.csvImportError = '';
    this.csvImporting = true;

    try {
      const csvText = await this.readFileAsText(file);
      const rows = this.parseCsv(csvText);

      if (rows.length === 0) {
        throw new Error('CSV file is empty.');
      }

      const headers = rows[0].map((header) => header.trim().toLowerCase());
      const requiredHeaders = ['first_name', 'middle_name', 'last_name', 'age', 'gender', 'department', 'year', 'section'];
      const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required CSV headers: ${missingHeaders.join(', ')}`);
      }

      const results: { row: number; success: boolean; error?: string }[] = [];
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (row.length === 0 || row.every((cell) => cell.trim() === '')) {
          continue;
        }

        const student: any = {};
        headers.forEach((header, headerIndex) => {
          student[header] = row[headerIndex]?.trim() ?? '';
        });

        const result = await this.supabaseService.registerStudent({
          ...student,
          professorId: this.currentProfId
        });
        results.push({ row: rowIndex + 1, success: result.success, error: result.error });
      }

      const successCount = results.filter((r) => r.success).length;
      const failedRows = results.filter((r) => !r.success);
      this.csvImportMessage = `Imported ${successCount} student(s) from CSV.`;
      if (failedRows.length > 0) {
        this.csvImportError = failedRows
          .map((r) => `Row ${r.row}: ${r.error ?? 'Unknown error'}`)
          .join(' | ');
      }

      await this.loadSubjectTabsForSection();
    } catch (error: any) {
      console.error('CSV import failed:', error);
      this.csvImportError = error?.message ?? 'CSV import failed.';
    } finally {
      this.csvImporting = false;
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private parseCsv(csvText: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentValue);
        currentValue = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentValue);
        rows.push(currentRow);
        currentRow = [];
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    if (currentValue !== '' || currentRow.length > 0) {
      currentRow.push(currentValue);
      rows.push(currentRow);
    }

    return rows;
  }

  goToStudentReg(): void {
    this.router.navigate(['/studentreg']);
  }
}
