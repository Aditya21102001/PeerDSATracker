import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { isBackendUnavailable, isIdempotent } from './backend-unavailable';

/** A response the way Angular hands one to an error handler. */
function response(status: number, contentType?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'error',
    url: '/api/sheet',
    headers: contentType ? new HttpHeaders({ 'content-type': contentType }) : new HttpHeaders(),
  });
}

/**
 * The line between "the backend is asleep" and "the backend said no".
 *
 * Both halves of this matter. Too strict and a cold start goes unexplained, which is the bug this
 * whole feature exists to fix. Too generous and a real error is relabelled as a wait and retried --
 * quietly, several times, with the user watching a spinner over a failure that was never going to
 * clear.
 */
describe('isBackendUnavailable', () => {
  it('treats a missing response as unavailability', () => {
    // Status 0 is Angular for "nothing answered": connection refused, DNS, TLS, CORS, or a
    // Render instance that is not listening yet.
    expect(isBackendUnavailable(response(0))).toBe(true);
  });

  it('treats a bare gateway error as unavailability', () => {
    // Render answers 502 while a spun-down instance boots; Vercel answers 504 when its edge gives
    // up waiting for the rewrite target. Neither comes from this application.
    expect(isBackendUnavailable(response(502, 'text/html'))).toBe(true);
    expect(isBackendUnavailable(response(504, 'text/html'))).toBe(true);
  });

  it('treats a 503 with no body as unavailability', () => {
    expect(isBackendUnavailable(response(503))).toBe(true);
  });

  /**
   * The load-bearing case. Spring renders ResponseStatusException as problem+json, and two
   * endpoints use a 503 to mean something specific: a failed sign-in email, and an analytics
   * service that InsightsService already retries on its own. Retrying either from here would
   * resend a one-time code, or stack retries on top of retries.
   */
  it('does not treat an application 503 as unavailability', () => {
    expect(isBackendUnavailable(response(503, 'application/problem+json'))).toBe(false);
    expect(isBackendUnavailable(response(503, 'application/json'))).toBe(false);
  });

  it('does not treat an answer from the application as unavailability', () => {
    // A backend that can say 401, 404 or 500 is a backend that is up.
    for (const status of [400, 401, 403, 404, 409, 429, 500]) {
      expect(isBackendUnavailable(response(status)), `status ${status}`).toBe(false);
    }
  });

  it('ignores errors that are not HTTP failures at all', () => {
    expect(isBackendUnavailable(new Error('boom'))).toBe(false);
    expect(isBackendUnavailable(null)).toBe(false);
  });
});

describe('isIdempotent', () => {
  it('allows the safe methods to be resent', () => {
    expect(isIdempotent('GET')).toBe(true);
    expect(isIdempotent('get')).toBe(true);
    expect(isIdempotent('HEAD')).toBe(true);
  });

  /**
   * PUT and DELETE are idempotent by the HTTP spec, and still excluded. The spec guarantees the
   * server state after two identical requests, not that this application's handlers were written
   * to that guarantee -- and a silent retry is the wrong place to find out.
   */
  it('refuses to resend anything with a side effect', () => {
    expect(isIdempotent('POST')).toBe(false);
    expect(isIdempotent('PUT')).toBe(false);
    expect(isIdempotent('PATCH')).toBe(false);
    expect(isIdempotent('DELETE')).toBe(false);
  });
});
