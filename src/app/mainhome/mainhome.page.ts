import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-mainhome',
  standalone: false,
  templateUrl: 'mainhome.page.html',
  styleUrls: ['mainhome.page.scss'],
})
export class MainhomePage implements OnInit {
  currentUser: any = null;
  userName: string = 'Guest';
  userId: string = 'N/A';
  sections: { id: number; name: string }[] = [];
  subjectsBySection = new Map<number, { id: number; name: string }[]>();
  assessmentsBySubject = new Map<string, any[]>();
  selectedSectionId: number | null = null;
  selectedSubjectId: number | null = null;
  selectedAssessment: any | null = null;
  assessmentGrades: any[] = [];
  loadingAnalytics = false;
  loadingGrades = false;
  analyticsError = '';

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit() {
    this.loadCurrentUser();
    void this.loadGradeAnalytics();
  }

  async loadGradeAnalytics(): Promise<void> {
    this.loadingAnalytics = true;
    this.analyticsError = '';

    try {
      const currentUser = localStorage.getItem('currentUser');
      const professorId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
      if (!professorId) {
        this.analyticsError = 'Professor ID is missing.';
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
        subjectMap.set(sectionId, sectionSubjects);
      });

      this.sections = Array.from(sectionMap.values());
      this.subjectsBySection = subjectMap;
      this.assessmentsBySubject.clear();
      const assessments = await this.supabaseService.getProfessorGradeAssessments(Number(professorId));
      assessments.forEach((assessment: any) => {
        const key = this.assessmentKey(assessment.section_id, assessment.subj_id);
        const subjectAssessments = this.assessmentsBySubject.get(key) || [];
        subjectAssessments.push(assessment);
        this.assessmentsBySubject.set(key, subjectAssessments);
      });
    } catch (error) {
      console.error('Failed to load grade analytics:', error);
      this.analyticsError = 'Failed to load grade analytics.';
    } finally {
      this.loadingAnalytics = false;
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

  get passedCount(): number {
    return this.assessmentGrades.filter((grade) => Number(grade.percentage) >= 70).length;
  }

  get failedCount(): number {
    return this.assessmentGrades.filter((grade) => Number(grade.percentage) < 70).length;
  }

  get passRate(): number {
    return this.assessmentGrades.length ? Math.round((this.passedCount / this.assessmentGrades.length) * 100) : 0;
  }

  onSectionSelected(sectionId: number | string | undefined): void {
    if (sectionId === undefined) return;
    this.selectedSectionId = Number(sectionId);
    this.selectedSubjectId = null;
    this.selectedAssessment = null;
    this.assessmentGrades = [];
  }

  onSubjectSelected(subjectId: number): void {
    this.selectedSubjectId = Number(subjectId);
    this.selectedAssessment = null;
    this.assessmentGrades = [];
  }

  async onAssessmentSelected(assessment: any): Promise<void> {
    this.selectedAssessment = assessment;
    this.assessmentGrades = [];
    this.loadingGrades = true;
    this.analyticsError = '';

    try {
      const currentUser = localStorage.getItem('currentUser');
      const professorId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
      if (!professorId) {
        this.analyticsError = 'Professor ID is missing.';
        return;
      }

      this.assessmentGrades = await this.supabaseService.getProfessorGradesForAssessment(
        Number(professorId),
        Number(assessment.section_id),
        Number(assessment.subj_id),
        String(assessment.sheet_id)
      );
    } catch (error) {
      console.error('Failed to load assessment analytics:', error);
      this.analyticsError = 'Failed to load assessment analytics.';
    } finally {
      this.loadingGrades = false;
    }
  }

  loadCurrentUser() {
    try {
      const userData = localStorage.getItem('currentUser');
      if (userData) {
        this.currentUser = JSON.parse(userData);
        this.userName = this.currentUser.p_fname || 'Unknown';
        this.userId = this.currentUser.prof_id || 'N/A';
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async onLogout() {
    const confirmAlert = await this.alertCtrl.create({
      header: 'Confirm Logout',
      message: 'Are you sure you want to log out?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Logout',
          handler: () => {
            localStorage.removeItem('currentUser');
            this.currentUser = null;
            this.userName = 'Guest';
            this.userId = 'N/A';
            this.router.navigate(['/login']);
          }
        }
      ]
    });

    await confirmAlert.present();
  }

  onExams() {
    this.router.navigate(['/exams']);
  }

  onStudents() {
    this.router.navigate(['/sections']);
  }

  onClasses() {
    this.router.navigate(['/classes']);
  }

  onMore() {
    this.router.navigate(['/morebtn']);
  }
}
