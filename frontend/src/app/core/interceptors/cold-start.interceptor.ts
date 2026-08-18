import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, retry, tap, throwError, timer } from 'rxjs';
import { isBackendUnavailable, isIdempotent } from '../http/backend-unavailable';
import { BackendStatus } from '../services/backend-status';

/**
 * How many extra attempts a safe request gets. Four attempts at the delays below spans roughly 45
 * seconds, which covers a warm-ish restart. Beyond that the notice is already up and the poll cycle
 * in {@link BackendStatus} owns recovery -- holding a request open for two minutes would just make
 * the page look hung.
 */
const MAX_RETRIES = 4;

/** Backoff, in milliseconds, indexed by attempt. A cold JVM will not be ready in 200ms. */
const BACKOFF_MS = [2_000, 5_000, 12_000, 25_000];

/**
 * Turns a cold backend from a page of broken panels into a wait with an explanation.
 *
 * The backend spins down after 15 minutes idle (Render free plan), and the first request after that
 * fails rather than merely being slow -- Vercel's edge proxy gives up on the `/api/*` rewrite before
 * a cold JVM is listening. This interceptor spots that specific failure, tells
 * {@link BackendStatus} so the notice appears, and retries safe requests behind the scenes.
 *
 * Only idempotent methods are retried; see {@link isIdempotent} for why resending a POST here would
 * be a bug rather than a convenience.
 *
 * MUST be registered before the auth interceptor. A retry re-runs the interceptors nested inside
 * this one, which is how the retried attempt picks up a token refreshed in the meantime.
 */
export const coldStartInterceptor: HttpInterceptorFn = (req, next) => {
  const backend = inject(BackendStatus);

  return next(req).pipe(
    // Any answer at all means the backend is up -- including a 4xx, which is the application
    // talking. Only a failure to reach it counts against it.
    tap({
      next: () => backend.reportReachable(),
      error: (error: HttpErrorResponse) => {
        if (!isBackendUnavailable(error)) {
          backend.reportReachable();
        }
      },
    }),
    retry({
      count: MAX_RETRIES,
      delay: (error, attempt) => {
        if (!isBackendUnavailable(error) || !isIdempotent(req.method)) {
          return throwError(() => error);
        }
        // Raise the notice on the first failure, not after the retries are exhausted: the user is
        // already looking at a stalled page and deserves to know why now.
        backend.reportUnavailable();
        return timer(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]);
      },
    }),
    catchError((error: HttpErrorResponse) => {
      // Retries are spent, or the method was unsafe to repeat. Either way the notice belongs up,
      // so the failure the page is about to show has an explanation next to it.
      if (isBackendUnavailable(error)) {
        backend.reportUnavailable();
      }
      return throwError(() => error);
    }),
  );
};
