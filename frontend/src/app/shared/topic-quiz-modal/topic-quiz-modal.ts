import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { TopicQuizService } from '../../core/services/topic-quiz.service';

@Component({
  selector: 'app-topic-quiz-modal',
  standalone: true,
  template: `
    <!-- 1. Non-Intrusive Prompt Banner / Slide-up Toast -->
    @if (quiz.prompt(); as prompt) {
      @if (!quiz.isOpen()) {
        <aside class="quiz-prompt-toast" role="complementary" aria-label="Optional Concept Checkpoint">
          <div class="prompt-icon-col">
            <span class="prompt-icon">🧠</span>
          </div>
          <div class="prompt-content-col">
            <div class="prompt-topline">
              <span class="prompt-badge">{{ prompt.question.icon }} {{ prompt.topic }}</span>
              <span class="prompt-time-est">⏱️ 60-Sec Checkpoint</span>
            </div>
            <strong class="prompt-title">Optional Concept Check</strong>
            <p class="prompt-desc">
              Testing your understanding now reinforces neural pathways and boosts your retention score!
            </p>
            <div class="prompt-actions">
              <button
                type="button"
                class="btn btn-sm btn-prompt-start"
                (click)="quiz.openQuiz()"
                aria-label="Start optional 60-second quiz"
              >
                ⚡ Take 60s Quiz
              </button>
              <button
                type="button"
                class="btn btn-sm btn-ghost btn-prompt-skip"
                (click)="quiz.dismissPrompt()"
                aria-label="Skip quiz for now"
              >
                Maybe Later
              </button>
            </div>
          </div>
          <button
            type="button"
            class="prompt-close-x"
            (click)="quiz.dismissPrompt()"
            aria-label="Dismiss quiz prompt"
          >
            ✕
          </button>
        </aside>
      }
    }

    <!-- 2. Accessible Quiz Modal Dialog -->
    @if (quiz.isOpen()) {
      <div
        class="quiz-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-modal-title"
        (click)="onBackdropClick($event)"
      >
        <div class="quiz-modal-card card" #modalCard (click)="$event.stopPropagation()">
          @if (quiz.activeQuestion(); as q) {
            <!-- Modal Header -->
            <div class="quiz-header">
              <div class="quiz-topic-meta">
                <span class="topic-pill">{{ q.icon }} {{ q.topic }}</span>
                @if (q.subtopic) {
                  <span class="subtopic-pill">{{ q.subtopic }}</span>
                }
                <span class="difficulty-pill" [class]="q.difficulty.toLowerCase()">
                  {{ q.difficulty }}
                </span>
              </div>
              <button
                type="button"
                class="btn-close-modal"
                (click)="handleClose()"
                aria-label="Close quiz dialog"
              >
                ✕
              </button>
            </div>

            <!-- Question -->
            <div class="quiz-body">
              <h3 id="quiz-modal-title" class="quiz-question-text">
                {{ q.question }}
              </h3>

              <!-- Options List -->
              <div class="quiz-options-group" role="radiogroup" aria-label="Quiz Answer Options">
                @for (opt of q.options; track $index) {
                  <button
                    type="button"
                    class="quiz-option-card"
                    [class.selected]="quiz.selectedOption() === $index"
                    [class.correct]="quiz.isSubmitted() && $index === q.correctIndex"
                    [class.incorrect]="quiz.isSubmitted() && quiz.selectedOption() === $index && !quiz.isCorrect()"
                    [disabled]="quiz.isSubmitted()"
                    (click)="quiz.selectOption($index)"
                    role="radio"
                    [attr.aria-checked]="quiz.selectedOption() === $index"
                  >
                    <span class="option-indicator">
                      @if (quiz.isSubmitted()) {
                        @if ($index === q.correctIndex) {
                          ✓
                        } @else if (quiz.selectedOption() === $index && !quiz.isCorrect()) {
                          ✗
                        } @else {
                          {{ getOptionLetter($index) }}
                        }
                      } @else {
                        {{ getOptionLetter($index) }}
                      }
                    </span>
                    <span class="option-text">{{ opt }}</span>
                  </button>
                }
              </div>

              <!-- Submit button (prior to submitting) -->
              @if (!quiz.isSubmitted()) {
                <div class="quiz-submit-bar">
                  <span class="submit-hint">
                    Select the best engineering answer and submit to check feedback.
                  </span>
                  <button
                    type="button"
                    class="btn btn-primary btn-submit-quiz"
                    [disabled]="quiz.selectedOption() === null"
                    (click)="submitQuiz()"
                  >
                    Check Answer →
                  </button>
                </div>
              }

              <!-- Feedback Section (revealed after submission) -->
              @if (quiz.feedback(); as fb) {
                <section class="quiz-feedback-box" [class]="fb.grade.toLowerCase()" aria-live="polite">
                  <div class="feedback-status-header">
                    <span class="feedback-badge">{{ fb.badge }}</span>
                    <span class="retention-reward">+{{ fb.retentionBoost }}% Retention Index</span>
                  </div>

                  <h4 class="feedback-title">{{ fb.title }}</h4>
                  <p class="feedback-explanation">{{ fb.explanation }}</p>

                  <div class="takeaway-card">
                    <span class="takeaway-label">📌 Key Engineering Invariant:</span>
                    <p class="takeaway-text">{{ fb.takeawayNote }}</p>
                  </div>

                  <div class="feedback-actions">
                    <button
                      type="button"
                      class="btn btn-sm btn-save-notes"
                      (click)="saveTakeawayToNotes()"
                    >
                      📝 Save Takeaway to My Notes
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      (click)="handleClose()"
                    >
                      Continue Studying →
                    </button>
                  </div>
                </section>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styleUrls: ['./topic-quiz-modal.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicQuizModal {
  readonly quiz = inject(TopicQuizService);

  @ViewChild('modalCard') modalCardRef?: ElementRef<HTMLElement>;

  @Output() saveTakeaway = new EventEmitter<string>();
  @Output() quizClosed = new EventEmitter<void>();

  constructor() {
    // Connect service callback to component emitter
    this.quiz.onSaveTakeaway = (text: string) => {
      this.saveTakeaway.emit(text);
    };
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (this.quiz.isOpen() && event.key === 'Escape') {
      event.preventDefault();
      this.handleClose();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    // If clicked directly on the backdrop (not on children)
    if (event.target === event.currentTarget) {
      this.handleClose();
    }
  }

  handleClose(): void {
    this.quiz.closeQuiz();
    this.quizClosed.emit();
  }

  submitQuiz(): void {
    this.quiz.submitAnswer();
  }

  saveTakeawayToNotes(): void {
    this.quiz.saveTakeaway();
    this.handleClose();
  }

  getOptionLetter(index: number): string {
    return String.fromCharCode(65 + index); // 'A', 'B', 'C', 'D'
  }
}
