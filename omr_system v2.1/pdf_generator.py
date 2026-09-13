"""
pdf_generator.py
=================
Builds a print-ready, scanner-friendly OMR bubble sheet as a PDF using
ReportLab's low-level `canvas` API (chosen over Platypus/flowables because
we need exact pixel/point control over fiducial and bubble placement --
flowables' automatic layout would fight us here).

Key design points
------------------
* 4 solid black 20x20pt fiducial squares sit at the outer margins of every
  page. `omr_engine.py` looks for exactly these four shapes to compute the
  perspective transform, so their size/position here MUST match
  `config.FIDUCIAL_SIZE` / `config.FIDUCIAL_INSET`.
* All bubble geometry comes from `layout.compute_bubble_grid()`, the same
  function the scanner uses -- see layout.py for why that matters.
* An optional QR code embeds the sheet's machine-readable parameters
  (question_count, options_per_question, columns, sheet_id) so a scanning
  app can auto-configure itself instead of requiring the operator to
  re-enter those numbers by hand.
"""

import io
import json
import os

import qrcode
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from config import (
    SheetConfig,
    PAGE_WIDTH,
    PAGE_HEIGHT,
    MARGIN,
    FIDUCIAL_SIZE,
    FIDUCIAL_INSET,
    BUBBLE_RADIUS,
    fiducial_bounded_page_size,
)
from layout import compute_bubble_grid, question_label_position, compute_content_box

# All bubble-grid geometry is computed in the FIDUCIAL-BOUNDED reference
# frame -- see the note at the top of layout.py for why this must match
# omr_engine.py's warped-canvas frame exactly. FB_WIDTH/FB_HEIGHT are the
# width/height `compute_bubble_grid()` is called with everywhere in this
# file; FB_ORIGIN is where that box's (0, 0) sits in true page points.
FB_WIDTH, FB_HEIGHT = fiducial_bounded_page_size()
FB_ORIGIN_X, FB_ORIGIN_Y = FIDUCIAL_INSET, FIDUCIAL_INSET


# --------------------------------------------------------------------------
# Coordinate helper: our layout math is top-left/y-down, relative to the
# fiducial-bounded box's origin; ReportLab's canvas is bottom-left/y-up,
# relative to the true page edge. This is the single conversion point for
# the whole generator so nothing else has to think about either offset.
# --------------------------------------------------------------------------
def topleft_to_pdf(x: float, y: float) -> "tuple[float, float]":
    """Converts fiducial-bounded-box top-left/y-down coords (what layout.py
    and the bubble/text drawing functions use) into page-absolute PDF
    coords. Used for everything EXCEPT the fiducials themselves."""
    page_x = x + FB_ORIGIN_X
    page_y = y + FB_ORIGIN_Y
    return page_x, PAGE_HEIGHT - page_y


def page_topleft_to_pdf(x: float, y: float) -> "tuple[float, float]":
    """Converts TRUE page-edge top-left/y-down coords into PDF coords, with
    no fiducial-box offset applied. Used only for drawing the fiducials and
    their corner reference labels, which are positioned relative to the
    true page edge, not the fiducial-bounded content box."""
    return x, PAGE_HEIGHT - y


def draw_fiducials(c: canvas.Canvas) -> None:
    """
    Draw the 4 solid black registration squares. These are placed with
    their CENTERS at `FIDUCIAL_INSET` from each edge, which keeps them
    fully inside the printable area on virtually any consumer printer
    while remaining close enough to the true corners for a stable
    perspective transform.
    """
    c.setFillColorRGB(0, 0, 0)
    half = FIDUCIAL_SIZE / 2.0
    corners_topleft = [
        (FIDUCIAL_INSET, FIDUCIAL_INSET),                              # TL
        (PAGE_WIDTH - FIDUCIAL_INSET, FIDUCIAL_INSET),                 # TR
        (PAGE_WIDTH - FIDUCIAL_INSET, PAGE_HEIGHT - FIDUCIAL_INSET),   # BR
        (FIDUCIAL_INSET, PAGE_HEIGHT - FIDUCIAL_INSET),                # BL
    ]
    for cx_tl, cy_tl in corners_topleft:
        cx, cy = page_topleft_to_pdf(cx_tl, cy_tl)
        c.rect(cx - half, cy - half, FIDUCIAL_SIZE, FIDUCIAL_SIZE, fill=1, stroke=0)


def build_qr_image(cfg: SheetConfig) -> ImageReader:
    """
    Encode the sheet's metadata (question_count, options_per_question,
    columns, sheet_id, subject) as JSON inside a QR code so a companion
    mobile scanning app can read the sheet's shape without any manual
    configuration. Returned as an in-memory ImageReader ready to `drawImage`.
    """
    payload = json.dumps(cfg.to_metadata_dict(), separators=(",", ":"))
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def draw_header(c: canvas.Canvas, cfg: SheetConfig) -> None:
    """
    Title / subject / quiz-type text block plus student-info fill-in lines
    (Name, Student ID boxes) and the QR metadata block, all confined to the
    HEADER_FRAC band reserved by layout.compute_bubble_grid().
    """
    x0, y0, x1, y1 = compute_content_box(FB_WIDTH, FB_HEIGHT)
    top_x, top_y = topleft_to_pdf(x0, y0)

    # --- Title ---
    c.setFont("Helvetica-Bold", 16)
    c.drawString(x0, top_y - 20, cfg.title)

    # --- Subject / Quiz type / Sheet ID line ---
    c.setFont("Helvetica", 10)
    meta_line = f"Subject: {cfg.subject}      Quiz Type: {cfg.quiz_type}      Sheet ID: {cfg.sheet_id}"
    c.drawString(x0, top_y - 36, meta_line)

    # --- Student info fill-in fields ---
    c.setFont("Helvetica", 9)
    name_label_y = top_y - 58
    c.drawString(x0, name_label_y, "Name:")
    c.line(x0 + 38, name_label_y - 2, x0 + 260, name_label_y - 2)

    c.drawString(x0, name_label_y - 20, "Date:")
    c.line(x0 + 38, name_label_y - 22, x0 + 180, name_label_y - 22)

    # --- Student ID grid boxes (digit entry) ---
    id_label_y = name_label_y - 20
    id_box = 14
    id_x0 = x0 + 200
    c.drawString(id_x0, id_label_y + 20, "Student ID:")
    for i in range(cfg.student_id_digits):
        bx = id_x0 + i * (id_box + 3)
        by = id_label_y
        c.rect(bx, by - id_box, id_box, id_box, fill=0, stroke=1)

    # --- QR metadata block, top-right of content box ---
    if cfg.embed_qr:
        qr_img = build_qr_image(cfg)
        qr_size = 60
        qr_x = x1 - qr_size
        qr_y = top_y - qr_size + 4
        c.drawImage(qr_img, qr_x, qr_y, width=qr_size, height=qr_size)
        c.setFont("Helvetica", 6)
        c.drawCentredString(qr_x + qr_size / 2, qr_y - 8, "scan for sheet metadata")


def draw_instructions(c: canvas.Canvas) -> None:
    x0, y0, x1, y1 = compute_content_box(FB_WIDTH, FB_HEIGHT)
    top_x, top_y = topleft_to_pdf(x0, y0)
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(
        x0, top_y - 108,
        "Fill each bubble completely with a dark pencil or pen. "
        "Erase clean any stray marks. Do not fold or crease this sheet."
    )


def draw_bubbles(c: canvas.Canvas, cfg: SheetConfig) -> None:
    """
    Draws every question's number label and its row of option bubbles,
    using the shared `compute_bubble_grid()` so positions exactly match
    what `omr_engine.py` will look for when scanning.
    """
    grid = compute_bubble_grid(cfg, FB_WIDTH, FB_HEIGHT)

    c.setFont("Helvetica", 8)
    for q_num, options in grid.items():
        # --- question number label ---
        lx, ly = question_label_position(cfg, q_num, FB_WIDTH, FB_HEIGHT)
        lx_pdf, ly_pdf = topleft_to_pdf(lx, ly)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(lx_pdf, ly_pdf - 3, f"{q_num}.")

        # --- bubbles + option letters ---
        # IMPORTANT: the option letter is drawn BELOW (outside) the bubble
        # circle, never inside it. If the glyph were inside the circle, its
        # dark ink would raise the measured fill-density of every UNMARKED
        # bubble in omr_engine.py, shrinking the contrast between a blank
        # bubble and a truly filled-in one. Keeping the interior of every
        # unmarked bubble pure white maximizes that contrast.
        for letter, (bx, by) in options.items():
            bx_pdf, by_pdf = topleft_to_pdf(bx, by)
            c.setLineWidth(1.0)
            c.setStrokeColorRGB(0, 0, 0)
            c.circle(bx_pdf, by_pdf, BUBBLE_RADIUS, fill=0, stroke=1)
            c.setFont("Helvetica", 5.5)
            c.setFillColorRGB(0.35, 0.35, 0.35)
            c.drawCentredString(bx_pdf, by_pdf - BUBBLE_RADIUS - 7, letter)
            c.setFillColorRGB(0, 0, 0)


def draw_corner_labels(c: canvas.Canvas) -> None:
    """
    Small printed reference marks near each fiducial reinforce, for a human,
    which corner is which -- purely cosmetic, does not affect CV pipeline.
    """
    c.setFont("Helvetica", 5)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    labels = {
        "TL": (FIDUCIAL_INSET + 14, FIDUCIAL_INSET + 3),
        "TR": (PAGE_WIDTH - FIDUCIAL_INSET - 24, FIDUCIAL_INSET + 3),
        "BL": (FIDUCIAL_INSET + 14, PAGE_HEIGHT - FIDUCIAL_INSET - 6),
        "BR": (PAGE_WIDTH - FIDUCIAL_INSET - 24, PAGE_HEIGHT - FIDUCIAL_INSET - 6),
    }
    for text, (x_tl, y_tl) in labels.items():
        x_pdf, y_pdf = page_topleft_to_pdf(x_tl, y_tl)
        c.drawString(x_pdf, y_pdf, text)


def generate_omr_sheet(cfg: SheetConfig, output_path: str) -> str:
    """
    Public entry point: builds the complete single-page OMR sheet PDF for
    the given SheetConfig and writes it to `output_path`.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    c = canvas.Canvas(output_path, pagesize=(PAGE_WIDTH, PAGE_HEIGHT))

    draw_fiducials(c)
    draw_corner_labels(c)
    draw_header(c, cfg)
    draw_instructions(c)
    draw_bubbles(c, cfg)

    c.showPage()
    c.save()
    return output_path


if __name__ == "__main__":
    # Quick manual smoke test / example usage.
    demo_cfg = SheetConfig(
        title="Midterm Examination",
        subject="Computer Science 101",
        quiz_type="Multiple Choice",
        total_questions=60,
        options_per_question=4,
        columns=3,
        sheet_id="CS101-MIDTERM-2026",
    )
    path = generate_omr_sheet(demo_cfg, "output/sample_sheet.pdf")
    print(f"Generated: {path}")
