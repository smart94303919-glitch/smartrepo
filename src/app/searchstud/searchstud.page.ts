import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-searchstud',
  templateUrl: './searchstud.page.html',
  styleUrls: ['./searchstud.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule]
})
export class SearchstudPage implements OnInit {
  students: any[] = [];

  // ✅ Declare these properties so TypeScript knows about them
  isEditOpen = false;
  editStudent: any = {};

  constructor(
    private supabaseService: SupabaseService,
    private alertCtrl: AlertController,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadStudents();
  }

  async loadStudents() {
    const { data, error } = await this.supabaseService.getAllStudents();
    if (error) {
      console.error('Error loading students:', error);
    } else {
      this.students = data || [];
    }
  }

  onGoto() {
    this.router.navigate(['/students']);
  }

  // Open modal with selected student // edit update functiu
  edit(student: any) {
    this.editStudent = { ...student }; // clone object
    this.isEditOpen = true;
  }

  closeEdit() {
    this.isEditOpen = false;
    this.editStudent = {};
  }

  async saveEdit() {
    const { error } = await this.supabaseService.updateStudent(
      this.editStudent.studinfo_id,
      this.editStudent
    );
    if (!error) {
      const alert = await this.alertCtrl.create({
        header: 'Success',
        message: 'Student updated successfully',
        buttons: ['OK']
      });
      await alert.present();
      this.isEditOpen = false;
      await this.loadStudents(); // refresh list
    }
  }

  async delete(student: any) {
    const studentId = student?.student_id ?? student?.studinfo_id;

    const confirmAlert = await this.alertCtrl.create({
      header: 'Confirm Delete',
      message: `Delete ${student.first_name} ${student.last_name}?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          handler: async () => {
            const { error } = await this.supabaseService.deleteStudent(studentId);
            if (!error) {
              this.students = this.students.filter((s) => (s.student_id ?? s.studinfo_id) !== studentId);
              const successAlert = await this.alertCtrl.create({
                header: 'Success',
                message: 'Student deleted successfully',
                buttons: ['OK']
              });
              await successAlert.present();
            }
          }
        }
      ]
    });
    await confirmAlert.present();
  }
}
