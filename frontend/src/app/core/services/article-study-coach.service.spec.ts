import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ArticleStudyCoachService } from './article-study-coach.service';

describe('ArticleStudyCoachService', () => {
  let service: ArticleStudyCoachService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [ArticleStudyCoachService],
    });
    service = TestBed.inject(ArticleStudyCoachService);
  });

  it('initializes with default settings and calibrating pattern', () => {
    expect(service.settings().enableReadingCoach).toBe(true);
    expect(service.currentPattern()).toBe('CALIBRATING');
    expect(service.retentionIndex()).toBeGreaterThanOrEqual(70);
    expect(service.isReading()).toBe(false);
  });

  it('starts an article reading session and tracks words', () => {
    service.startSession(1, 'Java Virtual Machine Internals', 'Word '.repeat(500));
    expect(service.currentArticleId()).toBe(1);
    expect(service.currentArticleTitle()).toBe('Java Virtual Machine Internals');
    expect(service.totalWordCount()).toBe(500);
    expect(service.isReading()).toBe(true);

    service.endSession();
    expect(service.currentArticleId()).toBeNull();
    expect(service.isReading()).toBe(false);
  });

  it('detects SKIMMING pattern when scrolling too quickly through content', () => {
    service.startSession(1, 'Distributed Transactions', 'Word '.repeat(1000));
    service.totalReadSeconds.set(40);
    service.scrollDepthPercent.set(80);
    service.currentWpm.set(520);

    (service as any).evaluatePattern();
    expect(service.currentPattern()).toBe('SKIMMING');

    const recs = service.recommendations();
    expect(recs.some((r) => r.id === 'read-and-recite')).toBe(true);
  });

  it('detects PASSIVE_READING pattern when reading continuously for over 7 minutes without pause', () => {
    service.startSession(1, 'Kafka Architecture', 'Word '.repeat(1200));
    service.totalReadSeconds.set(500);
    service.continuousReadSeconds.set(450); // > 420 seconds (7 minutes)

    (service as any).evaluatePattern();
    expect(service.currentPattern()).toBe('PASSIVE_READING');

    const recs = service.recommendations();
    expect(recs.some((r) => r.id === 'pause-retrieval')).toBe(true);
  });

  it('detects COMPREHENSION_STRUGGLE when re-reading sections repeatedly', () => {
    service.startSession(1, 'Java Memory Barrier', 'Word '.repeat(800));
    service.totalReadSeconds.set(120);
    service.reReadCount.set(4);

    (service as any).evaluatePattern();
    expect(service.currentPattern()).toBe('COMPREHENSION_STRUGGLE');

    const recs = service.recommendations();
    expect(recs.some((r) => r.id === 'trace-invariants')).toBe(true);
  });

  it('detects DEEP_ACTIVE_READING when balanced pauses and active reflection occur', () => {
    service.startSession(1, 'Spring Boot Fundamentals', 'Word '.repeat(800));
    service.totalReadSeconds.set(200);
    service.continuousReadSeconds.set(120);
    service.pauseCount.set(3);
    service.activePauseCount.set(2);
    service.currentWpm.set(220);

    (service as any).evaluatePattern();
    expect(service.currentPattern()).toBe('DEEP_ACTIVE_READING');

    const label = service.patternLabel();
    expect(label.title).toBe('Optimal Deep Reading');
  });

  it('records active engagement when user adds notes or highlights', () => {
    service.startSession(1, 'Dynamic Programming Memoization', 'Word '.repeat(600));
    expect(service.activePauseCount()).toBe(0);

    service.notifyNoteRecorded();
    expect(service.activePauseCount()).toBe(1);

    service.updateArticleNotes('Key invariant: memo[i][j] caches optimal subproblem state.');
    expect(service.articleNotes()).toContain('memo[i][j]');
  });

  it('starts and manages reading focus rest timer', () => {
    service.startBreakTimer(180);
    expect(service.breakTimerActive()).toBe(true);
    expect(service.breakTimerSeconds()).toBe(180);

    service.cancelBreakTimer();
    expect(service.breakTimerActive()).toBe(false);
  });
});
