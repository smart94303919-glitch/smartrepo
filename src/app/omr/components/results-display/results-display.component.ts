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
import { AnswerKey, GradeSheetResponse } from '../../../services/omr-api.service';

interface AnswerKeyRow {
  question: number;
  answer: string | null;
}

@Component({
  selector: 'app-results-display',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './results-display.component.html',
  styleUrls: ['./results-display.component.scss'],
})
export class ResultsDisplayComponent implements OnChanges {
  sortedAnswers: AnswerKeyRow[] = [];

  /** Result of a single /grade-sheet call (key capture or student grade). */
  @Input() result: GradeSheetResponse | null = null;

  /** Results from a gallery batch, rendered one paper at a time. */
  @Input() results: GradeSheetResponse[] = [];

  @Input() optionsPerQuestion: number | null = null;

  @Input() processingError: string | null = null;

  /** Fired only when the user explicitly confirms the displayed results. */
  @Output() resultConfirmed = new EventEmitter<void>();

  @Output() saveResult = new EventEmitter<GradeSheetResponse>();
  @Output() answerKeySaveRequested = new EventEmitter<AnswerKey>();

  @Input() savingResultKey: string | null = null;
  @Input() savedResultKey: string | null = null;
  @Input() answerKeySaved = false;
  @Input() answerKeySaveDisabled = false;
  @Input() savingAnswerKey = false;

  overlayImageUrl: string | null = null;
  editingQuestionNumber: number | null = null;
  private editingAnswerKeyResult: GradeSheetResponse | null = null;
  private readonly editedAnswerKeys = new WeakMap<GradeSheetResponse, AnswerKey>();

  constructor() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['result'] && this.result?.overlay_image_base64) {
      this.overlayImageUrl = `data:image/png;base64,${this.result.overlay_image_base64}`;
    }
    if (changes['result'] || changes['results']) {
      this.refreshSortedAnswers();
    }
  }

  confirmResults() {
    this.resultConfirmed.emit();
  }

  resultKey(result: GradeSheetResponse): string {
    return `${result.student_id ?? ''}|${result.display_sheet_id || result.sheet_id}`;
  }

  getSortedItemized(result: GradeSheetResponse) {
    return [...(result.itemized ?? [])]
      .sort((first, second) => Number(first.question) - Number(second.question));
  }

  refreshSortedAnswers(): void {
    const previousResult = this.editingAnswerKeyResult;
    const result = this.result?.answer_key
      ? this.result
      : this.results.find((item) => Boolean(item.answer_key)) ?? null;
    if (!result) {
      this.sortedAnswers = [];
      this.editingQuestionNumber = null;
      this.editingAnswerKeyResult = null;
      return;
    }

    if (previousResult !== result) {
      this.editingQuestionNumber = null;
    }
    const answerKey = this.editedAnswerKeys.get(result) ?? result.answer_key ?? {};
    this.sortedAnswers = Object.entries(answerKey)
      .map(([question, answer]) => ({ question: Number(question), answer }))
      .filter((item) => Number.isInteger(item.question))
      .sort((first, second) => first.question - second.question);
    this.editingAnswerKeyResult = result;
  }

  trackByQuestion(_index: number, item: AnswerKeyRow): number {
    return item.question;
  }

  getAvailableOptionChars(): string[] {
    const configuredCount = Number(this.optionsPerQuestion) || 4;
    const count = Math.min(9, Math.max(2, Math.trunc(configuredCount)));
    return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
  }

  isEditingAnswer(result: GradeSheetResponse, questionNumber: number): boolean {
    return this.editingAnswerKeyResult === result && this.editingQuestionNumber === questionNumber;
  }

  enableAnswerEdit(result: GradeSheetResponse, questionNumber: number): void {
    this.editingAnswerKeyResult = result;
    this.editingQuestionNumber = questionNumber;
  }

  updateQuestionAnswer(result: GradeSheetResponse, questionNumber: number, newAnswer: string): void {
    const updatedAnswerKey = {
      ...(this.editedAnswerKeys.get(result) ?? result.answer_key ?? {}),
      [String(questionNumber)]: newAnswer.toUpperCase(),
    };
    this.editedAnswerKeys.set(result, updatedAnswerKey);
    this.sortedAnswers = this.sortedAnswers.map((item) =>
      item.question === questionNumber ? { ...item, answer: newAnswer.toUpperCase() } : item,
    );
    this.cancelAnswerEdit();
  }

  cancelAnswerEdit(): void {
    this.editingQuestionNumber = null;
    this.editingAnswerKeyResult = null;
  }

  requestSave(result: GradeSheetResponse) {
    this.saveResult.emit(result);
  }

  requestSaveAnswerKey(): void {
    const result = this.result;
    if (result?.mode !== 'key' || !result.answer_key) return;

    const answerKey = this.editedAnswerKeys.get(result) ?? result.answer_key;
    this.answerKeySaveRequested.emit({ ...answerKey });
  }

}
