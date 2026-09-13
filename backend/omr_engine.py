"""
omr_engine.py
=============
Core computer-vision pipeline. Responsible for turning a raw photo/scan of
a filled-in bubble sheet into a clean `{question_number: chosen_letter}`
dictionary.

Pipeline stages
---------------
1. `find_fiducials()`      -- locate the 4 solid black registration squares
                               via contour detection + shape filtering.
2. `order_points()`        -- sort the 4 fiducial centers into
                               TL, TR, BR, BL order regardless of input
                               rotation.
3. `four_point_warp()`     -- perspective-correct the sheet into a fixed
                               WARP_WIDTH x WARP_HEIGHT canvas.
4. `binarize()`            -- adaptive threshold to obtain a clean
                               black/white "ink mask".
5. `compute_bubble_grid()` -- (imported from layout.py) recompute the exact
                               same bubble center coordinates that were used
                               to draw the sheet.
6. `read_answers()`        -- for every question, measure ink density under
                               each bubble's circular ROI and decide which
                               option (if any) was marked.

All geometry constants come from `config.py`; all bubble *positions* come
from the shared `layout.py` so the reader can never disagree with the
generator about where a bubble should be.
"""

import json
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from config import SheetConfig, WARP_WIDTH, WARP_HEIGHT, CV
from layout import compute_bubble_grid


# --------------------------------------------------------------------------
# Result containers
# --------------------------------------------------------------------------

@dataclass
class QuestionResult:
    question_num: int
    selected: Optional[str]     # e.g. "B", or None if blank
    multi_marked: bool          # True if 2+ bubbles were filled (ambiguous)
    fill_fractions: Dict[str, float]   # per-option ink density, for debugging/QA


class OMRProcessingError(Exception):
    """Raised when the pipeline cannot confidently process an image
    (e.g. fewer than 4 fiducials found)."""


# --------------------------------------------------------------------------
# Stage 1: Fiducial (registration square) detection
# --------------------------------------------------------------------------

def _preprocess_for_fiducials(image: np.ndarray) -> np.ndarray:
    """Grayscale + Otsu threshold, tuned to make solid black squares pop
    out as clean white blobs on a black background for contour finding."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    # Otsu automatically picks the threshold that best separates the
    # bimodal (mostly-white-paper vs solid-black-square) histogram.
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return thresh


def find_fiducials(image: np.ndarray) -> List[Tuple[float, float]]:
    """
    Detect the 4 solid black registration squares via contour analysis.

    Filtering criteria (see config.CVParams for exact thresholds):
      - area within [fiducial_min_area_frac, fiducial_max_area_frac] of
        total image area (rejects tiny noise specks and huge dark blobs
        like a hand or shadow)
      - approxPolyDP simplifies to ~4 vertices (rejects circles/blobs)
      - solidity (contour area / convex-hull area) near 1.0 (rejects
        L-shapes, text blobs, etc.)
      - bounding-box aspect ratio near 1:1 (rejects rectangles/lines)

    Returns the 4 fiducial centers as (x, y) pixel coordinates, in
    whatever order cv2.findContours happened to return them (unordered --
    `order_points()` sorts them next).
    """
    h, w = image.shape[:2]
    img_area = float(h * w)
    thresh = _preprocess_for_fiducials(image)

    contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidates: List[Tuple[float, Tuple[float, float]]] = []  # (area, center)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        area_frac = area / img_area
        if not (CV.fiducial_min_area_frac <= area_frac <= CV.fiducial_max_area_frac):
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        approx = cv2.approxPolyDP(cnt, CV.fiducial_approx_epsilon * perimeter, True)
        if not (4 <= len(approx) <= 6):
            # allow a little slack for corner rounding/jpeg artifacts
            continue

        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        if hull_area == 0:
            continue
        solidity = area / hull_area
        if solidity < CV.fiducial_min_solidity:
            continue

        x, y, bw, bh = cv2.boundingRect(cnt)
        aspect = bw / float(bh)
        if abs(aspect - 1.0) > CV.fiducial_aspect_tolerance:
            continue

        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]
        candidates.append((area, (cx, cy)))

    if len(candidates) < 4:
        raise OMRProcessingError(
            f"Only found {len(candidates)} registration squares (need 4). "
            "Ensure all 4 corners of the sheet are visible, well-lit, and "
            "not obscured by shadows, fingers, or glare."
        )

    # Assign every surviving candidate to its nearest image quadrant/corner
    # (TL, TR, BR, BL) -- the 4 fiducials always live one-per-corner, but a
    # single corner can still contain OTHER shape-filter survivors (e.g. a
    # densely-packed QR code block, or a filled-in answer bubble near the
    # edge of the sheet). We therefore keep every same-quadrant candidate,
    # ranked by distance to the true corner, and resolve ambiguity using a
    # size-consistency vote below rather than picking blindly on distance.
    corners_ref = [(0, 0), (w, 0), (w, h), (0, h)]
    per_quadrant: List[List[Tuple[float, Tuple[float, float]]]] = [[] for _ in range(4)]
    for area, (cx, cy) in candidates:
        d = [(cx - rx) ** 2 + (cy - ry) ** 2 for rx, ry in corners_ref]
        q = int(np.argmin(d))
        per_quadrant[q].append((area, (cx, cy)))

    if any(len(q) == 0 for q in per_quadrant):
        raise OMRProcessingError(
            "Could not find a registration square in every corner of the "
            "sheet. Ensure all 4 corners are visible and well-lit."
        )

    for q in per_quadrant:
        q.sort(key=lambda c: c[0])  # placeholder sort, replaced below

    # Sort each quadrant's candidates by distance to its reference corner
    # (closest first) -- fiducials are the closest solid black shape to the
    # true page corner in the overwhelming majority of cases.
    for i, ref in enumerate(corners_ref):
        per_quadrant[i].sort(
            key=lambda c: (c[1][0] - ref[0]) ** 2 + (c[1][1] - ref[1]) ** 2
        )

    # Greedily pick the closest candidate per quadrant, then verify the 4
    # chosen areas are mutually consistent (real fiducials are identical
    # physical squares). If one is an outlier (e.g. a QR block wrongly
    # ranked closest), swap in that quadrant's next-closest candidate and
    # re-check, up to a few iterations.
    picks = [0] * 4  # index into each quadrant's sorted candidate list
    for _ in range(6):
        chosen = [per_quadrant[i][picks[i]] for i in range(4)]
        areas = np.array([c[0] for c in chosen])
        median = np.median(areas)
        deviation = np.abs(areas - median) / median
        bad = np.argmax(deviation)
        if deviation[bad] <= CV.fiducial_size_consistency_tolerance:
            break
        if picks[bad] + 1 < len(per_quadrant[bad]):
            picks[bad] += 1
        else:
            break  # no better candidate available in that quadrant; give up

    chosen = [per_quadrant[i][picks[i]] for i in range(4)]
    return [c[1] for c in chosen]


def order_points(pts: List[Tuple[float, float]]) -> np.ndarray:
    """
    Sort 4 (x, y) points into [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
    order, robust to arbitrary input ordering and moderate rotation.

    Classic approach: TL has the smallest (x+y) sum, BR has the largest sum;
    TR has the smallest (y-x) difference, BL has the largest difference.
    """
    pts_arr = np.array(pts, dtype="float32")
    ordered = np.zeros((4, 2), dtype="float32")

    s = pts_arr.sum(axis=1)
    ordered[0] = pts_arr[np.argmin(s)]   # top-left     (smallest x+y)
    ordered[2] = pts_arr[np.argmax(s)]   # bottom-right (largest x+y)

    diff = np.diff(pts_arr, axis=1).flatten()
    ordered[1] = pts_arr[np.argmin(diff)]  # top-right    (smallest y-x)
    ordered[3] = pts_arr[np.argmax(diff)]  # bottom-left  (largest y-x)

    return ordered


# --------------------------------------------------------------------------
# Stage 2: Perspective correction
# --------------------------------------------------------------------------

def four_point_warp(
    image: np.ndarray,
    ordered_pts: np.ndarray,
    out_w: int = WARP_WIDTH,
    out_h: int = WARP_HEIGHT,
) -> np.ndarray:
    """
    Apply a perspective transform that maps the 4 fiducial centers to the
    exact corners of a flat `out_w x out_h` canvas. This corrects for
    camera tilt, rotation, and (within reason) mild paper warp, so every
    downstream ROI can be computed with simple fractional geometry instead
    of per-image trigonometry.
    """
    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype="float32",
    )
    M = cv2.getPerspectiveTransform(ordered_pts, dst)
    warped = cv2.warpPerspective(image, M, (out_w, out_h))
    return warped


def align_sheet(image: np.ndarray) -> np.ndarray:
    """Convenience wrapper: fiducial detection + ordering + warp in one call."""
    raw_pts = find_fiducials(image)
    ordered = order_points(raw_pts)
    return four_point_warp(image, ordered)


# --------------------------------------------------------------------------
# Stage 3: Binarization
# --------------------------------------------------------------------------

def binarize(warped_bgr: np.ndarray) -> np.ndarray:
    """
    Convert the aligned sheet to a clean black/white "ink mask" where
    pencil/pen marks are white (255) and blank paper is black (0), using
    adaptive Gaussian thresholding. Adaptive (rather than a single global
    Otsu value) thresholding is used because scanned/photographed sheets
    frequently have uneven lighting across the page.
    """
    gray = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (CV.gaussian_blur_kernel, CV.gaussian_blur_kernel), 0)
    thresh = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,   # ink -> white, paper -> black
        CV.adaptive_block_size,
        CV.adaptive_c,
    )
    return thresh


# --------------------------------------------------------------------------
# Stage 4: Bubble fill measurement + answer decision
# --------------------------------------------------------------------------

def _bubble_fill_fraction(ink_mask: np.ndarray, cx: float, cy: float, radius: float) -> float:
    """
    Measures what fraction of pixels inside a circular ROI (centered at
    cx, cy with the given radius, scaled slightly to the bubble's printed
    radius fraction) are "ink" (white) in the binarized mask.
    """
    h, w = ink_mask.shape[:2]
    x0, y0 = int(max(cx - radius, 0)), int(max(cy - radius, 0))
    x1, y1 = int(min(cx + radius, w)), int(min(cy + radius, h))
    if x1 <= x0 or y1 <= y0:
        return 0.0

    roi = ink_mask[y0:y1, x0:x1]

    # Build a circular mask so corner pixels of the bounding square
    # (which are always paper, never bubble ink) don't dilute the score.
    yy, xx = np.ogrid[: roi.shape[0], : roi.shape[1]]
    local_cx, local_cy = cx - x0, cy - y0
    circle_mask = (xx - local_cx) ** 2 + (yy - local_cy) ** 2 <= radius ** 2

    if circle_mask.sum() == 0:
        return 0.0

    ink_pixels = roi[circle_mask]
    return float(np.count_nonzero(ink_pixels)) / float(ink_pixels.size)


def read_answers(
    warped_bgr: np.ndarray, cfg: SheetConfig
) -> Dict[int, QuestionResult]:
    """
    For every question defined in `cfg`, measure ink fill under each of its
    option bubbles (using the exact grid `layout.compute_bubble_grid()`
    used to draw the sheet) and decide which option, if any, was marked.

    Decision rule per question:
      1. Compute fill fraction for every option.
      2. The best (highest-fill) option must clear `min_absolute_fill_frac`
         to be considered "marked" at all -- otherwise the question is
         blank.
      3. The best option's fill must exceed the second-best option's fill
         by at least `bubble_relative_margin`x -- otherwise the question is
         flagged `multi_marked` (ambiguous double-bubble) and no single
         answer is recorded.
    """
    ink_mask = binarize(warped_bgr)
    grid = compute_bubble_grid(cfg, warped_bgr.shape[1], warped_bgr.shape[0])

    # Bubble ROI radius in the warped canvas, scaled proportionally from the
    # PDF's point-based BUBBLE_RADIUS relative to page width. We deliberately
    # sample slightly SMALLER than the printed circle's outline (0.8x) so
    # the ROI stays inside the printed stroke and never picks up the ring
    # itself (or the option-letter glyph, which is printed OUTSIDE the
    # circle -- see pdf_generator.draw_bubbles) as false "ink".
    from config import BUBBLE_RADIUS, PAGE_WIDTH
    radius_px = BUBBLE_RADIUS * (warped_bgr.shape[1] / PAGE_WIDTH) * 0.8

    results: Dict[int, QuestionResult] = {}
    for q_num, options in grid.items():
        fractions: Dict[str, float] = {}
        for letter, (cx, cy) in options.items():
            fractions[letter] = _bubble_fill_fraction(ink_mask, cx, cy, radius_px)

        ranked = sorted(fractions.items(), key=lambda kv: kv[1], reverse=True)
        best_letter, best_frac = ranked[0]
        second_frac = ranked[1][1] if len(ranked) > 1 else 0.0

        if best_frac < CV.min_absolute_fill_frac:
            selected, multi = None, False
        elif second_frac > 0 and (best_frac / max(second_frac, 1e-6)) < CV.bubble_relative_margin \
                and second_frac >= CV.min_absolute_fill_frac:
            # Two (or more) bubbles are both substantially filled -> ambiguous
            selected, multi = None, True
        else:
            selected, multi = best_letter, False

        results[q_num] = QuestionResult(
            question_num=q_num,
            selected=selected,
            multi_marked=multi,
            fill_fractions=fractions,
        )

    return results


# --------------------------------------------------------------------------
# Stage 5: Full-image convenience entry point
# --------------------------------------------------------------------------

def process_sheet_image(
    image: np.ndarray, cfg: SheetConfig
) -> Tuple[Dict[int, QuestionResult], np.ndarray]:
    """
    Runs the complete pipeline: align -> binarize -> read.
    Returns (answers_dict, warped_bgr_image) -- the warped image is
    returned too so callers (e.g. main.py) can save a debug overlay.
    """
    warped = align_sheet(image)
    answers = read_answers(warped, cfg)
    return answers, warped


def draw_debug_overlay(
    warped_bgr: np.ndarray, cfg: SheetConfig, results: Dict[int, QuestionResult]
) -> np.ndarray:
    """
    Draws colored circles over every bubble: green for the detected answer,
    red for bubbles flagged as an ambiguous multi-mark, light grey outline
    for everything else. Useful for visually auditing scan accuracy.
    """
    from config import BUBBLE_RADIUS, PAGE_WIDTH

    overlay = warped_bgr.copy()
    grid = compute_bubble_grid(cfg, warped_bgr.shape[1], warped_bgr.shape[0])
    radius_px = int(BUBBLE_RADIUS * (warped_bgr.shape[1] / PAGE_WIDTH) * 1.15)

    for q_num, options in grid.items():
        res = results.get(q_num)
        for letter, (cx, cy) in options.items():
            color = (200, 200, 200)
            thickness = 1
            if res:
                if res.multi_marked:
                    color, thickness = (0, 0, 255), 2       # red
                elif res.selected == letter:
                    color, thickness = (0, 200, 0), 2       # green
            cv2.circle(overlay, (int(cx), int(cy)), radius_px, color, thickness)

    return overlay


# --------------------------------------------------------------------------
# Chaquopy/local bridge wrappers
# --------------------------------------------------------------------------

def _results_to_json(results: Dict[int, QuestionResult]) -> str:
    """Serialize existing QuestionResult values without changing the OMR decisions."""
    payload = {str(question): asdict(result) for question, result in results.items()}
    return json.dumps(payload)


def grade_sheet_local(image_path: str, cfg: Optional[SheetConfig] = None) -> str:
    """Run the existing OMR pipeline against a local image path.

    The returned JSON contains the same QuestionResult fields produced by
    ``process_sheet_image``. The optional config must match the printed sheet.
    """
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(
            f"Could not read image at '{image_path}'. Check the path and format."
        )

    sheet_config = cfg or SheetConfig()
    results, _ = process_sheet_image(image, sheet_config)
    return _results_to_json(results)


def generate_answer_key_local(image_path: str, cfg: Optional[SheetConfig] = None) -> str:
    """Read a teacher sheet locally and return its answer key as JSON."""
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(
            f"Could not read image at '{image_path}'. Check the path and format."
        )

    sheet_config = cfg or SheetConfig()
    results, _ = process_sheet_image(image, sheet_config)
    answer_key = {
        str(question): result.selected
        for question, result in results.items()
    }
    return json.dumps({"answer_key": answer_key})


