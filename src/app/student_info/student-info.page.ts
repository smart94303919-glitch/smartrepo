import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule } from '@ionic/angular';
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
    private alertCtrl: AlertController
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

  async confirmSaveChanges(): Promise<void> {
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
    try {
      const currentUser = localStorage.getItem('currentUser');
      const user = currentUser ? JSON.parse(currentUser) : null;
      const result = await this.supabaseService.updateStudent(this.student.student_id, {
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

      if (result && 'error' in result && result.error) {
        const errorAlert = await this.alertCtrl.create({
          header: 'Save Failed',
          message: result.error.message || 'Failed to save student information.',
          buttons: ['OK']
        });
        await errorAlert.present();
        return;
      }

      const successAlert = await this.alertCtrl.create({
        header: 'Changes saved successfully',
        message: 'Your changes were saved successfully.',
        buttons: ['OK']
      });
      await successAlert.present();
      this.router.navigate(['/student_dashboard']);
    } catch (error: any) {
      console.error('Failed to save student:', error);
      const failureAlert = await this.alertCtrl.create({
        header: 'Save Failed',
        message: 'Failed to save student information.',
        buttons: ['OK']
      });
      await failureAlert.present();
    }
  }

  goBack(): void {
    this.router.navigate(['/student_dashboard']);
  }
}
