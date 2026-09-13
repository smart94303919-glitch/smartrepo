# OMR (Optical Mark Recognition) System

An end-to-end bubble-sheet generation and grading system:

- **Generate** print-ready, customizable OMR answer sheets as PDFs (ReportLab)
- **Scan** photographed or scanned sheets from a phone/webcam/scanner and
  correct for tilt, rotation, and perspective (OpenCV)
- **Grade** student sheets against a teacher-captured answer key and export
  results to Excel (pandas + openpyxl)

## Architecture

```
config.py           Central constants: page geometry, fiducial size, CV
                     thresholds (CVParams), and the SheetConfig dataclass
                     that describes one sheet's parameters.

layout.py            THE shared source of truth for bubble geometry.
                     compute_bubble_grid() is called by BOTH the PDF
                     generator and the CV scanner, so drawn and detected
                     bubble positions can never drift apart.

pdf_generator.py     ReportLab canvas code that draws the sheet: 4 black
                     fiducial squares, title/subject/header block, an
                     embedded QR code with sheet metadata, and the full
                     multi-column bubble grid.

omr_engine.py        The OpenCV pipeline:
                       1. find_fiducials()   - contour-based detection of
                                                the 4 registration squares
                       2. order_points()     - sorts them TL/TR/BR/BL
                       3. four_point_warp()  - perspective correction to a
                                                fixed 1000x1414 canvas
                       4. binarize()         - adaptive threshold -> ink mask
                       5. read_answers()     - per-bubble ink-density scoring
                                                -> {question: selected letter}

main.py              Interactive CLI runner: generate sheets, capture a
                     teacher answer key, grade student sheets (single file,
                     webcam, or batch folder), and export results.
```

### Why a shared `layout.py`?

The single hardest bug class in any OMR system is bubble-grid drift: the
PDF generator and the CV scanner each independently "knowing" where a
bubble should be, and slowly disagreeing as parameters change. This
project eliminates that entire bug class by having **one function**,
`layout.compute_bubble_grid()`, compute bubble positions for both the
generator and the scanner. Both sides work in the same "fiducial-bounded"
coordinate frame (the box between the 4 registration squares' centers),
which is exactly the region `omr_engine.four_point_warp()` normalizes
every photo into — see the detailed comments at the top of `layout.py`.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

> **Note on OpenCV:** `requirements.txt` installs standard `opencv-python`,
> which requires system-level GUI libraries for `cv2.imshow` (used by the
> optional webcam preview). On a headless server/container, install
> `opencv-python-headless` instead and use file-based image input rather
> than `--webcam`.

## Quick Start

### 1. Generate a bubble sheet

```bash
python main.py generate \
  --title "Midterm Examination" \
  --subject "Computer Science 101" \
  --quiz-type "Multiple Choice" \
  --questions 60 \
  --options 4 \
  --columns 3 \
  --sheet-id "CS101-MIDTERM-2026" \
  --output sheet.pdf
```

This writes `output/sheet.pdf` and also saves `output/last_sheet_config.json`
so later scan steps default to matching parameters. Print it, or if you
just need a preview, render it: `pdftoppm -png -r 150 output/sheet.pdf preview`.

`--options` accepts 1–8 (renders choices A through H).

### 2. Capture the teacher's answer key

Fill out one copy of the sheet with the correct answers, then photograph
or scan it (good, even lighting; all 4 corners visible), and run:

```bash
python main.py key --image path/to/teacher_sheet.jpg
```

This detects the 4 fiducial squares, perspective-corrects the image,
reads every bubble, and saves `output/answer_key.json`. A visual debug
overlay (green = detected answer, red = ambiguous double-mark) is written
to `output/debug/teacher_key_overlay.png` — **always check this** before
trusting an automatically captured key.

### 3. Grade student sheets

Single sheet:

```bash
python main.py grade --image path/to/student1.jpg --student-id S001
```

Straight from a webcam (press SPACE to capture, ESC to cancel):

```bash
python main.py grade --webcam --student-id S002
```

Whole folder at once:

```bash
python main.py batch-grade --folder path/to/student_photos/
```

Every graded sheet appends to (or updates, if re-graded) a running
`output/results.xlsx` workbook with two sheets:
- **Summary** — one row per student: score, total, percentage, timestamp
- **Itemized** — one row per student per question: correct answer, the
  student's answer (or `BLANK`/`MULTI`), and whether it was correct

### 4. Review results

```bash
python main.py export
```

Prints the current Summary sheet to the console (the workbook itself is
kept up to date after every `grade`/`batch-grade` call).

### Interactive mode

Run `python main.py` with no subcommand for a guided menu that walks
through all of the above.

## Photography tips for reliable scans

- Keep the sheet flat; avoid folds/creases near the fiducial squares
- Ensure all 4 black corner squares are fully visible and well lit
- Avoid harsh shadows or glare across the bubble area
- Fill bubbles completely and darkly; light or partial marks may read as
  blank, and two heavily-filled bubbles on one question will be flagged
  `multi_marked` (ambiguous) rather than guessed

## Tuning detection sensitivity

All CV thresholds live in `config.py`'s `CVParams` dataclass:

- `bubble_fill_threshold` / `min_absolute_fill_frac` — how much ink counts
  as "filled" vs blank
- `bubble_relative_margin` — how much darker the top choice must be than
  the runner-up before it's accepted as unambiguous
- `adaptive_block_size` / `adaptive_c` — adaptive-threshold sensitivity for
  uneven lighting
- `fiducial_*` — shape/size filters used to distinguish the registration
  squares from QR codes, filled bubbles, and other dark regions

If your scans are consistently misread, check `output/debug/*_overlay.png`
first — it will usually make clear whether the problem is misalignment
(fiducial detection) or fill-threshold miscalibration.
