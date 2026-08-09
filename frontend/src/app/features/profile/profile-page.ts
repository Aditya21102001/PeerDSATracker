import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MailPreferences, Platform, PlatformAccountView, SyncRunView } from '../../core/models/api.models';
import { InsightsService } from '../../core/services/insights.service';

/**
 * Links LeetCode / Codeforces handles and shows each account's cached external stats
 * alongside its recent sync runs.
 *
 * Those external numbers sit beside — and are never merged into — the sheet's streak and
 * XP, which are earned here only. Sync is best-effort (LeetCode has no official API), so a
 * failed run is recorded as FAILED and the last cached stats simply stay put. "Sync now"
 * exists because Render's free tier skips the scheduled sync while the backend sleeps.
 */
@Component({
  selector: 'app-profile-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="profile">
      <header>
        <h1>Linked platforms</h1>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <!-- "Account settings" is where people look for a password, and this page is the
               closest thing to one, so the link belongs here as well as on the dashboard. -->
          <a routerLink="/security">Password</a>
        </nav>
      </header>

      <p class="hint">
        Codeforces has an official API and is reliable. LeetCode does not — that sync uses an
        undocumented endpoint and is best-effort; a failure here never affects your sheet progress.
      </p>

      <section class="link-form">
        <label for="platform" class="sr-only">Platform</label>
        <select id="platform" [(ngModel)]="platform">
          <option value="LEETCODE">LeetCode</option>
          <option value="CODEFORCES">Codeforces</option>
        </select>

        <label for="handle" class="sr-only">Handle</label>
        <input id="handle" type="text" placeholder="your handle" [(ngModel)]="handle" />

        <button type="button" class="btn" (click)="link()" [disabled]="!handle.trim() || busy()">Link</button>
        <button
          type="button"
          class="btn btn-ghost"
          (click)="sync()"
          [disabled]="busy() || !accounts().length"
        >
          {{ busy() ? 'Syncing…' : 'Sync now' }}
        </button>
      </section>

      @if (message()) {
        <p class="message" role="status">{{ message() }}</p>
      }

      <ul class="accounts">
        @for (a of accounts(); track a.platform) {
          <li>
            <div class="head">
              <strong>{{ a.platform }}</strong>
              <span class="handle">&#64;{{ a.handle }}</span>
              <button type="button" class="ghost" (click)="unlink(a.platform)">Unlink</button>
            </div>
            <p class="stats">{{ describe(a) }}</p>
            <p class="synced">
              {{ a.lastSyncedAt ? 'Last synced ' + a.lastSyncedAt.slice(0, 19).replace('T', ' ') + ' UTC' : 'Never synced' }}
            </p>
          </li>
        } @empty {
          <li class="empty">No platforms linked yet.</li>
        }
      </ul>

      <section class="emails">
        <h2>Emails</h2>
        <label class="toggle">
          <input
            type="checkbox"
            [checked]="dailyDigest()"
            [disabled]="savingPrefs()"
            (change)="setDailyDigest($event)"
          />
          <span>
            Send me the morning practice digest
            <small>
              One email at 9am with your streak, your week, and what's due for revision. Every one
              of them also has a one-click unsubscribe link.
            </small>
          </span>
        </label>
      </section>

      @if (runs().length) {
        <section>
          <h2>Recent syncs</h2>
          <ul class="runs">
            @for (r of runs(); track r.id) {
              <li [class.failed]="r.status === 'FAILED'">
                <span>{{ r.platform }}</span>
                <span class="status">{{ r.status }}</span>
                <span class="trigger">{{ r.triggerSource }}</span>
                @if (r.errorMessage) {
                  <span class="err">{{ r.errorMessage }}</span>
                }
              </li>
            }
          </ul>
        </section>
      }
    </main>
  `,
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly insights = inject(InsightsService);
  private readonly http = inject(HttpClient);

  /**
   * Mirrors the server's setting rather than assuming it. Someone who unsubscribed from an email
   * footer months ago must see this unticked when they arrive, not ticked and lying to them.
   */
  protected readonly dailyDigest = signal(true);
  protected readonly savingPrefs = signal(false);

  protected platform: Platform = 'LEETCODE';
  protected handle = '';

  protected readonly accounts = signal<PlatformAccountView[]>([]);
  protected readonly runs = signal<SyncRunView[]>([]);
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  /** External stats are stored verbatim as jsonb; each platform has its own shape. */
  protected describe(account: PlatformAccountView): string {
    const s = account.externalStats;
    if (!s) {
      return 'No stats yet — hit “Sync now”.';
    }
    if (account.platform === 'LEETCODE') {
      return `${s['totalSolved']} solved (${s['easy']} easy / ${s['medium']} medium / ${s['hard']} hard) · rank ${s['ranking']}`;
    }
    return `rating ${s['rating']} (max ${s['maxRating']}) · ${s['rank']} · ${s['solvedCount']} solved recently`;
  }

  protected link(): void {
    this.busy.set(true);
    this.insights.link(this.platform, this.handle.trim()).subscribe({
      next: () => {
        this.handle = '';
        this.busy.set(false);
        this.flash('Linked.');
        this.reload();
      },
      error: () => {
        this.busy.set(false);
        this.flash('Could not link that account.');
      },
    });
  }

  protected unlink(platform: Platform): void {
    this.insights.unlink(platform).subscribe({ next: () => this.reload() });
  }

  protected sync(): void {
    this.busy.set(true);
    this.insights.run().subscribe({
      next: (results) => {
        this.busy.set(false);
        const failed = results.filter((r) => r.status === 'FAILED');
        this.flash(failed.length ? `${failed.length} sync(s) failed — see below.` : 'Synced.');
        this.reload();
      },
      error: () => {
        this.busy.set(false);
        this.flash('Sync service unavailable.');
      },
    });
  }

  /**
   * Writes the new value straight through, then re-reads what the server actually stored. If the
   * write fails the checkbox must snap back rather than sit there showing a preference that was
   * never saved — this is the control someone uses when they want the mail to stop.
   */
  protected setDailyDigest(event: Event): void {
    const wanted = (event.target as HTMLInputElement).checked;
    this.savingPrefs.set(true);

    this.http.post<MailPreferences>('/api/mail/preferences', { dailyDigest: wanted }).subscribe({
      next: (saved) => {
        this.savingPrefs.set(false);
        this.dailyDigest.set(saved.dailyDigest);
        this.flash(saved.dailyDigest ? 'Daily digest on.' : 'Daily digest off.');
      },
      error: () => {
        this.savingPrefs.set(false);
        this.dailyDigest.set(!wanted);
        this.flash('Could not save that. Try again.');
      },
    });
  }

  private reload(): void {
    this.insights.accounts().subscribe({ next: (a) => this.accounts.set(a) });
    this.insights.runs().subscribe({ next: (r) => this.runs.set(r.slice(0, 6)) });
    this.http.get<MailPreferences>('/api/mail/preferences').subscribe({
      next: (p) => this.dailyDigest.set(p.dailyDigest),
      error: () => {},
    });
  }

  private flash(text: string): void {
    this.message.set(text);
    setTimeout(() => this.message.set(null), 3000);
  }
}
