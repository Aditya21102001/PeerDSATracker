import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendStatus } from '../services/backend-status';
import { coldStartInterceptor } from './cold-start.interceptor';

/**
 * The cold-start path, end to end: a gateway failure raises the notice, safe requests are resent
 * behind it, and unsafe ones are not.
 *
 * The backend spins down after 15 minutes idle on Render's free plan, and the SPA reaches it through
 * Vercel's `/api/*` rewrite, whose edge proxy times out before a cold JVM is listening. So the first
 * requests after an idle period fail outright rather than being slow, which is what these tests
 * reproduce.
 */
describe('coldStartInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let backend: BackendStatus;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([coldStartInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    backend = TestBed.inject(BackendStatus);
  });

  afterEach(() => {
    // Ends BackendStatus's poll cycle. A subscription that outlives the test keeps firing probes at
    // an environment vitest is trying to tear down, which costs minutes of wall clock per file.
    backend.reportReachable();
    vi.useRealTimers();
  });

  /** How a proxy fails: a status, and a body that is not the application's JSON. */
  const gateway = { status: 502, statusText: 'Bad Gateway' };

  it('resends a GET and clears the notice once the backend answers', async () => {
    const seen = vi.fn();
    client.get('/api/sheet').subscribe({ next: seen });

    http.expectOne('/api/sheet').flush('<html>Bad Gateway</html>', gateway);

    // The notice goes up on the FIRST failure, not after the retries are spent: the user is
    // already looking at a stalled page.
    expect(backend.current()).toBe('warming');
    expect(seen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);

    http.expectOne('/api/sheet').flush({ ok: true });
    expect(seen).toHaveBeenCalledOnce();
    // A real request succeeding is better evidence than the next poll would be.
    expect(backend.current()).toBe('ready');
  });

  /**
   * The dangerous case. A resent `POST /api/auth/otp/request` sends a second sign-in code and burns
   * a slot against the five-per-hour limit; a resent solve toggle flips a problem back. So the
   * notice is raised -- the user still deserves to know why their action failed -- and the request
   * is left alone.
   */
  it('raises the notice for a POST but never resends it', async () => {
    const failed = vi.fn();
    client.post('/api/auth/otp/request', { email: 'a@b.c' }).subscribe({ error: failed });

    http.expectOne('/api/auth/otp/request').flush('<html>Gateway Timeout</html>', {
      status: 504,
      statusText: 'Gateway Timeout',
    });

    expect(failed).toHaveBeenCalledOnce();
    expect(backend.current()).toBe('warming');

    // Long enough for every backoff step to have fired, had any been scheduled.
    await vi.advanceTimersByTimeAsync(5_000);
    http.expectNone('/api/auth/otp/request');
  });

  it('passes an application error straight through', () => {
    const failed = vi.fn();
    client.get('/api/auth/me').subscribe({ error: failed });

    http.expectOne('/api/auth/me').flush({ message: 'no' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toHaveBeenCalledOnce();
    // A backend that can say 401 is a backend that is up, so the notice must stay down.
    expect(backend.current()).toBe('ready');
  });

  /**
   * A gateway status carrying JSON came from Spring, not from a proxy. `/api/analytics/*` answers
   * 503 when the FastAPI service is cold -- which InsightsService already retries -- so retrying
   * here too would stretch one failed panel across minutes.
   */
  it('leaves an application 503 to the service that owns it', () => {
    const failed = vi.fn();
    client.get('/api/analytics/weakness').subscribe({ error: failed });

    http
      .expectOne('/api/analytics/weakness')
      .flush(
        { detail: 'Analytics service unavailable' },
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'content-type': 'application/problem+json' },
        },
      );

    expect(failed).toHaveBeenCalledOnce();
    expect(backend.current()).toBe('ready');
  });

  /**
   * The production regression, reproduced exactly.
   *
   * `GET /api/analytics/weakness` answered 502 with `content-type: application/json`, from Spring:
   * `AnalyticsController` uses that status to mean "analytics answered with an error; retrying
   * cannot fix a misconfiguration, do not spin on it". Because the JSON check covered only 503,
   * this interceptor retried it seven times over two and a half minutes -- and because
   * `InsightsService.waitForWake` retries from outside, the layers multiplied to ~21 requests per
   * panel, each one making the backend call a service that was never going to answer.
   */
  it('does not retry the 502 that means "retrying cannot fix this"', async () => {
    const failed = vi.fn();
    client.get('/api/analytics/weakness').subscribe({ error: failed });

    http.expectOne('/api/analytics/weakness').flush(
      { detail: 'Analytics service error (upstream 401). Analytics rejected our token.' },
      { status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'application/json' } },
    );

    // Fails once, immediately, and stays failed.
    expect(failed).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(150_000);
    http.expectNone('/api/analytics/weakness');

    // And it must not claim the server is asleep: the server answered.
    expect(backend.current()).toBe('ready');
  });

  /**
   * The amplification that took the site down, as a test.
   *
   * A genuine bodiless gateway error on an analytics path means the backend really is unreachable,
   * so the notice belongs up -- but `InsightsService.waitForWake` is already retrying this call from
   * outside `HttpClient`, and layers multiply rather than add. Seven attempts here became twenty-one
   * against a 0.1-CPU instance.
   */
  it('reports but does not resend a path whose caller already retries', async () => {
    const failed = vi.fn();
    client.get('/api/analytics/revise-next').subscribe({ error: failed });

    http.expectOne('/api/analytics/revise-next').flush('<html>Bad Gateway</html>', gateway);

    // Told the user, once. Did not queue six more requests behind it.
    expect(failed).toHaveBeenCalledOnce();
    expect(backend.current()).toBe('warming');

    await vi.advanceTimersByTimeAsync(150_000);
    http.expectNone('/api/analytics/revise-next');
  });

  /** The same failure on an ordinary path IS this interceptor's to retry. */
  it('still resends an ordinary path on the same failure', async () => {
    const seen = vi.fn();
    client.get('/api/sheet').subscribe({ next: seen });

    http.expectOne('/api/sheet').flush('<html>Bad Gateway</html>', gateway);
    await vi.advanceTimersByTimeAsync(2_000);

    http.expectOne('/api/sheet').flush({ ok: true });
    expect(seen).toHaveBeenCalledOnce();
  });

  it('gives up describing it as a cold start once a cold start could not explain it', async () => {
    client.get('/api/sheet').subscribe({ error: () => {} });
    http.expectOne('/api/sheet').flush('<html>Bad Gateway</html>', gateway);
    expect(backend.current()).toBe('warming');

    // Fail every retry and every poll for longer than the give-up window. Both the interceptor's
    // backoff and BackendStatus's own probe cycle are in flight, so whatever is pending is failed.
    //
    // Cancelled requests are skipped rather than flushed: each probe carries its own 5s timeout, so
    // a probe that has already timed out is gone by the time the loop comes round -- which is the
    // behaviour under test, not an artefact of it.
    for (let elapsed = 0; elapsed < 270_000; elapsed += 5_000) {
      await vi.advanceTimersByTimeAsync(5_000);
      for (const pending of http.match(() => true)) {
        if (!pending.cancelled) {
          pending.flush('<html>Bad Gateway</html>', gateway);
        }
      }
    }

    // Still calling it "waking up" after this long would be a lie that wastes the user's time.
    expect(backend.current()).toBe('unreachable');
  });
});
