/**
 * results-display.component.ts
 * =============================
 * Renders the JSON payload returned by POST /grade-sheet (either
 * mode='key' or mode='grade') -- score, percentage, itemized right/wrong/
 * blank breakdown, and the visual debug overlay (green ring = detected
 * answer, red ring = ambiguous double-mark) so the user can SEE the
 * alignment result, not just trust a number.
 */
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GradeSheetResponse } from '../../../services/omr-api.service';

@Component({
  selector: 'app-results-display',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './results-display.component.html',
  styleUrls: ['./results-display.component.scss'],
})
export class ResultsDisplayComponent implements OnChanges {
  /** Result of a single /grade-sheet call (key capture or student grade). */
  @Input() result: GradeSheetResponse | null = null;

  /** Results from a gallery batch, rendered one paper at a time. */
  @Input() results: GradeSheetResponse[] = [];

  @Input() processingError: string | null = null;

  /** Fired only when the user explicitly confirms the displayed results. */
  @Output() resultConfirmed = new EventEmitter<void>();

  @Output() saveResult = new EventEmitter<GradeSheetResponse>();

  @Input() savingResultKey: string | null = null;
  @Input() savedResultKey: string | null = null;

  overlayImageUrl: string | null = null;

  constructor() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['result'] && this.result?.overlay_image_base64) {
      this.overlayImageUrl = `data:image/png;base64,${this.result.overlay_image_base64}`;
    }
  }

  confirmResults() {
    this.resultConfirmed.emit();
  }

  resultKey(result: GradeSheetResponse): string {
    return `${result.student_id ?? ''}|${result.display_sheet_id || result.sheet_id}`;
  }

  requestSave(result: GradeSheetResponse) {
    this.saveResult.emit(result);
  }

}
