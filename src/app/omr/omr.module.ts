/**
 * omr.module.ts
 * =============
 * Feature module that bundles all OMR-related components, pages, and services.
 * This module is lazy-loaded via app-routing.module.ts under the '/omr' route.
 */
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

// Pages
import { OmrContainerPage } from './pages/omr-container/omr-container.page';

// Components
import { TemplateFormComponent } from './components/template-form/template-form.component';
import { ImagePickerComponent } from './components/image-picker/image-picker.component';
import { ResultsDisplayComponent } from './components/results-display/results-display.component';

const routes: Routes = [
  {
    path: '',
    component: OmrContainerPage,
  },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    IonicModule,
    RouterModule.forChild(routes),
    OmrContainerPage,
    TemplateFormComponent,
    ImagePickerComponent,
    ResultsDisplayComponent,
  ],
})
export class OmrModule {}
