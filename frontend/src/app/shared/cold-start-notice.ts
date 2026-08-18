import { Component, computed, inject } from '@angular/core';
import { BackendStatus } from '../core/services/backend-status';
import { Spinner } from './spinner';

/**
 * Explains, while it is happening, that the backend is asleep rather than broken.
 *
 * The backend runs on Render's free plan and is spun down after 15 minutes of inactivity. Waking it
 * is a container start plus a JVM on 0.1 CPU with the optimizing JIT disabled, and the browser never
 * gets to simply wait for that: requests reach the backend through Vercel's `/api/*` rewrite, whose
 * edge proxy times out first. So the first visit after a quiet spell used to present as an app where
 * several panels had failed for no stated reason -- and a reload, which is what anyone would try,
 * restarted the same wait.
 *
 * A bar at the top rather than a modal, deliberately. Nothing here needs a decision from the user,
 * and a cold start that begins mid-session (the instance can spin down while a tab sits open) must
 * not seize a page somebody is reading. The blank-page case -- a reload against a cold backend,
 * where bootstrap is still blocked on session restore and this component does not exist yet -- is
 * covered by the inline splash in index.html instead.
 *
 * Recovery is not this component's job: {@link BackendStatus} polls, and the interceptors retry.
 * This only reports, and offers a manual retry once the polling has given up.
 */
@Component({
  selector: 'app-cold-start-notice',
  imports: [Spinner],
  template: `
    @if (backend.troubled()) {
      <div class="notice" [class.stalled]="state() !== 'warming'">
        <div class="inner">
          @if (state() === 'warming') {
            <!--
              Spinner carries role="status" and announces its own label, so the headline is passed
              to it rather than repeated in a sibling live region -- two live regions would say the
              same thing twice to a screen reader.
            -->
            <app-spinner inline [size]="18" [label]="headline()" />
          } @else {
            <p class="headline" role="status">{{ headline() }}</p>
          }

          <p class="detail">{{ detail() }}</p>

          @if (state() === 'unreachable') {
            <button type="button" class="btn btn-ghost btn-sm" (click)="backend.retryNow()">Try again</button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .notice {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      /* Above the theme toggle (10), the phone nav (40) and the chat panel (41). Below the tour,
         which is a modal and owns the screen while it runs. */
      z-index: 60;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      box-shadow: var(--shadow-md);
    }

    /* A wait is neutral; having given up is not. */
    .notice.stalled {
      border-bottom-color: var(--danger);
    }

    .inner {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      max-width: 60rem;
      margin-inline: auto;
      padding: var(--sp-3) var(--sp-4);
      /* The theme toggle is fixed to the top-right corner. Without this the bar's text slides
         underneath it on a narrow screen. */
      padding-inline-end: 3.5rem;
      font-size: var(--fs-sm);
    }

    .headline {
      margin: 0;
      font-weight: 600;
      color: var(--text);
    }

    .detail {
      margin: 0;
      color: var(--text-muted);
    }

    button {
      margin-inline-start: auto;
      flex: none;
    }

    /* Stacked, because three items in a row do not fit a phone and the detail line is the part
       worth reading. */
    @media (max-width: 40rem) {
      .inner {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--sp-2);
      }

      button {
        margin-inline-start: 0;
      }
    }
  `,
})
export class ColdStartNotice {
  protected readonly backend = inject(BackendStatus);
  protected readonly state = this.backend.current;

  protected readonly headline = computed(() => {
    switch (this.state()) {
      case 'warming':
        return 'Waking the server up…';
      case 'unreachable':
        return 'Cannot reach the server';
      case 'offline':
        return 'You are offline';
      default:
        return '';
    }
  });

  protected readonly detail = computed(() => {
    switch (this.state()) {
      case 'warming':
        // Naming the cause and the cost is what stops the reload. Roughly a minute is honest for a
        // free-plan container plus a cold JVM; promising less would only be believed once.
        return 'It sleeps after 15 minutes idle to stay free. Waking it usually takes a minute or two — nothing is lost, and anything that failed will be retried automatically.';
      case 'unreachable':
        return 'It has not answered for several minutes, which is longer than a cold start takes. Something is probably actually wrong.';
      case 'offline':
        return 'Your device reports no network connection. Nothing will load until it returns.';
      default:
        return '';
    }
  });
}
