import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaderboardRow } from '../../core/models/api.models';
import { AuthStore } from '../../core/services/auth.store';
import { PeerService } from '../../core/services/peer.service';
import { Spinner } from '../../shared/spinner';

type Scope = 'global' | 'peers';

/**
 * Two ranked boards: global (server-paged) and peers (me plus everyone I follow, ranked only
 * within that set, not against the world). Ranks are computed from denormalized counters before
 * LIMIT, so page 2 still carries true global ranks — `row.rank` is authoritative and must never
 * be re-derived from the row's index. `currentStreak` arrives already corrected by the server.
 */
@Component({
  selector: 'app-leaderboard-page',
  imports: [RouterLink, Spinner],
  template: `
    <main class="leaderboard">
      <header>
        <h1>Leaderboard</h1>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/peers">Peers</a>
        </nav>
      </header>

      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="scope() === 'global'"
          [class.active]="scope() === 'global'"
          (click)="select('global')"
        >
          Global
        </button>
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="scope() === 'peers'"
          [class.active]="scope() === 'peers'"
          (click)="select('peers')"
        >
          My peers
        </button>
      </div>

      @if (loading()) {
        <app-spinner label="Loading the leaderboard…" />
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      } @else {
        @if (scope() === 'global') {
          <p class="count">{{ totalUsers() }} members</p>
        } @else {
          <p class="count">You and {{ rows().length - 1 }} peer(s) you follow</p>
        }

        <!-- The table scrolls inside this box rather than widening the page. -->
        <div class="scroll-x">
          <table>
            <caption class="sr-only">Ranked by XP, tie-broken by problems solved</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Member</th>
                <th scope="col">XP</th>
                <th scope="col" class="col-optional">Solved</th>
                <th scope="col">Streak</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.userId) {
                <tr [class.me]="r.userId === myId()">
                  <!-- Server-supplied rank; never swap for $index — page 2 shows true global ranks. -->
                  <td class="rank">{{ r.rank }}</td>
                  <td class="member">
                    {{ r.displayName || r.username }}
                    @if (r.userId === myId()) {
                      <span class="you">you</span>
                    }
                  </td>
                  <td class="num">{{ r.xp }}</td>
                  <td class="num col-optional">{{ r.totalSolved }}</td>
                  <td class="num">{{ r.currentStreak }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="empty">Nothing here yet. Solve a problem to get on the board.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </main>
  `,
  styleUrl: './leaderboard-page.scss',
})
export class LeaderboardPage {
  private readonly peers = inject(PeerService);
  private readonly auth = inject(AuthStore);

  protected readonly scope = signal<Scope>('global');
  protected readonly rows = signal<LeaderboardRow[]>([]);
  protected readonly totalUsers = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly myId = computed(() => this.auth.currentUser()?.id ?? null);

  constructor() {
    // /auth/me may not have been fetched yet on a hard reload of this route.
    if (!this.auth.currentUser()) {
      this.auth.loadMe().subscribe({ error: () => {} });
    }
    this.select('global');
  }

  protected select(scope: Scope): void {
    this.scope.set(scope);
    this.loading.set(true);
    this.error.set(null);

    // The two endpoints return different shapes: global is paged, peers is a bare list.
    if (scope === 'global') {
      this.peers.globalLeaderboard().subscribe({
        next: (data) => {
          this.rows.set(data.rows);
          this.totalUsers.set(data.totalUsers);
          this.loading.set(false);
        },
        error: () => this.fail(),
      });
    } else {
      this.peers.peersLeaderboard().subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => this.fail(),
      });
    }
  }

  private fail(): void {
    this.error.set('Could not load the leaderboard.');
    this.loading.set(false);
  }
}
