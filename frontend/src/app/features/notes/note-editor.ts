import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotesService } from '../../core/services/notes.service';
import { Problem } from '../../core/models/api.models';

@Component({
  selector: 'app-note-editor',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="editor">
      <header>
        <a routerLink="/notes">← All notes</a>
        <a routerLink="/sheet">Sheet</a>
      </header>

      @if (problem(); as p) {
        <h1>{{ p.title }}</h1>
        <p class="meta">
          Step {{ p.stepNo }} · {{ p.difficulty }}
          @if (p.leetcodeUrl) {
            · <a [href]="p.leetcodeUrl" target="_blank" rel="noopener">LeetCode</a>
          }
        </p>
      } @else {
        <h1>Note</h1>
      }

      <label for="content" class="sr-only">Note content (markdown)</label>
      <textarea
        id="content"
        rows="16"
        placeholder="Approach, edge cases, complexity, why you got it wrong…"
        [(ngModel)]="content"
      ></textarea>

      <div class="actions">
        <button type="button" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="danger" (click)="remove()" [disabled]="saving()">Delete</button>
        @if (message()) {
          <span class="message" role="status">{{ message() }}</span>
        }
      </div>
    </main>
  `,
  styleUrl: './note-editor.scss',
})
export class NoteEditor {
  /** Bound from the route param via withComponentInputBinding(). */
  readonly problemId = input.required<string>();

  private readonly notes = inject(NotesService);

  protected content = '';
  protected readonly problem = signal<Problem | null>(null);
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);

  constructor() {
    // input() values are available after construction, so defer a tick.
    queueMicrotask(() => {
      const id = Number(this.problemId());
      this.notes.problem(id).subscribe({ next: (p) => this.problem.set(p) });
      this.notes.get(id).subscribe({ next: (n) => (this.content = n.content) });
    });
  }

  protected save(): void {
    this.saving.set(true);
    this.notes.save(Number(this.problemId()), this.content).subscribe({
      next: () => {
        this.saving.set(false);
        this.flash('Saved.');
      },
      error: () => {
        this.saving.set(false);
        this.flash('Could not save.');
      },
    });
  }

  protected remove(): void {
    this.saving.set(true);
    this.notes.delete(Number(this.problemId())).subscribe({
      next: () => {
        this.content = '';
        this.saving.set(false);
        this.flash('Deleted.');
      },
      error: () => {
        this.saving.set(false);
        this.flash('Could not delete.');
      },
    });
  }

  private flash(text: string): void {
    this.message.set(text);
    setTimeout(() => this.message.set(null), 2000);
  }
}
