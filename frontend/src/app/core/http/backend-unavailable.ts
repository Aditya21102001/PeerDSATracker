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
 * 503 is the awkward one, because this application issues its own: `/api/auth/otp/request` answers
 * 503 when mail delivery fails, deliberately, instead of falling back to returning the code. Those
 * come from Spring with a JSON body; a proxy's 503 comes with an HTML error page or nothing at all.
 * So a 503 only counts as unavailability when the body is not JSON -- otherwise a failed OTP send
 * would read as a cold start and, worse, be retried.
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
  if (error.status === 503) {
    return !(error.headers.get('content-type') ?? '').includes('json');
  }
  return true;
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
