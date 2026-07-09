import { Component, computed, input } from '@angular/core';
import { HeatmapDay } from '../core/models/api.models';

interface Cell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  week: number;
  weekday: number;
}

const DAYS_SHOWN = 371; // 53 weeks, so the grid is always rectangular
const MS_PER_DAY = 86_400_000;

/** GitHub-style contribution calendar. Rendered as a grid of cells, not a chart library. */
@Component({
  selector: 'app-heatmap-calendar',
  template: `
    <figure class="heatmap">
      <figcaption>
        {{ totalSolved() }} problems solved in the last year
      </figcaption>

      <div class="grid" [style.grid-template-columns]="'repeat(' + weeks() + ', 10px)'">
        @for (cell of cells(); track cell.date) {
          <div
            class="cell"
            [attr.data-level]="cell.level"
            [style.grid-column]="cell.week + 1"
            [style.grid-row]="cell.weekday + 1"
            [title]="cell.count + (cell.count === 1 ? ' problem' : ' problems') + ' on ' + cell.date"
          ></div>
        }
      </div>

      <div class="legend">
        <span>Less</span>
        @for (l of [0, 1, 2, 3, 4]; track l) {
          <div class="cell" [attr.data-level]="l"></div>
        }
        <span>More</span>
      </div>
    </figure>
  `,
  styleUrl: './heatmap-calendar.scss',
})
export class HeatmapCalendar {
  readonly days = input.required<HeatmapDay[]>();
  /** Injected so the component stays pure; templates must not call new Date(). */
  readonly today = input.required<Date>();

  protected readonly totalSolved = computed(() =>
    this.days().reduce((sum, d) => sum + d.count, 0),
  );

  protected readonly cells = computed<Cell[]>(() => {
    const byDate = new Map(this.days().map((d) => [d.date, d.count]));

    const end = startOfDay(this.today());
    const start = new Date(end.getTime() - (DAYS_SHOWN - 1) * MS_PER_DAY);
    // Align the first column to a Sunday so weekdays line up in rows.
    start.setDate(start.getDate() - start.getDay());

    const cells: Cell[] = [];
    for (let t = start.getTime(), week = 0; t <= end.getTime(); t += MS_PER_DAY) {
      const d = new Date(t);
      const iso = toIso(d);
      const weekday = d.getDay();
      const count = byDate.get(iso) ?? 0;

      cells.push({ date: iso, count, level: levelFor(count), week, weekday });
      if (weekday === 6) {
        week++;
      }
    }
    return cells;
  });

  protected readonly weeks = computed(() => Math.max(...this.cells().map((c) => c.week)) + 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toIso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}
