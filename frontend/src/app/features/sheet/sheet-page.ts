import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Difficulty, Problem, ProblemStatus, StatusFilter } from '../../core/models/api.models';
import { AuthStore } from '../../core/services/auth.store';
import { ProgressStore } from '../../core/services/progress.store';
import { Spinner } from '../../shared/spinner';

const STATUSES: readonly ProblemStatus[] = ['SOLVED', 'ATTEMPTED', 'REVISIT'];

/**
 * The Grind Sheet: a server-paged, server-filtered view of the 474 problems (sourced from
 * the Striver A2Z sheet), ordered step -> sub-step -> position.
 *
 * Every status/star edit is routed through ProgressStore and applied optimistically. The
 * filter controls re-query the server on each change rather than slicing the loaded page,
 * because paging and filtering are server-side and the server owns the progress counters.
 */
@Component({
  selector: 'app-sheet-page',
  imports: [FormsModule, RouterLink, Spinner],
  template: `
    <main class="sheet">
      <header>
        <div class="title">
          <h1>The Grind Sheet</h1>
          <!-- The 474 problems are someone else's curated list. Credit it. -->
          <p class="credit">
            474 problems, curated from the
            <a
              href="https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2"
              target="_blank"
              rel="noopener"
              >Striver A2Z sheet</a
            >.
          </p>
        </div>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/revision">Revision</a>
          <a routerLink="/leaderboard">Leaderboard</a>
          <button type="button" class="link" (click)="signOut()">Sign out</button>
        </nav>
      </header>

      @if (store.progress(); as p) {
        <section class="overall" aria-label="Overall progress">
          <div class="bar-row">
            <strong>{{ p.solved }} / {{ p.total }} solved</strong>
            <span>{{ store.solvedPercent() }}%</span>
          </div>
          <div
            class="bar"
            role="progressbar"
            [attr.aria-valuenow]="store.solvedPercent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="fill" [style.width.%]="store.solvedPercent()"></div>
          </div>
          <p class="counts">
            {{ p.attempted }} attempted · {{ p.revisit }} to revisit · {{ p.starred }} starred
          </p>
        </section>

        <details class="steps">
          <summary>Progress by step ({{ p.steps.length }})</summary>
          <ul>
            @for (s of p.steps; track s.stepNo) {
              <li>
                <span class="step-title">{{ s.stepNo }}. {{ s.stepTitle }}</span>
                <span class="step-count">{{ s.solved }}/{{ s.total }}</span>
                <div class="bar small">
                  <div class="fill" [style.width.%]="percent(s.solved, s.total)"></div>
                </div>
              </li>
            }
          </ul>
        </details>
      }

      <div class="filters">
        <label for="q" class="sr-only">Search problems</label>
        <input id="q" type="search" placeholder="Search problems…" [(ngModel)]="query" (ngModelChange)="reload()" />

        <label for="difficulty" class="sr-only">Difficulty</label>
        <select id="difficulty" [(ngModel)]="difficulty" (ngModelChange)="reload()">
          <option [ngValue]="null">All difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>

        <label for="status" class="sr-only">Status</label>
        <select id="status" [(ngModel)]="status" (ngModelChange)="reload()">
          <option [ngValue]="null">Any status</option>
          <option value="UNSOLVED">Unsolved</option>
          <option value="SOLVED">Solved</option>
          <option value="ATTEMPTED">Attempted</option>
          <option value="REVISIT">Revisit</option>
          <option value="STARRED">Starred</option>
        </select>
      </div>

      @if (store.loading()) {
        <app-spinner label="Loading problems…" />
      } @else {
        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }
        <p class="count">{{ store.total() }} problems</p>

        <ul class="problems">
          @for (p of store.problems(); track p.id) {
            <li [class.solved]="p.status === 'SOLVED'">
              <button
                type="button"
                class="star"
                [attr.aria-pressed]="p.starred"
                [attr.aria-label]="'Star ' + p.title"
                (click)="store.toggleStar(p)"
              >
                {{ p.starred ? '★' : '☆' }}
              </button>

              <span class="step">{{ p.stepNo }}</span>
              <span class="title">{{ p.title }}</span>
              <span class="difficulty" [attr.data-level]="p.difficulty">{{ p.difficulty }}</span>

              <span class="actions" role="group" [attr.aria-label]="'Status for ' + p.title">
                @for (s of statuses; track s) {
                  <button
                    type="button"
                    [class.active]="p.status === s"
                    [attr.aria-pressed]="p.status === s"
                    (click)="cycle(p, s)"
                  >
                    {{ label(s) }}
                  </button>
                }
              </span>

              <a class="note" [routerLink]="['/notes', p.id]" [attr.aria-label]="'Note for ' + p.title">
                Note
              </a>

              @if (p.leetcodeUrl) {
                <a [href]="p.leetcodeUrl" target="_blank" rel="noopener">LeetCode</a>
              } @else {
                <span class="no-link" aria-hidden="true"></span>
              }
            </li>
          } @empty {
            <li class="empty">No problems match those filters.</li>
          }
        </ul>
      }
    </main>
  `,
  styleUrl: './sheet-page.scss',
})
export class SheetPage {
  protected readonly store = inject(ProgressStore);
  private readonly auth = inject(AuthStore);

  protected readonly statuses = STATUSES;

  protected query = '';
  protected difficulty: Difficulty | null = null;
  protected status: StatusFilter | null = null;

  constructor() {
    this.reload();
    this.store.loadProgress();
  }

  protected reload(): void {
    this.store.load({
      q: this.query,
      difficulty: this.difficulty,
      status: this.status,
      size: 100,
    });
  }

  /** Clicking the active status clears it, so the same button both sets and unsets. */
  protected cycle(problem: Problem, status: ProblemStatus): void {
    this.store.setStatus(problem, problem.status === status ? null : status);
  }

  protected percent(solved: number, total: number): number {
    return total > 0 ? Math.round((solved / total) * 100) : 0;
  }

  protected label(status: ProblemStatus): string {
    return status === 'SOLVED' ? 'Solved' : status === 'ATTEMPTED' ? 'Tried' : 'Revisit';
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
