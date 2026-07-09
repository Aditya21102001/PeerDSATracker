import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { RevisionItem } from '../../core/models/api.models';
import { NotesService } from '../../core/services/notes.service';
import { Spinner } from '../../shared/spinner';

/**
 * Spaced-repetition review queue over the Striver sheet. Reviews follow a fixed interval
 * ladder (1, 3, 7, 16, 35, 90 days, saturating at the top so reviews never stop) — "Got it"
 * climbs a rung, "Forgot" drops back to 1 day. Deliberately not SM-2: with no self-reported
 * recall quality there is nothing to drive an ease factor.
 *
 * A schedule is orthogonal to a problem's status — scheduling or retiring never touches XP
 * or the SOLVED flag. The queue is split into due-now and upcoming.
 */
@Component({
  selector: 'app-revision-page',
  imports: [RouterLink, Spinner],
  template: `
    <main class="revision">
      <header>
        <h1>Revision queue</h1>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/notes">Notes</a>
        </nav>
      </header>

      @if (loading()) {
        <app-spinner label="Loading your revision queue…" />
      } @else {
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <section>
          <h2>Due now ({{ due().length }})</h2>
          <ul class="items">
            @for (i of due(); track i.problemId) {
              <li>
                <span class="title">
                  {{ i.title }}
                  @if (i.overdueDays > 0) {
                    <span class="overdue">{{ i.overdueDays }}d overdue</span>
                  }
                </span>
                <span class="difficulty" [attr.data-level]="i.difficulty">{{ i.difficulty }}</span>
                <span class="interval">every {{ i.intervalDays }}d</span>

                <span class="actions">
                  <button type="button" (click)="reviewed(i)" title="Recalled it — longer interval">
                    Got it
                  </button>
                  <button type="button" class="ghost" (click)="reset(i)" title="Forgot it — back to 1 day">
                    Forgot
                  </button>
                  <a [routerLink]="['/notes', i.problemId]">Note</a>
                  <button type="button" class="ghost" (click)="retire(i)" title="Stop revising">✕</button>
                </span>
              </li>
            } @empty {
              <li class="empty">Nothing due. Mark a problem “Revisit” on the sheet.</li>
            }
          </ul>
        </section>

        <section>
          <h2>Upcoming ({{ upcoming().length }})</h2>
          <ul class="items muted">
            @for (i of upcoming(); track i.problemId) {
              <li>
                <span class="title">{{ i.title }}</span>
                <span class="interval">in {{ daysUntil(i) }}d · every {{ i.intervalDays }}d</span>
              </li>
            } @empty {
              <li class="empty">Nothing scheduled ahead.</li>
            }
          </ul>
        </section>
      }
    </main>
  `,
  styleUrl: './revision-page.scss',
})
export class RevisionPage {
  private readonly api = inject(NotesService);

  protected readonly due = signal<RevisionItem[]>([]);
  protected readonly upcoming = signal<RevisionItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Captured once; templates must not call new Date(). */
  private readonly now = Date.now();

  constructor() {
    this.reload();
  }

  protected daysUntil(item: RevisionItem): number {
    const ms = new Date(item.nextReviewAt).getTime() - this.now;
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }

  protected reviewed(item: RevisionItem): void {
    this.act(item, this.api.reviewed(item.problemId));
  }

  protected reset(item: RevisionItem): void {
    this.act(item, this.api.resetReview(item.problemId));
  }

  protected retire(item: RevisionItem): void {
    this.act(item, this.api.retire(item.problemId));
  }

  /** Every action moves the item out of "due", so drop it optimistically and refresh. */
  private act(item: RevisionItem, request: Observable<unknown>): void {
    this.due.update((list) => list.filter((i) => i.problemId !== item.problemId));

    request.subscribe({
      next: () => this.reload(),
      error: () => {
        this.error.set('Could not update that item.');
        this.reload();
      },
    });
  }

  private reload(): void {
    forkJoin({ due: this.api.dueQueue(), upcoming: this.api.upcoming() }).subscribe({
      next: (data) => {
        this.due.set(data.due);
        this.upcoming.set(data.upcoming);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the revision queue.');
        this.loading.set(false);
      },
    });
  }
}
