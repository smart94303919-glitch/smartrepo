import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-student-info',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  templateUrl: './student-info.page.html',
  styleUrls: ['./student-info.page.scss']
})
export class StudentInfoPage implements OnInit {
  originalStudentId = '';
  private readonly invalidNameNotifications = new Set<'first_name' | 'middle_name' | 'last_name'>();
  private invalidAgeNotified = false;
  student: any = {
    student_id: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    age: '',
    gender: '',
    department: '',
    year: '',
    section: '',
    subject: '',
    subjectId: null as number | null
  };

  sections: { section_id: number; section: string }[] = [];
  subjects: { SubjectID: number; subject: string }[] = [];
  selectedSubject = '';
  selectedSubjectIds: number[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabaseService: SupabaseService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParamMap;

    this.student = {
      student_id: queryParams.get('student_id') ?? '',
      first_name: queryParams.get('first_name') ?? '',
      middle_name: queryParams.get('middle_name') ?? '',
      last_name: queryParams.get('last_name') ?? '',
      age: queryParams.get('age') ?? '',
      gender: queryParams.get('gender') ?? '',
      department: queryParams.get('department') ?? '',
      year: queryParams.get('year') ?? '',
      section: queryParams.get('section') ?? '',
      subject: queryParams.get('subject') ?? '',
      subjectId: Number(queryParams.get('subjectId')) || null
    };
    this.originalStudentId = this.student.student_id;

    this.selectedSubject = this.student.subject;
    if (this.student.subjectId) {
      this.selectedSubjectIds = [this.student.subjectId];
    }

    void this.loadSections();
  }

  get fullName(): string {
    return [
      this.student.first_name,
      this.student.middle_name,
      this.student.last_name
    ]
      .map((part: unknown) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' ') || 'Student name not provided';
  }

  get initials(): string {
    const name = [
      this.student.first_name,
      this.student.middle_name,
      this.student.last_name
    ]
      .map((part: unknown) => String(part ?? '').trim())
      .filter(Boolean);
    const initials = `${name[0]?.[0] ?? ''}${name.length > 1 ? name[name.length - 1][0] : ''}`;
    return initials.toUpperCase() || 'S';
  }

  displayValue(value: unknown, fallback = 'Not specified'): string {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      await this.loadSections();
    } finally {
      event.target.complete();
    }
  }

  private async loadSections(): Promise<void> {
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

  async onSectionChange(): Promise<void> {
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
      .map((subject: string) => subject.trim())
      .filter(Boolean);
    const selectedSubjects = this.subjects.filter((subject) =>
      this.selectedSubjectIds.includes(subject.SubjectID) || selectedNames.includes(subject.subject)
    );
    this.selectedSubjectIds = selectedSubjects.map((subject) => subject.SubjectID);

    if (!selectedSubjects.length) {
      this.student.subject = '';
      this.student.subjectId = null;
      this.selectedSubject = '';
      return;
    }

    this.updateSelectedSubjects();
  }

  onSubjectChange(event: any): void {
    const selectedIds = event?.detail?.value ?? this.selectedSubjectIds;
    this.selectedSubjectIds = (Array.isArray(selectedIds) ? selectedIds : [selectedIds])
      .map((subjectId) => Number(subjectId))
      .filter((subjectId) => Number.isFinite(subjectId));
    this.updateSelectedSubjects();
  }

  private updateSelectedSubjects(): void {
    const selectedSubjects = this.subjects.filter((subject) => this.selectedSubjectIds.includes(subject.SubjectID));
    const selectedNames = selectedSubjects.map((subject) => subject.subject);

    this.student.subject = selectedNames.join(', ');
    this.student.subjectId = selectedSubjects[0]?.SubjectID ?? null;
    this.selectedSubject = this.student.subject;
  }

  onNameInput(field: 'first_name' | 'middle_name' | 'last_name', event: CustomEvent<{ value?: string | null }>): void {
    const name = String(event.detail?.value ?? '');
    if (!this.isValidName(name)) {
      if (!this.invalidNameNotifications.has(field)) {
        this.invalidNameNotifications.add(field);
        void this.showValidationToast(
          'Name is invalid. Use letters, spaces, hyphens, or apostrophes.'
        );
      }
      return;
    }

    this.invalidNameNotifications.delete(field);
  }

  onAgeInput(event: CustomEvent<{ value?: string | number | null }>): void {
    let value = event.detail?.value;
    const rawValue = String(value ?? '');
    if (rawValue.length > 2) {
      value = rawValue.slice(0, 2);
      (event.target as HTMLIonInputElement).value = value;
      this.student.age = value === '' ? '' : Number(value);
    }

    const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
    if (hasValue && Number(value) < 18) {
      if (!this.invalidAgeNotified) {
        this.invalidAgeNotified = true;
        void this.showValidationToast('Age is invalid. The minimum age is 18.');
      }
      return;
    }

    this.invalidAgeNotified = false;
  }

  private isValidName(name: string): boolean {
    return /^[\p{L}\p{M} '\-]*$/u.test(name);
  }

  private async showValidationToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      color: 'warning'
    });
    await toast.present();
  }

  private async validateEditableFields(): Promise<boolean> {
    const requiredTextFields = [
      this.student.student_id,
      this.student.first_name,
      this.student.last_name,
      this.student.section
    ];
    const hasMissingRequiredText = requiredTextFields.some(
      (value) => typeof value !== 'string' || value.trim().length === 0
    );
    const textFields = [
      this.student.student_id,
      this.student.first_name,
      this.student.middle_name,
      this.student.last_name,
      this.student.section,
      this.student.subject,
      this.student.gender,
      this.student.department,
      this.student.year
    ];
    const hasWhitespaceOnlyText = textFields.some(
      (value) => typeof value === 'string' && value.length > 0 && value.trim().length === 0
    );

    if (hasMissingRequiredText || hasWhitespaceOnlyText) {
      await this.showValidationToast(
        'Required fields must be completed, and text fields cannot consist only of spaces.'
      );
      return false;
    }

    const invalidName = [
      this.student.first_name,
      this.student.middle_name,
      this.student.last_name
    ].some((name: string | null | undefined) => name && !this.isValidName(name));

    if (invalidName) {
      await this.showValidationToast(
        'Name is invalid. Use letters, spaces, hyphens, or apostrophes.'
      );
      return false;
    }

    if (this.student.age !== '' && this.student.age !== null && Number(this.student.age) < 18) {
      await this.showValidationToast('Age is invalid. The minimum age is 18.');
      return false;
    }

    return true;
  }

  async confirmSaveChanges(): Promise<void> {
    if (!(await this.validateEditableFields())) return;

    const confirmAlert = await this.alertCtrl.create({
      header: 'Save changes confirmation',
      message: `Are you sure you want to save the changes for ${this.student.first_name || 'this student'} ${this.student.last_name || ''}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Save Changes',
          handler: async () => {
            await this.saveStudent();
          }
        }
      ]
    });

    await confirmAlert.present();
  }

  async saveStudent(): Promise<void> {
    if (!(await this.validateEditableFields())) return;

    const loading = await this.loadingCtrl.create({
      message: 'Updating student information...',
      spinner: 'crescent'
    });
    await loading.present();

    let result: any;
    let updateFailed = false;
    try {
      const currentUser = localStorage.getItem('currentUser');
      const user = currentUser ? JSON.parse(currentUser) : null;
      result = await this.supabaseService.updateStudent(this.student.student_id, {
        originalStudentId: this.originalStudentId,
        first_name: this.student.first_name,
        middle_name: this.student.middle_name,
        last_name: this.student.last_name,
        age: this.student.age !== '' && this.student.age !== null ? Number(this.student.age) : null,
        gender: this.student.gender,
        section: this.student.section,
        subject: this.student.subject,
        subjectId: this.student.subjectId ?? null,
        subjectIds: this.selectedSubjectIds,
        professorId: user?.prof_id ?? null
      });
    } catch (error: any) {
      console.error('Failed to save student:', error);
      updateFailed = true;
    } finally {
      await loading.dismiss();
    }

    if (updateFailed) {
      const failureAlert = await this.alertCtrl.create({
        header: 'Save Failed',
        message: 'Failed to save student information.',
        buttons: ['OK']
      });
      await failureAlert.present();
      return;
    }

    if (result && 'error' in result && result.error) {
      const errorAlert = await this.alertCtrl.create({
        header: 'Save Failed',
        message: result.error.message || 'Failed to save student information.',
        buttons: ['OK']
      });
      await errorAlert.present();
      return;
    }

    this.supabaseService.notifyStudentUpdated();
    const successAlert = await this.alertCtrl.create({
      header: 'Changes saved successfully',
      message: 'Your changes were saved successfully.',
      buttons: ['OK']
    });
    await successAlert.present();
    this.router.navigate(['/student_dashboard']);
  }

  goBack(): void {
    this.router.navigate(['/student_dashboard']);
  }
}
