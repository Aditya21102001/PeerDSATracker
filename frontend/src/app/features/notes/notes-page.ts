import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoteSummary } from '../../core/models/api.models';
import { NotesService } from '../../core/services/notes.service';

@Component({
  selector: 'app-notes-page',
  imports: [RouterLink],
  template: `
    <main class="notes">
      <header>
        <h1>Notes</h1>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/sheet">Sheet</a>
          <a routerLink="/revision">Revision</a>
        </nav>
      </header>

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        <p class="count">{{ total() }} note(s)</p>
        <ul>
          @for (n of notes(); track n.problemId) {
            <li>
              <a [routerLink]="['/notes', n.problemId]">
                <span class="title">{{ n.problemTitle }}</span>
                <span class="step">Step {{ n.stepNo }}</span>
              </a>
              <p class="snippet">{{ snippet(n) }}</p>
            </li>
          } @empty {
            <li class="empty">
              No notes yet. Open a problem from the <a routerLink="/sheet">sheet</a> and write one.
            </li>
          }
        </ul>
      }
    </main>
  `,
  styleUrl: './notes-page.scss',
})
export class NotesPage {
  private readonly notesApi = inject(NotesService);

  protected readonly notes = signal<NoteSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);

  constructor() {
    this.notesApi.list().subscribe({
      next: (page) => {
        this.notes.set(page.content);
        this.total.set(page.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected snippet(note: NoteSummary): string {
    const flat = note.content.replace(/\s+/g, ' ').trim();
    return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat || '(empty)';
  }
}
