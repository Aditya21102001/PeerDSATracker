import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Signin } from './signin';

/**
 * The "Continue with Google" button is the only way in for an account that has no password, and
 * whether it appears is decided by one network call made the instant the page loads.
 *
 * On Render's free tier that call is the single most likely request in the whole app to arrive at
 * a sleeping backend: it is the first request a returning visitor makes. When it failed the button
 * was hidden for the rest of the visit, on a deployment where Google sign-in was configured and
 * working — the account holder simply had no visible way in, and nothing on screen suggested
 * reloading would help.
 */
describe('Signin — the Google button survives a cold backend', () => {
  let fixture: ComponentFixture<Signin>;
  let http: HttpTestingController;

  const OPTIONS = '/api/auth/options';

  /*
   * vitest's fake timers rather than Angular's fakeAsync/tick: this application is zoneless, so
   * zone-testing.js is deliberately absent and fakeAsync cannot work. The retry's delay is an
   * rxjs timer(), which schedules through setTimeout, so faking the clock drives it directly.
   */
  beforeEach(async () => {
    vi.useFakeTimers();
    // The button is now seeded from a per-device cache, so a value left by a previous test would
    // make these pass for the wrong reason.
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Signin],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Signin);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const googleLink = () =>
    fixture.nativeElement.querySelector('a.provider') as HTMLAnchorElement | null;

  it('shows the button when the backend answers first time', () => {
    fixture.detectChanges();
    http.expectOne(OPTIONS).flush({ googleEnabled: true, otpDemoMode: false });
    fixture.detectChanges();

    expect(googleLink()).not.toBeNull();
  });

  /**
   * The regression this file exists for. Without the retry the first 503 is final and the button
   * never appears, even though the very next request would have succeeded.
   */
  it('retries a cold start and still shows the button', () => {
    fixture.detectChanges();

    http.expectOne(OPTIONS).flush('waking', { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(8_000);

    http.expectOne(OPTIONS).flush({ googleEnabled: true, otpDemoMode: false });
    fixture.detectChanges();

    expect(googleLink()).not.toBeNull();
  });

  /** status 0 is what the browser reports when the request could not be completed at all. */
  it('retries a dropped connection', () => {
    fixture.detectChanges();

    http.expectOne(OPTIONS).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown' });
    vi.advanceTimersByTime(8_000);

    http.expectOne(OPTIONS).flush({ googleEnabled: true, otpDemoMode: false });
    fixture.detectChanges();

    expect(googleLink()).not.toBeNull();
  });

  /**
   * The retry has to stay selective. A 404 is a real answer -- this deployment has no such
   * endpoint -- and spinning on it would delay the page for nothing.
   */
  it('does not retry a real answer', () => {
    fixture.detectChanges();

    http.expectOne(OPTIONS).flush('nope', { status: 404, statusText: 'Not Found' });
    vi.advanceTimersByTime(30_000);

    http.verify(); // no second request was made
    fixture.detectChanges();
    expect(googleLink()).toBeNull();
  });

  /** A backend with no Google credentials must not advertise a button that would 401. */
  it('hides the button when the backend says Google is off', () => {
    fixture.detectChanges();

    http.expectOne(OPTIONS).flush({ googleEnabled: false, otpDemoMode: false });
    fixture.detectChanges();

    expect(googleLink()).toBeNull();
  });

  /** Whatever happens to the probe, the password form must still work. */
  it('never blocks the password form on the probe', () => {
    fixture.detectChanges();

    http.expectOne(OPTIONS).flush('down', { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#identifier')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#password')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]')).not.toBeNull();
  });
});
