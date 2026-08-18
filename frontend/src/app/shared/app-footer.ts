import { Component, computed, inject, signal } from '@angular/core';
import { buildInfo } from '../../build-info';
import { BackendStatus } from '../core/services/backend-status';

/**
 * Where a commit sha can be looked up. Hardcoded because there is nowhere better: it is the same
 * repository for every deployment of this app, and threading it through an environment file would
 * add a knob nobody will ever turn.
 */
const REPO_COMMIT_URL = 'https://github.com/Aditya21102001/PeerDSATracker/commit/';

/** Below this, a freshly started backend is worth pointing out -- it means a cold start just ran. */
const JUST_STARTED_SECONDS = 120;

/**
 * Largest-unit relative time: "3 minutes ago", "2 days ago".
 *
 * Exported for tests. Returns an empty string for anything unparseable rather than "Invalid Date",
 * because this is decoration and a missing build stamp must not become visible garbage.
 */
export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) {
    return '';
  }
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return '';
  }

  const seconds = Math.round((now - then) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      // Negative: Intl counts into the past with negative values.
      return format.format(-Math.round(seconds / size), unit);
    }
  }
  return format.format(-seconds, 'second');
}

/** Full local date and time, for the tooltip behind a relative stamp. */
function exact(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString();
}

/**
 * Which build is running, on both halves of the deployment.
 *
 * The two halves deploy independently -- the SPA to Vercel, the backend to Render -- so "the
 * version" is two facts, and a bug report naming only one of them can send you reading code that
 * was never live. The frontend values are baked in at build time by scripts/build-info.mjs; the
 * backend values arrive from GET /api/meta, already fetched by the startup probe in
 * {@link BackendStatus}, so this footer adds no request of its own.
 *
 * The api line is absent until that probe answers, which on a cold start is a while. That is
 * correct: a gap is honest, where a version carried over from a previous session would not be.
 */
@Component({
  selector: 'app-footer',
  template: `
    <footer class="site-footer">
      <p class="line">
        <span class="part">
          <span class="key">web</span>
          @if (webCommit()) {
            <a
              class="val mono"
              [href]="repoCommitUrl + web.commit"
              target="_blank"
              rel="noopener"
              [title]="'Commit ' + web.commit + ' on GitHub'"
              >{{ webCommit() }}</a
            >
          } @else {
            <span class="val mono">local</span>
          }
          @if (webBuiltAgo()) {
            <span class="sep" aria-hidden="true">·</span>
            <!-- The exact instant lives in the tooltip; the relative form is the readable one. -->
            <time class="val" [attr.datetime]="web.builtAt" [title]="webBuiltExact()"
              >deployed {{ webBuiltAgo() }}</time
            >
          }
        </span>

        @if (backend.meta(); as api) {
          <span class="sep divider" aria-hidden="true">|</span>
          <span class="part">
            <span class="key">api</span>
            @if (api.commit) {
              <a
                class="val mono"
                [href]="repoCommitUrl + api.commit"
                target="_blank"
                rel="noopener"
                [title]="'Commit ' + api.commit + ' on GitHub'"
                >{{ api.version }}</a
              >
            } @else {
              <span class="val mono">{{ api.version }}</span>
            }
            @if (apiBuiltAgo()) {
              <span class="sep" aria-hidden="true">·</span>
              <time class="val" [attr.datetime]="api.builtAt" [title]="apiBuiltExact()"
                >deployed {{ apiBuiltAgo() }}</time
              >
            }
            @if (justWoke()) {
              <span class="sep" aria-hidden="true">·</span>
              <!-- Free plan: the instance had spun down, and this visit is what started it. -->
              <span class="val woke" title="The server had spun down and was started by this visit"
                >just woke up</span
              >
            }
          </span>
        }
      </p>
    </footer>
  `,
  styles: `
    .site-footer {
      padding: var(--sp-5) var(--sp-4) var(--sp-4);
      /* Clears the phone navigation bar, which is fixed 56px tall at the bottom below 48rem.
         Unconditional: that bar only exists when signed in, and the spare gap is invisible. */
      padding-bottom: calc(var(--sp-4) + 56px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--border);
      color: var(--text-faint);
      font-size: var(--fs-xs);

      @media (min-width: 48rem) {
        padding-bottom: var(--sp-4);
      }
    }

    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--sp-2);
      max-width: 60rem;
      margin: 0 auto;
    }

    .part {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
    }

    .key {
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      /* --text-faint is 4.54:1 at its worst, so the label stays readable, not decorative. */
      color: var(--text-faint);
    }

    .mono {
      font-family: var(--font-mono);
    }

    a.val {
      color: var(--text-muted);
      text-decoration: underline;
      text-decoration-color: var(--border-strong);
      text-underline-offset: 2px;

      &:hover {
        color: var(--accent);
      }
    }

    .woke {
      color: var(--xp);
    }

    .divider {
      color: var(--border-strong);
    }

    /* The separators are decorative and aria-hidden, so dropping them when cramped costs a screen
       reader nothing. */
    @media (max-width: 30rem) {
      .divider {
        display: none;
      }

      .line {
        flex-direction: column;
        gap: var(--sp-1);
      }
    }
  `,
})
export class AppFooter {
  protected readonly backend = inject(BackendStatus);

  protected readonly repoCommitUrl = REPO_COMMIT_URL;
  protected readonly web = buildInfo;

  /**
   * Read once, at construction. A footer stamp that re-rendered on a timer would be a repeating
   * change-detection wake-up for a line nobody is watching tick; "3 hours ago" is just as true a
   * minute later, and a reload refreshes it.
   */
  private readonly now = signal(Date.now());

  protected readonly webCommit = computed(() => buildInfo.commitShort);
  protected readonly webBuiltAgo = computed(() => timeAgo(buildInfo.builtAt, this.now()));
  protected readonly webBuiltExact = computed(() => exact(buildInfo.builtAt));

  protected readonly apiBuiltAgo = computed(() =>
    timeAgo(this.backend.meta()?.builtAt, this.now()),
  );
  protected readonly apiBuiltExact = computed(() => exact(this.backend.meta()?.builtAt));

  /** A backend up for seconds means this visitor paid for the cold start. */
  protected readonly justWoke = computed(() => {
    const uptime = this.backend.meta()?.uptimeSeconds;
    return uptime !== undefined && uptime < JUST_STARTED_SECONDS;
  });
}
