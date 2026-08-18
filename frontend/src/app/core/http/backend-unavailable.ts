import { HttpErrorResponse } from '@angular/common/http';

/**
 * Statuses a proxy emits when it could not reach the application behind it. Render answers 502
 * while a spun-down instance boots; Vercel answers 504 when its edge gives up waiting for the
 * rewrite target.
 */
const GATEWAY_STATUSES: readonly number[] = [502, 503, 504];

/**
 * Does this failure look like "the backend is not up yet" rather than "the backend said no"?
 *
 * The distinction matters twice over: it decides whether the user is told a cold start is in
 * progress, and -- via {@link isIdempotent} -- whether the request is quietly retried. Getting it
 * wrong in the generous direction is worse than getting it wrong in the strict direction, because
 * a real error dressed up as a cold start is an error the user never sees.
 *
 * Status 0 is Angular's stand-in for "no HTTP response at all": DNS failure, connection refused,
 * TLS failure, CORS rejection, an aborted request. A spun-down instance produces it too.
 *
 * The gateway statuses need a second test, because this application issues all three itself:
 *
 * <ul>
 *   <li>`/api/auth/otp/request` answers 503 when mail delivery fails, deliberately, instead of
 *       falling back to returning the code.
 *   <li>`/api/analytics/*` answers 503 when the backend cannot reach the FastAPI service. That is a
 *       cold start, but of a *different* service, and `InsightsService.waitForWake` already owns
 *       that retry -- stacking this one on top would spread one panel's failure over minutes.
 *   <li>`/api/analytics/*` answers **502** when analytics answered *with an error*: a mismatched
 *       `INTERNAL_TOKEN`, a wrong `ANALYTICS_BASE_URL`, a crash. `AnalyticsController` picks that
 *       status precisely to mean "retrying cannot fix this, do not spin on it".
 * </ul>
 *
 * So the status alone is not enough, and the discriminator is the body. Spring renders every error
 * as JSON (`ResponseStatusException` becomes `application/problem+json`); a proxy standing in for an
 * origin it cannot reach serves an HTML error page or nothing at all. A gateway status carrying JSON
 * therefore came *from the backend*, which means the backend is up, whatever it is complaining about.
 *
 * Checking only 503 was a real bug: a misconfigured analytics service made every dashboard show
 * "waking the server up" and retry for two and a half minutes, over a 502 that said in so many words
 * that it would never succeed.
 */
export function isBackendUnavailable(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  if (error.status === 0) {
    return true;
  }
  if (!GATEWAY_STATUSES.includes(error.status)) {
    return false;
  }
  return !(error.headers.get('content-type') ?? '').includes('json');
}

/**
 * The browser believes there is no network. Worth separating from a cold backend: telling somebody
 * on a train that the server is waking up sends them to look in the wrong place.
 *
 * `navigator.onLine` only reliably means something when it is false, which is the only way it is
 * read here.
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * May this request be sent again on its own?
 *
 * Only for methods that carry no side effect. The unsafe ones are not a theoretical concern here:
 * a retried `POST /api/auth/otp/request` sends a second sign-in code and burns a slot against the
 * five-per-hour limit, and a retried solve toggle would flip a problem back. A cold start still
 * raises the notice for those -- it just does not resend them, and the user retries deliberately.
 */
export function isIdempotent(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}
