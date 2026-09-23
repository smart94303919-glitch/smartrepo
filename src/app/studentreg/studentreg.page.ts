import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, LoadingController, ToastController } from '@ionic/angular';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

@Component({
  selector: 'app-studentreg',
  templateUrl: './studentreg.page.html',
  styleUrls: ['./studentreg.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class StudentregPage implements OnInit {
  @ViewChild('csvInput') csvInput!: ElementRef<HTMLInputElement>;

  student = this.getEmptyStudent();
  selectedSubject = '';
  selectedSubjectIds: number[] = [];
  sections: { section_id: number; section: string }[] = [];
  subjects: { SubjectID: number; subject: string }[] = [];
  registeringStudent = false;
  importingStudents = false;
  isUploading = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    const subject = this.route.snapshot.queryParamMap.get('subject');
    const section = this.route.snapshot.queryParamMap.get('section');

    if (subject) {
      this.selectedSubject = subject;
      this.student.subject = subject;
    }

    if (section) {
      this.student.section = section;
    }

    this.loadSections();
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      await this.loadSections();
    } finally {
      event.target.complete();
    }
  }

  async downloadStudentFormat(): Promise<void> {
    const headers = [[
      'student_id',
      'first_name',
      'middle_name',
      'last_name',
      'age',
      'gender',
      'department',
      'year',
      'section',
      'subject',
    ]];
    const worksheet = XLSX.utils.aoa_to_sheet(headers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const fileName = 'student_registration_template.xlsx';

    try {
      if (Capacitor.isNativePlatform()) {
        const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        await Share.share({
          title: 'Download Student Registration Template',
          url: savedFile.uri,
          dialogTitle: 'Save or Open Excel Template',
        });
        return;
      }

      const workbookData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([workbookData], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download student registration template:', error);
      await this.showToast('Unable to download the student registration template.', 'danger');
    }
  }

  getEmptyStudent() {
    return {
      student_id: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      age: null,
      gender: '',
      department: '',
      year: '',
      section: '',
      subject: '',
      subjectId: null as number | null
    };
  }

  private async loadSections() {
    try {
      const currentUser = localStorage.getItem('currentUser');
      let rows: any[] = [];

      if (currentUser) {
        const user = JSON.parse(currentUser);
        if (user?.prof_id) {
          rows = await this.supabaseService.getProfessorAssignedSections(user.prof_id);
        }
      }

      this.sections = rows ?? [];

      if (this.student.section) {
        await this.onSectionChange();
      }
    } catch (error) {
      console.error('Failed to load sections:', error);
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

  async onSectionChange() {
    const selectedSection = this.sections.find((section) => section.section === this.student.section);

    if (!selectedSection?.section_id) {
      this.subjects = [];
      this.student.subject = '';
      this.student.subjectId = null;
      this.selectedSubjectIds = [];
      this.selectedSubject = '';
      return;
    }

    const currentUser = localStorage.getItem('currentUser');
    const user = currentUser ? JSON.parse(currentUser) : null;
    this.subjects = await this.supabaseService.getSubjectsByProfessorSection(
      user?.prof_id ?? null,
      selectedSection.section_id
    );

    const selectedNames = this.student.subject
      .split(',')
      .map((subject) => subject.trim())
      .filter(Boolean);
    this.selectedSubjectIds = this.subjects
      .filter((subject) => selectedNames.includes(subject.subject))
      .map((subject) => subject.SubjectID);

    if (!this.selectedSubjectIds.length) {
      this.student.subject = '';
      this.student.subjectId = null;
      this.selectedSubject = '';
      return;
    }

    this.updateSelectedSubjects();
  }

  onSubjectChange(event: any) {
    const selectedIds = event?.detail?.value ?? this.selectedSubjectIds;
    this.selectedSubjectIds = (Array.isArray(selectedIds) ? selectedIds : [selectedIds])
      .map((subjectId) => Number(subjectId))
      .filter((subjectId) => Number.isFinite(subjectId));
    this.updateSelectedSubjects();
  }

  private updateSelectedSubjects() {
    const selectedSubjects = this.subjects.filter((subject) => this.selectedSubjectIds.includes(subject.SubjectID));
    const selectedNames = selectedSubjects.map((subject) => subject.subject);

    this.student.subject = selectedNames.join(', ');
    this.student.subjectId = selectedSubjects[0]?.SubjectID ?? null;
    this.selectedSubject = this.student.subject;
  }

  async onSubmit() {
    if (this.isUploading) {
      return;
    }

    if (!this.student.student_id || !this.student.first_name || !this.student.last_name || !this.selectedSubjectIds.length) {
      const validationAlert = await this.alertCtrl.create({
        header: 'Missing information',
        message: 'Please fill all required fields before registering the student.',
        buttons: ['OK']
      });
      await validationAlert.present();
      return;
    }

    await this.showRegistrationConfirmation();
  }

  async showRegistrationConfirmation() {
    const studentName = [this.student.first_name, this.student.middle_name, this.student.last_name]
      .filter(Boolean)
      .join(' ');

    const alert = await this.alertCtrl.create({
      header: 'Confirm registration',
      message: `Register student ${studentName || this.student.student_id} for ${this.student.subject || 'the selected subject'}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Register',
          handler: async () => {
            await this.submitRegistration();
          }
        }
      ]
    });

    await alert.present();
  }

  private async submitRegistration() {
    this.registeringStudent = true;
    this.isUploading = true;
    const loading = await this.loadingCtrl.create({
      message: 'Saving student record...',
      spinner: 'circles',
      backdropDismiss: false
    });
    await loading.present();

    try {
      const selectedSubjects = this.subjects.filter((subject) => this.selectedSubjectIds.includes(subject.SubjectID));
      let result: Awaited<ReturnType<SupabaseService['registerStudent']>> = { success: true, data: [] };

      for (const subject of selectedSubjects) {
        result = await this.supabaseService.registerStudent({
          ...this.student,
          subject: subject.subject,
          subjectId: subject.SubjectID,
          professorId: this.getCurrentProfessorId()
        });

        if (!result.success) {
          break;
        }
      }

      if (result.success) {
        await this.showToast('Student record added successfully!', 'success');
        const successAlert = await this.alertCtrl.create({
          header: 'Registration complete',
          message: 'Student registered successfully.',
          buttons: [{
            text: 'OK',
            handler: () => {
              this.student = this.getEmptyStudent();
              this.router.navigate(['/sections']);
            }
          }]
        });

        await successAlert.present();
      } else {
        await this.showToast(`Upload failed: ${result.error || 'Student registration failed.'}`, 'danger');
        const errorAlert = await this.alertCtrl.create({
          header: 'Registration failed',
          message: 'Registration failed: ' + (result.error || 'Unknown error'),
          buttons: ['OK']
        });

        await errorAlert.present();
      }
    } catch (error) {
      console.error('Student registration failed:', error);
      const message = error instanceof Error ? error.message : 'Unable to register the student.';
      await this.showToast(`Upload failed: ${message}`, 'danger');
      const errorAlert = await this.alertCtrl.create({
        header: 'Registration failed',
        message: 'Unable to register the student. Please try again.',
        buttons: ['OK']
      });

      await errorAlert.present();
    } finally {
      this.registeringStudent = false;
      this.isUploading = false;
      await loading.dismiss();
    }
  }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    await toast.present();
  }

  private normalizeCsvHeader(header: string): string {
    const normalized = (header ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

    const aliases: Record<string, string> = {
      studentid: 'student_id',
      id: 'student_id',
      s_id: 'student_id',
      lastname: 'last_name',
      firstname: 'first_name',
      middlename: 'middle_name',
      s_lastname: 'last_name',
      s_firstname: 'first_name',
      s_middlename: 'middle_name',
      subjectid: 'subjectId',
      subj_id: 'subjectId',
      subject: 'subject',
      section: 'section',
      section_id: 'section_id',
      prof_id: 'professorId',
      professor_id: 'professorId'
    };

    return aliases[normalized] ?? normalized;
  }

  private normalizeCsvValue(value: string | undefined | null): string {
    return (value ?? '').toString().trim();
  }

  private async resolveImportedStudentSubjectId(importedStudent: any): Promise<number | null> {
    const sectionName = this.normalizeCsvValue(importedStudent.section);
    if (sectionName) {
      this.student.section = sectionName;
      await this.onSectionChange();
    }

    const subjectName = this.normalizeCsvValue(importedStudent.subject);
    const matchedSubject = this.subjects.find(
      (subject) => subject.subject?.trim().toLowerCase() === subjectName.toLowerCase()
    );

    return importedStudent.subjectId ?? importedStudent.subj_id ?? importedStudent.SubjectID ?? matchedSubject?.SubjectID ?? this.student.subjectId ?? null;
  }

  onImportCsvClick() {
    this.csvInput.nativeElement.click();
  }

  async onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (this.isUploading) {
      input.value = '';
      return;
    }

    this.importingStudents = true;
    this.isUploading = true;
    const loading = await this.loadingCtrl.create({
      message: 'Uploading student list, please wait...',
      spinner: 'crescent',
      backdropDismiss: false
    });
    await loading.present();

    try {
      let rows: any[][];
      const isExcelFile = /\.(xls|xlsx)$/i.test(file.name);

      if (isExcelFile) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
        rows = firstSheet
          ? XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: '' })
          : [];
      } else {
        const text = await file.text();
        rows = text
          .split(/\r?\n/)
          .filter((row) => row.trim().length > 0)
          .map((row) => row.split(','));
      }

      if (!rows.length) {
        alert('The selected CSV or Excel file is empty.');
        return;
      }

      const header = rows[0]
        .map((value) => value?.toString().trim() ?? '')
        .map((value) => this.normalizeCsvHeader(value));
      const dataRows = rows.slice(1);

      const importedStudents = dataRows.map((row) => {
        const studentData: any = {};

        header.forEach((key, index) => {
          if (key) {
            studentData[key] = row[index]?.toString().trim() ?? '';
          }
        });

        return studentData;
      });

      if (!importedStudents.length) {
        alert('No student data found in the selected CSV file.');
        return;
      }

      const professorId = this.getCurrentProfessorId();
      const registrationPayloads = [] as any[];
      for (const importedStudent of importedStudents) {
        const subjectId = await this.resolveImportedStudentSubjectId(importedStudent);
        const sectionValue = this.normalizeCsvValue(importedStudent.section) || this.student.section || '';
        const subjectValue = this.normalizeCsvValue(importedStudent.subject) || this.selectedSubject || '';

        registrationPayloads.push({
          ...this.getEmptyStudent(),
          ...importedStudent,
          subject: subjectValue,
          subjectId,
          section: sectionValue,
          professorId
        });
      }

      const result = await this.supabaseService.registerStudentsBatch(registrationPayloads);
      if (!result.success) {
        alert(`Student import failed. ${result.error || ''}`.trim());
        await this.showToast(`Upload failed: ${result.error || 'Student registration failed.'}`, 'danger');
      } else {
        alert(`Successfully imported ${result.data.length} student(s).`);
        await this.showToast(`Successfully imported ${result.data.length} student records!`, 'success');
      }

      input.value = '';
    } catch (error) {
      console.error('Student list upload failed:', error);
      const message = error instanceof Error ? error.message : 'Unable to import the student list.';
      await this.showToast(`Upload failed: ${message}`, 'danger');
    } finally {
      this.importingStudents = false;
      this.isUploading = false;
      await loading.dismiss();
    }
  }

  onGoback() {
    this.router.navigate(['/sections']);
  }
}
