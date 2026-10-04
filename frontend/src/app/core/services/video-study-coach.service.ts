import { Injectable, computed, inject, signal } from '@angular/core';
import {
  FaceBox,
  GestureMotivation,
  PauseEvent,
  PauseReason,
  StudyCoachSettings,
  StudyCoachingRecommendation,
  StudyHabitMetrics,
  StudyPatternType,
  UserGestureType,
} from '../models/video-study-coach.models';
import { TopicQuizService } from './topic-quiz.service';
import { OpenCvGestureService } from './opencv-gesture.service';
import { AuthStore } from './auth.store';

const SETTINGS_KEY = 'peerdsa_video_coach_settings_v1';

@Injectable({ providedIn: 'root' })
export class VideoStudyCoachService {
  private readonly quiz = inject(TopicQuizService);
  protected readonly openCvService = inject(OpenCvGestureService);
  private readonly auth = inject(AuthStore, { optional: true });

  // --- Persistent Settings ---
  private readonly settingsSignal = signal<StudyCoachSettings>(this.loadSettings());
  readonly settings = this.settingsSignal.asReadonly();

  // --- Real-time Playback & Observation State ---
  private iframeElement: HTMLIFrameElement | null = null;
  private ytPlayer: any = null;
  readonly isPlaying = signal<boolean>(false);
  readonly isPaused = signal<boolean>(false);
  readonly isAway = signal<boolean>(false);
  readonly awayReason = signal<PauseReason | null>(null);
  readonly currentPlaybackSpeed = signal<number>(1);
  readonly currentVideoId = signal<string>('');
  readonly currentVideoTitle = signal<string>('');
  readonly currentVideoCategory = signal<string>('');

  // --- Study Habit Observation Metrics ---
  readonly totalWatchSeconds = signal<number>(0);
  readonly totalPauseSeconds = signal<number>(0);
  readonly continuousWatchSeconds = signal<number>(0);
  readonly maxContinuousStreakSeconds = signal<number>(0);
  readonly pauseCount = signal<number>(0);
  readonly activePauseCount = signal<number>(0);
  readonly frequentPauseStreak = signal<number>(0);
  readonly currentPattern = signal<StudyPatternType>('CALIBRATING');
  readonly currentPauseDurationSeconds = signal<number>(0);

  // --- Camera Presence & Gesture Guard ---
  readonly cameraActive = signal<boolean>(false);
  readonly faceDetected = signal<boolean>(true);
  readonly currentFaceBox = signal<FaceBox | null>(null);
  readonly detectedGesture = signal<UserGestureType>('none');
  readonly isGestureControlActive = signal<boolean>(true);
  readonly pendingGestureAction = signal<{
    gesture: UserGestureType;
    action: 'pause' | 'resume';
    secondsRemaining: number;
  } | null>(null);
  readonly autoRewindOnReturn = signal<boolean>(true);
  readonly mediaStreamSignal = signal<MediaStream | null>(null);
  readonly isOpenCvActive = computed(() => this.openCvService.isOpenCvLoaded());

  // --- Personalised Gesture Motivations ---
  readonly latestMotivation = signal<GestureMotivation | null>(null);
  readonly gestureMotivationHistory = signal<GestureMotivation[]>([]);
  private motivationTimer: any = null;

  private mediaStream: MediaStream | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private hiddenCanvas: HTMLCanvasElement | null = null;
  private nativeFaceDetector: any = null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private motionlessFrames = 0;
  private presenceCheckInterval: any = null;
  private absenceCheckCount = 0;
  private presenceReturnCheckCount = 0;
  private presenceTickCount = 0;
  private pendingGestureTimer: any = null;

  // --- Break Timer (Pomodoro) ---
  readonly breakTimerSeconds = signal<number>(0);
  readonly breakTimerActive = signal<boolean>(false);
  readonly breakTimerInitial = signal<number>(300);

  // --- Event & Pause History ---
  private currentPauseEvent: PauseEvent | null = null;
  private readonly pausesSignal = signal<PauseEvent[]>([]);
  readonly pauses = this.pausesSignal.asReadonly();

  // --- Interval Timers ---
  private secondInterval: any = null;
  private lastPauseTimestamp = 0;

  // --- Window Event Handlers ---
  private readonly visibilityListener = () => this.handleVisibilityChange();
  private readonly blurListener = () => this.handleWindowBlur();
  private readonly focusListener = () => this.handleWindowFocus();
  private readonly messageListener = (event: MessageEvent) => this.handleIFrameMessage(event);

  // --- Toast / Notification Alert ---
  readonly activeToast = signal<{ message: string; type: 'info' | 'warning' | 'success'; icon: string } | null>(null);

  // --- Computed Metrics & Pedagogical Feedback ---
  readonly formattedWatchTime = computed(() => this.formatSeconds(this.totalWatchSeconds()));
  readonly formattedPauseTime = computed(() => this.formatSeconds(this.totalPauseSeconds()));
  readonly formattedContinuousWatch = computed(() => this.formatSeconds(this.continuousWatchSeconds()));
  readonly formattedBreakTimer = computed(() => this.formatSeconds(this.breakTimerSeconds()));

  readonly activeLearningIndex = computed<number>(() => {
    const watchSec = this.totalWatchSeconds();
    const pauseSec = this.totalPauseSeconds();
    const streak = this.continuousWatchSeconds();
    const pauses = this.pauseCount();
    const notesCount = this.activePauseCount();

    if (watchSec < 60) return 75; // Initial baseline

    let score = 70;

    // Bonus for taking deliberate notes during/after pauses
    score += Math.min(18, notesCount * 6);

    // Balanced ratio bonus (15% to 35% pause time relative to watch time is ideal for deep processing)
    const totalTime = watchSec + pauseSec;
    const pauseRatio = pauseSec / (totalTime || 1);
    if (pauseRatio >= 0.12 && pauseRatio <= 0.35) {
      score += 12;
    } else if (pauseRatio > 0.6) {
      score -= 10; // Too much idle/pause
    }

    // Penalty for excessive passive bingeing without pause
    if (streak > 900) {
      // > 15 mins without a pause
      score -= Math.min(25, Math.floor((streak - 900) / 120) * 5);
    }

    // Penalty for erratic micro-pauses
    if (this.frequentPauseStreak() >= 3) {
      score -= 8;
    }

    return Math.max(25, Math.min(98, Math.round(score)));
  });

  readonly patternLabel = computed<{ title: string; subtitle: string; badgeClass: string; icon: string }>(() => {
    switch (this.currentPattern()) {
      case 'PASSIVE_BINGE':
        return {
          title: 'Passive Binge Warning',
          subtitle: 'Watching continuously for >12 min without pausing to code or synthesize.',
          badgeClass: 'badge-warning',
          icon: '⚠️',
        };
      case 'COGNITIVE_OVERLOAD':
        return {
          title: 'High Cognitive Friction',
          subtitle: 'Frequent stuttered pauses detected. Dense algorithmic concepts.',
          badgeClass: 'badge-info',
          icon: '🧠',
        };
      case 'OPTIMAL_ACTIVE':
        return {
          title: 'Optimal Active Learning',
          subtitle: 'Healthy rhythm of chunked viewing and reflective synthesis.',
          badgeClass: 'badge-success',
          icon: '🎯',
        };
      case 'EXTENDED_PAUSE':
        return {
          title: 'Extended Study Break',
          subtitle: 'Video paused for an extended period. Ready to resume or rest.',
          badgeClass: 'badge-secondary',
          icon: '☕',
        };
      case 'CALIBRATING':
      default:
        return {
          title: 'Observing Study Rhythm',
          subtitle: 'Calibrating your focus continuity and algorithmic intake.',
          badgeClass: 'badge-neutral',
          icon: '📊',
        };
    }
  });

  readonly coachingRecommendations = computed<StudyCoachingRecommendation[]>(() => {
    const list: StudyCoachingRecommendation[] = [];
    const pattern = this.currentPattern();
    const streakMin = Math.floor(this.continuousWatchSeconds() / 60);

    if (pattern === 'PASSIVE_BINGE') {
      list.push({
        id: 'pause-and-predict',
        title: `Pause & Predict Technique (${streakMin}m continuous)`,
        description:
          'Continuous passive viewing creates the "illusion of competence". Pause before the instructor writes the code, sketch the state variables on paper, and predict the next step!',
        badge: 'Critical Retention',
        category: 'retention',
        actionText: '⏸️ Take 60s Active Pause',
        actionKey: 'take_pause',
      });
      list.push({
        id: 'feynman-check',
        title: 'Feynman 1-Sentence Test',
        description:
          'Explain in one sentence why the brute-force approach fails and what invariant this optimal algorithm maintains.',
        badge: 'Mental Model',
        category: 'cognitive_load',
        actionText: '📝 Insert Prompt to Notes',
        actionKey: 'insert_feynman',
      });
    } else if (pattern === 'COGNITIVE_OVERLOAD') {
      list.push({
        id: 'slow-down-rate',
        title: 'Reduce Playback Speed to 0.75x',
        description:
          'Dense pointer manipulation, tree recursion, or DP transitions require extra working memory. Slow down to digest each state transition without feeling rushed.',
        badge: 'Cognitive Relief',
        category: 'pacing',
        actionText: '🐢 Switch to 0.75x Speed',
        actionKey: 'slow_speed',
      });
      list.push({
        id: 'trace-scratchpad',
        title: 'Trace Invariants on Paper',
        description:
          'Instead of rewinding repeatedly, pause and draw the call stack or array pointers for a small 3-element test case.',
        badge: 'Active Processing',
        category: 'cognitive_load',
        actionText: '📝 Open Notes Trace',
        actionKey: 'open_notes',
      });
    } else if (pattern === 'OPTIMAL_ACTIVE') {
      list.push({
        id: 'spaced-synthesis',
        title: 'Great Study Rhythm!',
        description:
          'Your active pauses and synthesis intervals align with deliberate practice research. This ensures high recall during live interview pressure.',
        badge: 'Top Habit',
        category: 'retention',
      });
      list.push({
        id: 'edge-case-audit',
        title: 'Edge Case Formulation',
        description:
          'Jot down at least 3 edge cases (e.g. empty array, single node, duplicates, integer overflow) before continuing.',
        badge: 'Interview Ready',
        category: 'retention',
        actionText: '📝 Add Edge Cases Note',
        actionKey: 'insert_edge_cases',
      });
    } else if (pattern === 'EXTENDED_PAUSE') {
      list.push({
        id: 'pomodoro-break',
        title: 'Take a Structured 5-Minute Break',
        description:
          'Step away from the screen, hydrate, and relax your eyes. Structured breaks boost subsequent problem-solving speed.',
        badge: 'Recovery',
        category: 'break',
        actionText: '⏱️ Start 5-Min Rest Timer',
        actionKey: 'start_pomodoro',
      });
    } else {
      list.push({
        id: 'active-baseline',
        title: 'Deliberate Study Mode Active',
        description:
          'PeerDSA Study Coach is tracking your continuous viewing vs pause intervals to give you personalized learning feedback.',
        badge: 'AI Coach',
        category: 'pacing',
      });
    }

    return list;
  });

  constructor() {
    this.startSecondTicker();
    this.quiz.onQuizCompleted = (isCorrect, boost) => {
      this.activePauseCount.update((c) => c + 1);
      this.showToast(
        isCorrect ? `🎯 Concept quiz passed! +${boost}% Retention Boost.` : `💡 Concept reviewed! Keep practicing.`,
        'success',
        '🧠'
      );
      this.evaluateStudyPattern();
    };
  }

  // --- Attach & Detach Player ---

  setVideoMetadata(videoId: string, title: string, category = ''): void {
    this.currentVideoId.set(videoId);
    this.currentVideoTitle.set(title);
    this.currentVideoCategory.set(category);
  }

  attachPlayer(iframe: HTMLIFrameElement, videoId = '', title = '', category = ''): void {
    this.iframeElement = iframe;
    if (videoId) {
      this.setVideoMetadata(videoId, title, category);
    }
    this.attachWindowListeners();
    this.startSecondTicker();
    this.loadYouTubeIframeApi();

    // Attach direct YT.Player if YouTube iframe API is available
    if (typeof window !== 'undefined' && (window as any).YT && (window as any).YT.Player) {
      try {
        this.ytPlayer = new (window as any).YT.Player(iframe, {
          events: {
            onStateChange: (event: any) => {
              const state = event.data;
              if (state === 1) this.handlePlayDetected();
              else if (state === 2) this.handlePauseDetected('USER_PAUSE');
              else if (state === 0) this.handleEndedDetected();
            },
          },
        });
      } catch {}
    }

    // Send listening command and event listeners to YouTube embed for bidirectional postMessage
    const sendHandshake = () => {
      try {
        if (this.iframeElement?.contentWindow) {
          this.iframeElement.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
          this.sendIFrameCommand('addEventListener', ['onStateChange']);
          this.sendIFrameCommand('addEventListener', ['infoDelivery']);
        }
      } catch {}
    };
    sendHandshake();
    setTimeout(sendHandshake, 400);
    setTimeout(sendHandshake, 1200);

    // If camera presence is enabled in settings, start camera
    if (this.settings().enableCameraPresence && !this.cameraActive()) {
      this.startCameraPresence();
    }
  }

  private loadYouTubeIframeApi(): void {
    if (typeof window === 'undefined') return;
    if ((window as any).YT && (window as any).YT.Player) return;
    if (document.getElementById('yt-iframe-api-tag')) return;

    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api-tag';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  detachPlayer(): void {
    if (this.secondInterval) {
      clearInterval(this.secondInterval);
      this.secondInterval = null;
    }
    this.iframeElement = null;
    this.ytPlayer = null;
    this.removeWindowListeners();
    this.stopCameraPresence();
  }

  resetSession(): void {
    this.totalWatchSeconds.set(0);
    this.totalPauseSeconds.set(0);
    this.continuousWatchSeconds.set(0);
    this.maxContinuousStreakSeconds.set(0);
    this.pauseCount.set(0);
    this.activePauseCount.set(0);
    this.frequentPauseStreak.set(0);
    this.currentPauseDurationSeconds.set(0);
    this.currentPattern.set('CALIBRATING');
    this.pausesSignal.set([]);
    this.isAway.set(false);
    this.awayReason.set(null);
  }

  // --- YouTube IFrame Commands ---

  pauseVideo(reason: PauseReason = 'USER_PAUSE'): void {
    try {
      if (this.ytPlayer?.pauseVideo) {
        this.ytPlayer.pauseVideo();
      }
    } catch {}
    this.sendIFrameCommand('pauseVideo');
    // Burst-fire to handle YouTube iframe API latency / partial load states
    setTimeout(() => this.sendIFrameCommand('pauseVideo'), 80);
    setTimeout(() => this.sendIFrameCommand('pauseVideo'), 280);
    this.handlePauseDetected(reason);
  }

  playVideo(): void {
    try {
      if (this.ytPlayer?.playVideo) {
        this.ytPlayer.playVideo();
      }
    } catch {}
    this.sendIFrameCommand('playVideo');
    setTimeout(() => this.sendIFrameCommand('playVideo'), 80);
    this.handlePlayDetected();
  }

  setPlaybackSpeed(speed: number): void {
    this.currentPlaybackSpeed.set(speed);
    try {
      if (this.ytPlayer?.setPlaybackRate) {
        this.ytPlayer.setPlaybackRate(speed);
      }
    } catch {}
    this.sendIFrameCommand('setPlaybackRate', [speed]);
    this.showToast(`Playback speed set to ${speed}x`, 'info', '⏱️');
  }

  private sendIFrameCommand(func: string, args: any[] = []): void {
    if (!this.iframeElement?.contentWindow) return;
    try {
      // Send both arg-forms: empty string (older YT players) and empty array (newer)
      this.iframeElement.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: args.length > 0 ? args : '' }),
        '*'
      );
      this.iframeElement.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: args.length > 0 ? args : [] }),
        '*'
      );
    } catch (e) {
      console.warn('Failed to postMessage to YouTube iframe:', e);
    }
  }

  // --- Inbound YouTube Player Messages ---

  private handleIFrameMessage(event: MessageEvent): void {
    if (!event.data) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      // Handle onStateChange: 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
      if (data?.event === 'onStateChange') {
        const state = data.info?.playerState !== undefined ? data.info.playerState : data.info;
        if (state === 1 || state === '1' || state === 'playing') {
          this.handlePlayDetected();
        } else if (state === 2 || state === '2' || state === 'paused') {
          this.handlePauseDetected('USER_PAUSE');
        } else if (state === 0 || state === '0' || state === 'ended') {
          this.handleEndedDetected();
        }
      }

      // Handle infoDelivery or initialDelivery
      if ((data?.event === 'infoDelivery' || data?.event === 'initialDelivery') && data.info) {
        const ps = data.info.playerState;
        if (ps === 1 || ps === '1' || ps === 'playing') {
          if (!this.isPlaying()) {
            this.handlePlayDetected();
          }
        } else if (ps === 2 || ps === '2' || ps === 'paused') {
          if (!this.isPaused()) {
            this.handlePauseDetected('USER_PAUSE');
          }
        }
      }
    } catch {}
  }

  // --- Observation Engine Logic ---

  private handlePlayDetected(): void {
    this.isPlaying.set(true);
    this.isPaused.set(false);
    this.isAway.set(false);
    this.awayReason.set(null);

    // Finalize current pause event if any
    if (this.currentPauseEvent) {
      this.currentPauseEvent.endedAt = Date.now();
      this.currentPauseEvent.durationSeconds = this.currentPauseDurationSeconds();
      this.pausesSignal.update((list) => [this.currentPauseEvent!, ...list.slice(0, 19)]);
      this.currentPauseEvent = null;
    }
    this.currentPauseDurationSeconds.set(0);

    this.evaluateStudyPattern();
  }

  private handlePauseDetected(reason: PauseReason): void {
    if (this.isPaused()) return;

    this.isPlaying.set(false);
    this.isPaused.set(true);

    const now = Date.now();
    const timeSinceLastPause = (now - this.lastPauseTimestamp) / 1000;
    this.lastPauseTimestamp = now;

    // Check for rapid stuttered pauses (<90s apart)
    if (timeSinceLastPause < 90 && this.pauseCount() > 0) {
      this.frequentPauseStreak.update((s) => s + 1);
    } else {
      this.frequentPauseStreak.set(1);
    }

    this.pauseCount.update((c) => c + 1);
    this.continuousWatchSeconds.set(0);
    this.currentPauseDurationSeconds.set(0);

    this.currentPauseEvent = {
      id: 'pause_' + now,
      startedAt: now,
      durationSeconds: 0,
      reason,
      notesRecorded: false,
    };

    this.evaluateStudyPattern();
  }

  private handleEndedDetected(): void {
    this.isPlaying.set(false);
    this.isPaused.set(true);
    this.showToast('Tutorial complete! Time to test your code in the editor.', 'success', '🎉');
  }

  notifyNoteRecorded(): void {
    // If the user recorded notes during or immediately following a pause, mark active learning
    if (this.isPaused() && this.currentPauseEvent) {
      if (!this.currentPauseEvent.notesRecorded) {
        this.currentPauseEvent.notesRecorded = true;
        this.activePauseCount.update((c) => c + 1);
        this.showToast('Great active study habit! Concept synthesized in notes.', 'success', '📝');
      }
    } else {
      this.activePauseCount.update((c) => c + 1);
    }
    this.evaluateStudyPattern();
  }

  // --- Pattern Evaluation ---

  private evaluateStudyPattern(): void {
    const watchSec = this.totalWatchSeconds();
    const streak = this.continuousWatchSeconds();
    const pauseDur = this.currentPauseDurationSeconds();
    const freqPauses = this.frequentPauseStreak();

    if (watchSec < 90) {
      this.currentPattern.set('CALIBRATING');
      return;
    }

    // 1. Prolonged Pause
    if (this.isPaused() && pauseDur > 240) {
      this.currentPattern.set('EXTENDED_PAUSE');
      return;
    }

    // 2. Passive Bingeing: watching continuously for > 12 mins (720s) with 0 pauses
    if (this.isPlaying() && streak >= 720) {
      this.currentPattern.set('PASSIVE_BINGE');
      return;
    }

    // 3. Cognitive Overload / Frequent rapid pauses
    if (freqPauses >= 3) {
      this.currentPattern.set('COGNITIVE_OVERLOAD');
      return;
    }

    // 4. Optimal Active Learning
    if (this.pauseCount() >= 1 && this.activePauseCount() >= 1 && streak < 600) {
      this.currentPattern.set('OPTIMAL_ACTIVE');
      return;
    }

    if (streak < 480) {
      this.currentPattern.set('OPTIMAL_ACTIVE');
    } else {
      this.currentPattern.set('CALIBRATING');
    }
  }

  // --- 1-Second Ticker ---

  private startSecondTicker(): void {
    if (this.secondInterval) clearInterval(this.secondInterval);

    this.secondInterval = setInterval(() => {
      if (this.isPlaying()) {
        this.totalWatchSeconds.update((s) => s + 1);
        this.continuousWatchSeconds.update((s) => {
          const next = s + 1;
          if (next > this.maxContinuousStreakSeconds()) {
            this.maxContinuousStreakSeconds.set(next);
          }
          // Periodic alert if passive bingeing reaches 15 mins
          if (next === 900) {
            this.showToast('15 min continuous watch reached — pause and try predicting next steps!', 'warning', '⚠️');
          }
          return next;
        });
        this.evaluateStudyPattern();

        if (this.currentVideoId()) {
          this.quiz.checkVideoTrigger(
            this.currentVideoId(),
            this.currentVideoTitle(),
            this.currentVideoCategory(),
            this.totalWatchSeconds(),
            this.continuousWatchSeconds()
          );
        }
      } else if (this.isPaused()) {
        this.totalPauseSeconds.update((s) => s + 1);
        this.currentPauseDurationSeconds.update((s) => s + 1);
        this.evaluateStudyPattern();
      }

      // Pomodoro break ticker
      if (this.breakTimerActive()) {
        this.breakTimerSeconds.update((sec) => {
          if (sec <= 1) {
            this.breakTimerActive.set(false);
            this.playChime();
            this.showToast('Pomodoro break complete! Ready to dive back in.', 'success', '🔔');
            return 0;
          }
          return sec - 1;
        });
      }
    }, 1000);
  }

  // --- Away Detection (Tab Switch / Window Blur) ---

  private attachWindowListeners(): void {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityListener);
      window.addEventListener('blur', this.blurListener);
      window.addEventListener('focus', this.focusListener);
      window.addEventListener('message', this.messageListener);
    }
  }

  private removeWindowListeners(): void {
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      window.removeEventListener('blur', this.blurListener);
      window.removeEventListener('focus', this.focusListener);
      window.removeEventListener('message', this.messageListener);
    }
  }

  private handleVisibilityChange(): void {
    if (!this.settings().autoPauseOnAway) return;

    if (document.hidden) {
      if (!this.isAway() && (this.isPlaying() || !this.isPaused() || !!this.currentVideoId())) {
        this.triggerAwayPause('AWAY_TAB_SWITCH');
      }
    } else {
      this.handleReturnFromAway();
    }
  }

  private handleWindowBlur(): void {
    if (!this.settings().autoPauseOnAway) return;

    // Only pause on blur if tab switch didn't already trigger it and we are actively watching
    if (!this.isAway() && (this.isPlaying() || !this.isPaused() || !!this.currentVideoId())) {
      this.triggerAwayPause('AWAY_TAB_SWITCH');
    }
  }

  private handleWindowFocus(): void {
    if (this.isAway() && !document.hidden) {
      this.handleReturnFromAway();
    }
  }

  triggerAwayPause(reason: PauseReason): void {
    this.isAway.set(true);
    this.awayReason.set(reason);
    this.pauseVideo(reason);

    if (this.settings().soundAlertOnAutoPause) {
      this.playChime();
    }

    const reasonText =
      reason === 'AWAY_PRESENCE_LOST'
        ? 'You stepped away from the screen'
        : 'You switched away from the study window';

    this.showToast(`⏸️ Video auto-paused: ${reasonText}. Your spot is saved!`, 'info', '🛡️');
  }

  handleReturnFromAway(): void {
    if (!this.isAway()) return;

    if (this.awayReason() === 'AWAY_PRESENCE_LOST' || this.settings().autoResumeOnReturn) {
      this.resumeFromAway();
    } else {
      this.showToast('Welcome back! Click Resume or hit Spacebar to continue studying.', 'info', '👋');
    }
  }

  resumeFromAway(rewind = true): void {
    const wasPresenceLost = this.awayReason() === 'AWAY_PRESENCE_LOST';
    this.isAway.set(false);
    this.awayReason.set(null);
    if (rewind && wasPresenceLost && this.autoRewindOnReturn()) {
      this.rewindSeconds(3);
      this.showToast('Welcome back! Resumed with 3s rewind so you don\'t miss a beat.', 'success', '⏪');
    } else {
      this.showToast('Resuming playback. Stay focused!', 'success', '▶');
    }
    this.playVideo();
  }

  rewindSeconds(seconds = 3): void {
    try {
      if (this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function' && typeof this.ytPlayer.seekTo === 'function') {
        const cur = this.ytPlayer.getCurrentTime();
        const target = Math.max(0, cur - seconds);
        this.ytPlayer.seekTo(target, true);
        return;
      }
    } catch {}
    this.sendIFrameCommand('seekTo', [0, false]);
  }

  toggleAutoRewindOnReturn(): void {
    this.autoRewindOnReturn.update((v) => !v);
    this.showToast(
      this.autoRewindOnReturn() ? '⏪ 3s Auto-Rewind on return enabled' : 'Auto-Rewind disabled',
      'info',
      '⏪'
    );
  }

  // --- Smart Client-Side Camera Presence & Gesture Guard ---

  async startCameraPresence(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.showToast('Camera not supported in this browser.', 'warning', '📷');
        return false;
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });

      this.mediaStreamSignal.set(this.mediaStream);

      // Trigger OpenCV background initialization
      this.openCvService.loadOpenCv().catch(() => {});

      this.hiddenVideo = document.createElement('video');
      this.hiddenVideo.autoplay = true;
      this.hiddenVideo.muted = true;
      this.hiddenVideo.playsInline = true;
      this.hiddenVideo.setAttribute('playsinline', '');
      this.hiddenVideo.setAttribute('muted', '');
      this.hiddenVideo.style.cssText =
        'position:fixed;top:-9999px;left:-9999px;width:160px;height:120px;opacity:0.01;pointer-events:none;';

      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(this.hiddenVideo);
      }

      this.hiddenVideo.srcObject = this.mediaStream;

      // Wait for camera stream to produce frames
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Camera stream timeout')), 8000);
        const check = () => {
          if (this.hiddenVideo && this.hiddenVideo.videoWidth > 0 && this.hiddenVideo.readyState >= 2) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        this.hiddenVideo!.play().then(check).catch(reject);
      });

      this.hiddenCanvas = document.createElement('canvas');
      this.hiddenCanvas.width = 160;
      this.hiddenCanvas.height = 120;

      this.cameraActive.set(true);
      this.faceDetected.set(true);
      this.absenceCheckCount = 0;
      this.motionlessFrames = 0;
      this.prevFrameData = null;

      // Warmup: capture baseline frames
      await this.warmupCameraFrames();

      // Check presence and gestures at 200ms (5 FPS) for responsive gesture tracking (<300ms latency)
      this.presenceTickCount = 0;
      this.presenceCheckInterval = setInterval(() => this.checkCameraPresence(), 200);

      this.showToast('Smart Presence & Gesture Guard active. Auto-pauses when away and resumes on return!', 'success', '📷');
      return true;
    } catch (err) {
      console.warn('Camera presence denied or failed:', err);
      this.cameraActive.set(false);
      this.mediaStreamSignal.set(null);
      this.updateSettings({ enableCameraPresence: false });
      this.showToast('Camera permission denied. Tab auto-pause is still active.', 'warning', '📷');
      return false;
    }
  }

  /** Capture 2 baseline frames to seed prevFrameData before live detection starts */
  private async warmupCameraFrames(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await new Promise<void>((r) => setTimeout(r, 200));
      if (!this.hiddenVideo || !this.hiddenCanvas) break;
      const ctx = this.hiddenCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || this.hiddenVideo.videoWidth === 0) break;
      ctx.drawImage(this.hiddenVideo, 0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);
      const frame = ctx.getImageData(0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);
      const data = frame.data;
      const lumaArr = new Uint8ClampedArray(this.hiddenCanvas.width * this.hiddenCanvas.height);
      for (let j = 0; j < data.length; j += 4) {
        lumaArr[j / 4] = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
      }
      this.prevFrameData = lumaArr;
    }
  }

  stopCameraPresence(): void {
    if (this.presenceCheckInterval) {
      clearInterval(this.presenceCheckInterval);
      this.presenceCheckInterval = null;
    }
    this.presenceTickCount = 0;
    if (this.pendingGestureTimer) {
      clearTimeout(this.pendingGestureTimer);
      this.pendingGestureTimer = null;
    }
    this.pendingGestureAction.set(null);
    this.presenceReturnCheckCount = 0;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.mediaStreamSignal.set(null);
    if (this.hiddenVideo) {
      this.hiddenVideo.srcObject = null;
      if (this.hiddenVideo.parentNode) {
        this.hiddenVideo.parentNode.removeChild(this.hiddenVideo);
      }
      this.hiddenVideo = null;
    }
    this.hiddenCanvas = null;
    this.prevFrameData = null;
    this.nativeFaceDetector = null;
    this.motionlessFrames = 0;
    this.cameraActive.set(false);
    this.faceDetected.set(true);
    this.currentFaceBox.set(null);
    this.absenceCheckCount = 0;
    this.detectedGesture.set('none');
  }

  toggleCameraPresence(): void {
    const next = !this.settings().enableCameraPresence;
    this.updateSettings({ enableCameraPresence: next });
    if (next) {
      this.startCameraPresence();
    } else {
      this.stopCameraPresence();
      this.showToast('Camera Presence Guard disabled.', 'info', '📷');
    }
  }

  toggleGestureControl(): void {
    const next = !this.isGestureControlActive();
    this.isGestureControlActive.set(next);
    this.updateSettings({ enableGestureControl: next });
    this.showToast(next ? '✋ Gesture Control activated (Wave to pause/play)' : 'Gesture Control disabled.', 'info', '✋');
  }

  private async checkCameraPresence(): Promise<void> {
    if (!this.hiddenVideo || !this.hiddenCanvas || !this.cameraActive()) return;

    const ctx = this.hiddenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || this.hiddenVideo.videoWidth === 0 || this.hiddenVideo.readyState < 2) return;

    ctx.drawImage(this.hiddenVideo, 0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);

    // Run OpenCV / Native Spatial Computer Vision Analysis
    const cvResult = this.openCvService.analyzeFrame(this.hiddenCanvas);

    // If native Chrome/Edge FaceDetector API is available, merge face detection
    if (typeof (window as any).FaceDetector === 'function') {
      try {
        if (!this.nativeFaceDetector) {
          this.nativeFaceDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        }
        const faces: any[] = await this.nativeFaceDetector.detect(this.hiddenCanvas);
        if (Array.isArray(faces)) {
          if (faces.length > 0) {
            cvResult.isPresent = true;
            const f = faces[0].boundingBox;
            if (f) {
              cvResult.faceBox = { x: f.x, y: f.y, width: f.width, height: f.height };
            }
          } else if (faces.length === 0 && !cvResult.isPresent) {
            cvResult.isPresent = false;
          }
        }
      } catch {
        this.nativeFaceDetector = null;
      }
    }

    if (cvResult.faceBox) {
      this.currentFaceBox.set(cvResult.faceBox);
    }

    // Handle Gesture Recognition on every frame (5 FPS)
    if (cvResult.gesture !== 'none') {
      this.handleGestureAction(cvResult.gesture);
    }

    // Evaluate presence decision on a 1.0s cadence (every 5 ticks at 200ms = 1000ms)
    // Preserves the 2-3s continuous absence rule and 1.5-2s return rule
    this.presenceTickCount++;
    if (this.presenceTickCount % 5 === 0) {
      this.handlePresenceDecision(cvResult.isPresent);
    }
  }

  handleGestureAction(gesture: UserGestureType, immediate = false): void {
    if (!this.isGestureControlActive() || !this.settings().enableGestureControl) return;
    if (this.pendingGestureTimer) return; // already a pending gesture action

    this.detectedGesture.set(gesture);
    this.playChime();

    // 1. If user is away or video is paused, ANY recognized gesture resumes playback!
    if (this.isAway() || this.isPaused()) {
      const targetAction = 'resume';
      if (immediate) {
        this.executeGestureAction(gesture, targetAction);
        return;
      }

      this.pendingGestureAction.set({
        gesture,
        action: targetAction,
        secondsRemaining: 1.5,
      });

      const icon = gesture === 'WAVE' ? '👋' : (gesture === 'PALM' ? '✋' : (gesture === 'NOD' ? '🧠' : '👍'));
      this.showToast(`${icon} ${gesture} recognized — Resuming in 1.5s...`, 'info', icon);

      this.pendingGestureTimer = setTimeout(() => {
        this.executeGestureAction(gesture, targetAction);
        this.pendingGestureTimer = null;
        this.pendingGestureAction.set(null);
      }, 1500);
      return;
    }

    // 2. Video is actively playing:
    if (gesture === 'NOD' || gesture === 'THUMBS_UP') {
      // Comprehension Checkpoint!
      // Nodding along while watching locks the concept into memory (+5% Active Recall).
      // Executes immediately without interrupting video playback!
      this.executeGestureAction(gesture, 'checkpoint');
      return;
    }

    // 3. Hand gestures while playing: WAVE or PALM deliberate pause intent
    const targetAction = 'pause';
    if (immediate) {
      this.executeGestureAction(gesture, targetAction);
      return;
    }

    // Require 1.5s deliberate confirmation before pausing to avoid accidental triggers
    this.pendingGestureAction.set({
      gesture,
      action: targetAction,
      secondsRemaining: 1.5,
    });

    const icon = gesture === 'WAVE' ? '👋' : '✋';
    this.showToast(`${icon} ${gesture} recognized — Pausing in 1.5s...`, 'info', icon);

    this.pendingGestureTimer = setTimeout(() => {
      this.executeGestureAction(gesture, targetAction);
      this.pendingGestureTimer = null;
      this.pendingGestureAction.set(null);
    }, 1500);
  }

  cancelPendingGesture(): void {
    if (this.pendingGestureTimer) {
      clearTimeout(this.pendingGestureTimer);
      this.pendingGestureTimer = null;
    }
    this.pendingGestureAction.set(null);
    this.detectedGesture.set('none');
    this.showToast('Gesture action cancelled.', 'info', '✕');
  }

  private executeGestureAction(
    gesture: UserGestureType,
    targetAction: 'pause' | 'resume' | 'checkpoint'
  ): void {
    const motivation = this.generatePersonalizedMotivation(gesture, targetAction);
    this.latestMotivation.set(motivation);
    this.gestureMotivationHistory.update((h) => [motivation, ...h.slice(0, 9)]);

    if (this.motivationTimer) clearTimeout(this.motivationTimer);
    this.motivationTimer = setTimeout(() => {
      if (this.latestMotivation()?.id === motivation.id) {
        this.latestMotivation.set(null);
      }
    }, 7000);

    if (targetAction === 'checkpoint') {
      this.activePauseCount.update((c) => c + 1);
      this.evaluateStudyPattern();
      this.showToast(motivation.message, 'success', motivation.icon);
    } else if (gesture === 'WAVE') {
      if (targetAction === 'resume') {
        this.resumeFromAway();
        this.showToast(motivation.message, 'success', '👋');
      } else {
        this.pauseVideo('USER_PAUSE');
        this.showToast(motivation.message, 'info', '👋');
      }
    } else if (gesture === 'PALM') {
      if (targetAction === 'resume') {
        this.resumeFromAway();
        this.showToast(motivation.message, 'success', '✋');
      } else {
        this.pauseVideo('USER_PAUSE');
        this.showToast(motivation.message, 'info', '✋');
      }
    } else if (gesture === 'NOD' || gesture === 'THUMBS_UP') {
      if (targetAction === 'resume') {
        this.resumeFromAway();
        this.showToast(motivation.message, 'success', motivation.icon);
      } else {
        this.showToast(motivation.message, 'success', motivation.icon);
        this.activePauseCount.update((c) => c + 1);
        this.evaluateStudyPattern();
      }
    }

    setTimeout(() => {
      if (this.detectedGesture() === gesture) {
        this.detectedGesture.set('none');
      }
    }, 2000);
  }

  dismissLatestMotivation(): void {
    if (this.motivationTimer) {
      clearTimeout(this.motivationTimer);
      this.motivationTimer = null;
    }
    this.latestMotivation.set(null);
  }

  generatePersonalizedMotivation(
    gesture: UserGestureType,
    action: 'pause' | 'resume' | 'checkpoint' = 'checkpoint'
  ): GestureMotivation {
    const user = this.auth?.currentUser ? this.auth.currentUser() : null;
    const userName = user?.displayName || user?.username || 'Fellow Engineer';
    const topic = this.cleanTopicTitle(this.currentVideoTitle());
    const streak = user?.currentStreak || 0;
    const solved = user?.totalSolved || 0;
    const learningIndex = this.activeLearningIndex();
    const streakText = streak > 1 ? ` (${streak}-day streak)` : '';

    let gestureCategory: 'HAND' | 'HEAD' | 'AFFIRMATION' = 'HAND';
    let title = '';
    let message = '';
    let icon = '✨';
    let boostText = '';

    if (gesture === 'NOD') {
      gestureCategory = 'HEAD';
      icon = '🧠';
      boostText = '+5% Active Recall';
      title = `Concept Internalized, ${userName}!`;
      const nodMessages = [
        `That head nod proves the ${topic} intuition is clicking! Recognizing state transitions early is how top engineers ace interviews.`,
        `Neural pathways firing! You've grasped the core invariant for ${topic}, ${userName}. Keep this mental momentum alive!`,
        `Mastery in motion! That deliberate nod marks deep synthesis for ${topic}. Your retention index is up to ${learningIndex}%!`,
        `Brilliant focus, ${userName}${streakText}! Internalizing ${topic} step-by-step turns difficult problems into second nature.`,
      ];
      message = nodMessages[Math.floor(Math.random() * nodMessages.length)];
    } else if (gesture === 'PALM') {
      gestureCategory = 'HAND';
      icon = '✋';
      boostText = 'Deliberate Practice';
      title = `Mindful Reflection, ${userName}!`;
      const palmMessages = [
        `Elite problem-solvers pause before coding to formulate the edge cases. Great discipline pausing on ${topic}!`,
        `Active digestion mode engaged! Taking 30 seconds to trace ${topic} on paper beats 2 hours of passive watching.`,
        `Smart pause! What's the loop invariant or recursion base case for ${topic}? Capture your thoughts in notes before continuing.`,
        `Disciplined pacing, ${userName}! Pausing to synthesize ${topic} builds lasting recall under interview pressure.`,
      ];
      message = palmMessages[Math.floor(Math.random() * palmMessages.length)];
    } else if (gesture === 'WAVE') {
      gestureCategory = 'HAND';
      icon = '👋';
      if (action === 'resume') {
        boostText = 'Momentum Restored';
        title = `Ready to Conquer, ${userName}!`;
        const resumeMessages = [
          `Full focus mode engaged! Dive back into ${topic} and let's master the optimal approach.`,
          `Back to the grind! High energy for ${topic}. Let's see how the instructor proves time complexity.`,
          `Momentum restored, ${userName}${streakText}! Consistency in mastering ${topic} is key to cracking your dream software role.`,
          `Wave recognized — game on! Let's lock in the rest of this ${topic} pattern.`,
        ];
        message = resumeMessages[Math.floor(Math.random() * resumeMessages.length)];
      } else {
        boostText = 'Chunked Synthesis';
        title = `Structured Pause, ${userName}!`;
        const pauseMessages = [
          `Wave acknowledged! Pausing to give your working memory room to consolidate ${topic}.`,
          `Great study pacing, ${userName}! Chunking your study session on ${topic} into digestible intervals boosts retention by 40%.`,
          `Taking control of your learning! Use this pause to reflect on the trade-offs of ${topic}.`,
        ];
        message = pauseMessages[Math.floor(Math.random() * pauseMessages.length)];
      }
    } else if (gesture === 'THUMBS_UP') {
      gestureCategory = 'AFFIRMATION';
      icon = '👍';
      boostText = '+5% Retention Boost';
      title = `Confidence High, ${userName}!`;
      const thumbsMessages = [
        `Thumbs up to mastery! You've added another proven algorithmic pattern for ${topic} to your toolkit.`,
        `Confidence locked! ${topic} is becoming intuitive for you, ${userName}${solved > 0 ? ` (${solved} total solved)` : ''}!`,
        `High-yield study session! Keep that positive energy going into mastering ${topic}.`,
      ];
      message = thumbsMessages[Math.floor(Math.random() * thumbsMessages.length)];
    } else {
      gestureCategory = 'AFFIRMATION';
      icon = '🌟';
      title = `Great Focus, ${userName}!`;
      message = `Active gesture detected during ${topic}. Staying engaged accelerates your path to DSA mastery!`;
    }

    return {
      id: 'mot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      gesture,
      gestureCategory,
      title,
      message,
      icon,
      boostText,
      timestamp: Date.now(),
    };
  }

  private cleanTopicTitle(rawTitle: string): string {
    if (!rawTitle) return 'DSA';
    const keywords = [
      'Two Sum', 'Binary Search', 'Dynamic Programming', 'Graph', 'Tree', 'Trie',
      'Linked List', 'Backtracking', 'Sliding Window', 'Stack', 'Queue', 'Heap',
      'Sorting', 'Recursion', 'Greedy', 'Bit Manipulation', 'Segment Tree', 'System Design'
    ];
    for (const kw of keywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(rawTitle)) {
        return kw;
      }
    }
    const cleaned = rawTitle.replace(/[\[\(][^\]\)]*[\]\)]/g, '').replace(/LeetCode\s*#?\d+/gi, '').trim();
    const words = cleaned.split(/\s+/).slice(0, 4).join(' ');
    return words.length > 25 ? words.slice(0, 25) + '...' : words || 'DSA';
  }

  private handlePresenceDecision(isPresent: boolean): void {
    if (!isPresent) {
      this.absenceCheckCount++;
      this.presenceReturnCheckCount = 0; // reset return count if absence detected

      // If user is away for 2-3s continuously (3 consecutive checks at 1s = 2.5 - 3.0s), ONLY THEN pause
      if (this.absenceCheckCount >= 3) {
        this.faceDetected.set(false);
        this.currentFaceBox.set(null);
        if (!this.isAway() && !!this.currentVideoId()) {
          this.triggerAwayPause('AWAY_PRESENCE_LOST');
        }
      }
    } else {
      // User is present in frame: immediately reset continuous absence count
      this.absenceCheckCount = 0;
      this.motionlessFrames = 0;
      this.faceDetected.set(true);

      const wasAway = this.isAway() && this.awayReason() === 'AWAY_PRESENCE_LOST';

      if (wasAway) {
        // Require 1.5 to 2.0 seconds (2 consecutive confirmed checks) of continuous presence before resuming
        this.presenceReturnCheckCount++;
        if (this.presenceReturnCheckCount >= 2) {
          this.presenceReturnCheckCount = 0;
          this.resumeFromAway();
        } else if (this.presenceReturnCheckCount === 1) {
          this.showToast('👤 Face detected — resuming video in 1s...', 'info', '👁️');
        }
      } else {
        this.presenceReturnCheckCount = 0;
      }
    }
  }

  // --- Pomodoro Rest Timer ---

  startBreakTimer(seconds = 300): void {
    if (this.isPlaying()) {
      this.pauseVideo('BREAK_TIMER');
    }
    this.breakTimerInitial.set(seconds);
    this.breakTimerSeconds.set(seconds);
    this.breakTimerActive.set(true);
    this.showToast(`Starting ${Math.round(seconds / 60)}-minute focus break. Rest your eyes!`, 'info', '⏱️');
  }

  cancelBreakTimer(): void {
    this.breakTimerActive.set(false);
    this.breakTimerSeconds.set(0);
    this.showToast('Focus break ended. Ready to continue.', 'info', '▶');
  }

  // --- Settings Persistence ---

  private loadSettings(): StudyCoachSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...this.defaultSettings(), ...JSON.parse(raw) };
      }
    } catch {}
    return this.defaultSettings();
  }

  private defaultSettings(): StudyCoachSettings {
    return {
      autoPauseOnAway: true,
      enableCameraPresence: false,
      soundAlertOnAutoPause: true,
      autoResumeOnReturn: true,
      enableGestureControl: true,
    };
  }

  updateSettings(partial: Partial<StudyCoachSettings>): void {
    const updated = { ...this.settingsSignal(), ...partial };
    this.settingsSignal.set(updated);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {}
  }

  // --- Audio Chime ---

  private playChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch {}
  }

  // --- Toast UI Notifications ---

  showToast(message: string, type: 'info' | 'warning' | 'success', icon = '💡'): void {
    this.activeToast.set({ message, type, icon });
    setTimeout(() => {
      if (this.activeToast()?.message === message) {
        this.activeToast.set(null);
      }
    }, 4500);
  }

  dismissToast(): void {
    this.activeToast.set(null);
  }

  // --- Helpers ---

  private formatSeconds(sec: number): string {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
