import { Component, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

interface SectionPerformance {
  sectionName: string;
  students: { name: string; percentage: number }[];
}

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
  sectionPerformance: SectionPerformance[] = [];
  performanceLoading = false;
  performanceError = '';

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit() {
    this.loadCurrentUser();
    void this.loadSectionPerformance();
  }

  async loadSectionPerformance(): Promise<void> {
    const currentUser = localStorage.getItem('currentUser');
    const professorId = currentUser ? JSON.parse(currentUser)?.prof_id : null;
    if (!professorId) {
      return;
    }

    try {
      this.performanceLoading = true;
      const scores = await this.supabaseService.getProfessorStudentScores(Number(professorId));
      const sectionStudents = new Map<string, Map<string, { name: string; total: number; count: number }>>();

      scores.forEach((score: any) => {
        const sectionName = score.section_name || 'Unknown Section';
        const studentId = String(score.student_id);
        let students = sectionStudents.get(sectionName);
        if (!students) {
          students = new Map();
          sectionStudents.set(sectionName, students);
        }

        const existing = students.get(studentId) || {
          name: score.student_name || 'Unknown Student',
          total: 0,
          count: 0
        };
        existing.total += Number(score.percentage ?? 0);
        existing.count += 1;
        students.set(studentId, existing);
      });

      this.sectionPerformance = Array.from(sectionStudents.entries()).map(([sectionName, students]) => ({
        sectionName,
        students: Array.from(students.values())
          .map((student) => ({
            name: student.name,
            percentage: Math.round((student.total / student.count) * 10) / 10
          }))
          .filter((student) => student.percentage >= 70)
          .sort((first, second) => second.percentage - first.percentage)
          .slice(0, 5)
      })).filter((section) => section.students.length > 0);
    } catch (error) {
      console.error('Failed to load section performance:', error);
      this.performanceError = 'Unable to load section performance.';
    } finally {
      this.performanceLoading = false;
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
