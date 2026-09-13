"""
config.py
==========
Single source of truth for every layout, geometry, and CV-threshold constant
used across the OMR pipeline. Both `pdf_generator.py` (which draws the sheet)
and `omr_engine.py` (which reads it back) import from here so that the
printed geometry and the scanning geometry can never drift apart.

If you change a page-layout constant, both the generator and the scanner
pick it up automatically -- there is no duplicated geometry anywhere else
in the codebase.
"""

from dataclasses import dataclass, field
from typing import List
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch


# --------------------------------------------------------------------------
# 1. PAGE / PRINT GEOMETRY (used by pdf_generator.py)
# --------------------------------------------------------------------------

PAGE_SIZE = letter                 # (612 pt, 792 pt) == 8.5in x 11in
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE

MARGIN = 0.5 * inch                # outer margin, also fiducial inset
FIDUCIAL_SIZE = 20                 # 20 x 20 pt == ~0.278in solid squares
FIDUCIAL_INSET = 0.25 * inch       # distance of fiducial center from edge

# --------------------------------------------------------------------------
# 2. NORMALIZED / WARPED IMAGE GEOMETRY (used by omr_engine.py)
# --------------------------------------------------------------------------
# After perspective correction every scan -- regardless of the camera that
# took it -- is warped into this exact pixel canvas. Because the aspect
# ratio (1000 / 1414 ≈ 0.707) matches US Letter (8.5 / 11 ≈ 0.773 is NOT
# quite equal -- we deliberately use an A4-like ratio close to letter so
# that minor paper-size differences don't distort bubble geometry) all ROI
# math below is expressed as a *fraction* of WARP_WIDTH / WARP_HEIGHT, which
# makes it resolution independent.

WARP_WIDTH = 1000
WARP_HEIGHT = 1414

# Fraction of the warped canvas that is "dead" margin outside the usable
# question-grid area (keeps ROIs away from fiducials & sheet edges).
CONTENT_MARGIN_FRAC = 0.06

# --------------------------------------------------------------------------
# 3. DEFAULT SHEET PARAMETERS (overridable per-sheet at generation time)
# --------------------------------------------------------------------------

DEFAULT_TOTAL_QUESTIONS = 60
DEFAULT_OPTIONS_PER_QUESTION = 4          # A-D
DEFAULT_COLUMNS = 3
MAX_OPTIONS = 8                            # A-H hard ceiling
OPTION_LETTERS = "ABCDEFGH"

# --------------------------------------------------------------------------
# 4. BUBBLE DRAWING GEOMETRY (points, on the PDF canvas)
# --------------------------------------------------------------------------

BUBBLE_RADIUS = 6.5                # pt
BUBBLE_GAP_X = 20                  # horizontal spacing between bubble centers
QUESTION_ROW_HEIGHT = 20           # vertical spacing between question rows
QUESTION_NUMBER_WIDTH = 26         # space reserved for "12." label
COLUMN_GAP = 26                    # gap between answer-block columns

# --------------------------------------------------------------------------
# 5. CV / THRESHOLD PARAMETERS (used by omr_engine.py)
# --------------------------------------------------------------------------

@dataclass
class CVParams:
    # --- Fiducial (registration square) detection ---
    fiducial_min_area_frac: float = 0.00025   # min contour area / image area
    fiducial_max_area_frac: float = 0.0035    # max contour area / image area
    fiducial_approx_epsilon: float = 0.04     # cv2.approxPolyDP epsilon factor
    fiducial_min_solidity: float = 0.90       # area / convexHull area
    fiducial_aspect_tolerance: float = 0.20   # |w/h - 1| tolerance (squareness)
    fiducial_size_consistency_tolerance: float = 0.40  # max relative area
                                               # deviation from the median of
                                               # the 4 chosen fiducials (all
                                               # 4 printed squares are the
                                               # same physical size, so this
                                               # rejects same-corner false
                                               # positives like QR blocks)

    # --- Adaptive threshold for binarizing the warped sheet ---
    adaptive_block_size: int = 35             # must be odd
    adaptive_c: int = 15

    # --- Bubble fill decision ---
    bubble_fill_threshold: float = 0.35       # fraction of ROI pixels that
                                               # must be "ink" to count as marked
    bubble_relative_margin: float = 1.55      # a bubble must be this many
                                               # times "darker" than the 2nd
                                               # darkest choice to be unambiguous
    min_absolute_fill_frac: float = 0.12      # below this, treat as blank
    gaussian_blur_kernel: int = 5             # must be odd


CV = CVParams()

# --------------------------------------------------------------------------
# 6. FILE / OUTPUT PATHS
# --------------------------------------------------------------------------

OUTPUT_DIR = "output"
ANSWER_KEY_PATH = f"{OUTPUT_DIR}/answer_key.json"
RESULTS_XLSX_PATH = f"{OUTPUT_DIR}/results.xlsx"
DEBUG_DIR = f"{OUTPUT_DIR}/debug"


def fiducial_bounded_page_size() -> "tuple[float, float]":
    """
    Returns the (width, height) of the region BETWEEN the 4 fiducial
    centers on the printed page, in points. `omr_engine.four_point_warp()`
    maps exactly this region to the full WARP_WIDTH x WARP_HEIGHT canvas,
    so `pdf_generator.py` must lay out bubbles as fractions of THIS box
    (not the full page) for the printed and scanned coordinate systems to
    agree. See the reference-frame note at the top of layout.py.
    """
    return (PAGE_WIDTH - 2 * FIDUCIAL_INSET, PAGE_HEIGHT - 2 * FIDUCIAL_INSET)


@dataclass
class SheetConfig:
    """
    Parameters describing ONE generated answer sheet. An instance of this
    class is created by the user (interactively or via CLI args) and is
    consumed by both pdf_generator.py (to draw it) and omr_engine.py
    (to know how many questions/options/columns to expect when scanning).
    """
    title: str = "OMR Answer Sheet"
    subject: str = "General"
    quiz_type: str = "Multiple Choice"
    total_questions: int = DEFAULT_TOTAL_QUESTIONS
    options_per_question: int = DEFAULT_OPTIONS_PER_QUESTION
    columns: int = DEFAULT_COLUMNS
    student_id_digits: int = 13
    embed_qr: bool = True
    sheet_id: str = "SHEET-0001"
    section: str = ""
    section_id: int | str = ""
    SubjectID: int | str = ""

    def __post_init__(self):
        if self.quiz_type == "True or False":
            self.options_per_question = 2
        if not (1 <= self.options_per_question <= MAX_OPTIONS):
            raise ValueError(
                f"options_per_question must be between 1 and {MAX_OPTIONS} "
                f"(A-{OPTION_LETTERS[MAX_OPTIONS - 1]})"
            )
        if self.total_questions <= 0:
            raise ValueError("total_questions must be positive")
        if self.columns <= 0:
            raise ValueError("columns must be positive")

    @property
    def option_letters(self) -> List[str]:
        if self.quiz_type == "True or False":
            return ["T", "F"]
        return list(OPTION_LETTERS[: self.options_per_question])

    def to_metadata_dict(self) -> dict:
        """Payload encoded into the QR / DataMatrix metadata block."""
        return {
            "sheet_id": self.sheet_id,
            "title": self.title,
            "subject": self.subject,
            "quiz_type": self.quiz_type,
            "question_count": self.total_questions,
            "options_per_question": self.options_per_question,
            "columns": self.columns,
        }
