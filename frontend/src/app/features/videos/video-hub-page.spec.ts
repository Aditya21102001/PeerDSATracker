import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VideoHubPage } from './video-hub-page';
import { VideoStudyCoachService } from '../../core/services/video-study-coach.service';

describe('VideoHubPage with VideoStudyCoach', () => {
  let fixture: ComponentFixture<VideoHubPage>;
  let component: VideoHubPage;
  let coach: VideoStudyCoachService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [VideoHubPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        VideoStudyCoachService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoHubPage);
    component = fixture.componentInstance;
    coach = TestBed.inject(VideoStudyCoachService);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates component and initializes VideoStudyCoach', () => {
    expect(component).toBeTruthy();
    expect(coach.settings().autoPauseOnAway).toBe(true);
    expect(coach.activeLearningIndex()).toBeGreaterThanOrEqual(70);
  });

  it('switches to watch mode and renders Study HUD bar and coach controls', () => {
    // Switch to watch view
    (component as any).viewMode.set('watch');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const hudBar = compiled.querySelector('#vh-study-hud-bar');
    expect(hudBar).toBeTruthy();

    const statusBadge = compiled.querySelector('#vh-hud-status-badge');
    expect(statusBadge).toBeTruthy();
    expect(statusBadge?.textContent).toContain('Observing Study Rhythm');

    const awayToggle = compiled.querySelector('#vh-hud-away-guard-toggle');
    expect(awayToggle).toBeTruthy();
    expect(awayToggle?.textContent).toContain('Away Guard: ON');
  });

  it('displays away overlay when user is away and allows resuming playback', () => {
    (component as any).viewMode.set('watch');
    fixture.detectChanges();

    coach.triggerAwayPause('AWAY_TAB_SWITCH');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const awayOverlay = compiled.querySelector('#vh-away-overlay');
    expect(awayOverlay).toBeTruthy();
    expect(awayOverlay?.textContent).toContain('Video Auto-Paused: You Were Away');

    const resumeBtn = compiled.querySelector('#vh-away-resume-btn') as HTMLButtonElement;
    expect(resumeBtn).toBeTruthy();
    resumeBtn.click();
    fixture.detectChanges();

    expect(coach.isAway()).toBe(false);
  });

  it('switches to coach tab and presents diagnostic metrics and study recommendations', () => {
    (component as any).viewMode.set('watch');
    (component as any).activeTab.set('coach');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const coachPanel = compiled.querySelector('#vh-coach-panel');
    expect(coachPanel).toBeTruthy();
    expect(coachPanel?.textContent).toContain('Active Learning Index');
    expect(coachPanel?.textContent).toContain('How You Should Study This Topic to Improve');

    const pomodoroCard = compiled.querySelector('#vh-pomodoro-card');
    expect(pomodoroCard).toBeTruthy();
  });

  it('applies coach action to insert Feynman recall template into notes', () => {
    (component as any).viewMode.set('watch');
    fixture.detectChanges();

    (component as any).applyCoachAction('insert_feynman');
    fixture.detectChanges();

    expect((component as any).service.currentNotes()).toContain('Feynman Technique Active Recall');
    expect((component as any).activeTab()).toBe('notes');
  });

  it('applies coach action to insert Edge Cases checklist into notes', () => {
    (component as any).viewMode.set('watch');
    fixture.detectChanges();

    (component as any).applyCoachAction('insert_edge_cases');
    fixture.detectChanges();

    expect((component as any).service.currentNotes()).toContain('Edge Cases Audit');
    expect((component as any).activeTab()).toBe('notes');
  });

  it('toggles away guard setting from HUD button', () => {
    expect(coach.settings().autoPauseOnAway).toBe(true);
    (component as any).toggleAutoPauseAway();
    expect(coach.settings().autoPauseOnAway).toBe(false);

    (component as any).toggleAutoPauseAway();
    expect(coach.settings().autoPauseOnAway).toBe(true);
  });

  it('renders Quick Quiz button in HUD and opens topic quiz modal', () => {
    (component as any).viewMode.set('watch');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const quizBtn = compiled.querySelector('#vh-hud-quiz-btn') as HTMLButtonElement;
    expect(quizBtn).toBeTruthy();
    expect(quizBtn?.textContent).toContain('Quick Quiz');

    quizBtn.click();
    fixture.detectChanges();

    const modal = compiled.querySelector('.quiz-modal-backdrop');
    expect(modal).toBeTruthy();
    expect((component as any).quiz.isOpen()).toBe(true);
  });

  it('saves quiz takeaway directly into video study notes', () => {
    (component as any).handleQuizTakeaway('\n\n### 💡 Checkpoint Takeaway: Test\n- Key Takeaway: Always check edge cases.');
    fixture.detectChanges();

    expect((component as any).service.currentNotes()).toContain('Checkpoint Takeaway');
    expect((component as any).service.currentNotes()).toContain('Always check edge cases.');
  });

  it('inserts quick recall concept anchors directly into notes when paused', () => {
    (component as any).viewMode.set('watch');
    fixture.detectChanges();

    (component as any).quickInsertNote('⚠️ Edge Case: empty array');
    fixture.detectChanges();

    expect((component as any).service.currentNotes()).toContain('⚠️ Edge Case: empty array');
    expect((component as any).activeTab()).toBe('notes');
    expect(coach.activePauseCount()).toBeGreaterThan(0);
  });

  it('toggles gesture guide drawer in camera PiP', () => {
    expect((component as any).showGestureGuide()).toBe(false);
    (component as any).toggleGestureGuide();
    expect((component as any).showGestureGuide()).toBe(true);
    (component as any).toggleGestureGuide();
    expect((component as any).showGestureGuide()).toBe(false);
  });

  it('renders personalized gesture motivation card when latestMotivation is set', () => {
    (component as any).viewMode.set('watch');
    coach.latestMotivation.set({
      id: 'mot-1',
      gesture: 'NOD',
      gestureCategory: 'HEAD',
      title: 'Concept Internalized, Aditya!',
      message: 'Great intuition on Dynamic Programming!',
      icon: '🧠',
      boostText: '+5% Active Recall',
      timestamp: Date.now(),
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const banner = compiled.querySelector('#vh-motivation-banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('Concept Internalized');
    expect(banner?.textContent).toContain('HEAD GESTURE');

    const dismissBtn = compiled.querySelector('#vh-btn-dismiss-motivation') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    dismissBtn.click();
    fixture.detectChanges();
    expect(coach.latestMotivation()).toBeNull();
  });
});
