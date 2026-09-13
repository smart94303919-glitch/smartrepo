/**
 * results-display.component.ts
 * =============================
 * Renders the JSON payload returned by POST /grade-sheet (either
 * mode='key' or mode='grade') -- score, percentage, itemized right/wrong/
 * blank breakdown, and the visual debug overlay (green ring = detected
 * answer, red ring = ambiguous double-mark) so the user can SEE the
 * alignment result, not just trust a number.
 */
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { GradeSheetResponse } from '../../services/omr-api.service';

@Component({
  selector: 'app-results-display',
  templateUrl: './results-display.component.html',
  styleUrls: ['./results-display.component.scss'],
})
export class ResultsDisplayComponent implements OnChanges {
  /** Result of a single /grade-sheet call (key capture or student grade). */
  @Input() result: GradeSheetResponse | null = null;

  overlayImageUrl: string | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['result'] && this.result?.overlay_image_base64) {
      this.overlayImageUrl = `data:image/png;base64,${this.result.overlay_image_base64}`;
    }
  }
}
