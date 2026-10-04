import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoStudyCoachService } from './video-study-coach.service';

describe('VideoStudyCoachService', () => {
  let service: VideoStudyCoachService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [VideoStudyCoachService],
    });
    service = TestBed.inject(VideoStudyCoachService);
  });

  it('initializes with default settings and calibrating pattern', () => {
    expect(service.settings().autoPauseOnAway).toBe(true);
    expect(service.settings().enableCameraPresence).toBe(false);
    expect(service.isPlaying()).toBe(false);
    expect(service.isPaused()).toBe(false);
    expect(service.isAway()).toBe(false);
    expect(service.currentPattern()).toBe('CALIBRATING');
    expect(service.activeLearningIndex()).toBeGreaterThanOrEqual(70);
  });

  it('updates settings and persists to localStorage', () => {
    service.updateSettings({ autoResumeOnReturn: true, soundAlertOnAutoPause: false });
    expect(service.settings().autoResumeOnReturn).toBe(true);
    expect(service.settings().soundAlertOnAutoPause).toBe(false);

    const saved = JSON.parse(localStorage.getItem('peerdsa_video_coach_settings_v1') || '{}');
    expect(saved.autoResumeOnReturn).toBe(true);
  });

  it('detects play and pause transitions', () => {
    // Simulate YouTube onStateChange PLAYING (1)
    (service as any).handlePlayDetected();
    expect(service.isPlaying()).toBe(true);
    expect(service.isPaused()).toBe(false);

    // Simulate YouTube onStateChange PAUSED (2)
    (service as any).handlePauseDetected('USER_PAUSE');
    expect(service.isPlaying()).toBe(false);
    expect(service.isPaused()).toBe(true);
    expect(service.pauseCount()).toBe(1);
  });

  it('classifies PASSIVE_BINGE when watching continuously for over 12 minutes without pauses', () => {
    (service as any).handlePlayDetected();
    service.totalWatchSeconds.set(800);
    service.continuousWatchSeconds.set(750); // > 720 seconds (12.5 minutes)

    (service as any).evaluateStudyPattern();
    expect(service.currentPattern()).toBe('PASSIVE_BINGE');

    const recs = service.coachingRecommendations();
    expect(recs.some((r) => r.id === 'pause-and-predict')).toBe(true);
  });

  it('classifies COGNITIVE_OVERLOAD when frequent rapid pauses occur', () => {
    service.totalWatchSeconds.set(300);
    service.frequentPauseStreak.set(4);

    (service as any).evaluateStudyPattern();
    expect(service.currentPattern()).toBe('COGNITIVE_OVERLOAD');

    const recs = service.coachingRecommendations();
    expect(recs.some((r) => r.id === 'slow-down-rate')).toBe(true);
  });

  it('classifies OPTIMAL_ACTIVE when balanced pauses with notes are taken', () => {
    service.totalWatchSeconds.set(400);
    service.continuousWatchSeconds.set(200);
    service.pauseCount.set(2);
    service.activePauseCount.set(1);
    service.frequentPauseStreak.set(1);

    (service as any).evaluateStudyPattern();
    expect(service.currentPattern()).toBe('OPTIMAL_ACTIVE');

    const label = service.patternLabel();
    expect(label.title).toBe('Optimal Active Learning');
  });

  it('triggers away pause when user navigates away and autoPauseOnAway is enabled', () => {
    (service as any).handlePlayDetected();
    expect(service.isPlaying()).toBe(true);

    service.triggerAwayPause('AWAY_TAB_SWITCH');
    expect(service.isAway()).toBe(true);
    expect(service.awayReason()).toBe('AWAY_TAB_SWITCH');
    expect(service.isPlaying()).toBe(false);
    expect(service.isPaused()).toBe(true);
  });

  it('resumes playback from away when requested', () => {
    service.triggerAwayPause('AWAY_TAB_SWITCH');
    expect(service.isAway()).toBe(true);

    service.resumeFromAway();
    expect(service.isAway()).toBe(false);
    expect(service.awayReason()).toBeNull();
  });

  it('rewards notes recorded during pause with active recall score', () => {
    (service as any).handlePauseDetected('USER_PAUSE');
    expect(service.activePauseCount()).toBe(0);

    service.notifyNoteRecorded();
    expect(service.activePauseCount()).toBe(1);
  });

  it('starts and manages Pomodoro break timer', () => {
    (service as any).handlePlayDetected();
    service.startBreakTimer(180);

    expect(service.isPlaying()).toBe(false);
    expect(service.breakTimerActive()).toBe(true);
    expect(service.breakTimerSeconds()).toBe(180);

    service.cancelBreakTimer();
    expect(service.breakTimerActive()).toBe(false);
  });

  it('triggers away pause when camera presence confirms absence across consecutive checks', () => {
    (service as any).handlePlayDetected();
    service.setVideoMetadata('test-vid-123', 'Binary Trees');
    expect(service.isPlaying()).toBe(true);
    expect(service.isAway()).toBe(false);

    // 1st absence check - debouncing: not triggered yet
    (service as any).handlePresenceDecision(false);
    expect(service.faceDetected()).toBe(true);
    expect(service.isAway()).toBe(false);

    // 2nd consecutive absence check - confirms user is away from camera
    (service as any).handlePresenceDecision(false);
    expect(service.faceDetected()).toBe(false);
    expect(service.isAway()).toBe(true);
    expect(service.awayReason()).toBe('AWAY_PRESENCE_LOST');
    expect(service.isPlaying()).toBe(false);

    // User returns in front of camera
    (service as any).handlePresenceDecision(true);
    expect(service.faceDetected()).toBe(true);
  });
});
