import uvicorn
from fastapi import FastAPI

from api_server import app as api_app
from api_server import (
    export_results,
    generate_pdf,
    get_results,
    grade_sheet,
    scan_student_id,
    start_omr_system,
)

app: FastAPI = api_app

# Expose the same API behind the UI-friendly /api prefix while keeping the
# original endpoints available for existing scripts and tests.
app.post("/api/generate-pdf")(generate_pdf)
app.post("/api/grade-sheet")(grade_sheet)
app.post("/api/scan-student-id")(scan_student_id)
app.get("/api/results/{sheet_id}")(get_results)
app.get("/api/results/{sheet_id}/export")(export_results)
app.post("/api/start-system")(start_omr_system)
app.post("/start-system")(start_omr_system)


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
