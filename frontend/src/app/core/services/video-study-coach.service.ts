import { Injectable, computed, inject, signal } from '@angular/core';
import {
  PauseEvent,
  PauseReason,
  StudyCoachSettings,
  StudyCoachingRecommendation,
  StudyHabitMetrics,
  StudyPatternType,
} from '../models/video-study-coach.models';
import { TopicQuizService } from './topic-quiz.service';

const SETTINGS_KEY = 'peerdsa_video_coach_settings_v1';

@Injectable({ providedIn: 'root' })
export class VideoStudyCoachService {
  private readonly quiz = inject(TopicQuizService);

  // --- Persistent Settings ---
  private readonly settingsSignal = signal<StudyCoachSettings>(this.loadSettings());
  readonly settings = this.settingsSignal.asReadonly();

  // --- Real-time Playback & Observation State ---
  private iframeElement: HTMLIFrameElement | null = null;
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

  // --- Camera Presence Guard (Opt-in) ---
  readonly cameraActive = signal<boolean>(false);
  readonly faceDetected = signal<boolean>(true);
  private mediaStream: MediaStream | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private hiddenCanvas: HTMLCanvasElement | null = null;
  private nativeFaceDetector: any = null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private presenceCheckInterval: any = null;
  private absenceCheckCount = 0;

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

  detachPlayer(): void {
    if (this.secondInterval) {
      clearInterval(this.secondInterval);
      this.secondInterval = null;
    }
    this.iframeElement = null;
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
    this.sendIFrameCommand('pauseVideo');
    this.handlePauseDetected(reason);
  }

  playVideo(): void {
    this.sendIFrameCommand('playVideo');
    this.handlePlayDetected();
  }

  setPlaybackSpeed(speed: number): void {
    this.currentPlaybackSpeed.set(speed);
    this.sendIFrameCommand('setPlaybackRate', [speed]);
    this.showToast(`Playback speed set to ${speed}x`, 'info', '⏱️');
  }

  private sendIFrameCommand(func: string, args: any[] = []): void {
    if (!this.iframeElement?.contentWindow) return;
    try {
      // Dispatches both empty-array and empty-string variants to guarantee support across YouTube iframe versions
      this.iframeElement.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: args.length > 0 ? args : '' }),
        '*'
      );
      this.iframeElement.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args }),
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

    if (this.settings().autoResumeOnReturn) {
      this.resumeFromAway();
    } else {
      this.showToast('Welcome back! Click Resume or hit Spacebar to continue studying.', 'info', '👋');
    }
  }

  resumeFromAway(): void {
    this.isAway.set(false);
    this.awayReason.set(null);
    this.playVideo();
    this.showToast('Resuming playback. Stay focused!', 'success', '▶');
  }

  // --- Smart Client-Side Camera Presence Guard (Opt-in) ---

  async startCameraPresence(): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.showToast('Camera not supported in this browser.', 'warning', '📷');
        return false;
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false,
      });

      this.hiddenVideo = document.createElement('video');
      this.hiddenVideo.width = 320;
      this.hiddenVideo.height = 240;
      this.hiddenVideo.autoplay = true;
      this.hiddenVideo.muted = true;
      this.hiddenVideo.playsInline = true;
      this.hiddenVideo.setAttribute('playsinline', '');
      this.hiddenVideo.setAttribute('muted', '');
      this.hiddenVideo.style.position = 'fixed';
      this.hiddenVideo.style.top = '-9999px';
      this.hiddenVideo.style.left = '-9999px';
      this.hiddenVideo.style.width = '1px';
      this.hiddenVideo.style.height = '1px';
      this.hiddenVideo.style.opacity = '0';
      this.hiddenVideo.style.pointerEvents = 'none';

      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(this.hiddenVideo);
      }

      this.hiddenVideo.srcObject = this.mediaStream;
      await this.hiddenVideo.play();

      this.hiddenCanvas = document.createElement('canvas');
      this.hiddenCanvas.width = 160;
      this.hiddenCanvas.height = 120;

      this.cameraActive.set(true);
      this.faceDetected.set(true);
      this.absenceCheckCount = 0;
      this.prevFrameData = null;

      // Start presence check loop (every 1.5s for fast and responsive detection)
      this.presenceCheckInterval = setInterval(() => this.checkCameraPresence(), 1500);

      this.showToast('Smart Presence Guard active. Video will pause if you step away!', 'success', '📷');
      return true;
    } catch (err) {
      console.warn('Camera presence denied or failed:', err);
      this.cameraActive.set(false);
      this.updateSettings({ enableCameraPresence: false });
      this.showToast('Camera permission denied. Tab auto-pause is still active.', 'warning', '📷');
      return false;
    }
  }

  stopCameraPresence(): void {
    if (this.presenceCheckInterval) {
      clearInterval(this.presenceCheckInterval);
      this.presenceCheckInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
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
    this.cameraActive.set(false);
    this.faceDetected.set(true);
    this.absenceCheckCount = 0;
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

  private async checkCameraPresence(): Promise<void> {
    if (!this.hiddenVideo || !this.hiddenCanvas || !this.cameraActive()) return;

    const ctx = this.hiddenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || this.hiddenVideo.videoWidth === 0 || this.hiddenVideo.readyState < 2) return;

    ctx.drawImage(this.hiddenVideo, 0, 0, this.hiddenCanvas.width, this.hiddenCanvas.height);

    // Tier 1: Hardware-accelerated browser native FaceDetector API (Chromium / Shape Detection API)
    if (typeof (window as any).FaceDetector === 'function') {
      try {
        if (!this.nativeFaceDetector) {
          this.nativeFaceDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        }
        const faces = await this.nativeFaceDetector.detect(this.hiddenCanvas);
        const faceFound = Array.isArray(faces) && faces.length > 0;
        this.handlePresenceDecision(faceFound);
        return;
      } catch {
        // Fall through to pixel-level computer vision
      }
    }

    // Tier 2: Real-time Computer Vision Pixel Pipeline (Zero external dependencies)
    try {
      const width = this.hiddenCanvas.width;
      const height = this.hiddenCanvas.height;
      const frame = ctx.getImageData(0, 0, width, height);
      const data = frame.data;

      // Region of Interest: Upper-central portrait zone where a desk-facing user sits
      const xMin = Math.floor(width * 0.18);
      const xMax = Math.floor(width * 0.82);
      const yMin = Math.floor(height * 0.08);
      const yMax = Math.floor(height * 0.82);

      let roiPixels = 0;
      let skinPixels = 0;
      let motionPixels = 0;
      let totalLuma = 0;

      const currentLuma = new Uint8ClampedArray(width * height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pIdx = y * width + x;
          const i = pIdx * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          currentLuma[pIdx] = luma;
          totalLuma += luma;

          if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
            roiPixels++;

            // YCbCr skin chrominance cluster test
            const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

            // Invariant human skin chromaticity boundaries across all human ethnicities
            if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g && g > b && luma > 18) {
              skinPixels++;
            }

            // Temporal inter-frame motion delta
            if (this.prevFrameData) {
              const delta = Math.abs(luma - this.prevFrameData[pIdx]);
              if (delta > 6) {
                motionPixels++;
              }
            }
          }
        }
      }

      this.prevFrameData = currentLuma;

      const avgLuma = totalLuma / (width * height);
      const skinRatio = roiPixels > 0 ? skinPixels / roiPixels : 0;
      const motionRatio = roiPixels > 0 ? motionPixels / roiPixels : 0;

      // Covered camera or pitch black room
      if (avgLuma < 10) {
        this.handlePresenceDecision(false);
        return;
      }

      // Live person criteria:
      // Substantial skin tone in portrait zone (>2.5%) OR subtle posture/micro-motion (>1.2%) with skin presence (>0.8%)
      const isPresent = skinRatio >= 0.025 || (skinRatio >= 0.008 && motionRatio >= 0.012);
      this.handlePresenceDecision(isPresent);
    } catch (e) {
      // Keep presence state on canvas read error
    }
  }

  private handlePresenceDecision(isPresent: boolean): void {
    if (!isPresent) {
      this.absenceCheckCount++;
      // If absent for 2 consecutive checks (~3 seconds)
      if (this.absenceCheckCount >= 2) {
        this.faceDetected.set(false);
        if (!this.isAway() && (this.isPlaying() || !this.isPaused() || !!this.currentVideoId())) {
          this.triggerAwayPause('AWAY_PRESENCE_LOST');
        }
      }
    } else {
      const wasAbsent = !this.faceDetected();
      this.absenceCheckCount = 0;
      this.faceDetected.set(true);

      if (wasAbsent && this.isAway() && this.awayReason() === 'AWAY_PRESENCE_LOST') {
        this.handleReturnFromAway();
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
      autoResumeOnReturn: false,
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
