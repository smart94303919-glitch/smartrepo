import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { StudentDashboardRoutingModule } from './student_dashboard-routing.module';
import { StudentDashboardComponent } from './student_dashboard.component';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    StudentDashboardRoutingModule,
    StudentDashboardComponent,
  ],
})
export class StudentDashboardModule {}
