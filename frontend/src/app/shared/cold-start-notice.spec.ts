import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendStatus } from '../core/services/backend-status';
import { ColdStartNotice } from './cold-start-notice';

/**
 * The notice is only reached by people already having a bad time -- a page that will not load -- so
 * it is the last place an accessibility gap should be tolerated. It is not in the `a11y.spec.ts`
 * screen list because it renders nothing until the backend is in trouble, and a component that
 * renders nothing passes axe vacuously. Its states have to be driven first.
 *
 * Same axe configuration as `a11y.spec.ts`: `region` off because a component rendered outside the
 * app shell has no landmark to sit in, `color-contrast` off because jsdom has no layout engine to
 * resolve colours with (the tokens are checked directly in `design-tokens.spec.ts`).
 */
describe('ColdStartNotice', () => {
  let fixture: ComponentFixture<ColdStartNotice>;
  let backend: BackendStatus;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [ColdStartNotice],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(BackendStatus);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ColdStartNotice);
  });

  afterEach(() => {
    // Ends the poll cycle. Without this the subscription outlives the test, keeps firing probes at
    // the environment vitest is trying to tear down, and turns a 2-second file into a 2-minute one.
    backend.reportReachable();
    fixture.destroy();
    vi.useRealTimers();
  });

  /**
   * `detectChanges`, not `whenStable`. Stability waits on pending work, and this component's whole
   * subject is a backend that never answers -- with fake timers holding the poll cycle open, the
   * fixture is never stable and the wait simply times out. The template is signal-driven, so one
   * synchronous pass renders everything there is to render.
   */
  const render = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  /**
   * axe needs the subject attached to the document; a detached root reports nothing.
   *
   * Real timers for the duration, then back to fake. axe schedules its own work on timers, so under
   * fake ones `axe.run()` never settles -- the test times out, the run is still going when the next
   * test starts, and axe refuses with "already running". The failure looks like an accessibility
   * problem and is not one, which is the worst kind of flake to leave behind.
   */
  const audit = async (element: HTMLElement) => {
    document.body.appendChild(element);
    vi.useRealTimers();
    try {
      const results = await axe.run(element, {
        rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.help}`);
    } finally {
      element.remove();
      vi.useFakeTimers();
    }
  };

  it('stays out of the way while the backend is fine', async () => {
    const host = render();

    // A bar that appears on a healthy load is worse than no bar: it teaches people to ignore it.
    expect(host.textContent?.trim()).toBe('');
  });

  it('explains a cold start, and says how long it will take', async () => {
    backend.reportUnavailable();
    const host = render();

    expect(host.textContent).toContain('Waking the server up');
    // Naming the cause and the cost is what stops the reload that restarts the wait.
    expect(host.textContent).toContain('15 minutes idle');
    expect(host.textContent).toContain('a minute or two');
    // Nothing to decide while waiting, so nothing to press.
    expect(host.querySelector('button')).toBeNull();
    expect(await audit(host)).toEqual([]);
  });

  it('blames the network, not the server, when the device is offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      backend.reportUnavailable();
      const host = render();

      // Telling somebody on a train that the server is waking up sends them looking in the wrong
      // place -- and the server is not the thing that is wrong.
      expect(host.textContent).toContain('offline');
      expect(host.textContent).not.toContain('Waking the server up');
      expect(await audit(host)).toEqual([]);
    } finally {
      onLine.mockRestore();
    }
  });

  it('offers a retry once it stops being plausible that this is a cold start', async () => {
    backend.reportUnavailable();

    // Fail every probe for longer than the give-up window. Cancelled requests are skipped: each
    // probe carries its own timeout, so some are already gone by the time the loop comes round.
    for (let elapsed = 0; elapsed < 270_000; elapsed += 5_000) {
      await vi.advanceTimersByTimeAsync(5_000);
      for (const pending of http.match(() => true)) {
        if (!pending.cancelled) {
          pending.flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
        }
      }
    }

    const host = render();
    expect(host.textContent).toContain('Cannot reach the server');

    // The polling has stopped, so a real control is the only way back -- and it has to be a real
    // button, not a clickable span, or a keyboard user is stuck on a dead page.
    const retry = host.querySelector('button');
    expect(retry).not.toBeNull();
    expect(retry?.textContent).toContain('Try again');
    expect(await audit(host)).toEqual([]);

    retry?.click();
    expect(backend.current()).toBe('warming');
  });
});
