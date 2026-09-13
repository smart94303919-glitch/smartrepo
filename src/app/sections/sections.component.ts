import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-sections',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './sections.component.html',
  styleUrls: ['./sections.component.scss']
})
export class SectionsComponent implements OnInit {
  groupedSections: { sectionName: string; subjects: { SubjectID: number; subject: string }[] }[] = [];
  errorMessage = '';
  loading = false;

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) { }

  ngOnInit(): void {
    this.loadAssignedSubjects();
  }

  private async loadAssignedSubjects() {
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

    try {
      this.loading = true;
      const rows = await this.supabaseService.getProfessorSubjectSectionAssignments(user.prof_id);
      const sectionMap = new Map<string, { sectionName: string; subjects: { SubjectID: number; subject: string }[] }>();

      (rows || []).forEach((row: any) => {
        const subjectField = row.subject_tbl;
        const subjectObj = Array.isArray(subjectField) ? subjectField[0] : subjectField;
        const sectionField = row.section_tbl;
        const sectionObj = Array.isArray(sectionField) ? sectionField[0] : sectionField;
        const id = row.subj_id ?? subjectObj?.subj_id;
        const name = subjectObj?.subject ?? 'Unknown Subject';
        const sectionName = sectionObj?.section ?? 'Unknown Section';

        if (!id) return;

        let sectionEntry = sectionMap.get(sectionName);
        if (!sectionEntry) {
          sectionEntry = { sectionName, subjects: [] };
          sectionMap.set(sectionName, sectionEntry);
        }

        if (!sectionEntry.subjects.some((subject) => subject.SubjectID === id)) {
          sectionEntry.subjects.push({ SubjectID: id, subject: name });
        }
      });

      this.groupedSections = Array.from(sectionMap.values());

      if (!this.groupedSections.length) {
        this.errorMessage = 'No class assignments found for this professor yet.';
      }
    } catch (error: any) {
      console.error('Failed to load assigned subjects:', error);
      this.errorMessage = 'Failed to load assigned subjects.';
    } finally {
      this.loading = false;
    }
  }

  onSubjectClick(section: { sectionName: string; subjects: { SubjectID: number; subject: string }[] }) {
    const subject = section.subjects[0];
    this.router.navigate(['/student_dashboard'], {
      queryParams: {
        subject: subject?.subject ?? '',
        subjectId: subject?.SubjectID ?? '',
        section: section.sectionName
      }
    });
  }

  onRegisterStudent(section?: { sectionName: string; subjects: { SubjectID: number; subject: string }[] }) {
    const queryParams = section ? { section: section.sectionName } : {};
    this.router.navigate(['/studentreg'], { queryParams });
  }

  onGoBack() {
    this.router.navigate(['/mainhome']);
  }
}
