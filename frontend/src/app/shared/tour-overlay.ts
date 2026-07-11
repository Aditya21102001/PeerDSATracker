import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TourService } from '../core/services/tour.service';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Renders the interactive product tour: a dimmed backdrop with a spotlight cut around the current
 * step's target element, plus a tooltip with Back/Next/Skip. Lives in the app shell (outside the
 * router outlet) so it can persist across the route changes a step triggers.
 *
 * Driven entirely by {@link TourService} signals. For each step it navigates to the step's route,
 * polls for the target element (features mark theirs with `data-tour="…"`), scrolls it into view,
 * and measures it; a target that never appears falls back to a centered card so the tour never
 * gets stuck. A `runId` guards against a slow step resolving after the user has already moved on.
 *
 * A full-screen catcher swallows clicks so the app can't be operated mid-tour; the spotlight and
 * tooltip reposition on scroll and resize.
 */
@Component({
  selector: 'app-tour-overlay',
  host: {
    '(window:resize)': 'reposition()',
    '(window:scroll)': 'reposition()',
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    @if (tour.active()) {
      <div class="tour" role="dialog" aria-modal="true" [attr.aria-label]="'Tour: ' + (tour.step()?.title ?? '')">
        <!-- Blocks interaction with the app for the duration of the tour. -->
        <div class="catcher" [class.dim]="!spot()"></div>

        @if (spot(); as s) {
          <div
            class="spot"
            [style.top.px]="s.top"
            [style.left.px]="s.left"
            [style.width.px]="s.width"
            [style.height.px]="s.height"
          ></div>
        }

        @if (tour.step(); as step) {
          <div
            class="tip"
            [class.centered]="!spot()"
            [style.top.px]="spot() ? tipTop() : null"
            [style.left.px]="spot() ? tipLeft() : null"
          >
            <p class="count">Step {{ tour.stepIndex() + 1 }} of {{ tour.total }}</p>
            <h2>{{ step.title }}</h2>
            <p class="body">{{ step.body }}</p>
            <div class="controls">
              <button type="button" class="btn btn-quiet btn-sm" (click)="tour.stop()">Skip</button>
              <span class="spacer"></span>
              @if (!tour.isFirst()) {
                <button type="button" class="btn btn-ghost btn-sm" (click)="tour.prev()">Back</button>
              }
              <button type="button" class="btn btn-sm" (click)="tour.next()">
                {{ tour.isLast() ? 'Done' : 'Next' }}
              </button>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .tour {
      position: fixed;
      inset: 0;
      z-index: 3000;
    }

    .catcher {
      position: fixed;
      inset: 0;
      /* Transparent when a spotlight is showing (its box-shadow supplies the dim); a plain scrim
         for a centered, targetless step. */
      background: transparent;

      &.dim {
        background: #0009;
      }
    }

    .spot {
      position: fixed;
      border-radius: var(--r-md);
      /* One trick, two jobs: the huge spread dims the whole viewport except this rect, and the
         second layer draws an accent ring around it. */
      box-shadow:
        0 0 0 9999px #0009,
        0 0 0 3px var(--accent);
      pointer-events: none;
      transition:
        top var(--t-base) var(--ease),
        left var(--t-base) var(--ease),
        width var(--t-base) var(--ease),
        height var(--t-base) var(--ease);
    }

    .tip {
      position: fixed;
      width: min(340px, calc(100vw - 24px));
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-lg);
      padding: var(--sp-4);
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      animation: page-in var(--t-base) var(--ease) both;

      &.centered {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(400px, calc(100vw - 24px));
        text-align: center;
      }
    }

    .count {
      font-size: var(--fs-xs);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent);
    }

    h2 {
      font-size: var(--fs-lg);
    }

    .body {
      color: var(--text-muted);
      font-size: var(--fs-sm);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      margin-top: var(--sp-2);
    }

    .spacer {
      flex: 1;
    }
  `,
})
export class TourOverlay {
  protected readonly tour = inject(TourService);
  private readonly router = inject(Router);

  protected readonly spot = signal<Box | null>(null);
  protected readonly tipTop = signal(0);
  protected readonly tipLeft = signal(0);

  private currentEl: HTMLElement | null = null;
  private runId = 0;

  constructor() {
    effect(() => {
      const step = this.tour.step();
      // A new step (or the tour ending) invalidates any in-flight resolution.
      const id = ++this.runId;
      if (!step) {
        this.currentEl = null;
        this.spot.set(null);
        return;
      }
      void this.prepare(step.route, step.target, id);
    });
  }

  private async prepare(route: string | undefined, target: string | undefined, id: number): Promise<void> {
    this.spot.set(null); // hide the old spotlight while the next step resolves

    const path = this.router.url.split(/[?#]/)[0];
    if (route && path !== route) {
      await this.router.navigateByUrl(route);
    }
    if (id !== this.runId) {
      return;
    }

    if (!target) {
      this.currentEl = null;
      this.centerTip();
      return;
    }

    const el = await this.waitFor(target, id);
    if (id !== this.runId) {
      return;
    }
    if (!el) {
      // Target never showed (slow load, empty list): don't get stuck, just center the card.
      this.currentEl = null;
      this.centerTip();
      return;
    }

    this.currentEl = el;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    this.measure();
  }

  /** Poll for the target element, since a step's route may still be rendering or loading data. */
  private waitFor(selector: string, id: number): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        if (id !== this.runId) {
          resolve(null);
          return;
        }
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          resolve(el);
        } else if (++tries > 30) {
          resolve(null);
        } else {
          setTimeout(tick, 80);
        }
      };
      tick();
    });
  }

  /** Keep the spotlight and tooltip glued to the target as the viewport moves. */
  protected reposition(): void {
    if (this.currentEl && this.tour.active()) {
      this.measure();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.tour.active()) {
      return;
    }
    if (event.key === 'Escape') {
      this.tour.stop();
    } else if (event.key === 'ArrowRight') {
      this.tour.next();
    } else if (event.key === 'ArrowLeft') {
      this.tour.prev();
    }
  }

  private measure(): void {
    const el = this.currentEl;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 6;
    const box: Box = {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
    this.spot.set(box);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = Math.min(340, vw - 24);
    const gap = 14;
    const estHeight = 200;

    let left = box.left + box.width / 2 - tipW / 2;
    left = Math.max(12, Math.min(left, vw - tipW - 12));

    const below = box.top + box.height + gap;
    const top = below + estHeight < vh ? below : Math.max(12, box.top - gap - estHeight);

    this.tipLeft.set(left);
    this.tipTop.set(top);
  }

  private centerTip(): void {
    this.spot.set(null); // no target → CSS centers the card; the inline coords are ignored
  }
}
