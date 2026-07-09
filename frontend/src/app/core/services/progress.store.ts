import { Service, computed, inject, signal } from '@angular/core';
import { Problem, ProblemStatus, SheetProgress } from '../models/api.models';
import { ProblemQuery, SheetService } from './sheet.service';

@Service()
export class ProgressStore {
  private readonly sheet = inject(SheetService);

  private readonly problemList = signal<Problem[]>([]);
  private readonly sheetProgress = signal<SheetProgress | null>(null);
  private readonly isLoading = signal(true);
  private readonly loadError = signal<string | null>(null);
  private readonly matchCount = signal(0);

  readonly problems = this.problemList.asReadonly();
  readonly progress = this.sheetProgress.asReadonly();
  readonly loading = this.isLoading.asReadonly();
  readonly error = this.loadError.asReadonly();
  readonly total = this.matchCount.asReadonly();

  readonly solvedPercent = computed(() => {
    const p = this.sheetProgress();
    return p && p.total > 0 ? Math.round((p.solved / p.total) * 100) : 0;
  });

  load(query: ProblemQuery): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.sheet.problems(query).subscribe({
      next: (page) => {
        this.problemList.set(page.content);
        this.matchCount.set(page.totalElements);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load problems.');
        this.isLoading.set(false);
      },
    });
  }

  loadProgress(): void {
    this.sheet.progress().subscribe({
      next: (p) => this.sheetProgress.set(p),
      error: () => this.loadError.set('Could not load progress.'),
    });
  }

  /**
   * Optimistic: the row flips immediately, and rolls back if the server rejects.
   * Progress counters are re-fetched on success rather than recomputed locally,
   * since the server owns them.
   */
  setStatus(problem: Problem, status: ProblemStatus | null): void {
    const previous = problem.status;
    if (previous === status) {
      return;
    }
    this.patch(problem.id, { status });

    const request = status ? this.sheet.setStatus(problem.id, status) : this.sheet.clearStatus(problem.id);
    request.subscribe({
      next: () => this.loadProgress(),
      error: () => {
        this.patch(problem.id, { status: previous });
        this.loadError.set('Could not save that change.');
      },
    });
  }

  toggleStar(problem: Problem): void {
    const previous = problem.starred;
    this.patch(problem.id, { starred: !previous });

    this.sheet.toggleStar(problem.id).subscribe({
      next: (res) => this.patch(problem.id, { starred: res.starred }),
      error: () => {
        this.patch(problem.id, { starred: previous });
        this.loadError.set('Could not save that change.');
      },
    });
  }

  private patch(problemId: number, changes: Partial<Problem>): void {
    this.problemList.update((list) =>
      list.map((p) => (p.id === problemId ? { ...p, ...changes } : p)),
    );
  }
}
