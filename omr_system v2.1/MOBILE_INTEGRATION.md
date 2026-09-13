# Mobile Integration: FastAPI Backend + Ionic Frontend

This extends the base OMR system (PDF generation + OpenCV grading, both
unchanged) with a REST API and an Ionic mobile UI, so the system can run
as a phone app instead of a terminal tool.

**Nothing about the core pipeline changed.** `api_server.py` contains zero
image-processing logic — it only decodes uploads, builds `SheetConfig`
objects, and calls straight into the same `pdf_generator.generate_omr_sheet()`
and `omr_engine.process_sheet_image()` the CLI (`main.py`) already uses.
The perspective warp, fiducial detection, and bubble-scoring math are
completely untouched.

> **Why `api_server.py` and not `main.py`?** This project already has a
> working terminal CLI at `main.py` (`generate`/`key`/`grade`/
> `batch-grade`/`export`). Naming the new backend `main.py` would silently
> overwrite it. The API lives in `api_server.py` instead — both can
> coexist, and both call the same underlying modules.

## 1. Running the backend

```bash
pip install -r requirements.txt
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API docs (Swagger UI) are auto-generated at:
`http://localhost:8000/docs`

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/generate-pdf` | JSON sheet params → streams the generated PDF |
| POST | `/grade-sheet` | Multipart image upload → JSON results (`mode=key` or `mode=grade`) |
| GET | `/results/{sheet_id}` | JSON summary of every graded student for a sheet |
| GET | `/results/{sheet_id}/export` | Downloads that sheet's results as `.xlsx` |

Storage is namespaced per `sheet_id` under `output/keys/`, `output/results/`,
`output/pdfs/`, and `output/debug/{sheet_id}/`, so multiple concurrent
quizzes don't collide (unlike the CLI's single global `answer_key.json`).

### Example requests

```bash
# Generate a sheet
curl -X POST http://localhost:8000/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Biology Midterm", "subject": "Biology 101",
        "quiz_type": "Multiple Choice", "total_questions": 20,
        "options_per_question": 4, "columns": 2,
        "sheet_id": "BIO-101", "output_name": "sheet.pdf"
      }' -o sheet.pdf

# Capture the teacher's answer key
curl -X POST http://localhost:8000/grade-sheet \
  -F "file=@teacher_photo.jpg;type=image/jpeg" \
  -F "mode=key" -F "sheet_id=BIO-101"

# Grade a student
curl -X POST http://localhost:8000/grade-sheet \
  -F "file=@student_photo.jpg;type=image/jpeg" \
  -F "mode=grade" -F "sheet_id=BIO-101" -F "student_id=S001"

# View class results
curl http://localhost:8000/results/BIO-101
```

Errors come back as clean JSON (`{"detail": "..."}`) with an appropriate
HTTP status — 422 for alignment failures (e.g. corners not visible), 415
for a bad file type, 413 for an oversized upload — never a raw stack trace.

## 2. Running the Ionic frontend

The `ionic-frontend/` folder contains the mobile UI pieces to merge into
your existing Ionic project (or a fresh `ionic start` scaffold):

```
ionic-frontend/
  src/environments/environment.ts          # API base URL config
  src/app/services/omr-api.service.ts       # HTTP client for the FastAPI backend
  src/app/components/template-form/         # Sheet parameter form
  src/app/components/image-picker/          # Camera + gallery capture
  src/app/components/results-display/       # Score, itemized breakdown, overlay, class summary
  src/app/pages/omr-dashboard/              # Ties the above into one page
  package.json                              # Dependencies to merge in
```

Merge `package.json`'s dependencies into your project's, then:

```bash
npm install
npx cap sync
```

Add camera/storage permissions (required or the native pickers fail
silently on-device):
- **Android** (`android/app/src/main/AndroidManifest.xml`): `CAMERA`,
  `READ_EXTERNAL_STORAGE`
- **iOS** (`ios/App/App/Info.plist`): `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`

### Setting the API URL

Edit `src/environments/environment.ts`:

| Where the app runs | `apiBaseUrl` |
|---|---|
| Browser / Ionic dev server | `http://localhost:8000` |
| Android Emulator | `http://10.0.2.2:8000` (emulator's alias for the host) |
| Physical phone, same Wi-Fi as the backend | `http://<your-computer's-LAN-IP>:8000` |
| Production | your deployed API's HTTPS URL |

### Run it

```bash
ionic serve                 # browser, fastest iteration
ionic cap run android       # Android device/emulator
ionic cap run ios           # iOS device/simulator (Mac only)
```

## 3. Deploying the backend for real device testing

A phone can't reach `localhost` on your laptop. For a physical device on
the same network, `http://<LAN-IP>:8000` (per the table above) is enough.
For anything beyond your local network, containerize and deploy it:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]
```

Running Python itself *on* the device (Chaquopy for Android, Pyodide for
web) was considered and intentionally avoided here — OpenCV's native
dependencies make on-device Python packaging heavy and fragile compared
to a small stateless FastAPI service the app just calls over HTTP.
