import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';

import { AuthOptions } from '../models/api.models';
import { LastSignInService } from './last-sign-in.service';

const KEY = 'peerdsa.googleEnabled';

/**
 * Render's free tier spins a service down after 15 minutes idle, and this backend is a JVM on
 * 0.1 CPU: the README measures a cold start at 1-3 minutes. The delays below are deliberately
 * long enough to still be trying when it finishes waking. An earlier attempt used 3s x 2, which
 * gave up after six seconds and covered essentially none of a real cold start.
 */
const WAKE_RETRIES = 3;
const WAKE_DELAY_MS = 8_000;

/** Statuses worth another go: the browser never completed the request, or an edge stood in. */
const TRANSIENT = new Set([0, 502, 503, 504]);

/**
 * Which sign-in methods this deployment offers, and — crucially — what it offered last time.
 *
 * <p><b>The bug this exists for.</b> "Continue with Google" was shown only if a probe of
 * {@code /api/auth/options} succeeded during page load. That probe is the very first request a
 * returning visitor makes, so it is the single request in the whole app most likely to arrive at a
 * sleeping backend. When it failed the button was absent for the rest of the visit, and the effect
 * was worst for the people it locked out: an account created through Google has no password, so
 * they saw "Last time on this device you signed in with Google" directly above a password form
 * they could not use, with the Google button missing. Reloading a minute later fixed it, which is
 * why it looked intermittent.
 *
 * <p><b>Why a cached answer is the real fix.</b> Retrying helps but cannot win a race against a
 * three-minute cold start without leaving the button missing for most of it. Whether this
 * deployment has Google configured changes roughly never, so last visit's answer is an excellent
 * predictor of this visit's — good enough to render immediately and correct in the background.
 *
 * <p><b>Why it is safe to trust it.</b> The stored value says nothing secret: it is a property of
 * the deployment, identical for every visitor, and already visible to anyone who loads the page.
 * The worst case is cosmetic and self-healing — if Google were switched off, a device holding a
 * stale {@code true} shows one button that would fail until the probe answers, which happens on
 * this same page load.
 *
 * <p>Note what is NOT cached: a failed probe never overwrites a good answer. Falling back to
 * "false" on failure is what made the original bug sticky.
 */
@Service()
export class AuthOptionsService {
  private readonly http = inject(HttpClient);
  private readonly lastSignIn = inject(LastSignInService);

  /**
   * Seeded from this device's last known answer so the button can render on the first frame,
   * before any network call resolves. Defaults to false on a browser that has never been here:
   * advertising a button that might 401 to a first-time visitor would read as a broken site.
   *
   * <p>Having actually signed in with Google on this device counts as the same evidence, and is
   * in fact stronger than a cached probe: the probe only reports what the server claims, whereas a
   * completed Google sign-in is proof the flow worked end to end on this deployment. It also
   * removes a self-contradiction that shipped for a while -- the page said "Last time on this
   * device you signed in with Google" directly above a missing Google button, because the two
   * facts were read from localStorage by different code and only one of them was trusted.
   */
  private readonly google = signal(read() || this.lastSignIn.lastMethod() === 'google');

  readonly googleEnabled = this.google.asReadonly();

  /**
   * Asks the server and updates the answer. Safe to call on every page load; never throws, and
   * never blocks anything — the password form works regardless of what this does.
   */
  refresh(): void {
    this.http
      .get<AuthOptions>('/api/auth/options')
      .pipe(
        retry({
          count: WAKE_RETRIES,
          // Only transient failures. A 4xx is a real answer about this deployment and spinning
          // on it would delay nothing into existence.
          delay: (error: HttpErrorResponse, attempt) =>
            TRANSIENT.has(error.status)
              ? timer(WAKE_DELAY_MS * attempt)
              : throwError(() => error),
        }),
      )
      .subscribe({
        next: (options) => this.remember(options.googleEnabled),
        // Deliberately does nothing. Keeping the cached answer is the entire point: overwriting
        // it with false is exactly the behaviour that hid the button for a whole visit.
        error: () => {},
      });
  }

  private remember(enabled: boolean): void {
    this.google.set(enabled);
    try {
      localStorage.setItem(KEY, String(enabled));
    } catch {
      // Private mode, or storage full. The cache is an optimisation; losing it costs one probe.
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}
