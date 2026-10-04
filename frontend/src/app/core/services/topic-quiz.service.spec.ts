import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOPIC_QUIZ_BANK, TopicQuizService } from './topic-quiz.service';

describe('TopicQuizService — Topic-Based Pedagogical Quiz & Feedback', () => {
  let service: TopicQuizService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [TopicQuizService],
    });
    service = TestBed.inject(TopicQuizService);
  });

  it('initializes with empty prompt and closed modal', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.prompt()).toBeNull();
    expect(service.activeQuestion()).toBeNull();
  });

  it('matches relevant questions based on subject keyword', () => {
    const javaQ = service.getQuestionForTopic('Java Concurrency & Threads', 'Thread Synchronization');
    expect(javaQ.topic).toBe('Java');

    const springQ = service.getQuestionForTopic('Spring Boot Fundamentals', 'Transaction Management');
    expect(springQ.topic).toBe('Spring Boot');

    const dsaQ = service.getQuestionForTopic('DSA', 'Kadane Maximum Subarray');
    expect(dsaQ.topic).toBe('DSA');

    const sysQ = service.getQuestionForTopic('System Design', 'CAP Theorem and Distributed Systems');
    expect(sysQ.topic).toBe('System Design');

    const dbQ = service.getQuestionForTopic('Database & SQL', 'B-Tree Indexing');
    expect(dbQ.topic).toBe('Database & SQL');
  });

  it('triggers article checkpoint at midpoint or continuous read streak', () => {
    service.checkArticleTrigger(101, 'Thread Synchronization', 'Java', 50, 60);
    expect(service.prompt()).not.toBeNull();
    expect(service.prompt()?.topic).toBe('Java');
    expect(service.prompt()?.reason).toBe('midpoint');
  });

  it('triggers video checkpoint when watching continuously', () => {
    service.checkVideoTrigger('vid_123', 'Dynamic Programming Patterns', 'DSA', 250, 245);
    expect(service.prompt()).not.toBeNull();
    expect(service.prompt()?.contextType).toBe('video');
  });

  it('evaluates correct answer and provides positive reinforcement feedback', () => {
    const question = TOPIC_QUIZ_BANK[0]; // Java wait() throws IllegalMonitorStateException (correctIndex: 1)
    service.openQuiz(question);

    expect(service.isOpen()).toBe(true);
    service.selectOption(question.correctIndex);
    const feedback = service.submitAnswer();

    expect(feedback).not.toBeNull();
    expect(feedback?.grade).toBe('CORRECT');
    expect(feedback?.retentionBoost).toBe(10);
    expect(service.isCorrect()).toBe(true);
    expect(service.correctCount()).toBe(1);
  });

  it('evaluates incorrect answer and provides constructive pedagogical explanation', () => {
    const question = TOPIC_QUIZ_BANK[0];
    service.openQuiz(question);

    // Pick incorrect index
    const wrongIndex = question.correctIndex === 0 ? 1 : 0;
    service.selectOption(wrongIndex);
    const feedback = service.submitAnswer();

    expect(feedback).not.toBeNull();
    expect(feedback?.grade).toBe('INCORRECT');
    expect(feedback?.explanation).toContain('IllegalMonitorStateException');
    expect(service.isCorrect()).toBe(false);
  });

  it('dispatches takeaway note via onSaveTakeaway callback', () => {
    const question = TOPIC_QUIZ_BANK[0];
    service.openQuiz(question);
    service.selectOption(question.correctIndex);
    service.submitAnswer();

    const spy = vi.fn();
    service.onSaveTakeaway = spy;

    service.saveTakeaway();
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0];
    expect(arg).toContain('Checkpoint Takeaway');
    expect(arg).toContain(question.takeawayNote);
  });

  it('dismisses prompt and respects cooldown', () => {
    service.checkArticleTrigger(202, 'Spring Security', 'Spring Boot', 55, 100);
    expect(service.prompt()).not.toBeNull();

    service.dismissPrompt();
    expect(service.prompt()).toBeNull();

    // Trying immediately again should be prevented by cooldown
    service.checkArticleTrigger(203, 'Another Article', 'Spring Boot', 60, 100);
    expect(service.prompt()).toBeNull();
  });
});
