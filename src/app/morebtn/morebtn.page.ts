import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-morebtn',
  templateUrl: './morebtn.page.html',
  styleUrls: ['./morebtn.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class MorebtnPage implements OnInit {
  currentUser: any = null;
  userName: string = 'Guest';
  userId: string = 'N/A';
  professorNumber = 'N/A';
  professorEmail = 'N/A';
  schoolYear = 'N/A';
  profileLoading = false;
  profileError = '';

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit() {
    this.loadCurrentUser();
    void this.loadProfessorDetails();
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      this.loadCurrentUser();
      await this.loadProfessorDetails();
    } finally {
      event.target.complete();
    }
  }

  async loadProfessorDetails(): Promise<void> {
    const professorId = Number(this.currentUser?.prof_id);
    if (!Number.isFinite(professorId)) {
      this.profileError = 'Professor ID is missing.';
      return;
    }

    try {
      this.profileLoading = true;
      const [details, schoolYear] = await Promise.all([
        this.supabaseService.getProfessorDetails(professorId),
        this.supabaseService.getProfessorSchoolYear(professorId)
      ]);
      this.userName = details.fullName || 'Unknown';
      this.professorNumber = details.professorNumber;
      this.professorEmail = details.email;
      this.schoolYear = schoolYear;
    } catch (error) {
      console.error('Failed to load professor details:', error);
      this.profileError = 'Unable to load professor details.';
    } finally {
      this.profileLoading = false;
    }
  }

  loadCurrentUser() {
    try {
      const userData = localStorage.getItem('currentUser');
      if (userData) {
        this.currentUser = JSON.parse(userData);
        const firstName = this.currentUser.first_name || '';
        const middleName = this.currentUser.middle_name || '';
        const lastName = this.currentUser.last_name || '';
        this.userName = [firstName, middleName, lastName].filter(name => name).join(' ') || 'Unknown';
        this.userId = this.currentUser.prof_id || 'N/A';
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  goBack() {
    this.router.navigate(['/mainhome']);
  }

  goAbout() {
    this.router.navigate(['/about-and-use']);
  }

  async goBak() {
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
            this.router.navigate(['/home']);
          }
        }
      ]
    });

    await confirmAlert.present();
  }
}
