import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ArticleCoachSettings,
  ArticlePauseRecord,
  ArticleReadingPattern,
  ArticleStudyMetrics,
  ArticleStudyRecommendation,
} from '../models/article-study-coach.models';
import { TopicQuizService } from './topic-quiz.service';

const SETTINGS_KEY = 'peerdsa_article_coach_settings_v1';
const ARTICLE_NOTES_PREFIX = 'peerdsa_article_notes_';

@Injectable({ providedIn: 'root' })
export class ArticleStudyCoachService {
  private readonly quiz = inject(TopicQuizService);

  // --- Persistent Settings ---
  private readonly settingsSignal = signal<ArticleCoachSettings>(this.loadSettings());
  readonly settings = this.settingsSignal.asReadonly();

  // --- Active Article Info ---
  readonly currentArticleId = signal<number | string | null>(null);
  readonly currentArticleTitle = signal<string>('');
  readonly currentArticleSubject = signal<string>('');
  readonly totalWordCount = signal<number>(0);
  readonly articleNotes = signal<string>('');

  // --- Live Observation Metrics ---
  readonly totalReadSeconds = signal<number>(0);
  readonly totalPauseSeconds = signal<number>(0);
  readonly continuousReadSeconds = signal<number>(0);
  readonly maxContinuousStreakSeconds = signal<number>(0);
  readonly pauseCount = signal<number>(0);
  readonly activePauseCount = signal<number>(0);
  readonly reReadCount = signal<number>(0);
  readonly scrollDepthPercent = signal<number>(0);
  readonly currentWpm = signal<number>(0);
  readonly currentPauseDurationSeconds = signal<number>(0);
  readonly currentPattern = signal<ArticleReadingPattern>('CALIBRATING');

  // --- State Flags ---
  readonly isReading = signal<boolean>(false);
  readonly isPaused = signal<boolean>(false);
  readonly isAway = signal<boolean>(false);
  readonly isCoachDrawerOpen = signal<boolean>(false);

  // --- Break Timer (Pomodoro for Articles) ---
  readonly breakTimerSeconds = signal<number>(0);
  readonly breakTimerActive = signal<boolean>(false);

  // --- Toast Notifications ---
  readonly activeToast = signal<{ message: string; type: 'info' | 'warning' | 'success'; icon: string } | null>(null);

  // --- Internal State ---
  private secondInterval: any = null;
  private idleSecondsWithoutScroll = 0;
  private lastScrollTop = 0;
  private maxScrollTop = 0;
  private currentPauseRecord: ArticlePauseRecord | null = null;
  private scrollContainer: HTMLElement | null = null;

  // --- Listeners ---
  private readonly scrollHandler = () => this.handleScroll();
  private readonly selectionHandler = () => this.handleSelection();
  private readonly visibilityHandler = () => this.handleVisibilityChange();
  private readonly blurHandler = () => this.handleWindowBlur();
  private readonly focusHandler = () => this.handleWindowFocus();

  // --- Computed Views ---
  readonly formattedReadTime = computed(() => this.formatSeconds(this.totalReadSeconds()));
  readonly formattedPauseTime = computed(() => this.formatSeconds(this.totalPauseSeconds()));
  readonly formattedContinuousRead = computed(() => this.formatSeconds(this.continuousReadSeconds()));
  readonly formattedBreakTimer = computed(() => this.formatSeconds(this.breakTimerSeconds()));

  readonly retentionIndex = computed<number>(() => {
    const readSec = this.totalReadSeconds();
    const pauseSec = this.totalPauseSeconds();
    const streak = this.continuousReadSeconds();
    const notesCount = this.activePauseCount();
    const wpm = this.currentWpm();

    if (readSec < 30) return 75; // Initial baseline

    let score = 70;

    // Active notes & highlights bonus
    score += Math.min(18, notesCount * 6);

    // Balanced ratio bonus (15% to 40% pause time indicates thoughtful reading)
    const totalTime = readSec + pauseSec;
    const pauseRatio = pauseSec / (totalTime || 1);
    if (pauseRatio >= 0.15 && pauseRatio <= 0.40) {
      score += 12;
    } else if (pauseRatio > 0.65) {
      score -= 10;
    }

    // Penalty for excessive passive continuous reading without any pause
    if (streak > 480) {
      score -= Math.min(22, Math.floor((streak - 480) / 90) * 4);
    }

    // Skimming penalty
    if (wpm > 450) {
      score -= 15;
    }

    return Math.max(30, Math.min(98, Math.round(score)));
  });

  readonly patternLabel = computed<{ title: string; subtitle: string; badgeClass: string; icon: string }>(() => {
    switch (this.currentPattern()) {
      case 'SKIMMING':
        return {
          title: 'Skimming Alert',
          subtitle: 'Scrolling too fast through technical details without pausing to absorb.',
          badgeClass: 'badge-warning',
          icon: '⚡',
        };
      case 'PASSIVE_READING':
        return {
          title: 'Passive Reading Warning',
          subtitle: 'Reading continuously for >8m with zero notes or reflection pauses.',
          badgeClass: 'badge-warning',
          icon: '⚠️',
        };
      case 'COMPREHENSION_STRUGGLE':
        return {
          title: 'Dense Concept / Re-reading',
          subtitle: 'Repeatedly re-reading this section. Take time to trace invariants.',
          badgeClass: 'badge-info',
          icon: '🧠',
        };
      case 'DEEP_ACTIVE_READING':
        return {
          title: 'Optimal Deep Reading',
          subtitle: 'Balanced reading speed with active reflection pauses and notes.',
          badgeClass: 'badge-success',
          icon: '🎯',
        };
      case 'EXTENDED_PAUSE':
        return {
          title: 'Reading Break',
          subtitle: 'Paused for an extended time. Ready to resume or rest.',
          badgeClass: 'badge-secondary',
          icon: '☕',
        };
      case 'CALIBRATING':
      default:
        return {
          title: 'Observing Reading Rhythm',
          subtitle: 'Analyzing your reading cadence, depth, and synthesis pauses.',
          badgeClass: 'badge-neutral',
          icon: '📖',
        };
    }
  });

  readonly recommendations = computed<ArticleStudyRecommendation[]>(() => {
    const list: ArticleStudyRecommendation[] = [];
    const pattern = this.currentPattern();
    const streakMin = Math.floor(this.continuousReadSeconds() / 60);

    if (pattern === 'SKIMMING') {
      list.push({
        id: 'read-and-recite',
        title: 'The "Read & Recite" Technique',
        description:
          'You scrolled through content at high velocity. In interview prep, skimming gives false confidence. Pause at the end of each heading and explain the core concept in your own words!',
        badge: 'Critical Retention',
        category: 'pacing',
        actionText: '⏸️ Take 60s Recall Pause',
        actionKey: 'take_pause',
      });
      list.push({
        id: 'feynman-summary',
        title: '1-Line Concept Distillation',
        description:
          'Before scrolling further, summarize what problem this pattern solves and what tradeoffs it introduces.',
        badge: 'Active Recall',
        category: 'retention',
        actionText: '📝 Insert 1-Line Summary',
        actionKey: 'insert_summary',
      });
    } else if (pattern === 'PASSIVE_READING') {
      list.push({
        id: 'pause-retrieval',
        title: `Active Recall Check (${streakMin}m continuous)`,
        description:
          'Reading continuously without pauses leads to ~70% memory decay within 24 hours. Pause now and challenge yourself: what are the key interview talking points?',
        badge: 'Memory Decay Prevention',
        category: 'retention',
        actionText: '💡 Test Yourself Prompt',
        actionKey: 'insert_quiz_prompt',
      });
      list.push({
        id: 'highlight-takeaway',
        title: 'Highlight or Note 1 Critical Nuance',
        description:
          'Select and highlight any line of code or explanation that surprised you or that you might forget under pressure.',
        badge: 'Focus',
        category: 'comprehension',
        actionText: '📝 Open Scratchpad',
        actionKey: 'open_scratchpad',
      });
    } else if (pattern === 'COMPREHENSION_STRUGGLE') {
      list.push({
        id: 'trace-invariants',
        title: 'Trace Code Invariants on Paper',
        description:
          'You have re-read this section multiple times. Complex topics like concurrency, memory barriers, or distributed transactions require active decomposition. Trace the step-by-step state transitions!',
        badge: 'Deep Comprehension',
        category: 'comprehension',
        actionText: '📝 Insert Tradeoff Template',
        actionKey: 'insert_tradeoffs',
      });
      list.push({
        id: 'pomodoro-eye-rest',
        title: 'Reset Mental Working Memory',
        description:
          'If your eyes are straining on dense explanations, take a quick 3-minute eye break to reset cognitive bandwidth.',
        badge: 'Rest',
        category: 'break',
        actionText: '☕ Start 3-Min Rest Timer',
        actionKey: 'start_short_break',
      });
    } else if (pattern === 'DEEP_ACTIVE_READING') {
      list.push({
        id: 'golden-pace',
        title: 'Excellent Deep Study Cadence',
        description:
          'Your balanced reading pace and periodic reflection pauses align with cognitive research. Keep this rhythm to cement your technical knowledge for interviews.',
        badge: 'Top Habit',
        category: 'retention',
      });
      list.push({
        id: 'interview-qa',
        title: 'Formulate an Interview Question',
        description:
          'Turn this article section into a mock interview question and write a punchy 2-minute answer in your notes.',
        badge: 'Interview Practice',
        category: 'retention',
        actionText: '📝 Insert Mock Q&A Template',
        actionKey: 'insert_interview_qa',
      });
    } else {
      list.push({
        id: 'coach-active',
        title: 'Active Study Coach Active',
        description:
          'PeerDSA Reading Coach is observing your continuous reading, scroll velocity, and reflection pauses to give you personalized learning guidance.',
        badge: 'AI Coach',
        category: 'pacing',
      });
    }

    return list;
  });

  constructor() {
    this.startTicker();
    this.quiz.onQuizCompleted = (isCorrect, boost) => {
      this.activePauseCount.update((c) => c + 1);
      this.showToast(
        isCorrect ? `🎯 Concept quiz passed! +${boost}% Retention Boost.` : `💡 Concept reviewed! Keep practicing.`,
        'success',
        '🧠'
      );
      this.evaluatePattern();
    };
  }

  // --- Session Management ---

  startSession(
    articleId: number | string,
    articleTitle: string,
    content: string,
    subject = '',
    container?: HTMLElement
  ): void {
    this.currentArticleId.set(articleId);
    this.currentArticleTitle.set(articleTitle);
    this.currentArticleSubject.set(subject);

    const words = (content || '').trim().split(/\s+/).filter(Boolean).length;
    this.totalWordCount.set(Math.max(1, words));

    this.resetMetrics();
    this.loadArticleNotes(articleId);

    this.scrollContainer = container || null;
    this.attachListeners();
    this.startTicker();
    this.isReading.set(true);
  }

  endSession(): void {
    this.saveArticleNotes();
    this.detachListeners();
    if (this.secondInterval) {
      clearInterval(this.secondInterval);
      this.secondInterval = null;
    }
    this.currentArticleId.set(null);
    this.scrollContainer = null;
    this.isReading.set(false);
    this.isPaused.set(false);
    this.isAway.set(false);
  }

  resetMetrics(): void {
    this.totalReadSeconds.set(0);
    this.totalPauseSeconds.set(0);
    this.continuousReadSeconds.set(0);
    this.maxContinuousStreakSeconds.set(0);
    this.pauseCount.set(0);
    this.activePauseCount.set(0);
    this.reReadCount.set(0);
    this.scrollDepthPercent.set(0);
    this.currentWpm.set(0);
    this.currentPauseDurationSeconds.set(0);
    this.currentPattern.set('CALIBRATING');
    this.idleSecondsWithoutScroll = 0;
    this.lastScrollTop = 0;
    this.maxScrollTop = 0;
    this.currentPauseRecord = null;
  }

  // --- Interaction & Scroll Handlers ---

  handleScroll(): void {
    const el = this.scrollContainer || document.documentElement;
    const scrollTop = el.scrollTop || window.scrollY || 0;
    const scrollHeight = el.scrollHeight || document.documentElement.scrollHeight || 1;
    const clientHeight = el.clientHeight || window.innerHeight || 1;

    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const depth = Math.min(100, Math.round((scrollTop / maxScroll) * 100));
    this.scrollDepthPercent.set(depth);

    // Detect re-reading: user scrolled backward by > 150px from their max point
    if (scrollTop < this.lastScrollTop - 150 && this.maxScrollTop > 300) {
      if (this.totalReadSeconds() > 30) {
        this.reReadCount.update((c) => c + 1);
      }
    }

    if (scrollTop > this.maxScrollTop) {
      this.maxScrollTop = scrollTop;
    }
    this.lastScrollTop = scrollTop;

    // Reset idle timer
    this.idleSecondsWithoutScroll = 0;

    // If was paused, end current pause record
    if (this.isPaused()) {
      this.isPaused.set(false);
      this.isReading.set(true);
      if (this.currentPauseRecord) {
        this.currentPauseRecord.endedAt = Date.now();
        this.currentPauseRecord.durationSeconds = this.currentPauseDurationSeconds();
        this.currentPauseRecord = null;
      }
      this.currentPauseDurationSeconds.set(0);
    }

    this.updateWpm();
    this.evaluatePattern();

    if (this.currentArticleId()) {
      this.quiz.checkArticleTrigger(
        this.currentArticleId()!,
        this.currentArticleTitle(),
        this.currentArticleSubject(),
        this.scrollDepthPercent(),
        this.continuousReadSeconds()
      );
    }
  }

  handleSelection(): void {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 5) {
      this.activePauseCount.update((c) => c + 1);
      if (this.currentPauseRecord) {
        this.currentPauseRecord.textHighlighted = true;
      }
      this.showToast('Concept highlighted! Active engagement recorded.', 'success', '✨');
      this.evaluatePattern();
    }
  }

  notifyNoteRecorded(): void {
    this.activePauseCount.update((c) => c + 1);
    if (this.currentPauseRecord) {
      this.currentPauseRecord.notesRecorded = true;
    }
    this.showToast('Great study habit! Note synthesized in scratchpad.', 'success', '📝');
    this.evaluatePattern();
  }

  updateArticleNotes(text: string): void {
    this.articleNotes.set(text);
    this.saveArticleNotes();
    this.notifyNoteRecorded();
  }

  // --- Ticker & Pattern Evaluation ---

  private startTicker(): void {
    if (this.secondInterval) clearInterval(this.secondInterval);

    this.secondInterval = setInterval(() => {
      if (!this.currentArticleId() || !this.settings().enableReadingCoach) return;

      this.idleSecondsWithoutScroll++;

      // Inactivity threshold: if no scroll for > 4 seconds, consider in Digest Pause
      if (this.idleSecondsWithoutScroll > 4 && this.idleSecondsWithoutScroll <= 180) {
        if (!this.isPaused() && !this.isAway()) {
          this.isPaused.set(true);
          this.pauseCount.update((c) => c + 1);
          this.continuousReadSeconds.set(0);
          this.currentPauseDurationSeconds.set(0);

          this.currentPauseRecord = {
            id: 'ap_' + Date.now(),
            startedAt: Date.now(),
            durationSeconds: 0,
            scrollDepthPercent: this.scrollDepthPercent(),
            notesRecorded: false,
            textHighlighted: false,
          };
        }

        this.totalPauseSeconds.update((s) => s + 1);
        this.currentPauseDurationSeconds.update((s) => s + 1);
        this.evaluatePattern();
      } else if (this.idleSecondsWithoutScroll <= 4) {
        // Actively reading
        this.isReading.set(true);
        this.isPaused.set(false);
        this.isAway.set(false);

        this.totalReadSeconds.update((s) => s + 1);
        this.continuousReadSeconds.update((s) => {
          const next = s + 1;
          if (next > this.maxContinuousStreakSeconds()) {
            this.maxContinuousStreakSeconds.set(next);
          }
          if (next === 480) {
            this.showToast('8 mins continuous reading — pause to reflect on key ideas!', 'warning', '⚠️');
          }
          return next;
        });

        this.updateWpm();
        this.evaluatePattern();

        if (this.currentArticleId()) {
          this.quiz.checkArticleTrigger(
            this.currentArticleId()!,
            this.currentArticleTitle(),
            this.currentArticleSubject(),
            this.scrollDepthPercent(),
            this.continuousReadSeconds()
          );
        }
      } else {
        // Idle > 180s
        this.isAway.set(true);
        this.currentPattern.set('EXTENDED_PAUSE');
      }

      // Pomodoro break timer
      if (this.breakTimerActive()) {
        this.breakTimerSeconds.update((sec) => {
          if (sec <= 1) {
            this.breakTimerActive.set(false);
            this.playChime();
            this.showToast('Reading break complete! Ready to dive back into the text.', 'success', '🔔');
            return 0;
          }
          return sec - 1;
        });
      }
    }, 1000);
  }

  private updateWpm(): void {
    const readSec = this.totalReadSeconds();
    if (readSec < 10) return;

    const wordsTotal = this.totalWordCount();
    const depthFraction = Math.max(0.05, this.scrollDepthPercent() / 100);
    const wordsRead = Math.round(wordsTotal * depthFraction);
    const minutes = readSec / 60;
    const wpm = Math.round(wordsRead / (minutes || 1));
    this.currentWpm.set(Math.min(1200, Math.max(50, wpm)));
  }

  private evaluatePattern(): void {
    const readSec = this.totalReadSeconds();
    const streak = this.continuousReadSeconds();
    const wpm = this.currentWpm();
    const depth = this.scrollDepthPercent();
    const reReads = this.reReadCount();
    const pauseDur = this.currentPauseDurationSeconds();

    if (readSec < 20) {
      this.currentPattern.set('CALIBRATING');
      return;
    }

    if (this.isPaused() && pauseDur > 180) {
      this.currentPattern.set('EXTENDED_PAUSE');
      return;
    }

    // 1. Skimming check: >450 WPM and scrolled through >60% in under 90s
    if (wpm > 450 && depth > 50 && readSec < 90) {
      this.currentPattern.set('SKIMMING');
      return;
    }

    // 2. High cognitive friction: re-reading repeated sections
    if (reReads >= 3 || (this.isPaused() && pauseDur > 90 && this.activePauseCount() === 0)) {
      this.currentPattern.set('COMPREHENSION_STRUGGLE');
      return;
    }

    // 3. Passive continuous reading: >7m without pause
    if (streak >= 420) {
      this.currentPattern.set('PASSIVE_READING');
      return;
    }

    // 4. Optimal deep reading: balanced pace (120-300 wpm) with reflection pauses
    if (this.pauseCount() >= 1 && (this.activePauseCount() >= 1 || streak < 360)) {
      this.currentPattern.set('DEEP_ACTIVE_READING');
      return;
    }

    if (streak < 300) {
      this.currentPattern.set('DEEP_ACTIVE_READING');
    } else {
      this.currentPattern.set('CALIBRATING');
    }
  }

  // --- Away Detection Handlers ---

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.isAway.set(true);
      this.isReading.set(false);
      this.isPaused.set(true);
    } else {
      this.isAway.set(false);
      this.showToast('Welcome back to the article! Ready to continue studying.', 'info', '👋');
    }
  }

  private handleWindowBlur(): void {
    this.isAway.set(true);
  }

  private handleWindowFocus(): void {
    this.isAway.set(false);
  }

  // --- Pomodoro Break Timer ---

  startBreakTimer(seconds = 300): void {
    this.breakTimerSeconds.set(seconds);
    this.breakTimerActive.set(true);
    this.showToast(`Starting ${Math.round(seconds / 60)}-minute eye & brain rest. Look into the distance!`, 'info', '☕');
  }

  cancelBreakTimer(): void {
    this.breakTimerActive.set(false);
    this.breakTimerSeconds.set(0);
    this.showToast('Rest timer ended. Ready to continue.', 'info', '📖');
  }

  // --- Notes Persistence ---

  private loadArticleNotes(articleId: number | string): void {
    try {
      const saved = localStorage.getItem(ARTICLE_NOTES_PREFIX + articleId);
      this.articleNotes.set(saved || '');
    } catch {
      this.articleNotes.set('');
    }
  }

  private saveArticleNotes(): void {
    const id = this.currentArticleId();
    if (!id) return;
    try {
      localStorage.setItem(ARTICLE_NOTES_PREFIX + id, this.articleNotes());
    } catch {}
  }

  // --- Settings ---

  private loadSettings(): ArticleCoachSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...this.defaultSettings(), ...JSON.parse(raw) };
    } catch {}
    return this.defaultSettings();
  }

  private defaultSettings(): ArticleCoachSettings {
    return {
      enableReadingCoach: true,
      soundChimeOnAlerts: true,
      autoSaveNotes: true,
    };
  }

  updateSettings(partial: Partial<ArticleCoachSettings>): void {
    const updated = { ...this.settingsSignal(), ...partial };
    this.settingsSignal.set(updated);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {}
  }

  // --- Chime & Toasts ---

  private playChime(): void {
    if (!this.settings().soundChimeOnAlerts) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.16); // G5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }

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

  toggleCoachDrawer(): void {
    this.isCoachDrawerOpen.update((v) => !v);
  }

  setCoachDrawerOpen(open: boolean): void {
    this.isCoachDrawerOpen.set(open);
  }

  setPatternForTesting(pattern: ArticleReadingPattern): void {
    this.currentPattern.set(pattern);
  }

  // --- Listeners Setup ---

  private attachListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.scrollHandler, { passive: true });
      document.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
      document.addEventListener('selectionchange', this.selectionHandler);
      document.addEventListener('visibilitychange', this.visibilityHandler);
      window.addEventListener('blur', this.blurHandler);
      window.addEventListener('focus', this.focusHandler);
    }
  }

  private detachListeners(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.scrollHandler);
      document.removeEventListener('scroll', this.scrollHandler, { capture: true } as any);
      document.removeEventListener('selectionchange', this.selectionHandler);
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      window.removeEventListener('blur', this.blurHandler);
      window.removeEventListener('focus', this.focusHandler);
    }
  }

  private formatSeconds(sec: number): string {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
