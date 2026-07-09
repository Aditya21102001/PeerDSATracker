import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightsService } from './insights.service';

/**
 * Render's free tier spins the analytics service down after 15 minutes. The first
 * request afterwards gets a 503 from the backend while the instance wakes. Retrying
 * turns "analytics offline" into "loads a moment later" -- but only for a 503. Any
 * other status is a real failure and must not be retried.
 */
describe('InsightsService cold-start retry', () => {
  let insights: InsightsService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    insights = TestBed.inject(InsightsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a 503 and succeeds once the service wakes', async () => {
    const report = vi.fn();
    insights.weakness().subscribe({ next: report });

    http.expectOne('/api/analytics/weakness').flush('waking', { status: 503, statusText: 'Service Unavailable' });

    await vi.advanceTimersByTimeAsync(12_000);

    http.expectOne('/api/analytics/weakness').flush({ userId: 1, weakest: [], strongest: [], overallMastery: 0 });
    expect(report).toHaveBeenCalledOnce();
  });

  it('gives up after the retry budget and surfaces the failure', async () => {
    const failed = vi.fn();
    insights.weakness().subscribe({ error: failed });

    // initial + 2 retries = 3 attempts
    for (const wait of [0, 12_000, 24_000]) {
      if (wait) await vi.advanceTimersByTimeAsync(wait);
      http.expectOne('/api/analytics/weakness').flush('down', { status: 503, statusText: 'Service Unavailable' });
    }

    expect(failed).toHaveBeenCalledOnce();
  });

  it('does NOT retry a 401 — that is a real failure, not a cold start', async () => {
    const failed = vi.fn();
    insights.reviseNext().subscribe({ error: failed });

    http.expectOne('/api/analytics/revise-next').flush('nope', { status: 401, statusText: 'Unauthorized' });

    expect(failed).toHaveBeenCalledOnce();
    http.expectNone('/api/analytics/revise-next');
  });

  it('does not retry the sync endpoints — only analytics cold-starts', () => {
    insights.accounts().subscribe({ error: () => {} });

    http.expectOne('/api/sync/accounts').flush('boom', { status: 503, statusText: 'Service Unavailable' });
    http.expectNone('/api/sync/accounts');
  });
});
