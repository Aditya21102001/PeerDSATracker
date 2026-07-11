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
import { HeatmapCalendar } from '../../shared/heatmap-calendar';
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
  imports: [HeatmapCalendar, RouterLink, Spinner],
  template: `
    <main class="dashboard">
      <header>
        <h1>⚡ The Grind ⚡</h1>
        <nav>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/revision">Revision</a>
          <a routerLink="/notes">Notes</a>
          <a routerLink="/peers">Peers</a>
          <a routerLink="/leaderboard">Leaderboard</a>
          <a routerLink="/profile">Platforms</a>
          <a routerLink="/guide">Guide</a>
          <button type="button" class="link" (click)="signOut()">Sign out</button>
        </nav>
      </header>

      @if (loading()) {
        <app-spinner label="Loading your dashboard…" />
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      } @else {
        <section class="tiles">
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

        <section class="card">
          <app-heatmap-calendar [days]="heatmap()" [today]="today" />
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
              <div class="topics">
                <div>
                  <h3>Weakest topics</h3>
                  <ul>
                    @for (t of w.weakest; track t.topic) {
                      <li>
                        <span>{{ t.topic }}</span>
                        <span class="num">{{ t.solved }}/{{ t.total }}</span>
                      </li>
                    }
                  </ul>
                </div>
                <div>
                  <h3>Strongest topics</h3>
                  <ul>
                    @for (t of w.strongest; track t.topic) {
                      <li>
                        <span>{{ t.topic }}</span>
                        <span class="num">{{ t.solved }}/{{ t.total }}</span>
                      </li>
                    }
                  </ul>
                </div>
              </div>
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

  /** Captured once at construction: templates must not call new Date(). */
  protected readonly today = new Date();

  protected readonly streak = signal<StreakSummary | null>(null);
  protected readonly xp = signal<XpView | null>(null);
  protected readonly badges = signal<BadgeView[]>([]);
  protected readonly heatmap = signal<HeatmapDay[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly weakness = signal<WeaknessReport | null>(null);
  protected readonly recommendations = signal<Recommendation[]>([]);
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
