import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthOptionsService } from './auth-options.service';

/**
 * The reported symptom was "sometimes the Google button is missing, then it's back with no code
 * change" — a race with Render's cold start, invisible in any test that assumes a backend answers.
 * Every test here is about what happens when it does not.
 */
describe('AuthOptionsService', () => {
  const URL = '/api/auth/options';
  const KEY = 'peerdsa.googleEnabled';

  let http: HttpTestingController;

  const build = () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthOptionsService);
  };

  beforeEach(() => {
    vi.useFakeTimers(); // zoneless app: no zone-testing.js, so fakeAsync/tick are unavailable
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('starts hidden on a browser that has never been here', () => {
    const service = build();

    expect(service.googleEnabled()).toBe(false);
  });

  it('remembers a positive answer for next time', () => {
    const service = build();
    service.refresh();
    http.expectOne(URL).flush({ googleEnabled: true, otpDemoMode: false });

    expect(service.googleEnabled()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  /**
   * The actual reported bug. A returning visitor whose backend is asleep must still see the
   * button — the answer has not changed, only the server's ability to say so.
   */
  it('shows the button from cache while the backend is still asleep', () => {
    localStorage.setItem(KEY, 'true');
    const service = build();

    // Rendered true before any response arrives.
    expect(service.googleEnabled()).toBe(true);

    service.refresh();
    for (let i = 0; i < 4; i++) {
      http.expectOne(URL).flush('waking', { status: 503, statusText: 'Service Unavailable' });
      vi.advanceTimersByTime(60_000);
    }

    // Every attempt failed, and the button is still there.
    expect(service.googleEnabled()).toBe(true);
  });

  /**
   * The precise regression. Overwriting a good cached answer with `false` on failure is what made
   * the original bug last the whole visit rather than one frame.
   */
  it('a failed probe never erases a good answer', () => {
    localStorage.setItem(KEY, 'true');
    const service = build();

    service.refresh();
    http.expectOne(URL).flush('gone', { status: 500, statusText: 'Server Error' });

    expect(service.googleEnabled()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  /** But a server that genuinely says "off" must be believed, and must stick. */
  it('a real negative answer turns the button off and is remembered', () => {
    localStorage.setItem(KEY, 'true');
    const service = build();

    service.refresh();
    http.expectOne(URL).flush({ googleEnabled: false, otpDemoMode: false });

    expect(service.googleEnabled()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });

  it('retries a cold start long enough to outlast one', () => {
    const service = build();
    service.refresh();

    http.expectOne(URL).flush('waking', { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(8_000);

    http.expectOne(URL).flush('waking', { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(16_000);

    http.expectOne(URL).flush({ googleEnabled: true, otpDemoMode: false });

    expect(service.googleEnabled()).toBe(true);
  });

  /** A 4xx is a real answer about this deployment; spinning on it delays nothing into existence. */
  it('does not retry a real answer', () => {
    const service = build();
    service.refresh();

    http.expectOne(URL).flush('nope', { status: 404, statusText: 'Not Found' });
    vi.advanceTimersByTime(120_000);

    http.verify(); // no further requests
    expect(service.googleEnabled()).toBe(false);
  });

  /** Private mode throws on localStorage. The probe must still work, just without the memory. */
  it('survives a browser that refuses storage', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('denied');
    };
    try {
      const service = build();
      service.refresh();
      http.expectOne(URL).flush({ googleEnabled: true, otpDemoMode: false });

      expect(service.googleEnabled()).toBe(true);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
