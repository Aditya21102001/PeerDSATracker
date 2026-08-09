import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  BadgeView,
  HeatmapDay,
  Recommendation,
  StreakSummary,
  WeaknessReport,
  XpView,
} from '../../core/models/api.models';
import { ActivityService } from '../../core/services/activity.service';
import { AuthStore } from '../../core/services/auth.store';
import { InsightsService } from '../../core/services/insights.service';
import { TourService } from '../../core/services/tour.service';
import { HeatmapCalendar } from '../../shared/heatmap-calendar';
import { MasteryChart } from '../../shared/mastery-chart/mastery-chart';
import { MailSummaryCard, MailSummaryItem } from '../../shared/mail-summary-card/mail-summary-card';
import { Spinner } from '../../shared/spinner';

/**
 * The landing dashboard: streak, XP/level, badge progress, the activity heatmap, and an
 * analytics-backed insights panel (weakest/strongest topics plus revise-next picks).
 *
 * Core stats and insights load as two independent requests so the optional analytics
 * service — which answers 503 while Render's free tier is spun down — can degrade its own
 * panel without ever blocking the rest of the page.
 */
@Component({
  selector: 'app-dashboard',
  imports: [HeatmapCalendar, MailSummaryCard, MasteryChart, RouterLink, Spinner],
  template: `
    <main id="main-content" tabindex="-1" class="dashboard">
      <header>
        <h1>⚡ The Grind ⚡</h1>
        <nav data-tour="nav">
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/revision">Revision</a>
          <a routerLink="/notes">Notes</a>
          <a routerLink="/peers">Peers</a>
          <a routerLink="/messages">Messages</a>
          <a routerLink="/leaderboard">Leaderboard</a>
          <a routerLink="/profile">Platforms</a>
          <!-- Set or change a password. Reachable from here because an account created through
               Google has never had one, and its owner has nowhere else to go looking. -->
          <a routerLink="/security">Password</a>
          <a routerLink="/guide">Guide</a>
          <button type="button" class="link" (click)="signOut()">Sign out</button>
        </nav>
      </header>

      @if (loading()) {
        <app-spinner label="Loading your dashboard…" />
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      } @else {
        <section class="tiles stagger" data-tour="stats">
          <div class="tile">
            <span class="value">{{ streak()?.current ?? 0 }}</span>
            <span class="label">Day streak</span>
          </div>
          <div class="tile">
            <span class="value">{{ streak()?.longest ?? 0 }}</span>
            <span class="label">Longest streak</span>
          </div>
          <div class="tile">
            <span class="value">{{ xp()?.xp ?? 0 }}</span>
            <span class="label">XP · level {{ xp()?.level ?? 1 }}</span>
          </div>
          <div class="tile">
            <span class="value">{{ earnedCount() }}/{{ badges().length }}</span>
            <span class="label">Badges</span>
          </div>
        </section>

        @if (xp(); as x) {
          <section class="level" aria-label="Level progress">
            <div class="bar-row">
              <span>Level {{ x.level }}</span>
              <span>{{ x.xpToNextLevel }} XP to level {{ x.level + 1 }}</span>
            </div>
            <div
              class="bar"
              role="progressbar"
              [attr.aria-valuenow]="levelPercent()"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="fill" [style.width.%]="levelPercent()"></div>
            </div>
          </section>
        }

        <section class="card" data-tour="heatmap">
          <app-heatmap-calendar [days]="heatmap()" [today]="today" />
        </section>

        <section class="card">
          <h2>Daily digest</h2>
          <app-mail-summary-card [item]="dailyDigest()" />
        </section>

        <section class="card">
          <h2>Insights</h2>
          @if (insightsLoading()) {
            <app-spinner
              inline
              [size]="16"
              label="Waking the analytics service… this takes about a minute after idle."
            />
          } @else if (insightsDown()) {
            <p class="muted">
              Analytics is unavailable right now. Everything else on this page still works.
            </p>
          } @else {
            @if (weakness(); as w) {
              <p class="muted">Overall mastery {{ (w.overallMastery * 100).toFixed(1) }}%</p>

              <!--
                Replaces the two "weakest"/"strongest" lists. Those showed only the extremes and
                left the middle invisible, so there was no way to see the shape of your progress
                — which topic is nearly done, which has barely started. One sorted chart shows
                every topic at once and puts the weak tail at the bottom.
              -->
              <app-mastery-chart [topics]="allTopics()" />
            }

            @if (recommendations().length) {
              <h3>Revise next</h3>
              <ul class="recs">
                @for (r of recommendations(); track r.problemId) {
                  <li>
                    <a [routerLink]="['/notes', r.problemId]">{{ r.title }}</a>
                    <span class="reason">{{ r.reason }}</span>
                  </li>
                }
              </ul>
            }
          }
        </section>

        <section class="card">
          <h2>Badges</h2>
          <ul class="badges">
            @for (b of badges(); track b.code) {
              <li [class.earned]="b.earned" [title]="b.description ?? b.name">
                <span class="icon" aria-hidden="true">{{ b.icon }}</span>
                <span class="name">{{ b.name }}</span>
                <span class="criteria">{{ b.criteriaValue }} {{ criteriaLabel(b) }}</span>
              </li>
            }
          </ul>
        </section>
      }
    </main>
  `,
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly activity = inject(ActivityService);
  private readonly insights = inject(InsightsService);
  private readonly auth = inject(AuthStore);
  private readonly tour = inject(TourService);

  /** Captured once at construction: templates must not call new Date(). */
  protected readonly today = new Date();

  protected readonly streak = signal<StreakSummary | null>(null);
  protected readonly xp = signal<XpView | null>(null);
  protected readonly badges = signal<BadgeView[]>([]);
  protected readonly heatmap = signal<HeatmapDay[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly weakness = signal<WeaknessReport | null>(null);

  /**
   * The two lists the analytics service returns, merged for the chart.
   *
   * De-duplicated by topic: with a small sheet the same topic can legitimately appear in both
   * "weakest" and "strongest", and a chart listing it twice looks like a bug.
   */
  protected readonly allTopics = computed(() => {
    const report = this.weakness();
    if (!report) {
      return [];
    }
    const byTopic = new Map<string, (typeof report.weakest)[number]>();
    for (const t of [...report.strongest, ...report.weakest]) {
      byTopic.set(t.topic, t);
    }
    return [...byTopic.values()];
  });
  protected readonly recommendations = signal<Recommendation[]>([]);
  protected readonly dailyDigest = signal<MailSummaryItem>({
    title: 'DSA Tracker · morning',
    senderName: 'Kasukabe Task Force',
    senderEmail: 'pranjalgaur.20.12@gmail.com',
    timestamp: '07:44',
    subject: 'Ding ding! Aditya Yadav, round one.',
    summary:
      'You are 0/369 solved overall and 0/139 on Both, with Jyoti sitting 7 spots ahead. The theme is consistent daily effort over perfection.',
    highlights: [
      'Estimate before you architect: turn daily work into simple, repeatable progress.',
      'Keep the streak alive with one focused study block today.',
      'Use the revision queue to close the gap with your current peer.',
    ],
    footer: 'Action Kamen approves of consistent ticks.',
    accent: '☀️',
  });
  /** The analytics service is optional; the dashboard must render without it. */
  protected readonly insightsDown = signal(false);
  /** True while InsightsService is retrying through a Render cold start. */
  protected readonly insightsLoading = signal(true);

  protected readonly earnedCount = computed(() => this.badges().filter((b) => b.earned).length);

  protected readonly levelPercent = computed(() => {
    const x = this.xp();
    return x ? Math.round((x.xpIntoLevel / x.xpPerLevel) * 100) : 0;
  });

  constructor() {
    forkJoin({
      streak: this.activity.streak(),
      xp: this.activity.xp(),
      badges: this.activity.badges(),
      heatmap: this.activity.heatmap(),
    }).subscribe({
      next: (data) => {
        this.streak.set(data.streak);
        this.xp.set(data.xp);
        this.badges.set(data.badges);
        this.heatmap.set(data.heatmap);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your dashboard.');
        this.loading.set(false);
      },
    });

    // Kept out of the forkJoin above: a 503 from the analytics service must not take
    // the whole dashboard down with it. InsightsService retries through a cold start.
    forkJoin({
      weakness: this.insights.weakness(),
      reviseNext: this.insights.reviseNext(),
    }).subscribe({
      next: (data) => {
        this.weakness.set(data.weakness);
        this.recommendations.set(data.reviseNext.recommendations.slice(0, 5));
        this.insightsLoading.set(false);
      },
      error: () => {
        this.insightsDown.set(true);
        this.insightsLoading.set(false);
      },
    });

    // First visit only: walk a new user through the app. Deferred so the intro card shows
    // while the dashboard data above is still loading. Replayable from the Guide.
    queueMicrotask(() => this.tour.autoStartOnce());
  }

  protected criteriaLabel(badge: BadgeView): string {
    switch (badge.criteriaType) {
      case 'TOTAL_SOLVED':
        return 'solved';
      case 'STREAK':
        return 'day streak';
      case 'XP':
        return 'XP';
      default:
        return '';
    }
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
