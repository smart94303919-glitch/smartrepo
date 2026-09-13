/**
 * omr-dashboard.module.ts
 * ========================
 * Standard Angular feature module wiring together the dashboard page and
 * its 3 child components. If you're using standalone components (Angular
 * 15+/17+ default), convert each component/page to `standalone: true`
 * with its own `imports` array instead -- this NgModule form is provided
 * for maximum compatibility with existing Ionic-Angular starter templates.
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { OmrDashboardPage } from './omr-dashboard.page';
import { TemplateFormComponent } from '../../components/template-form/template-form.component';
import { ImagePickerComponent } from '../../components/image-picker/image-picker.component';
import { ResultsDisplayComponent } from '../../components/results-display/results-display.component';

const routes: Routes = [{ path: '', component: OmrDashboardPage }];

@NgModule({
  declarations: [
    OmrDashboardPage,
    TemplateFormComponent,
    ImagePickerComponent,
    ResultsDisplayComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
})
export class OmrDashboardModule {}
