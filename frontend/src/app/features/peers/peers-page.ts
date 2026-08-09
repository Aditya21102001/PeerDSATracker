import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, merge, switchMap, tap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PeerView } from '../../core/models/api.models';
import { MessagingService } from '../../core/services/messaging.service';
import { PeerService } from '../../core/services/peer.service';
import { Spinner } from '../../shared/spinner';

type Tab = 'search' | 'following' | 'followers';

/**
 * Peer discovery and the follow graph, across search / following / followers tabs. Search hits
 * an auth-gated endpoint — an open one would let anyone enumerate every registered username.
 * Following is idempotent and self-follows are rejected server-side. A follower need not be
 * followed back, so every row carries its own `following` flag rather than a shared view.
 */
@Component({
  selector: 'app-peers-page',
  imports: [FormsModule, RouterLink, Spinner],
  template: `
    <main id="main-content" tabindex="-1" class="peers">
      <header>
        <h1>Peers</h1>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/leaderboard">Leaderboard</a>
        </nav>
      </header>

      <div class="tabs" role="tablist">
        @for (t of tabs; track t) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === t"
            [class.active]="tab() === t"
            (click)="select(t)"
          >
            {{ tabLabel(t) }}
          </button>
        }
      </div>

      @if (tab() === 'search') {
        <label for="q" class="sr-only">Search by username</label>
        <input
          id="q"
          type="search"
          placeholder="Search usernames…"
          [(ngModel)]="query"
          (ngModelChange)="onQuery($event)"
        />
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <!-- The empty message asserts a fact ("you follow nobody"). Never show it while the
           request that would disprove it is still in flight. -->
      @if (loading()) {
        <app-spinner label="Loading peers…" />
      } @else {
        <ul class="people">
          @for (p of people(); track p.id) {
            <li>
              <span class="name">
                {{ p.displayName || p.username }}
                <small>&#64;{{ p.username }}</small>
              </span>
              <span class="stats">
                {{ p.xp }} XP · {{ p.totalSolved }} solved · {{ p.currentStreak }}🔥
              </span>
              <button type="button" [class.following]="p.following" (click)="toggleFollow(p)">
                {{ p.following ? 'Following' : 'Follow' }}
              </button>
              @if (p.following && p.followsYou) {
                <!-- Shown only when a message could actually be sent. Offering it otherwise would
                     mean a 403 on click, which reads as a broken button rather than a rule. -->
                <button type="button" class="message" (click)="message(p)">Message</button>
              }
            </li>
          } @empty {
            <li class="empty">{{ emptyMessage() }}</li>
          }
        </ul>
      }
    </main>
  `,
  styleUrl: './peers-page.scss',
})
export class PeersPage {
  private readonly peers = inject(PeerService);
  private readonly messaging = inject(MessagingService);
  private readonly router = inject(Router);

  protected readonly tabs: Tab[] = ['search', 'following', 'followers'];
  protected readonly tab = signal<Tab>('search');
  protected readonly people = signal<PeerView[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected query = '';

  /** Keystrokes. Debounced and de-duplicated. */
  private readonly search$ = new Subject<string>();

  /**
   * Re-running the query the tab switch just cleared. This bypasses `distinctUntilChanged`,
   * which would otherwise swallow an identical query and leave the list empty under a
   * "No users match that name" message.
   */
  private readonly rerun$ = new Subject<string>();

  constructor() {
    merge(this.search$.pipe(debounceTime(250), distinctUntilChanged()), this.rerun$)
      .pipe(
        // After the debounce, so a burst of keystrokes is one spinner, not one per key.
        tap(() => this.loading.set(true)),
        switchMap((q) => this.peers.search(q)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (found) => {
          this.people.set(found);
          this.loading.set(false);
        },
        error: () => this.fail('Search failed.'),
      });
  }

  /** The spinner is armed inside the pipe, after the debounce — not here, per keystroke. */
  protected onQuery(query: string): void {
    this.search$.next(query);
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.error.set(null);
    this.people.set([]);

    if (tab === 'following') {
      this.loading.set(true);
      this.peers.following().subscribe({
        next: (p) => {
          this.people.set(p);
          this.loading.set(false);
        },
        error: () => this.fail('Could not load who you follow.'),
      });
    } else if (tab === 'followers') {
      this.loading.set(true);
      this.peers.followers().subscribe({
        next: (p) => {
          this.people.set(p);
          this.loading.set(false);
        },
        error: () => this.fail('Could not load your followers.'),
      });
    } else {
      // Back on the search tab: re-run the last query, or show the prompt-to-type empty state.
      this.loading.set(false);
      if (this.query.trim()) {
        this.rerun$.next(this.query);
      }
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }

  protected toggleFollow(peer: PeerView): void {
    // Optimistic: flip the flag immediately, then roll back to wasFollowing if the request fails.
    const wasFollowing = peer.following;
    this.patch(peer.id, !wasFollowing);

    const request = wasFollowing ? this.peers.unfollow(peer.id) : this.peers.follow(peer.id);
    request.subscribe({
      error: () => {
        this.patch(peer.id, wasFollowing);
        this.error.set('Could not update that follow.');
      },
      complete: () => {
        // The "following" list is defined by the follow edges; drop the row when it leaves.
        if (this.tab() === 'following' && wasFollowing) {
          this.people.update((list) => list.filter((p) => p.id !== peer.id));
        }
      },
    });
  }

  /** Opens (or finds) the thread with this peer and goes there. */
  protected message(p: PeerView): void {
    this.messaging.openWith(p.id).subscribe({
      next: () => void this.router.navigate(['/messages']),
      // Only reachable if the follow changed between render and click.
      error: () => void this.router.navigate(['/messages']),
    });
  }

  protected emptyMessage(): string {
    switch (this.tab()) {
      case 'search':
        return this.query.trim() ? 'No users match that name.' : 'Type a username to find peers.';
      case 'following':
        return 'You are not following anyone yet.';
      default:
        return 'Nobody follows you yet.';
    }
  }

  protected tabLabel(tab: Tab): string {
    return tab === 'search' ? 'Find peers' : tab === 'following' ? 'Following' : 'Followers';
  }

  private patch(id: number, following: boolean): void {
    this.people.update((list) => list.map((p) => (p.id === id ? { ...p, following } : p)));
  }
}
