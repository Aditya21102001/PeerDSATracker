import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PeerView } from '../../core/models/api.models';
import { PeerService } from '../../core/services/peer.service';

type Tab = 'search' | 'following' | 'followers';

@Component({
  selector: 'app-peers-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="peers">
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
          (ngModelChange)="search$.next($event)"
        />
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <ul class="people">
        @for (p of people(); track p.id) {
          <li>
            <span class="name">
              {{ p.displayName || p.username }}
              <small>&#64;{{ p.username }}</small>
            </span>
            <span class="stats">{{ p.xp }} XP · {{ p.totalSolved }} solved · {{ p.currentStreak }}🔥</span>
            <button type="button" [class.following]="p.following" (click)="toggleFollow(p)">
              {{ p.following ? 'Following' : 'Follow' }}
            </button>
          </li>
        } @empty {
          <li class="empty">{{ emptyMessage() }}</li>
        }
      </ul>
    </main>
  `,
  styleUrl: './peers-page.scss',
})
export class PeersPage {
  private readonly peers = inject(PeerService);

  protected readonly tabs: Tab[] = ['search', 'following', 'followers'];
  protected readonly tab = signal<Tab>('search');
  protected readonly people = signal<PeerView[]>([]);
  protected readonly error = signal<string | null>(null);
  protected query = '';

  /** Debounced so typing doesn't fire a request per keystroke. */
  protected readonly search$ = new Subject<string>();

  constructor() {
    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.peers.search(q)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (found) => this.people.set(found),
        error: () => this.error.set('Search failed.'),
      });
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.error.set(null);
    this.people.set([]);

    if (tab === 'following') {
      this.peers.following().subscribe({ next: (p) => this.people.set(p) });
    } else if (tab === 'followers') {
      this.peers.followers().subscribe({ next: (p) => this.people.set(p) });
    } else if (this.query.trim()) {
      this.search$.next(this.query);
    }
  }

  protected toggleFollow(peer: PeerView): void {
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
