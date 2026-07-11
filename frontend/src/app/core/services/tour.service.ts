import { Service, computed, signal } from '@angular/core';

/**
 * One step of the product tour. `target` is a CSS selector for the element to spotlight (absent =
 * a centered card); `route` is navigated to before the step shows, so the tour can walk across
 * pages. Target elements are marked with `data-tour="…"` attributes in the feature templates, so a
 * CSS refactor never silently breaks the tour.
 */
export interface TourStep {
  target?: string;
  route?: string;
  title: string;
  body: string;
}

const SEEN_KEY = 'peerdsa.tourSeen';

const STEPS: readonly TourStep[] = [
  {
    route: '/dashboard',
    title: 'Welcome to The Grind ⚡',
    body: 'A 60-second tour of how everything fits together. You can skip any time.',
  },
  {
    route: '/dashboard',
    target: '[data-tour="stats"]',
    title: 'Your stats',
    body: 'Streak, XP and level, and badges — all update the instant you solve a problem.',
  },
  {
    route: '/dashboard',
    target: '[data-tour="heatmap"]',
    title: 'Your activity',
    body: 'Every day you solve at least one problem lights up here, GitHub-style.',
  },
  {
    route: '/dashboard',
    target: '[data-tour="nav"]',
    title: 'Getting around',
    body: 'The sheet, revision, notes, peers and the leaderboard are all one click from here.',
  },
  {
    route: '/sheet',
    target: '[data-tour="sheet-progress"]',
    title: 'The sheet',
    body: 'All 474 problems across 18 steps. Filter by step, difficulty, text, or status.',
  },
  {
    route: '/sheet',
    target: '[data-tour="sheet-list"]',
    title: 'Solve & run',
    body: 'Mark a problem Solved to earn XP, or open Code to write and run your solution in-app.',
  },
  {
    route: '/dashboard',
    title: "You're all set!",
    body: 'Replay this tour any time from the Guide. Now go build a streak. 🔥',
  },
];

/**
 * Drives the interactive product tour. Holds only the step index and active flag as signals; the
 * {@link TourOverlay} component reads them to spotlight elements and to navigate between routes.
 *
 * The tour auto-launches once per browser (tracked in localStorage) and can be replayed on demand
 * from the guide. It never blocks the app — `stop()` tears it down from anywhere.
 */
@Service()
export class TourService {
  private readonly index = signal(0);
  private readonly isActive = signal(false);

  readonly active = this.isActive.asReadonly();
  readonly stepIndex = this.index.asReadonly();
  readonly total = STEPS.length;

  readonly step = computed<TourStep | null>(() => (this.isActive() ? STEPS[this.index()] : null));
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() === STEPS.length - 1);

  /** Begin at the first step and remember that the user has now seen the tour. */
  start(): void {
    this.index.set(0);
    this.isActive.set(true);
    this.markSeen();
  }

  /** Launch automatically the first time only; a no-op once the tour has been seen. */
  autoStartOnce(): void {
    if (!this.hasSeen()) {
      this.start();
    }
  }

  next(): void {
    if (this.isLast()) {
      this.stop();
    } else {
      this.index.update((i) => i + 1);
    }
  }

  prev(): void {
    if (!this.isFirst()) {
      this.index.update((i) => i - 1);
    }
  }

  stop(): void {
    this.isActive.set(false);
    this.index.set(0);
  }

  private hasSeen(): boolean {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  private markSeen(): void {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Private mode: the tour will simply offer itself again next visit.
    }
  }
}
