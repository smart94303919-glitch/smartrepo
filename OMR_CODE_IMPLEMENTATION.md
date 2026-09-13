# OMR System Integration - Complete Code Implementation Guide

## DELIVERABLES PROVIDED

This document contains all the code implementations requested for the OMR system integration.

---

## 1. ANGULAR ROUTING SETUP ✅

### File: `src/app/app-routing.module.ts`

The OMR route has been added as a lazy-loaded feature module:

```typescript
const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule)
  },
  // ... other routes ...
  {
    path: 'exams',
    loadChildren: () => import('./exams/exams.module').then(m => m.ExamsPageModule)
  },
  {
    path: 'omr',  // ← NEW OMR ROUTE
    loadChildren: () => import('./omr/omr.module').then(m => m.OmrModule)
  },
  {
    path: 'students',
    loadChildren: () => import('./students/students.module').then(m => m.StudentsPageModule)
  },
  // ... more routes ...
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      preloadingStrategy: PreloadAllModules,
      useHash: true
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
```

### Key Features:
- ✅ Lazy-loaded module (loaded only when `/omr` is accessed)
- ✅ Reduces initial bundle size
- ✅ Supports query parameters for conditional rendering

---

## 2. EXAMS PAGE HANDLER METHODS ✅

### File: `src/app/exams/exams.page.ts`

```typescript
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-exams',
  standalone: false,
  templateUrl: 'exams.page.html',
  styleUrls: ['exams.page.scss'],
})
export class ExamsPage {
  constructor(private router: Router) {}

  /**
   * Navigate to OMR system in "metadata" mode
   * BUTTON 1: [ Create Answer Sheets ]
   * Displays: Sheet Metadata & Layout Configuration form
   * Allows: Generating and downloading the OMR PDF template
   */
  openSheetMaker(): void {
    this.router.navigate(['/omr'], { queryParams: { mode: 'metadata' } });
  }

  /**
   * Navigate to OMR system in "scanner" mode
   * BUTTON 2: [ Scan Answer Sheets ]
   * Displays: Camera capture / Image upload, Process & Grade execution,
   *           Visual Answer Overlay display
   */
  openScanner(): void {
    this.router.navigate(['/omr'], { queryParams: { mode: 'scanner' } });
  }

  /**
   * Navigate to OMR system in "results" mode
   * BUTTON 3: [ Student Grades ]
   * Displays: Class Results / Grade Analytics dashboard
   * Allows: Itemized score table, student grade lists, export options
   */
  openStudentGrades(): void {
    this.router.navigate(['/omr'], { queryParams: { mode: 'results' } });
  }

  /**
   * Deprecated: kept for backwards compatibility
   * Now redirects to openSheetMaker() instead of opening external window
   */
  openOmrSystem(): void {
    this.openSheetMaker();
  }
}
```

### Button Click Handlers in HTML:

```html
<!-- BUTTON 1: Create Answer Sheets -->
<div class="feature-card assessments" 
     (click)="openSheetMaker()" 
     role="button" 
     tabindex="0" 
     (keydown.enter)="openSheetMaker()" 
     (keydown.space)="openSheetMaker()">
  <div class="card-icon">
    <ion-icon name="document-text"></ion-icon>
  </div>
  <h3>Create Answer Sheets</h3>
  <p>Create & manage tests</p>
  <ion-icon class="arrow-icon" name="chevron-forward"></ion-icon>
</div>

<!-- BUTTON 2: Scan Answer Sheets -->
<div class="feature-card students" 
     (click)="openScanner()" 
     role="button" 
     tabindex="0" 
     (keydown.enter)="openScanner()" 
     (keydown.space)="openScanner()">
  <div class="card-icon">
    <ion-icon name="camera"></ion-icon>
  </div>
  <h3>Scan Answer Sheets</h3>
  <p>Upload and analyze answer sheets</p>
  <ion-icon class="arrow-icon" name="chevron-forward"></ion-icon>
</div>

<!-- BUTTON 3: Student Grades -->
<div class="feature-card reports" 
     (click)="openStudentGrades()" 
     role="button" 
     tabindex="0" 
     (keydown.enter)="openStudentGrades()" 
     (keydown.space)="openStudentGrades()">
  <div class="card-icon">
    <ion-icon name="bar-chart"></ion-icon>
  </div>
  <h3>Student Grades</h3>
  <p>View grades & analytics</p>
  <ion-icon class="arrow-icon" name="chevron-forward"></ion-icon>
</div>
```

### Navigation Flow:

```
exams.page (Exams Tab)
    ├─ openSheetMaker() ─────────→ router.navigate(['/omr'], { queryParams: { mode: 'metadata' } })
    ├─ openScanner() ────────────→ router.navigate(['/omr'], { queryParams: { mode: 'scanner' } })
    └─ openStudentGrades() ─────→ router.navigate(['/omr'], { queryParams: { mode: 'results' } })
            ↓
        omr-container.page (reads query params and renders conditionally)
```

---

## 3. MIGRATED OMR COMPONENT LOGIC ✅

### File: `src/app/omr/pages/omr-container/omr-container.page.ts`

```typescript
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ToastController, LoadingController, AlertController } from '@ionic/angular';
import { OmrApiService, GradeSheetResponse, SheetConfigRequest } from '../../services/omr-api.service';

type ScanMode = 'key' | 'grade';
type DisplayMode = 'metadata' | 'scanner' | 'results' | 'full';

@Component({
  selector: 'app-omr-container',
  templateUrl: './omr-container.page.html',
  styleUrls: ['./omr-container.page.scss'],
})
export class OmrContainerPage implements OnInit {
  // Route-based display mode
  displayMode: DisplayMode = 'full';

  // Populated once a sheet has been generated
  activeSheetId = '';
  activeTotalQuestions: number | null = null;
  activeOptionsPerQuestion: number | null = null;
  activeColumns: number | null = null;

  scanMode: ScanMode = 'key';
  studentId = '';

  pendingImage: File | null = null;
  lastResult: GradeSheetResponse | null = null;

  isProcessing = false;

  constructor(
    private api: OmrApiService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Read query parameters to determine display mode
    this.route.queryParams.subscribe((params) => {
      const mode = params['mode'];
      if (mode === 'metadata' || mode === 'scanner' || mode === 'results') {
        this.displayMode = mode;
      } else {
        this.displayMode = 'full';  // Default: show all sections
      }
    });
  }

  /** Called when TemplateFormComponent finishes generating a sheet. */
  onSheetGenerated(cfg: SheetConfigRequest) {
    this.activeSheetId = cfg.sheet_id;
    this.activeTotalQuestions = cfg.total_questions;
    this.activeOptionsPerQuestion = cfg.options_per_question;
    this.activeColumns = cfg.columns;
  }

  /** Called when ImagePickerComponent acquires an image (camera or gallery). */
  onImageCaptured(file: File) {
    this.pendingImage = file;
  }

  async onProcessAndGrade() {
    // Validation
    if (!this.activeSheetId.trim()) {
      await this.showToast('Enter or generate a Sheet ID first.', 'danger');
      return;
    }
    if (!this.pendingImage) {
      await this.showToast('Capture or import a sheet image first.', 'danger');
      return;
    }
    if (this.scanMode === 'grade' && !this.studentId.trim()) {
      await this.showToast('Enter a Student ID before grading.', 'danger');
      return;
    }

    // Show loading
    this.isProcessing = true;
    const loading = await this.loadingCtrl.create({
      message: this.scanMode === 'key' ? 'Reading answer key...' : 'Grading sheet...',
    });
    await loading.present();

    // Call API
    this.api
      .gradeSheet(this.pendingImage, this.scanMode, this.activeSheetId, {
        studentId: this.scanMode === 'grade' ? this.studentId : undefined,
        totalQuestions: this.activeTotalQuestions ?? undefined,
        optionsPerQuestion: this.activeOptionsPerQuestion ?? undefined,
        columns: this.activeColumns ?? undefined,
      })
      .subscribe({
        next: async (res) => {
          await loading.dismiss();
          this.isProcessing = false;
          this.lastResult = res;
          this.pendingImage = null;  // Require fresh capture for next sheet
          
          const msg =
            res.mode === 'key'
              ? `Key captured: ${res.questions_read} questions read.`
              : `Graded: ${res.score}/${res.total_questions} (${res.percentage}%).`;
          await this.showToast(msg, 'success');
        },
        error: async (err) => {
          await loading.dismiss();
          this.isProcessing = false;
          await this.showAlignmentErrorAlert(err.message ?? 'Processing failed.');
        },
      });
  }

  async resetForm() {
    this.activeSheetId = '';
    this.activeTotalQuestions = null;
    this.activeOptionsPerQuestion = null;
    this.activeColumns = null;
    this.scanMode = 'key';
    this.studentId = '';
    this.pendingImage = null;
    this.lastResult = null;
    this.isProcessing = false;
    await this.showToast('All fields reset.', 'success');
  }

  private async showAlignmentErrorAlert(message: string) {
    const alert = await this.alertCtrl.create({
      header: 'Could Not Read Sheet',
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }
}
```

### File: `src/app/omr/pages/omr-container/omr-container.page.html`

```html
<!--
  omr-container.page.html
  Conditional rendering based on mode query parameter:
  - mode=metadata: Show only sheet form
  - mode=scanner: Show only image picker & grading
  - mode=results: Show only class results summary
  - default/full: Show all sections
-->
<ion-header>
  <ion-toolbar>
    <ion-title>OMR Grading System</ion-title>
  </ion-toolbar>
</ion-header>

<ion-content class="omr-shell">
  <!-- SECTION 1: METADATA / CREATE ANSWER SHEETS MODE -->
  <div *ngIf="displayMode === 'metadata' || displayMode === 'full'" class="section">
    <div class="section-header" *ngIf="displayMode === 'full'">
      <h2>Create Answer Sheets</h2>
      <p>Generate OMR sheet templates with your custom parameters</p>
    </div>
    <app-template-form (sheetGenerated)="onSheetGenerated($event)"></app-template-form>
  </div>

  <!-- SECTION 2: SCANNER / SCAN & GRADE MODE -->
  <div *ngIf="displayMode === 'scanner' || displayMode === 'full'" class="section">
    <div class="section-header" *ngIf="displayMode === 'full'">
      <h2>Scan & Grade Answer Sheets</h2>
      <p>Capture sheets and process them for grading</p>
    </div>

    <ion-card>
      <ion-card-header>
        <ion-card-title>Scanning & Grading Controls</ion-card-title>
      </ion-card-header>

      <ion-card-content>
        <!-- Sheet ID Input -->
        <ion-item>
          <ion-label position="stacked">Sheet ID</ion-label>
          <ion-input
            [(ngModel)]="activeSheetId"
            placeholder="e.g. BIO101-MID"
            [value]="activeSheetId"
          ></ion-input>
        </ion-item>

        <!-- Mode Selection: Teacher Key vs Student -->
        <ion-segment [(ngModel)]="scanMode" class="ion-margin-top">
          <ion-segment-button value="key">
            <ion-label>Teacher Answer Key</ion-label>
          </ion-segment-button>
          <ion-segment-button value="grade">
            <ion-label>Student Sheet</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Student ID (only for grading mode) -->
        <ion-item *ngIf="scanMode === 'grade'" class="ion-margin-top">
          <ion-label position="stacked">Student ID</ion-label>
          <ion-input [(ngModel)]="studentId" placeholder="e.g. S001"></ion-input>
        </ion-item>

        <!-- Image Capture Component -->
        <ion-card class="ion-margin-top">
          <ion-card-header>
            <ion-card-subtitle>Capture Sheet Image</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <app-image-picker (imageCaptured)="onImageCaptured($event)"></app-image-picker>
          </ion-card-content>
        </ion-card>

        <!-- Process & Grade Button -->
        <ion-button
          expand="block"
          color="success"
          class="ion-margin-top"
          [disabled]="isProcessing || !pendingImage"
          (click)="onProcessAndGrade()"
        >
          <ion-icon name="checkmark-done-outline" slot="start"></ion-icon>
          Process &amp; Grade Sheet
        </ion-button>

        <!-- Reset Form Button -->
        <ion-button expand="block" fill="outline" class="ion-margin-top" (click)="resetForm()">
          <ion-icon name="refresh-outline" slot="start"></ion-icon>
          Reset Form
        </ion-button>
      </ion-card-content>
    </ion-card>
  </div>

  <!-- SECTION 3: RESULTS / STUDENT GRADES MODE -->
  <div *ngIf="displayMode === 'results' || displayMode === 'full'" class="section">
    <div class="section-header" *ngIf="displayMode === 'full'">
      <h2>Student Grades & Results</h2>
      <p>View and export class results</p>
    </div>

    <app-results-display
      [result]="lastResult"
      [sheetIdForSummary]="activeSheetId"
    ></app-results-display>
  </div>
</ion-content>
```

### Key Conditional Display Logic:

```typescript
// In omr-container.page.ts
ngOnInit() {
  this.route.queryParams.subscribe((params) => {
    const mode = params['mode'];
    if (mode === 'metadata' || mode === 'scanner' || mode === 'results') {
      this.displayMode = mode;
    } else {
      this.displayMode = 'full';
    }
  });
}
```

```html
<!-- In omr-container.page.html -->
<!-- Show only if: displayMode is 'metadata' OR displayMode is 'full' -->
<div *ngIf="displayMode === 'metadata' || displayMode === 'full'">
  <!-- Template Form Section -->
</div>

<!-- Show only if: displayMode is 'scanner' OR displayMode is 'full' -->
<div *ngIf="displayMode === 'scanner' || displayMode === 'full'">
  <!-- Scanner Section -->
</div>

<!-- Show only if: displayMode is 'results' OR displayMode is 'full' -->
<div *ngIf="displayMode === 'results' || displayMode === 'full'">
  <!-- Results Section -->
</div>
```

---

## 4. UNIFIED TERMINAL STARTUP SCRIPT ✅

### File: `package.json`

```json
{
  "name": "smart",
  "version": "0.0.1",
  "author": "Ionic Framework",
  "homepage": "https://ionicframework.com/",
  "scripts": {
    "ng": "ng",
    "start": "concurrently -k \"npm run start:frontend\" \"npm run start:backend\"",
    "start:frontend": "ionic serve --port 8100",
    "start:backend": "python backend/api_server.py",
    "start:old-omr": "npm --prefix \"c:/Users/Benedict/omr_system v2.1\" run frontend -- --port 8200",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "ng test",
    "lint": "ng lint"
  },
  "private": true,
  "dependencies": {
    "@angular/animations": "^20.0.0",
    "@angular/common": "^20.0.0",
    "@angular/compiler": "^20.0.0",
    "@angular/core": "^20.0.0",
    "@angular/forms": "^20.0.0",
    "@angular/platform-browser": "^20.0.0",
    "@angular/platform-browser-dynamic": "^20.0.0",
    "@angular/router": "^20.0.0",
    "@capacitor/android": "^8.3.1",
    "@capacitor/camera": "^5.0.0",
    "@capacitor/core": "8.3.1",
    "@capacitor/filesystem": "^5.0.0",
    "@ionic/angular": "^8.0.0",
    "@supabase/supabase-js": "^2.105.1",
    "ionicons": "^7.0.0",
    "rxjs": "~7.8.0",
    "tslib": "^2.3.0",
    "zone.js": "~0.15.0"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^20.0.0",
    "@angular-eslint/builder": "^20.0.0",
    "@angular-eslint/eslint-plugin": "^20.0.0",
    "@angular-eslint/eslint-plugin-template": "^20.0.0",
    "@angular-eslint/schematics": "^20.0.0",
    "@angular-eslint/template-parser": "^20.0.0",
    "@angular/cli": "^20.0.0",
    "@angular/compiler-cli": "^20.0.0",
    "@angular/language-service": "^20.0.0",
    "@capacitor/cli": "8.3.1",
    "@ionic/angular-toolkit": "^12.0.0",
    "@types/jasmine": "~5.1.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "concurrently": "^10.0.5",
    "eslint": "^9.16.0",
    "eslint-plugin-import": "^2.29.1",
    "eslint-plugin-jsdoc": "^48.2.1",
    "eslint-plugin-prefer-arrow": "1.2.2",
    "jasmine-core": "~5.1.0",
    "jasmine-spec-reporter": "~5.0.0",
    "karma": "~6.4.0",
    "karma-chrome-launcher": "~3.2.0",
    "karma-coverage": "~2.2.0",
    "karma-jasmine": "~5.1.0",
    "karma-jasmine-html-reporter": "~2.1.0",
    "typescript": "~5.9.0"
  },
  "description": "An Ionic project"
}
```

### Startup Options:

**Option 1: Full Unified Startup (Recommended)**
```bash
npm start
```
- Starts frontend on `http://localhost:8100`
- Starts backend on `http://localhost:8000`
- Uses `concurrently` to run both in one terminal

**Option 2: Frontend Only**
```bash
npm run start:frontend
```

**Option 3: Backend Only**
```bash
npm run start:backend
```

---

## 5. FEATURE MODULE STRUCTURE ✅

### File: `src/app/omr/omr.module.ts`

```typescript
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
  declarations: [
    OmrContainerPage,
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
export class OmrModule {}
```

### Directory Structure:

```
src/app/omr/
├── omr.module.ts
├── pages/
│   └── omr-container/
│       ├── omr-container.page.ts
│       ├── omr-container.page.html
│       └── omr-container.page.scss
├── components/
│   ├── template-form/
│   │   ├── template-form.component.ts
│   │   ├── template-form.component.html
│   │   └── template-form.component.scss
│   ├── image-picker/
│   │   ├── image-picker.component.ts
│   │   ├── image-picker.component.html
│   │   └── image-picker.component.scss
│   └── results-display/
│       ├── results-display.component.ts
│       ├── results-display.component.html
│       └── results-display.component.scss
└── services/
    └── (included in src/app/services/)
```

---

## 6. ENVIRONMENT CONFIGURATION ✅

### File: `src/environments/environment.ts`

```typescript
export interface Environment {
  production: boolean;
  supabase: {
    url: string;
    anonKey: string;
  };
  apiBaseUrl?: string;
}

export const environment: Environment = {
  production: false,
  supabase: {
    url: 'https://uexbbrhnpjfhibwxbvlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleGJicmhucGpmaGlid3hidmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjc2OTIsImV4cCI6MjEwNDYwMzY5Mn0.lePn3kX_yr-SfzM3duyxiHPpvHh3dOjp7NZIgzSQS8E'
  },
  apiBaseUrl: 'http://localhost:8000'
};
```

### File: `src/environments/environment.prod.ts`

```typescript
export interface Environment {
  production: boolean;
  supabase: {
    url: string;
    anonKey: string;
  };
  apiBaseUrl?: string;
}

export const environment: Environment = {
  production: true,
  supabase: {
    url: 'https://uexbbrhnpjfhibwxbvlx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVleGJicmhucGpmaGlid3hidmx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjc2OTIsImV4cCI6MjEwNDYwMzY5Mn0.lePn3kX_yr-SfzM3duyxiHPpvHh3dOjp7NZIgzSQS8E'
  },
  apiBaseUrl: 'http://localhost:8000'  // Change to production URL if needed
};
```

---

## 7. OMR API SERVICE ✅

### File: `src/app/services/omr-api.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// Types matching FastAPI Pydantic models
export interface SheetConfigRequest {
  title: string;
  subject: string;
  quiz_type: string;
  total_questions: number;
  options_per_question: number;
  columns: number;
  sheet_id: string;
  output_name: string;
  student_id_digits?: number;
  embed_qr?: boolean;
}

export interface GradeSheetResponse {
  mode: 'key' | 'grade';
  sheet_id: string;
  student_id?: string;
  questions_read: number;
  blank_count: number;
  multi_marked_count: number;
  answer_key?: { [question: string]: string | null };
  score?: number;
  total_questions?: number;
  percentage?: number;
  attempted?: number;
  itemized?: ItemizedRow[];
  overlay_image_base64: string;
}

export interface StudentSummaryRow {
  student_id: string;
  score: number;
  total_questions: number;
  percentage: number;
  graded_at: string;
}

@Injectable({ providedIn: 'root' })
export class OmrApiService {
  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = (environment as any).apiBaseUrl || 'http://localhost:8000';
  }

  generatePdf(payload: SheetConfigRequest): Observable<Blob> {
    return this.http
      .post(`${this.baseUrl}/generate-pdf`, payload, { responseType: 'blob' })
      .pipe(catchError((e) => this.handleError(e)));
  }

  gradeSheet(
    imageFile: File | Blob,
    mode: 'key' | 'grade',
    sheetId: string,
    opts?: {
      studentId?: string;
      totalQuestions?: number;
      optionsPerQuestion?: number;
      columns?: number;
      filename?: string;
    }
  ): Observable<GradeSheetResponse> {
    const form = new FormData();
    form.append('file', imageFile, opts?.filename ?? 'capture.jpg');
    form.append('mode', mode);
    form.append('sheet_id', sheetId);
    if (opts?.studentId) form.append('student_id', opts.studentId);
    if (opts?.totalQuestions != null) form.append('total_questions', String(opts.totalQuestions));
    if (opts?.optionsPerQuestion != null) form.append('options_per_question', String(opts.optionsPerQuestion));
    if (opts?.columns != null) form.append('columns', String(opts.columns));

    return this.http
      .post<GradeSheetResponse>(`${this.baseUrl}/grade-sheet`, form)
      .pipe(catchError((e) => this.handleError(e)));
  }

  getResults(sheetId: string): Observable<StudentSummaryRow[]> {
    return this.http
      .get<StudentSummaryRow[]>(`${this.baseUrl}/results/${encodeURIComponent(sheetId)}`)
      .pipe(catchError((e) => this.handleError(e)));
  }

  exportResults(sheetId: string): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}/results/${encodeURIComponent(sheetId)}/export`, { responseType: 'blob' })
      .pipe(catchError((e) => this.handleError(e)));
  }

  checkHealth(): Observable<{ status: string; time: string }> {
    return this.http
      .get<{ status: string; time: string }>(`${this.baseUrl}/health`)
      .pipe(catchError((e) => this.handleError(e)));
  }

  private handleError(error: HttpErrorResponse) {
    let message = 'Unexpected error contacting the OMR server.';
    if (error.error?.detail) {
      message = error.error.detail;
    } else if (error.status === 0) {
      message = 'Could not reach the OMR server. Check your network connection.';
    } else if (error.message) {
      message = error.message;
    }
    return throwError(() => ({ status: error.status, message }));
  }
}
```

---

## SUMMARY OF ALL CHANGES

| File | Change | Status |
|------|--------|--------|
| `src/app/app-routing.module.ts` | Added `/omr` lazy-loaded route | ✅ Complete |
| `src/app/exams/exams.page.ts` | Added 3 handler methods | ✅ Complete |
| `src/app/exams/exams.page.html` | Updated button click handlers | ✅ Complete |
| `src/app/omr/omr.module.ts` | Created feature module | ✅ Complete |
| `src/app/omr/pages/omr-container/` | Created container page | ✅ Complete |
| `src/app/omr/components/template-form/` | Created form component | ✅ Complete |
| `src/app/omr/components/image-picker/` | Created picker component | ✅ Complete |
| `src/app/omr/components/results-display/` | Created results component | ✅ Complete |
| `src/app/services/omr-api.service.ts` | Created API service | ✅ Complete |
| `src/environments/environment.ts` | Added `apiBaseUrl` | ✅ Complete |
| `src/environments/environment.prod.ts` | Added `apiBaseUrl` | ✅ Complete |
| `package.json` | Updated startup scripts | ✅ Complete |

---

## NEXT STEPS

1. **Copy Python backend** from `omr_system v2.1/` to `backend/`
2. **Install dependencies**: `python -m pip install -r backend/requirements.txt`
3. **Start unified system**: `npm start`
4. **Test navigation**: Click buttons in exams → verify routing
5. **Test features**: Create sheet → Scan → View grades

---

**All code implementations are complete and ready for integration!**
