"""
layout.py
=========
THE most important file for correctness in this project.

Both `pdf_generator.py` (draws bubbles) and `omr_engine.py` (reads bubbles)
call `compute_bubble_grid()` below. Because the exact same function computes
positions for both drawing and reading, the two can NEVER go out of sync --
even if you change columns, question count, or options per question, the
scanner automatically knows where to look.

Coordinate convention used throughout this file (IMPORTANT):
    - origin (0, 0) is the TOP-LEFT of the "content box"
    - x increases to the right, y increases DOWNWARD
    - all inputs/outputs are in the same linear unit as `width`/`height`
      (points for the PDF canvas, pixels for the warped scan image)

`pdf_generator.py` converts these top-left/y-down coordinates into
ReportLab's bottom-left/y-up coordinate system with a single subtraction
(see `topleft_to_pdf()` in that module). `omr_engine.py` uses them directly
since OpenCV images are already top-left/y-down.
"""

from dataclasses import dataclass
from typing import Dict, List, Tuple

from config import SheetConfig, CONTENT_MARGIN_FRAC

# --------------------------------------------------------------------------
# CRITICAL REFERENCE-FRAME NOTE
# --------------------------------------------------------------------------
# `compute_bubble_grid()` is deliberately written to be agnostic to the
# absolute size of the canvas it's given -- it only ever works in FRACTIONS
# of the supplied `width`/`height`. That makes it safe to call once with
# PDF point dimensions and once with warped-image pixel dimensions, even
# though those two canvases have different aspect ratios.
#
# What it is NOT automatically safe against is a mismatched *origin*.
# `omr_engine.four_point_warp()` maps the 4 fiducial CENTERS to the warped
# canvas corners (0, 0)..(W, H) -- so pixel (0, 0) in a warped scan
# corresponds physically to the fiducial's center, not to the true edge of
# the printed page. If `pdf_generator.py` were to call this function with
# the full page size (origin = true page edge), the two callers would be
# measuring "fraction of width" from two different starting points, and
# the resulting small offset would compound into visible drift the further
# a bubble sits from the top-left corner.
#
# The fix: EVERY caller of `compute_bubble_grid()` must pass the size of
# the FIDUCIAL-BOUNDED box (i.e. width/height already shrunk by 2x
# FIDUCIAL_INSET from the true page edges), and treat the returned
# coordinates as relative to the fiducial center, not the page edge. See
# `config.fiducial_bounded_page_size()` for the generator side and
# `omr_engine.align_sheet()` (which warps directly to WARP_WIDTH x
# WARP_HEIGHT, already fiducial-bounded by construction) for the scanner
# side.
# --------------------------------------------------------------------------

# Vertical fractions of the content box reserved for non-bubble regions.
HEADER_FRAC = 0.20   # title / subject / student-info / QR block
FOOTER_FRAC = 0.04   # small bottom margin for a signature / page footer

# Horizontal padding inside each column reserved for the "12." number label
# (expressed as a fraction of a single column's width).
LABEL_FRAC_OF_COLUMN = 0.16


@dataclass
class BubblePosition:
    question_num: int
    option_letter: str
    x: float          # center x, top-left/y-down coordinate space
    y: float           # center y, top-left/y-down coordinate space


def compute_content_box(width: float, height: float) -> Tuple[float, float, float, float]:
    """
    Returns (x0, y0, x1, y1) of the usable content area, inset from the
    full canvas by CONTENT_MARGIN_FRAC on every side. This inset keeps
    question content clear of the fiducial registration squares that sit
    at the very corners of the page/image.
    """
    mx = width * CONTENT_MARGIN_FRAC
    my = height * CONTENT_MARGIN_FRAC
    return (mx, my, width - mx, height - my)


def compute_bubble_grid(
    cfg: SheetConfig, width: float, height: float
) -> Dict[int, Dict[str, Tuple[float, float]]]:
    """
    Compute the (x, y) center of every bubble on the sheet.

    Returns
    -------
    { question_number (1-indexed): { "A": (x, y), "B": (x, y), ... }, ... }

    Algorithm
    ---------
    1. Shrink the full canvas to the content box (clears fiducials).
    2. Reserve HEADER_FRAC off the top (title/subject/QR/student-id) and
       FOOTER_FRAC off the bottom.
    3. Split the remaining vertical band into `cfg.columns` equal-width
       columns, left to right.
    4. Within each column, questions are stacked top-to-bottom; row height
       is the column's usable height divided by the number of questions
       that fall in that column.
    5. Within each row, option bubbles are spread evenly across the
       column's width (after reserving space on the left for the "12."
       number label).
    """
    x0, y0, x1, y1 = compute_content_box(width, height)
    content_w = x1 - x0
    content_h = y1 - y0

    grid_top = y0 + content_h * HEADER_FRAC
    grid_bottom = y1 - content_h * FOOTER_FRAC
    grid_h = grid_bottom - grid_top

    col_w = content_w / cfg.columns

    # Distribute questions across columns as evenly as possible:
    # e.g. 62 questions / 3 columns -> [21, 21, 20]
    base, remainder = divmod(cfg.total_questions, cfg.columns)
    per_column = [base + (1 if i < remainder else 0) for i in range(cfg.columns)]

    result: Dict[int, Dict[str, Tuple[float, float]]] = {}
    q_num = 1
    for col_idx, n_rows in enumerate(per_column):
        if n_rows == 0:
            continue
        col_x0 = x0 + col_idx * col_w
        label_w = col_w * LABEL_FRAC_OF_COLUMN
        bubbles_x0 = col_x0 + label_w
        bubbles_w = col_w - label_w

        row_h = grid_h / n_rows
        n_opts = cfg.options_per_question
        # Evenly space option centers within the bubble area of the column,
        # with a half-slot margin on each side so bubbles aren't flush
        # against the column boundary.
        slot_w = bubbles_w / n_opts

        for row_idx in range(n_rows):
            row_center_y = grid_top + row_h * (row_idx + 0.5)
            options: Dict[str, Tuple[float, float]] = {}
            for opt_idx, letter in enumerate(cfg.option_letters):
                cx = bubbles_x0 + slot_w * (opt_idx + 0.5)
                options[letter] = (cx, row_center_y)
            result[q_num] = options
            q_num += 1

    return result


def question_label_position(
    cfg: SheetConfig, q_num: int, width: float, height: float
) -> Tuple[float, float]:
    """
    Returns the (x, y) baseline-anchor point for the "N." text label that
    precedes each question's bubble row, derived from the same grid so the
    label always lines up with its row.
    """
    grid = compute_bubble_grid(cfg, width, height)
    first_letter = cfg.option_letters[0]
    bx, by = grid[q_num][first_letter]

    x0, y0, x1, y1 = compute_content_box(width, height)
    content_w = x1 - x0
    col_w = content_w / cfg.columns
    # Recover which column this question is in to anchor the label at the
    # column's left edge rather than recomputing from scratch.
    base, remainder = divmod(cfg.total_questions, cfg.columns)
    per_column = [base + (1 if i < remainder else 0) for i in range(cfg.columns)]
    running = 0
    col_idx = 0
    for i, n in enumerate(per_column):
        if q_num <= running + n:
            col_idx = i
            break
        running += n
    label_x = x0 + col_idx * col_w + col_w * 0.02
    return (label_x, by)
