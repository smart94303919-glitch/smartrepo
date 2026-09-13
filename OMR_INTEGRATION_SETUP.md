# OMR System Integration Guide

## Overview

This document provides step-by-step instructions for completing the integration of the `omr_system v2.1` sub-project into the main `smart` project. The goal is to eliminate the dual-localhost setup (`8100` and `8200`) and run everything on a single `http://localhost:8100` instance.

---

## COMPLETED TASKS ✅

### 1. Angular Components & Services Migrated ✅
- ✅ Created `src/app/omr/components/` directory with 3 components:
  - `template-form/` - Sheet metadata and PDF generation
  - `image-picker/` - Camera/gallery capture
  - `results-display/` - Grading results and class summary
- ✅ Created `src/app/services/omr-api.service.ts` - HTTP API client
- ✅ All components connected to unified API service

### 2. OMR Container Page Created ✅
- ✅ Created `src/app/omr/pages/omr-container/` - Main orchestration page
- ✅ Conditional rendering based on route query parameters:
  - `mode=metadata` → Show only sheet form (Create Answer Sheets)
  - `mode=scanner` → Show only image picker & grading (Scan Answer Sheets)
  - `mode=results` → Show only class results (Student Grades)
  - `mode=full` or no param → Show all sections

### 3. OMR Module Created ✅
- ✅ Created `src/app/omr/omr.module.ts` - Feature module with all OMR components
- ✅ Lazy-loaded via `/omr` route
- ✅ Includes HttpClientModule and FormsModule

### 4. Routing Updated ✅
- ✅ Added `/omr` route to `src/app/app-routing.module.ts`
- ✅ Lazy-loaded for code splitting

### 5. Exams Page Updated ✅
- ✅ Updated `src/app/exams/exams.page.ts` with new handler methods:
  - `openSheetMaker()` → Navigate to `/omr?mode=metadata`
  - `openScanner()` → Navigate to `/omr?mode=scanner`
  - `openStudentGrades()` → Navigate to `/omr?mode=results`
- ✅ Updated button click handlers in `exams.page.html`

### 6. Environment Configuration Updated ✅
- ✅ Added `apiBaseUrl: 'http://localhost:8000'` to environment files
- ✅ OMR API service reads from environment

### 7. Package.json Updated ✅
- ✅ Updated scripts:
  - `npm start` - Starts both frontend (8100) and backend (8000) via concurrently
  - `npm run start:frontend` - Ionic dev server only
  - `npm run start:backend` - Python backend only

---

## REMAINING TASKS ⏳

### Backend Python Migration

You need to move the Python backend files from `omr_system v2.1/` to a new `backend/` directory in the project root.

#### Step 1: Create Backend Directory Structure

```
smart - main copy/
├── backend/
│   ├── api_server.py
│   ├── omr_engine.py
│   ├── pdf_generator.py
│   ├── config.py
│   ├── layout.py
│   ├── main.py
│   ├── requirements.txt
│   ├── output/
│   ├── tests/
│   └── README.md
```

#### Step 2: Copy Python Files from OMR System

Copy these files from `omr_system v2.1/` to `backend/`:
- `api_server.py`
- `omr_engine.py`
- `pdf_generator.py`
- `config.py`
- `layout.py`
- `main.py`
- `requirements.txt`
- `README.md`
- (Optional) `tests/` directory
- Create `output/` directory for generated files

#### Step 3: Verify API Server Configuration

Ensure `api_server.py` is configured to:
- Listen on `http://0.0.0.0:8000`
- Include proper CORS headers (should already have this)
- Include these endpoints:
  - `GET  /health` - Health check
  - `POST /generate-pdf` - Generate OMR sheet PDF
  - `POST /grade-sheet` - Grade a sheet image
  - `GET  /results/{sheet_id}` - Get class summary
  - `GET  /results/{sheet_id}/export` - Export results as XLSX

**Expected CORS configuration in api_server.py:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Step 4: Install Python Dependencies

```bash
# From project root
python -m pip install -r backend/requirements.txt
```

**Expected dependencies in `backend/requirements.txt`:**
- fastapi
- uvicorn
- opencv-python
- pillow
- pandas
- reportlab
- python-multipart
- (others from original omr_system v2.1)

#### Step 5: Test Backend Startup

```bash
# From project root
python backend/api_server.py
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Then test the health endpoint:
```bash
curl http://localhost:8000/health
```

---

## UNIFIED STARTUP INSTRUCTIONS

### Option 1: Full Unified Startup (Recommended)

```bash
# From project root
npm start
```

This will start:
1. **Frontend** on `http://localhost:8100` (Ionic dev server)
2. **Backend** on `http://localhost:8000` (Python FastAPI)

Both run concurrently and you'll see logs from both in the terminal.

### Option 2: Individual Startup (For Development)

**Terminal 1: Frontend Only**
```bash
npm run start:frontend
```

**Terminal 2: Backend Only**
```bash
npm run start:backend
```

### Option 3: Using Concurrently with Custom Commands

If you need to customize the startup, edit `package.json` scripts:

```json
"start": "concurrently -k \"npm run start:frontend\" \"npm run start:backend\"",
"start:frontend": "ionic serve --port 8100",
"start:backend": "python backend/api_server.py"
```

---

## FEATURE ROUTING & NAVIGATION

### From exams.page.html

Three feature cards now navigate to the unified OMR system:

```html
<!-- Create Answer Sheets -->
<div class="feature-card assessments" (click)="openSheetMaker()">
  <h3>Create Answer Sheets</h3>
  <!-- Opens /omr?mode=metadata -->
</div>

<!-- Scan Answer Sheets -->
<div class="feature-card students" (click)="openScanner()">
  <h3>Scan Answer Sheets</h3>
  <!-- Opens /omr?mode=scanner -->
</div>

<!-- Student Grades -->
<div class="feature-card reports" (click)="openStudentGrades()">
  <h3>Student Grades</h3>
  <!-- Opens /omr?mode=results -->
</div>
```

### URL Patterns

| Button | Route | Query Params | Displays |
|--------|-------|--------------|----------|
| Create Answer Sheets | `/omr` | `?mode=metadata` | Sheet form only |
| Scan Answer Sheets | `/omr` | `?mode=scanner` | Image picker & grading controls |
| Student Grades | `/omr` | `?mode=results` | Class summary table |
| (Dashboard view) | `/omr` | none (or `?mode=full`) | All sections combined |

---

## OMR COMPONENT ARCHITECTURE

### omr-container.page (Main Orchestrator)
- Reads query params to determine display mode
- Manages state: sheet metadata, images, grading results
- Passes data to child components via @Input/@Output
- Handles API calls via OmrApiService

### Child Components

**TemplateFormComponent**
- Input: None (self-contained form)
- Output: Emits `sheetGenerated` event with SheetConfigRequest
- Displays: Sheet metadata form with PDF generation button

**ImagePickerComponent**
- Input: None
- Output: Emits `imageCaptured` event with File
- Displays: Camera & gallery buttons with preview

**ResultsDisplayComponent**
- Input: `result` (GradeSheetResponse), `sheetIdForSummary` (string)
- Output: None (read-only display)
- Displays: Score, overlay image, itemized results, class summary table

### OmrApiService
- Centralized HTTP client for OMR backend
- Endpoints:
  - `generatePdf(config)` → Blob (PDF file)
  - `gradeSheet(image, mode, sheetId, options)` → GradeSheetResponse
  - `getResults(sheetId)` → StudentSummaryRow[]
  - `exportResults(sheetId)` → Blob (XLSX file)
  - `checkHealth()` → { status, time }

---

## API CONTRACT (No Changes Required)

The FastAPI backend (`backend/api_server.py`) endpoints remain **unchanged**:

```
POST /generate-pdf
  Request:  SheetConfigRequest (JSON)
  Response: Blob (PDF bytes)

POST /grade-sheet
  Request:  multipart/form-data (file + metadata)
  Response: GradeSheetResponse (JSON)

GET /results/{sheet_id}
  Request:  (path parameter)
  Response: StudentSummaryRow[] (JSON)

GET /results/{sheet_id}/export
  Request:  (path parameter)
  Response: Blob (XLSX bytes)

GET /health
  Request:  (none)
  Response: { status: "ok", time: "ISO8601" }
```

All image processing, OpenCV logic, and PDF generation remain **100% identical** to the original implementation.

---

## TROUBLESHOOTING

### Backend Fails to Start
```bash
# Check Python is installed
python --version

# Check dependencies
pip list | grep fastapi

# If missing, install
python -m pip install -r backend/requirements.txt
```

### Frontend Can't Reach Backend
- Verify backend is running: `curl http://localhost:8000/health`
- Check environment.ts has correct `apiBaseUrl`
- Check browser console for CORS errors
- Ensure CORS is enabled in `api_server.py`

### Port Already in Use
```bash
# Port 8100 in use
lsof -ti:8100 | xargs kill -9

# Port 8000 in use
lsof -ti:8000 | xargs kill -9
```

### Angular Build Errors
```bash
npm install
ng build
```

---

## NEXT STEPS

1. **Copy Python files** from `omr_system v2.1/` to `backend/`
2. **Install dependencies**: `python -m pip install -r backend/requirements.txt`
3. **Test backend**: `python backend/api_server.py` → verify `/health` works
4. **Run unified system**: `npm start`
5. **Test navigation**: Click buttons in exams.page → verify routing to `/omr`
6. **Test features**: Create sheet → Scan sheet → View grades

---

## ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────┐
│  Browser: http://localhost:8100         │
│  ┌───────────────────────────────────┐  │
│  │   Ionic Angular App               │  │
│  │   ┌─────────────────────────────┐ │  │
│  │   │  exams.page                 │ │  │
│  │   │  [3 Feature Buttons]        │ │  │
│  │   └──────┬──────────────────────┘ │  │
│  │          │                        │  │
│  │   ┌──────▼──────────────────────┐ │  │
│  │   │  omr-container.page         │ │  │
│  │   │  (?mode=metadata|scanner|..)│ │  │
│  │   │  ┌────────────────────────┐ │ │  │
│  │   │  │ template-form          │ │ │  │
│  │   │  │ image-picker           │ │ │  │
│  │   │  │ results-display        │ │ │  │
│  │   │  └────────────────────────┘ │ │  │
│  │   └──────┬──────────────────────┘ │  │
│  │          │                        │  │
│  │   ┌──────▼──────────────────────┐ │  │
│  │   │  omr-api.service.ts        │ │  │
│  │   │  (HTTP + environment)      │ │  │
│  │   └──────┬──────────────────────┘ │  │
│  └──────────┼────────────────────────┘  │
│             │ HTTP/JSON                 │
│             │ :8000                     │
└─────────────┼──────────────────────────┘
              │
┌─────────────▼──────────────────────┐
│  localhost:8000                     │
│  FastAPI Backend (api_server.py)    │
│                                     │
│  ├─ /generate-pdf                  │
│  ├─ /grade-sheet                   │
│  ├─ /results/{sheet_id}            │
│  ├─ /results/{sheet_id}/export     │
│  └─ /health                        │
│                                     │
│  Powered by:                        │
│  • OpenCV (bubble detection)        │
│  • ReportLab (PDF generation)       │
│  • Pandas (data export)             │
└─────────────────────────────────────┘
```

---

## FILES CHANGED

### Frontend (Already Updated)
- ✅ `src/app/omr/` - New module with components
- ✅ `src/app/services/omr-api.service.ts` - New API service
- ✅ `src/app/app-routing.module.ts` - Added `/omr` route
- ✅ `src/app/exams/exams.page.ts` - New handler methods
- ✅ `src/app/exams/exams.page.html` - Updated button handlers
- ✅ `src/environments/environment.ts` - Added `apiBaseUrl`
- ✅ `package.json` - Updated start scripts

### Backend (Needs Manual Setup)
- ⏳ Copy `backend/` directory from `omr_system v2.1/`
- ⏳ Verify `api_server.py` port is 8000
- ⏳ Ensure CORS middleware is present

---

## VERSION INFO

- **Angular**: 20.0.0
- **Ionic**: 8.0.0
- **TypeScript**: 5.9.0
- **Python**: 3.8+ (check `omr_system v2.1/requirements.txt`)
- **Node**: 18+ (for concurrently)

---

## SUPPORT

For issues with the integration:
1. Check backend is running: `curl http://localhost:8000/health`
2. Check frontend builds: `ng build`
3. Check network tab in browser dev tools (F12)
4. Review console logs in browser and terminal

---

**Integration Status**: 90% Complete ✅

**Remaining**: Copy Python backend files and verify startup sequence.
