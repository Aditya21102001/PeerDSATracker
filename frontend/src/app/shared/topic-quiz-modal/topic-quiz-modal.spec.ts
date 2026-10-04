import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TopicQuizService, TOPIC_QUIZ_BANK } from '../../core/services/topic-quiz.service';
import { TopicQuizModal } from './topic-quiz-modal';

describe('TopicQuizModal Component', () => {
  let fixture: ComponentFixture<TopicQuizModal>;
  let component: TopicQuizModal;
  let quizService: TopicQuizService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TopicQuizModal],
      providers: [TopicQuizService],
    }).compileComponents();

    fixture = TestBed.createComponent(TopicQuizModal);
    component = fixture.componentInstance;
    quizService = TestBed.inject(TopicQuizService);
    fixture.detectChanges();
  });

  it('renders nothing when prompt and modal are inactive', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.quiz-prompt-toast')).toBeNull();
    expect(el.querySelector('.quiz-modal-backdrop')).toBeNull();
  });

  it('renders prompt toast when a quiz is suggested', () => {
    quizService.suggestQuiz({
      question: TOPIC_QUIZ_BANK[0],
      contextType: 'article',
      sourceId: 10,
      sourceTitle: 'Concurrency Guide',
      topic: 'Java',
      reason: 'midpoint',
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toast = el.querySelector('.quiz-prompt-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Java');
    expect(toast?.textContent).toContain('Optional Concept Check');
  });

  it('opens modal when Start Quiz is clicked', () => {
    quizService.suggestQuiz({
      question: TOPIC_QUIZ_BANK[0],
      contextType: 'article',
      sourceId: 10,
      sourceTitle: 'Concurrency Guide',
      topic: 'Java',
      reason: 'midpoint',
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const startBtn = el.querySelector<HTMLButtonElement>('.btn-prompt-start');
    startBtn?.click();
    fixture.detectChanges();

    expect(quizService.isOpen()).toBe(true);
    const modal = el.querySelector('.quiz-modal-backdrop');
    expect(modal).not.toBeNull();
    expect(el.querySelector('.quiz-question-text')?.textContent).toContain(TOPIC_QUIZ_BANK[0].question);
  });

  it('allows selecting an option, submitting, and viewing pedagogical feedback', () => {
    quizService.openQuiz(TOPIC_QUIZ_BANK[0]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const optionCards = el.querySelectorAll<HTMLButtonElement>('.quiz-option-card');
    expect(optionCards.length).toBe(TOPIC_QUIZ_BANK[0].options.length);

    // Select the correct option
    optionCards[TOPIC_QUIZ_BANK[0].correctIndex].click();
    fixture.detectChanges();

    const submitBtn = el.querySelector<HTMLButtonElement>('.btn-submit-quiz');
    expect(submitBtn?.disabled).toBe(false);
    submitBtn?.click();
    fixture.detectChanges();

    expect(quizService.isSubmitted()).toBe(true);
    expect(quizService.isCorrect()).toBe(true);

    const feedbackBox = el.querySelector('.quiz-feedback-box');
    expect(feedbackBox).not.toBeNull();
    expect(feedbackBox?.textContent).toContain('Key Engineering Invariant');
  });

  it('emits saveTakeaway event when Save to Notes is clicked', () => {
    let emitted = '';
    component.saveTakeaway.subscribe((text) => {
      emitted = text;
    });

    quizService.openQuiz(TOPIC_QUIZ_BANK[0]);
    quizService.selectOption(TOPIC_QUIZ_BANK[0].correctIndex);
    quizService.submitAnswer();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const saveBtn = el.querySelector<HTMLButtonElement>('.btn-save-notes');
    saveBtn?.click();
    fixture.detectChanges();

    expect(emitted).toContain('Checkpoint Takeaway');
    expect(emitted).toContain(TOPIC_QUIZ_BANK[0].takeawayNote);
    expect(quizService.isOpen()).toBe(false);
  });
});
