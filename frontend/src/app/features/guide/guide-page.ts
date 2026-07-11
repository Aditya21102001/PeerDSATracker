import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { BadgeView } from '../../core/models/api.models';
import { ActivityService } from '../../core/services/activity.service';
import { AuthStore } from '../../core/services/auth.store';
import { InsightsService } from '../../core/services/insights.service';
import { NotesService } from '../../core/services/notes.service';
import { SheetService } from '../../core/services/sheet.service';
import { TourService } from '../../core/services/tour.service';
import { Spinner } from '../../shared/spinner';

/** One row of the signed-in user's "next steps" checklist. */
interface Task {
  done: boolean;
  label: string;
  detail: string;
  link: string;
  action: string;
}

/** The signed-in user's live progress, gathered to personalise the guide. */
interface GuideStats {
  solved: number;
  streak: number;
  level: number;
  xp: number;
  toNext: number;
  nextLevel: number;
  scheduled: number;
  platforms: number;
  nextBadge: string | null;
}

/**
 * A public how-it-works page, linked from the welcome page and the dashboard nav. It has no
 * guard, so both logged-out visitors and signed-in users can read it.
 *
 * For a signed-in user it opens with a **personalised "next steps" panel** driven by their real
 * progress (level, streak, what they haven't tried yet) and a button to replay the product tour;
 * the reference sections below explain each feature. A logged-out visitor sees only the reference
 * material plus signup CTAs. Every panel fetch is best-effort — a failed call degrades that line,
 * never the page.
 *
 * The static numbers here (XP values, the interval ladder, XP-per-level) mirror the backend and
 * must be kept in step with GamificationService and RevisionSchedule if those ever change.
 */
@Component({
  selector: 'app-guide-page',
  imports: [RouterLink, Spinner],
  template: `
    <main class="guide">
      <header>
        <h1>How The Grind works</h1>
        <nav>
          @if (isAuthenticated()) {
            <a routerLink="/dashboard">Dashboard</a>
            <a routerLink="/sheet">Sheet</a>
          } @else {
            <a routerLink="/">Home</a>
            <a routerLink="/signup" class="btn btn-sm">Get started</a>
          }
        </nav>
      </header>

      <p class="lede">
        Everything here is built around one loop: solve a problem, mark it, and let the app turn
        that into XP, a streak, and a revision plan. Here's each piece.
      </p>

      @if (isAuthenticated()) {
        <section class="you card" aria-label="Your next steps">
          <div class="you-head">
            <h2>Your next steps</h2>
            <button type="button" class="btn btn-sm" (click)="tour.start()">↺ Take the tour</button>
          </div>

          @if (loading()) {
            <app-spinner inline label="Loading your progress…" />
          } @else if (stats(); as s) {
            <p class="level">
              Level {{ s.level }} · {{ s.xp }} XP@if (s.toNext > 0) {
                · {{ s.toNext }} XP to level {{ s.nextLevel }}
              }
            </p>

            <ul class="checklist">
              @for (task of checklist(); track task.label) {
                <li [class.done]="task.done">
                  <span class="mark" aria-hidden="true">{{ task.done ? '✓' : '○' }}</span>
                  <span class="ctext">
                    <strong>{{ task.label }}</strong>
                    <small>{{ task.detail }}</small>
                  </span>
                  @if (!task.done) {
                    <a class="btn btn-sm btn-ghost" [routerLink]="task.link">{{ task.action }}</a>
                  }
                </li>
              }
            </ul>

            @if (s.nextBadge) {
              <p class="badge-hint">🏅 {{ s.nextBadge }}</p>
            }
          }
        </section>
      }

      <ol class="toc" aria-label="Contents">
        <li><a href="#start">Getting started</a></li>
        <li><a href="#sheet">The sheet &amp; statuses</a></li>
        <li><a href="#xp">XP, levels &amp; badges</a></li>
        <li><a href="#streak">Streaks &amp; the heatmap</a></li>
        <li><a href="#revision">Revision</a></li>
        <li><a href="#notes">Notes</a></li>
        <li><a href="#code">Write &amp; run code</a></li>
        <li><a href="#peers">Peers &amp; leaderboards</a></li>
        <li><a href="#platforms">Linked platforms</a></li>
      </ol>

      <section id="start" class="card">
        <h2>1. Getting started</h2>
        <p>
          Create an account, and your copy of the Striver A2Z sheet — 474 problems across 18 steps
          — is ready on first login. Open <strong>Sheet</strong> from the dashboard to begin. There
          is nothing to install and nothing to configure.
        </p>
      </section>

      <section id="sheet" class="card">
        <h2>2. The sheet &amp; statuses</h2>
        <p>Each problem carries one status, which you set as you work:</p>
        <ul class="defs">
          <li><span class="pill" data-level="EASY">Solved</span> You cracked it. This is the only status that earns XP and feeds your streak.</li>
          <li><span class="tag">Attempted</span> You had a go but didn't finish. No XP — just a marker to come back.</li>
          <li><span class="tag">Revisit</span> Worth another look. Pairs naturally with the revision queue.</li>
          <li><span class="tag star">★ Star</span> A bookmark, independent of status. Star anything you want to find fast.</li>
        </ul>
        <p class="muted">
          Filter the list by step, difficulty, text, or status — including <em>Unsolved</em> and
          <em>Starred</em> — to zero in on what's next.
        </p>
      </section>

      <section id="xp" class="card">
        <h2>3. XP, levels &amp; badges</h2>
        <p>Marking a problem <strong>Solved</strong> awards XP by difficulty:</p>
        <ul class="xp-row">
          <li><span class="pill" data-level="EASY">Easy</span> 10 XP</li>
          <li><span class="pill" data-level="MEDIUM">Medium</span> 20 XP</li>
          <li><span class="pill" data-level="HARD">Hard</span> 40 XP</li>
        </ul>
        <p>
          You gain a level every <strong>500 XP</strong>; the full sheet is worth 10,680 XP.
          <strong>Badges</strong> unlock automatically as you hit milestones for total solves,
          streak length, and XP — and once earned, a badge is never taken away. Un-marking a solve
          cleanly refunds its XP, so nothing drifts.
        </p>
      </section>

      <section id="streak" class="card">
        <h2>4. Streaks &amp; the heatmap</h2>
        <p>
          Solve at least one problem in a day and your <strong>streak</strong> grows by one; miss a
          day and it resets to zero. The dashboard <strong>heatmap</strong> shows every active day,
          GitHub-style — darker cells mean more solved. A day with no activity simply stays blank.
        </p>
        <p class="muted">
          "Day" follows the server's configured time zone, so late-night solves land on the day you
          meant them to.
        </p>
      </section>

      <section id="revision" class="card">
        <h2>5. Revision (spaced repetition)</h2>
        <p>
          Schedule any problem for revision and it comes back to you on a fixed interval ladder:
        </p>
        <p class="ladder"><span>1</span><span>3</span><span>7</span><span>16</span><span>35</span><span>90</span><small>days</small></p>
        <p>
          When a review is due, mark <strong>Got it</strong> to climb one rung (wait longer next
          time) or <strong>Forgot</strong> to drop back to a 1-day interval. Scheduling never
          changes a problem's solved status — the two are independent. The <strong>Revision</strong>
          page splits everything into what's due now and what's coming up.
        </p>
      </section>

      <section id="notes" class="card">
        <h2>6. Notes</h2>
        <p>
          Keep one note per problem — your approach, the edge cases, why you got it wrong. Find them
          all on the <strong>Notes</strong> page. Clearing a note deletes it.
        </p>
      </section>

      <section id="code" class="card">
        <h2>7. Write &amp; run code</h2>
        <p>
          Every problem has a <strong>Code</strong> editor (from the sheet, or the Code link on a
          note). Pick a language — Python, C++, Java, JavaScript, C, or Go — write your solution, and
          hit <strong>Run</strong> to execute it against optional standard input; you'll see stdout,
          any errors, and the exit code. <strong>Save</strong> keeps a draft per language, so it's
          waiting for you next time.
        </p>
        <p class="muted">
          Code runs in a secure sandbox, not in your browser, so the first run after an idle spell
          can take a few seconds while it warms up.
        </p>
      </section>

      <section id="peers" class="card">
        <h2>8. Peers &amp; leaderboards</h2>
        <p>
          Search for other users and <strong>follow</strong> them. The <strong>Leaderboard</strong>
          has two views: a <em>global</em> board ranked by XP, and a <em>peers</em> board of just you
          and the people you follow. Ranks are real global positions, so they stay meaningful as you
          page through.
        </p>
      </section>

      <section id="platforms" class="card">
        <h2>9. Linked platforms</h2>
        <p>
          On <strong>Platforms</strong> you can link your LeetCode and Codeforces handles to see
          those stats next to your sheet progress. Codeforces has an official API and is reliable;
          LeetCode is best-effort, and a failed sync never touches your sheet. These external numbers
          are shown side by side — they're never merged into your streak or XP, which you earn here.
        </p>
      </section>

      <section class="closer">
        @if (isAuthenticated()) {
          <a routerLink="/sheet" class="btn">Open the sheet</a>
        } @else {
          <a routerLink="/signup" class="btn">Start grinding</a>
          <a routerLink="/signin" class="btn btn-quiet">Sign in</a>
        }
      </section>
    </main>
  `,
  styleUrl: './guide-page.scss',
})
export class GuidePage {
  private readonly auth = inject(AuthStore);
  private readonly sheet = inject(SheetService);
  private readonly activity = inject(ActivityService);
  private readonly notes = inject(NotesService);
  private readonly insights = inject(InsightsService);
  protected readonly tour = inject(TourService);

  /** Drives the header/footer CTAs: Dashboard/Open the sheet when signed in, Get started when not. */
  protected readonly isAuthenticated = this.auth.isAuthenticated;

  protected readonly loading = signal(this.auth.isAuthenticated());
  protected readonly stats = signal<GuideStats | null>(null);

  /** The next-steps checklist, derived from the live progress once it loads. */
  protected readonly checklist = computed<Task[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    return [
      {
        done: s.solved > 0,
        label: 'Solve your first problem',
        detail: s.solved > 0 ? `${s.solved} solved so far` : 'Open the sheet and mark one Solved',
        link: '/sheet',
        action: 'Open sheet',
      },
      {
        done: s.streak > 0,
        label: 'Keep a daily streak',
        detail: s.streak > 0 ? `🔥 ${s.streak}-day streak going` : 'Solve one today to start a streak',
        link: '/sheet',
        action: 'Solve today',
      },
      {
        done: s.scheduled > 0,
        label: 'Queue a problem for revision',
        detail: s.scheduled > 0 ? `${s.scheduled} scheduled for review` : 'Nothing scheduled yet',
        link: '/revision',
        action: 'Set up revision',
      },
      {
        done: s.platforms > 0,
        label: 'Link a coding platform',
        detail: s.platforms > 0 ? `${s.platforms} linked` : 'Bring your LeetCode / Codeforces stats',
        link: '/profile',
        action: 'Link account',
      },
    ];
  });

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.loadProgress();
    }
  }

  /**
   * Gathers the signed-in user's live progress. Every stream is best-effort: a failed call
   * defaults its slice rather than blanking the whole panel.
   */
  private loadProgress(): void {
    forkJoin({
      progress: this.sheet.progress().pipe(catchError(() => of(null))),
      streak: this.activity.streak().pipe(catchError(() => of(null))),
      xp: this.activity.xp().pipe(catchError(() => of(null))),
      badges: this.activity.badges().pipe(catchError(() => of([] as BadgeView[]))),
      due: this.notes.dueQueue().pipe(catchError(() => of([]))),
      upcoming: this.notes.upcoming().pipe(catchError(() => of([]))),
      accounts: this.insights.accounts().pipe(catchError(() => of([]))),
    }).subscribe((data) => {
      const solved = data.progress?.solved ?? 0;
      this.stats.set({
        solved,
        streak: data.streak?.current ?? 0,
        level: data.xp?.level ?? 1,
        xp: data.xp?.xp ?? 0,
        toNext: data.xp?.xpToNextLevel ?? 0,
        nextLevel: (data.xp?.level ?? 1) + 1,
        scheduled: data.due.length + data.upcoming.length,
        platforms: data.accounts.length,
        nextBadge: this.nextBadge(data.badges, solved, data.xp?.xp ?? 0),
      });
      this.loading.set(false);
    });
  }

  /** The closest unearned solve- or XP-threshold badge, phrased as a gap to close. */
  private nextBadge(badges: BadgeView[], solved: number, xp: number): string | null {
    const closest = (type: 'TOTAL_SOLVED' | 'XP', have: number) =>
      badges
        .filter((b) => !b.earned && b.criteriaType === type && b.criteriaValue > have)
        .sort((a, b) => a.criteriaValue - b.criteriaValue)[0];

    const bySolves = closest('TOTAL_SOLVED', solved);
    if (bySolves) {
      const gap = bySolves.criteriaValue - solved;
      return `${gap} more ${gap === 1 ? 'solve' : 'solves'} → ${bySolves.name}`;
    }
    const byXp = closest('XP', xp);
    if (byXp) {
      return `${byXp.criteriaValue - xp} XP → ${byXp.name}`;
    }
    return null;
  }
}
