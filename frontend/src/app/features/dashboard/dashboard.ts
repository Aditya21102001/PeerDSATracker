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
import { VideoTourService } from '../../core/services/video-tour.service';
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
        <!-- Who is signed in. Hidden on phones, where the More sheet carries the same block. -->
        @if (me(); as user) {
          <a id="dash-account-link" class="account" routerLink="/security" aria-label="Account security and profile for {{ user.displayName || user.username }}">
            <span class="avatar" aria-hidden="true">{{ user.displayName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase() }}</span>
            <span class="identity">
              <strong>{{ user.displayName || user.username }}</strong>
              <small>&#64;{{ user.username }}</small>
            </span>
          </a>
        }
        <nav data-tour="nav" aria-label="Dashboard Primary Navigation">
          <a id="dash-nav-sheet" routerLink="/sheet">Sheet</a>
          <a id="dash-nav-videos" routerLink="/videos" class="highlight-link">📺 Videos</a>
          <a id="dash-nav-interview" routerLink="/interview" class="highlight-link">🤖 AI Interview</a>
          <a id="dash-nav-proctor" routerLink="/proctor">AI Test</a>
          <a id="dash-nav-revision" routerLink="/revision">Revision</a>
          <a id="dash-nav-notes" routerLink="/notes">Notes</a>
          <a id="dash-nav-blog" routerLink="/blog">Articles</a>
          <a id="dash-nav-study-guides" routerLink="/study-guides">Study Guides</a>
          <a id="dash-nav-hire" routerLink="/hire">Hire</a>
          <a id="dash-nav-peers" routerLink="/peers">Peers</a>
          <a id="dash-nav-messages" routerLink="/messages">Messages</a>
          <a id="dash-nav-leaderboard" routerLink="/leaderboard">Leaderboard</a>
          <a id="dash-nav-profile" routerLink="/profile">Platforms</a>
          <a id="dash-nav-security" routerLink="/security">Password</a>
          <a id="dash-nav-guide" routerLink="/guide">Guide</a>
          <button id="dash-btn-video-tour" type="button" class="link video-tour-btn" (click)="videoTour.open()" title="Watch 2-minute video tour">🎬 Tour</button>
          <button id="dash-btn-signout" type="button" class="link sign-out" (click)="signOut()">Sign out</button>
        </nav>
      </header>

      @if (loading()) {
        <app-spinner label="Loading your dashboard…" />
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      } @else {
        <section class="tiles stagger" data-tour="stats" id="dash-tiles-section">
          <a id="dash-tile-streak" routerLink="/sheet" class="tile interactive-tile" aria-label="Current day streak: {{ streak()?.current ?? 0 }} days. Click to view sheet.">
            <span class="value">{{ streak()?.current ?? 0 }}</span>
            <span class="label">Day streak</span>
          </a>
          <a id="dash-tile-longest" routerLink="/sheet" class="tile interactive-tile" aria-label="Longest streak: {{ streak()?.longest ?? 0 }} days. Click to view sheet.">
            <span class="value">{{ streak()?.longest ?? 0 }}</span>
            <span class="label">Longest streak</span>
          </a>
          <a id="dash-tile-xp" routerLink="/sheet" class="tile interactive-tile" aria-label="XP: {{ xp()?.xp ?? 0 }}, Level {{ xp()?.level ?? 1 }}. Click to view sheet.">
            <span class="value">{{ xp()?.xp ?? 0 }}</span>
            <span class="label">XP · level {{ xp()?.level ?? 1 }}</span>
          </a>
          <a id="dash-tile-badges" href="#dash-badges-section" class="tile interactive-tile" aria-label="Badges earned: {{ earnedCount() }} of {{ badges().length }}. Click to jump to badges.">
            <span class="value">{{ earnedCount() }}/{{ badges().length }}</span>
            <span class="label">Badges</span>
          </a>
        </section>

        <!-- Quick Action Launchpad: High-contrast, interactive hubs -->
        <section id="dash-quick-actions" class="quick-actions-section" aria-label="Quick Actions">
          <div class="quick-actions-grid">
            <a id="dash-quick-sheet" routerLink="/sheet" class="action-card action-sheet">
              <span class="action-icon" aria-hidden="true">⚡</span>
              <div class="action-info">
                <strong>Problem Sheet</strong>
                <small>474 curated problems</small>
              </div>
              <span class="action-tag">Solve →</span>
            </a>

            <a id="dash-quick-videos" routerLink="/videos" class="action-card action-videos">
              <span class="action-icon" aria-hidden="true">📺</span>
              <div class="action-info">
                <strong>Video Hub &amp; Playlists</strong>
                <small>Search YouTube &amp; embed</small>
              </div>
              <span class="action-tag new-tag">New</span>
            </a>

            <a id="dash-quick-interview" routerLink="/interview" class="action-card action-interview">
              <span class="action-icon" aria-hidden="true">🤖</span>
              <div class="action-info">
                <strong>AI Mock Interview</strong>
                <small>Real-time speech &amp; hints</small>
              </div>
              <span class="action-tag">Start →</span>
            </a>

            <a id="dash-quick-proctor" routerLink="/proctor" class="action-card action-proctor">
              <span class="action-icon" aria-hidden="true">🎯</span>
              <div class="action-info">
                <strong>AI Challenge Test</strong>
                <small>Timed challenges &amp; anti-cheat</small>
              </div>
              <span class="action-tag">Test →</span>
            </a>

            <a id="dash-quick-guides" routerLink="/study-guides" class="action-card action-guides">
              <span class="action-icon" aria-hidden="true">📚</span>
              <div class="action-info">
                <strong>Study Guides</strong>
                <small>DSA, Spring &amp; Angular</small>
              </div>
              <span class="action-tag">Read →</span>
            </a>

            <a id="dash-quick-hire" routerLink="/hire" class="action-card action-hire">
              <span class="action-icon" aria-hidden="true">💼</span>
              <div class="action-info">
                <strong>Tech Jobs Matchmaker</strong>
                <small>1-Click verified openings</small>
              </div>
              <span class="action-tag">Explore →</span>
            </a>
          </div>
        </section>

        @if (xp(); as x) {
          <section id="dash-level-section" class="level" aria-label="Level progress">
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

        <section id="dash-heatmap-section" class="card" data-tour="heatmap">
          <app-heatmap-calendar [days]="heatmap()" [today]="today" />
        </section>

        <section id="dash-digest-section" class="card">
          <h2>Daily digest</h2>
          <app-mail-summary-card [item]="dailyDigest()" />
        </section>

        <section id="dash-insights-section" class="card">
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
              <ul class="recs" id="dash-recs-list">
                @for (r of recommendations(); track r.problemId) {
                  <li id="dash-rec-item-{{ r.problemId }}">
                    <div class="rec-title-wrap">
                      <a id="dash-rec-title-{{ r.problemId }}" [routerLink]="['/notes', r.problemId]" class="rec-title-link">{{ r.title }}</a>
                      <span class="reason">{{ r.reason }}</span>
                    </div>
                    <div class="rec-actions">
                      <a id="dash-rec-solve-btn-{{ r.problemId }}" [routerLink]="['/code', r.problemId]" class="btn btn-xs btn-primary">Solve</a>
                      <a id="dash-rec-video-btn-{{ r.problemId }}" [routerLink]="['/videos']" [queryParams]="{ q: r.title }" class="btn btn-xs btn-ghost" title="Watch video explanation in Video Hub">📺 Video</a>
                    </div>
                  </li>
                }
              </ul>
            }
          }
        </section>

        <section id="dash-badges-section" class="card">
          <h2>Badges</h2>
          <ul class="badges" id="dash-badges-list">
            @for (b of badges(); track b.code) {
              <li id="dash-badge-{{ b.code }}" [class.earned]="b.earned" [title]="b.description ?? b.name">
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
  protected readonly videoTour = inject(VideoTourService);

  /** Captured once at construction: templates must not call new Date(). */
  protected readonly today = new Date();

  protected readonly streak = signal<StreakSummary | null>(null);
  protected readonly xp = signal<XpView | null>(null);
  protected readonly badges = signal<BadgeView[]>([]);
  protected readonly heatmap = signal<HeatmapDay[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** The signed-in account, for the header. Loaded by AuthStore on session restore. */
  protected readonly me = this.auth.currentUser;

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
    senderName: 'Aditya Yadav',
    senderEmail: 'adityakumaryadav21102001@gmail.com',
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
