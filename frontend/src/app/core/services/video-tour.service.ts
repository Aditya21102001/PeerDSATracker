import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface VideoTourChapter {
  id: string;
  title: string;
  subtitle: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  badge: string;
  icon: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  keyTakeaways: readonly string[];
  captions: readonly { offset: number; text: string }[];
}

export const VIDEO_TOUR_CHAPTERS: readonly VideoTourChapter[] = [
  {
    id: 'welcome',
    title: 'The Grind Loop & Daily Consistency',
    subtitle: 'Automated streaks, XP levels, and study habits',
    startTime: 0,
    duration: 25,
    badge: 'Overview',
    icon: '⚡',
    description:
      'Learn how PeerDSA turns daily problem-solving into automated streaks, XP progression, and gamified study motivation.',
    ctaText: 'View Dashboard',
    ctaLink: '/dashboard',
    keyTakeaways: [
      'Daily streak updates the moment you solve any problem',
      'Earn XP to level up from Novice to Grandmaster',
      'Visual GitHub-style activity heatmap tracks every active day',
    ],
    captions: [
      { offset: 0, text: 'Welcome to PeerDSA: The Grind! Let us take a 2-minute tour of how everything works.' },
      { offset: 6, text: 'Everything is built around one loop: solve a problem, mark it, and earn instant XP and streak credit.' },
      { offset: 14, text: 'Your activity heatmap lights up daily, and milestones unlock tiered achievement badges.' },
      { offset: 20, text: 'Next up: let us explore how the curated 474-problem SDE Sheet is organized.' },
    ],
  },
  {
    id: 'sheet',
    title: 'The Striver SDE Sheet (474 Problems)',
    subtitle: 'Curated topics, instant filtering, and tracking',
    startTime: 25,
    duration: 25,
    badge: 'Curriculum',
    icon: '📋',
    description:
      'Master 474 curated coding interview questions across 18 comprehensive steps from Arrays to Advanced Graphs and DP.',
    ctaText: 'Open SDE Sheet',
    ctaLink: '/sheet',
    keyTakeaways: [
      'Filter by difficulty: Easy, Medium, or Hard',
      'Search across problem names, tags, and topics',
      'Toggle problem status between Unsolved, Revising, and Solved',
    ],
    captions: [
      { offset: 0, text: 'The Sheet contains 474 high-yield problems across 18 structured topics.' },
      { offset: 6, text: 'Expand any topic to view problem sets, external problem links, and solution notes.' },
      { offset: 13, text: 'Use the quick filters to isolate Unsolved questions, filter by difficulty, or view revision items.' },
      { offset: 19, text: 'Want to solve directly in your browser? Click the Code button on any problem!' },
    ],
  },
  {
    id: 'code',
    title: 'In-Browser Code Editor & Runner',
    subtitle: 'Multi-language execution with live test cases',
    startTime: 50,
    duration: 25,
    badge: 'Editor',
    icon: '💻',
    description:
      'Code and test algorithms right in your browser with support for Java, C++, Python, JavaScript, and Go.',
    ctaText: 'Try Code Editor',
    ctaLink: '/sheet',
    keyTakeaways: [
      'Multi-language code templates for top programming languages',
      'Zero-setup sandboxed compilation and execution powered by Piston',
      'Custom test case inputs and execution runtime benchmarking',
    ],
    captions: [
      { offset: 0, text: 'The built-in Code Editor lets you write, run, and benchmark solutions without leaving the app.' },
      { offset: 7, text: 'Select Java, C++, Python, Go, or JavaScript with preloaded templates and syntax highlighting.' },
      { offset: 14, text: 'Run against default test cases or enter custom input to debug edge cases in real time.' },
      { offset: 20, text: 'Once your test passes, your solution is recorded and problem status updates seamlessly.' },
    ],
  },
  {
    id: 'revision',
    title: 'Spaced Repetition Revision Engine',
    subtitle: 'Scientifically proven 1-3-7-14-30 day memory ladder',
    startTime: 75,
    duration: 25,
    badge: 'Memory',
    icon: '🧠',
    description:
      'Combat the forgetting curve. Problems you solve are automatically scheduled for timed revision to lock concepts into long-term memory.',
    ctaText: 'View Revision Queue',
    ctaLink: '/revision',
    keyTakeaways: [
      'Automated review intervals: 1 day, 3 days, 1 week, 2 weeks, 1 month',
      'Confidence grading: rate problem difficulty on review',
      'Never let hard algorithms slip out of your memory before interviews',
    ],
    captions: [
      { offset: 0, text: 'Solving a problem once is not enough for interviews. Spaced repetition prevents forgetting.' },
      { offset: 7, text: 'Solved questions enter an automated review ladder at 1, 3, 7, 14, and 30 day intervals.' },
      { offset: 15, text: 'Each morning, check your Revision queue to test your recall on scheduled problems.' },
      { offset: 20, text: 'Rate your confidence after each review to adjust the repetition cadence automatically.' },
    ],
  },
  {
    id: 'articles',
    title: 'Technical Study Articles & Deep Dives',
    subtitle: '214 comprehensive interview guides across 9 subjects',
    startTime: 100,
    duration: 25,
    badge: 'Articles',
    icon: '📚',
    description:
      'Study subject-wise interview prep articles covering System Design, Apache Kafka, Spring Boot, Java Concurrency, SQL Internals, and more.',
    ctaText: 'Browse Articles',
    ctaLink: '/blogs',
    keyTakeaways: [
      '214 curated articles organized by core engineering subjects',
      'Subject tabs: System Design, Kafka, Spring Boot, Concurrency, SQL, Python',
      'Publish your own editorial technical articles and study notes',
    ],
    captions: [
      { offset: 0, text: 'Beyond coding, ace technical interviews with 214 curated deep-dive study articles.' },
      { offset: 7, text: 'Filter by subjects like Apache Kafka, System Design, Spring Boot internals, and SQL database design.' },
      { offset: 14, text: 'Articles include real interview Q&As, architecture diagrams, and production best practices.' },
      { offset: 20, text: 'You can also write and publish your own technical notes to share with peers!' },
    ],
  },
  {
    id: 'buddy',
    title: 'AI Grind Buddy: Coding Assistant',
    subtitle: 'Contextual DSA hints, complexity analysis, and edge cases',
    startTime: 125,
    duration: 25,
    badge: 'AI Tutor',
    icon: '🤖',
    description:
      'Stuck on an algorithm? Grind Buddy provides hints, time-complexity analysis, and debugging tips without spoiling the solution.',
    ctaText: 'Open Chat Assistant',
    ctaLink: '/dashboard',
    keyTakeaways: [
      'Floating study assistant available from anywhere in the app',
      'Provides progressive hints instead of spoiling full solutions',
      'Explains Big-O space and time complexity trade-offs',
    ],
    captions: [
      { offset: 0, text: 'Meet Grind Buddy — your AI coding-interview tutor available in the bottom-right corner.' },
      { offset: 7, text: 'Ask for hints, edge-case breakdowns, or time-complexity analysis when you get stuck.' },
      { offset: 14, text: 'Grind Buddy is tuned to guide your problem-solving rather than dumping full answers.' },
      { offset: 20, text: 'Use it while practicing or revising to simulate real interview back-and-forth.' },
    ],
  },
  {
    id: 'community',
    title: 'Peer Leaderboard & Direct Messaging',
    subtitle: 'Compete, collaborate, and study together',
    startTime: 150,
    duration: 25,
    badge: 'Social',
    icon: '🏆',
    description:
      'See where you rank on the global XP leaderboard, inspect peer profiles, and send direct messages to fellow engineers.',
    ctaText: 'Check Leaderboard',
    ctaLink: '/leaderboard',
    keyTakeaways: [
      'Global leaderboard ranks engineers by XP, streak, and problems solved',
      'Inspect public peer profiles to see their mastery and badges',
      'Real-time direct messaging for peer accountability and study groups',
    ],
    captions: [
      { offset: 0, text: 'Stay motivated by competing and collaborating with friends and peers across the platform.' },
      { offset: 7, text: 'The Leaderboard ranks users by total XP, daily streaks, and problems solved.' },
      { offset: 14, text: 'Click any peer to view their profile, badge shelf, and send a direct message.' },
      { offset: 20, text: 'You are now ready to begin! Click any chapter or jump straight into The Grind. 🔥' },
    ],
  },
];

export const TOTAL_TOUR_DURATION = 175; // 2 minutes 55 seconds

@Injectable({
  providedIn: 'root',
})
export class VideoTourService {
  private readonly router = inject(Router);

  private readonly _isOpen = signal(false);
  private readonly _isPlaying = signal(false);
  private readonly _currentTime = signal(0);
  private readonly _playbackRate = signal(1);
  private readonly _isMuted = signal(false);
  private readonly _captionsEnabled = signal(true);
  private readonly _isFullscreen = signal(false);

  private timerId: number | null = null;
  private lastTickMs: number = 0;

  readonly isOpen = this._isOpen.asReadonly();
  readonly isPlaying = this._isPlaying.asReadonly();
  readonly currentTime = this._currentTime.asReadonly();
  readonly playbackRate = this._playbackRate.asReadonly();
  readonly isMuted = this._isMuted.asReadonly();
  readonly captionsEnabled = this._captionsEnabled.asReadonly();
  readonly isFullscreen = this._isFullscreen.asReadonly();

  readonly chapters = VIDEO_TOUR_CHAPTERS;
  readonly totalDuration = TOTAL_TOUR_DURATION;

  /** Identifies which chapter corresponds to the current timestamp. */
  readonly currentChapterIndex = computed(() => {
    const t = this._currentTime();
    for (let i = VIDEO_TOUR_CHAPTERS.length - 1; i >= 0; i--) {
      if (t >= VIDEO_TOUR_CHAPTERS[i].startTime) {
        return i;
      }
    }
    return 0;
  });

  readonly currentChapter = computed<VideoTourChapter>(() => {
    return VIDEO_TOUR_CHAPTERS[this.currentChapterIndex()];
  });

  /** Computes the active subtitle string for the current playhead position. */
  readonly currentCaption = computed(() => {
    if (!this._captionsEnabled()) return '';
    const chapter = this.currentChapter();
    const chapterElapsed = this._currentTime() - chapter.startTime;
    let activeText = chapter.captions[0]?.text ?? '';
    for (const c of chapter.captions) {
      if (chapterElapsed >= c.offset) {
        activeText = c.text;
      }
    }
    return activeText;
  });

  /** Overall progress as a 0..100 percentage. */
  readonly progressPercent = computed(() => {
    return Math.min(100, Math.max(0, (this._currentTime() / this.totalDuration) * 100));
  });

  constructor() {
    // Automatically stop playback ticker when modal closes
    effect(() => {
      if (!this._isOpen()) {
        this.pause();
      }
    });
  }

  open(initialChapterIndex = 0): void {
    const safeIndex = Math.max(0, Math.min(initialChapterIndex, VIDEO_TOUR_CHAPTERS.length - 1));
    this._currentTime.set(VIDEO_TOUR_CHAPTERS[safeIndex].startTime);
    this._isOpen.set(true);
    this.play();
  }

  close(): void {
    this.pause();
    this._isOpen.set(false);
  }

  play(): void {
    if (this._currentTime() >= this.totalDuration) {
      this._currentTime.set(0);
    }
    this._isPlaying.set(true);
    this.startTicker();
  }

  pause(): void {
    this._isPlaying.set(false);
    this.stopTicker();
  }

  togglePlay(): void {
    if (this._isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.totalDuration));
    this._currentTime.set(clamped);
  }

  seekToChapter(index: number): void {
    if (index >= 0 && index < VIDEO_TOUR_CHAPTERS.length) {
      this.seek(VIDEO_TOUR_CHAPTERS[index].startTime);
    }
  }

  skip(deltaSeconds: number): void {
    this.seek(this._currentTime() + deltaSeconds);
  }

  setRate(rate: number): void {
    if ([0.75, 1, 1.25, 1.5, 2].includes(rate)) {
      this._playbackRate.set(rate);
    }
  }

  toggleMute(): void {
    this._isMuted.update((m) => !m);
  }

  toggleCaptions(): void {
    this._captionsEnabled.update((c) => !c);
  }

  toggleFullscreen(): void {
    this._isFullscreen.update((f) => !f);
  }

  navigateToFeature(link: string): void {
    this.close();
    this.router.navigateByUrl(link);
  }

  private startTicker(): void {
    this.stopTicker();
    this.lastTickMs = performance.now();
    this.timerId = window.setInterval(() => {
      const now = performance.now();
      const elapsedSec = (now - this.lastTickMs) / 1000;
      this.lastTickMs = now;
      const nextTime = this._currentTime() + elapsedSec * this._playbackRate();
      if (nextTime >= this.totalDuration) {
        this._currentTime.set(this.totalDuration);
        this.pause();
      } else {
        this._currentTime.set(nextTime);
      }
    }, 100);
  }

  private stopTicker(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
